"""Fuentes extra sin cuenta (descarga + adaptacion al formato largo del proyecto, en un solo paso).

Uso (desde la raiz del proyecto):
    .venv/Scripts/python -I scripts/fuentes_extra.py FUENTE [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD] [--puntos id,id]
FUENTE: era5 | modis | sentinel2 | landsat | dem | todo

Todas escriben en processed/ con la misma convencion que procesar_nuevo.py (punto, latitud, longitud, fecha, ...)
y se pueden re-ejecutar: por defecto solo piden lo posterior a la ultima fecha ya guardada (automatizable con cron).
  era5       -> processed/era5_diario.csv        (Open-Meteo, reanalisis ERA5 / ERA5-Land, diario)
  modis      -> processed/modis_ndvi.csv         (MOD13Q1 v061, 250 m, 16 dias; Planetary Computer)
  sentinel2  -> processed/sentinel2_indices.csv  (NDVI y NDMI, 10/20 m; desde 2015; Planetary Computer)
  landsat    -> processed/landsat_ndvi.csv       (Landsat 5/7/8/9 C2 L2, 30 m; Planetary Computer)
  dem        -> processed/topografia_por_punto.csv (NASADEM/SRTM 30 m: elevacion, pendiente, orientacion)
"""
import argparse
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ, fusionar, ord_punto  # noqa: E402

SAL = RAIZ / "processed"
SUF = ""  # --sufijo n1 -> escribe processed/<fuente>_n1.csv (para correr varios procesos a la vez sin pisarse); luego scripts/unir_sufijos.py
INICIO = "1996-01-01"
PC = "https://planetarycomputer.microsoft.com/api/stac/v1"


def ultima_fecha(dest, pid, defecto):
    """Fecha siguiente a la ultima guardada para el punto (o `defecto`)."""
    if not dest.exists():
        return defecto
    df = pd.read_csv(dest, usecols=["punto", "fecha"], dtype=str)
    f = df.loc[df["punto"] == pid, "fecha"]
    return (pd.Timestamp(f.max()) + pd.Timedelta(days=1)).strftime("%Y-%m-%d") if len(f) else defecto


def guardar(dest, filas, pid):
    if not filas:
        print(f"  {pid}: sin filas nuevas")
        return
    df = pd.DataFrame(filas)
    fusionar(dest, df, ["punto", "fecha"], ord_punto("fecha"))
    print(f"  {pid}: +{len(df)} filas -> {dest.name}")


def base(p):
    return {"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"]}


# ------------------------------------------------------------------ ERA5 (Open-Meteo)
def era5(puntos, desde, hasta):
    dest = SAL / f"era5_diario{SUF}.csv"
    suelo = ["soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm", "soil_moisture_28_to_100cm", "soil_moisture_100_to_255cm"]
    dia = ["temperature_2m_mean", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "et0_fao_evapotranspiration"]
    ren = {"temperature_2m_mean": "t2m", "temperature_2m_max": "t2m_max", "temperature_2m_min": "t2m_min",
           "precipitation_sum": "tp_mm", "et0_fao_evapotranspiration": "et0_mm",
           "soil_moisture_0_to_7cm": "swvl1", "soil_moisture_7_to_28cm": "swvl2",
           "soil_moisture_28_to_100cm": "swvl3", "soil_moisture_100_to_255cm": "swvl4"}
    for p in puntos:
        fin = pd.Timestamp(hasta)
        ini = pd.Timestamp(desde)
        tengo = set()
        if dest.exists():
            df0 = pd.read_csv(dest, usecols=["punto", "fecha"], dtype=str)
            tengo = set(df0.loc[df0["punto"] == p["id"], "fecha"])
        partes = []
        for a in range(ini.year, fin.year + 1, 3):
            d0, d1 = max(ini, pd.Timestamp(a, 1, 1)), min(fin, pd.Timestamp(min(a + 2, fin.year), 12, 31))
            if d0 > d1:
                continue
            falta = [d for d in pd.date_range(d0, d1).strftime("%Y-%m-%d") if d not in tengo]
            if not falta:
                continue  # bloque completo: tambien rellena huecos del medio si un pedido anterior fallo por limite de uso
            d0 = pd.Timestamp(falta[0])
            for intento in range(6):
                r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=120, params={
                    "latitude": p["lat"], "longitude": p["lon"], "start_date": d0.date(), "end_date": d1.date(),
                    "daily": ",".join(dia), "hourly": ",".join(suelo), "timezone": "America/Tegucigalpa"})
                if r.status_code == 200:
                    break
                time.sleep(20 * (intento + 1))
            else:
                print(f"  {p['id']}: Open-Meteo {r.status_code} {r.text[:120]}")
                continue
            j = r.json()
            d = pd.DataFrame(j["daily"]).rename(columns={"time": "fecha"}).set_index("fecha")
            h = pd.DataFrame(j["hourly"])
            h["fecha"] = h["time"].str[:10]
            h = h.drop(columns="time").groupby("fecha").mean().round(4)
            partes.append(d.join(h))
            time.sleep(2)
        if not partes:
            continue
        df = pd.concat(partes).rename(columns=ren).reset_index()
        df = df.dropna(subset=list(ren.values()), how="all")
        for k, v in base(p).items():
            df.insert(list(base(p)).index(k), k, v)
        guardar(dest, df.to_dict("records"), p["id"])


# ------------------------------------------------------------------ Planetary Computer (COG puntuales)
def _pc():
    import planetary_computer as pcm
    import pystac_client
    return pcm, pystac_client.Client.open(PC)


def _muestra(href, lon, lat, medio, rasterio, Transformer):
    """Ventana (2*medio+1)^2 alrededor del punto. Devuelve (array 2D, nodata, escala) o None."""
    with rasterio.open(href) as ds:
        x, y = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True).transform(lon, lat)
        f, c = ds.index(x, y)
        if not (0 <= f < ds.height and 0 <= c < ds.width):
            return None
        f0, c0 = max(f - medio, 0), max(c - medio, 0)
        w = rasterio.windows.Window(c0, f0, min(2 * medio + 1, ds.width - c0), min(2 * medio + 1, ds.height - f0))
        return ds.read(1, window=w).astype("f8"), ds.nodata


def _fecha_item(it):
    d = it.datetime or datetime.fromisoformat(it.properties["start_datetime"].replace("Z", "+00:00"))
    return d


def _items(cat, coleccion, p, d0, d1, **kw):
    q = cat.search(collections=[coleccion], intersects={"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                   datetime=f"{d0}/{d1}", **kw)
    return sorted(q.items(), key=_fecha_item)


def _reintentar(fn, n=3):
    for i in range(n):
        try:
            return fn()
        except Exception as e:
            err = e
            time.sleep(3 * (i + 1))
    return None


def modis(puntos, desde, hasta):
    import rasterio
    from pyproj import Transformer
    pcm, cat = _pc()
    dest = SAL / f"modis_ndvi{SUF}.csv"
    ini_min = max(desde, "2000-02-18")
    for p in puntos:
        d0 = ultima_fecha(dest, p["id"], ini_min)
        items = _items(cat, "modis-13Q1-061", p, d0, hasta)

        def una(it):
            it = pcm.sign(it)
            fila = {**base(p), "fecha": _fecha_item(it).strftime("%Y-%m-%d")}
            ok = False
            for col, a in (("ndvi", "250m_16_days_NDVI"), ("evi", "250m_16_days_EVI"),
                           ("calidad_pixel", "250m_16_days_pixel_reliability")):
                m = _reintentar(lambda: _muestra(it.assets[a].href, p["lon"], p["lat"], 0, rasterio, Transformer))
                if m is None:
                    fila[col] = np.nan
                    continue
                v = float(m[0][0, 0])
                if col == "calidad_pixel":
                    fila[col] = int(v) if v >= 0 else np.nan
                else:
                    fila[col] = np.nan if v <= -3000 else round(v * 0.0001, 4)
                    ok = ok or not np.isnan(fila[col])
            return fila if ok else None
        with ThreadPoolExecutor(12) as ex:
            filas = [f for f in ex.map(una, items) if f]
        guardar(dest, filas, p["id"])


def sentinel2(puntos, desde, hasta):
    import rasterio
    from pyproj import Transformer
    pcm, cat = _pc()
    dest = SAL / f"sentinel2_indices{SUF}.csv"
    for p in puntos:
        d0 = ultima_fecha(dest, p["id"], max(desde, "2015-07-01"))
        items = _items(cat, "sentinel-2-l2a", p, d0, hasta, query={"eo:cloud_cover": {"lt": 60}})

        def una(it):
            it = pcm.sign(it)
            def leer(a, medio):
                return _reintentar(lambda: _muestra(it.assets[a].href, p["lon"], p["lat"], medio, rasterio, Transformer))
            scl, b4, b8, b11 = leer("SCL", 0), leer("B04", 2), leer("B08", 2), leer("B11", 1)
            if None in (scl, b4, b8, b11):
                return None
            if int(scl[0][0, 0]) not in (4, 5, 6, 7):
                return None  # nube, sombra, nieve o sin dato en el punto
            off = -0.1 if it.datetime >= datetime(2022, 1, 25, tzinfo=it.datetime.tzinfo) else 0  # baseline 04.00
            r = lambda m: np.nanmean(np.where(m[0] > 0, (m[0] + off * 10000) / 10000, np.nan))
            rojo, nir, swir = r(b4), r(b8), r(b11)
            if any(math.isnan(x) for x in (rojo, nir, swir)):
                return None
            return {**base(p), "fecha": _fecha_item(it).strftime("%Y-%m-%d"), "ndvi": round((nir - rojo) / (nir + rojo), 4),
                    "ndmi": round((nir - swir) / (nir + swir), 4), "nubes_escena_pct": it.properties.get("eo:cloud_cover"),
                    "escena": it.id}
        with ThreadPoolExecutor(12) as ex:
            filas = [f for f in ex.map(una, items) if f]
        guardar(dest, filas, p["id"])


def landsat(puntos, desde, hasta):
    import rasterio
    from pyproj import Transformer
    pcm, cat = _pc()
    dest = SAL / f"landsat_ndvi{SUF}.csv"
    for p in puntos:
        d0 = ultima_fecha(dest, p["id"], desde)
        items = _items(cat, "landsat-c2-l2", p, d0, hasta, query={"eo:cloud_cover": {"lt": 60}, "platform": {"in": [
            "landsat-5", "landsat-7", "landsat-8", "landsat-9"]}})

        def una(it):
            it = pcm.sign(it)
            def leer(a):
                return _reintentar(lambda: _muestra(it.assets[a].href, p["lon"], p["lat"], 1, rasterio, Transformer))
            qa, rojo, nir = leer("qa_pixel"), leer("red"), leer("nir08")
            if None in (qa, rojo, nir):
                return None
            q = int(qa[0][qa[0].shape[0] // 2, qa[0].shape[1] // 2])
            if q & 0b111111:  # relleno, nube dilatada, cirro, nube, sombra o nieve en el pixel del punto
                return None
            r = lambda m: np.nanmean(np.where(m[0] > 0, m[0] * 0.0000275 - 0.2, np.nan))
            a, b = r(rojo), r(nir)
            if math.isnan(a) or math.isnan(b) or (a + b) == 0:
                return None
            return {**base(p), "fecha": _fecha_item(it).strftime("%Y-%m-%d"), "ndvi": round((b - a) / (b + a), 4),
                    "satelite": it.properties.get("platform"), "nubes_escena_pct": it.properties.get("eo:cloud_cover"),
                    "escena": it.id}
        with ThreadPoolExecutor(12) as ex:
            filas = [f for f in ex.map(una, items) if f]
        guardar(dest, filas, p["id"])


def dem(puntos, desde=None, hasta=None):
    import rasterio
    from pyproj import Transformer
    pcm, cat = _pc()
    filas = []
    for p in puntos:
        it = pcm.sign(next(cat.search(collections=["nasadem"], intersects={"type": "Point", "coordinates": [p["lon"], p["lat"]]}).items()))
        m = None
        for dlat, dlon in ((0, 0), (0.0004, 0.0004), (-0.0004, -0.0004), (0.0004, -0.0004)):  # puntos en el borde de un mosaico
            m = _reintentar(lambda: _muestra(it.assets["elevation"].href, p["lon"] + dlon, p["lat"] + dlat, 1, rasterio, Transformer))
            if m is not None and m[0].shape == (3, 3):
                break
        if m is None or m[0].shape != (3, 3):
            print(f"  {p['id']}: sin DEM")
            continue
        z = m[0]
        d = 30.0 * np.array([1, math.cos(math.radians(p["lat"]))])[0]  # ~30 m en lat; lon se corrige abajo
        dx = 30.0 * math.cos(math.radians(p["lat"]))
        dzdx = ((z[0, 2] + 2 * z[1, 2] + z[2, 2]) - (z[0, 0] + 2 * z[1, 0] + z[2, 0])) / (8 * dx)
        dzdy = ((z[2, 0] + 2 * z[2, 1] + z[2, 2]) - (z[0, 0] + 2 * z[0, 1] + z[0, 2])) / (8 * d)
        filas.append({**base(p), "elevacion_m": round(float(z[1, 1]), 1),
                      "pendiente_pct": round(100 * math.hypot(dzdx, dzdy), 2),
                      "orientacion_grados": round((math.degrees(math.atan2(-dzdx, dzdy)) + 360) % 360, 1)})
    if filas:
        pd.DataFrame(filas).to_csv(SAL / "topografia_por_punto.csv", index=False)
        print(f"  topografia_por_punto.csv: {len(filas)} puntos")


FUENTES = {"era5": era5, "modis": modis, "sentinel2": sentinel2, "landsat": landsat, "dem": dem}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fuente", choices=list(FUENTES) + ["todo"])
    ap.add_argument("--desde", default=INICIO)
    ap.add_argument("--hasta", default=(date.today() - timedelta(days=5)).isoformat())
    ap.add_argument("--puntos", help="ids separados por coma (defecto: todos)")
    ap.add_argument("--sufijo", default="", help="sufijo del CSV de salida, p. ej. n1")
    a = ap.parse_args(argv)
    global SUF
    SUF = "_" + a.sufijo if a.sufijo else ""
    ids = set(a.puntos.split(",")) if a.puntos else None
    pts = [p for p in PUNTOS if not ids or p["id"] in ids]
    SAL.mkdir(exist_ok=True)
    for f in (list(FUENTES) if a.fuente == "todo" else [a.fuente]):
        print(f"== {f} ({a.desde} a {a.hasta}, {len(pts)} puntos)")
        FUENTES[f](pts, a.desde, a.hasta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
