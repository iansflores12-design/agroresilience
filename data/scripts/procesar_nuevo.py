"""Procesa archivos NUEVOS con las mismas reglas que scripts/10_procesar.py (ver PROCESAMIENTO.md).

Sin modelos, sin APIs de IA, sin red. Solo limpieza y orden.

Uso (desde la raiz de data/):
    .venv/bin/python -I scripts/procesar_nuevo.py [RUTA ...] [--entrada DIR] [--salida DIR]

- Con RUTA(s): procesa esos archivos (o todos los archivos dentro de un directorio dado).
- Sin RUTA: procesa los archivos de la carpeta de entrada (entrada/ o --entrada o AGRO_ENTRADA)
  cuyo sha256 no este en <salida>/.procesados.csv.
- Salida: salida/ (o --salida o AGRO_SALIDA). Nunca raw/ ni processed/.

Registros validos ("registros ok") por tipo: POWER = dias; ONI = lineas; IBTrACS = filas validas leidas
(antes del filtro de temporada/distancia); SoilGrids = 1 por archivo; GRACE = (punto, mes);
IMERG/SMAP = puntos; Meteomatics = valores (parametro, coordenada, fecha).
Un registro invalido se anota en <salida>/errores.csv y en consola, se omite y se sigue.
Codigo de salida 0 aunque haya registros invalidos; 2 solo si un argumento es invalido.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta
from fnmatch import fnmatch
from pathlib import Path

import netCDF4 as nc
import numpy as np
import pandas as pd
import xarray as xr

RAIZ = Path(__file__).resolve().parent.parent
RAW, PRO = RAIZ / "raw", RAIZ / "processed"
CFG = json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))
PUNTOS, CAJA = CFG["puntos"], CFG["caja_honduras"]
PUNTO = {p["id"]: p for p in PUNTOS}
ORDEN = {p["id"]: n for n, p in enumerate(PUNTOS)}
MARGEN = 0.5
TRIMESTRES = {"DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"}
TOL_MALLA = 0.5  # grados: un punto mas lejos que esto de la celda mas cercana se considera fuera de la malla
FMT_ISO = "%Y-%m-%dT%H:%M:%SZ"


# ------------------------------------------------------------------ utilidades
def km(lat1, lon1, lat2, lon2):
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2)) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def dist_caja(lat, lon):
    la = min(max(lat, CAJA["lat_min"]), CAJA["lat_max"])
    lo = min(max(lon, CAJA["lon_min"]), CAJA["lon_max"])
    return km(lat, lon, la, lo)


def cercano(valores, x):
    return int(np.nanargmin(np.abs(np.asarray(valores, dtype=float) - x)))


def es_numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def fecha_compacta_ok(s):
    if not isinstance(s, str) or not re.fullmatch(r"\d{8}", s):
        return False
    try:
        datetime.strptime(s, "%Y%m%d")
        return True
    except ValueError:
        return False


def leer_json(ruta):
    return json.loads(Path(ruta).read_text(encoding="utf-8"))


def vacio():
    return pd.DataFrame()


def con_ok(df, n):
    df.attrs["ok"] = int(n)
    return df


# ------------------------------------------------------------------ lectores (archivo -> (DataFrame, errores))
# errores = lista de (registro, motivo). df.attrs["ok"] = registros validos; df.attrs["avisos"] = textos.
def leer_power(ruta):
    ruta = Path(ruta)
    try:
        d = leer_json(ruta)
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"JSON ilegible: {e}")]
    pid = ruta.stem
    if pid not in PUNTO:
        return con_ok(vacio(), 0), [(0, f"el punto '{pid}' no esta en config/zonas.json")]
    try:
        relleno = d.get("header", {}).get("fill_value", -999)
        par = d["properties"]["parameter"]
        if not isinstance(par, dict) or not par:
            raise ValueError("properties.parameter vacio")
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"estructura POWER invalida: {e!r}")]
    p, errores, limpio = PUNTO[pid], [], {}
    for k, serie in par.items():
        celdas = {}
        if not isinstance(serie, dict):
            errores.append((0, f"{k}: la serie no es un objeto fecha->valor"))
        else:
            for i, (fecha, v) in enumerate(serie.items(), 1):
                if not fecha_compacta_ok(fecha):
                    errores.append((i, f"{k}: fecha invalida {fecha!r}"))
                elif not es_numero(v):
                    errores.append((i, f"{k}: valor no numerico {v!r} en {fecha}"))
                else:
                    celdas[fecha] = v
        limpio[k] = celdas
    df = pd.DataFrame(limpio)
    if df.empty:
        return con_ok(vacio(), 0), errores
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.sort_index().replace(relleno, np.nan)
    df.insert(0, "fecha", df.index.strftime("%Y-%m-%d"))
    df.insert(0, "longitud", p["lon"])
    df.insert(0, "latitud", p["lat"])
    df.insert(0, "punto", pid)
    return con_ok(df, len(df)), errores


def calidad_de_csv(ruta_csv, pid):
    """Filas de calidad_power para un punto, a partir de su CSV de salida (mismas columnas que el original)."""
    df = pd.read_csv(ruta_csv)
    fechas = pd.to_datetime(df["fecha"], format="%Y-%m-%d")
    filas = []
    for k in [c for c in df.columns if c not in ("punto", "latitud", "longitud", "fecha")]:
        s = df[k]
        s.index = fechas
        a, b = s.first_valid_index(), s.last_valid_index()
        filas.append({"punto": pid, "parametro": k, "filas": len(s), "vacios": int(s.isna().sum()),
                      "minimo": s.min(), "maximo": s.max(),
                      "primer_dia": s.index.min().date(), "ultimo_dia": s.index.max().date(),
                      "primer_dia_con_dato": a.date() if a is not None else None,
                      "ultimo_dia_con_dato": b.date() if b is not None else None})
    return pd.DataFrame(filas)


def leer_oni(ruta):
    try:
        lineas = Path(ruta).read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"archivo ilegible: {e}")]
    filas, errores = [], []
    for n, linea in enumerate(lineas, 1):
        c = linea.split()
        if not c:
            continue
        if n == 1 and [x.upper() for x in c] == ["SEAS", "YR", "TOTAL", "ANOM"]:
            continue
        if len(c) != 4:
            errores.append((n, f"se esperaban 4 campos y hay {len(c)}: {linea.strip()!r}"))
            continue
        try:
            anio = int(c[1])
        except ValueError:
            errores.append((n, f"anio no numerico {c[1]!r}"))
            continue
        try:
            sst, anom = float(c[2]), float(c[3])
        except ValueError:
            errores.append((n, f"valor no numerico: {c[2]!r} {c[3]!r}"))
            continue
        if not (math.isfinite(sst) and math.isfinite(anom)):
            errores.append((n, f"valor no finito: {c[2]!r} {c[3]!r}"))
            continue
        if c[0] not in TRIMESTRES:
            errores.append((n, f"trimestre invalido {c[0]!r}"))
            continue
        filas.append({"anio": anio, "trimestre": c[0], "sst_total": sst, "oni": anom})
    df = pd.DataFrame(filas, columns=["anio", "trimestre", "sst_total", "oni"])
    return con_ok(df, len(df)), errores


IBT_USAR = ["SID", "SEASON", "NAME", "ISO_TIME", "NATURE", "LAT", "LON", "WMO_WIND", "WMO_PRES",
            "USA_WIND", "USA_PRES", "USA_SSHS", "DIST2LAND", "LANDFALL"]
IBT_NOMBRES = {"SID": "sid", "SEASON": "temporada", "NAME": "nombre", "ISO_TIME": "fecha_hora_utc",
               "NATURE": "naturaleza", "LAT": "latitud", "LON": "longitud",
               "WMO_WIND": "viento_wmo_kt", "WMO_PRES": "presion_wmo_mb",
               "USA_WIND": "viento_usa_kt", "USA_PRES": "presion_usa_mb", "USA_SSHS": "categoria_sshs",
               "DIST2LAND": "dist_tierra_km", "LANDFALL": "dist_tierra_6h_km"}


def leer_ibtracs(ruta):
    errores, filas = [], []
    try:
        with open(ruta, newline="", encoding="utf-8") as f:
            lector = csv.reader(f)
            cab = next(lector)
            next(lector)  # fila de unidades
            faltan = [c for c in IBT_USAR if c not in cab]
            if faltan:
                return con_ok(vacio(), 0), [(0, f"faltan columnas: {', '.join(faltan)}")]
            cols = [c for c in cab if c in IBT_USAR]  # mismo orden que el archivo, como usecols de pandas
            idx = {c: cab.index(c) for c in cols}
            for n, fila in enumerate(lector, 1):
                if not fila:
                    errores.append((n, "fila vacia"))
                    continue
                if len(fila) != len(cab):
                    errores.append((n, f"numero de campos {len(fila)} distinto de {len(cab)}"))
                    continue
                r = {c: fila[idx[c]].strip() for c in cols}
                try:
                    int(r["SEASON"])
                except ValueError:
                    errores.append((n, f"temporada no numerica {r['SEASON']!r}"))
                    continue
                try:
                    lat, lon = float(r["LAT"]), float(r["LON"])
                except ValueError:
                    errores.append((n, f"latitud/longitud no numerica: {r['LAT']!r} {r['LON']!r}"))
                    continue
                if not (math.isfinite(lat) and math.isfinite(lon)):
                    errores.append((n, f"latitud/longitud no finita: {r['LAT']!r} {r['LON']!r}"))
                    continue
                if not (-90 <= lat <= 90):
                    errores.append((n, f"latitud fuera de rango {lat}"))
                    continue
                if not (-180 <= lon <= 180):
                    errores.append((n, f"longitud fuera de rango {lon}"))
                    continue
                r["LAT"], r["LON"] = lat, lon
                filas.append(r)
    except StopIteration:
        return con_ok(vacio(), 0), [(0, "CSV sin las dos filas de encabezado")]
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"archivo ilegible: {e}")]
    n_ok = len(filas)
    df = pd.DataFrame(filas, columns=cols)
    df = df[df["SEASON"].astype(int) >= 1981].copy()
    df["distancia_caja_km"] = [round(dist_caja(a, b), 1) for a, b in zip(df["LAT"], df["LON"])]
    cerca = df.groupby("SID")["distancia_caja_km"].min()
    df = df[df["SID"].isin(cerca[cerca <= 500].index)].copy()
    df["dentro_500km"] = (df["distancia_caja_km"] <= 500).astype(int)
    df = df.rename(columns=IBT_NOMBRES)
    return con_ok(df, n_ok), errores


def leer_soilgrids(ruta):
    ruta = Path(ruta)
    stem = ruta.stem
    cercano_ = stem.endswith("_cercano")
    pid = stem[:-len("_cercano")] if cercano_ else stem
    if pid not in PUNTO:
        return con_ok(vacio(), 0), [(0, f"el punto '{pid}' no esta en config/zonas.json")]
    p = PUNTO[pid]
    alt = p.get("suelo_alterno")
    if bool(alt) != cercano_:
        df = con_ok(vacio(), 0)
        df.attrs["avisos"] = [f"omitido: {pid} " + ("tiene suelo_alterno y se usa " + pid + "_cercano.json" if alt
                                                    else "no tiene suelo_alterno y se usa " + pid + ".json")]
        return df, []
    try:
        d = leer_json(ruta)
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"JSON ilegible: {e}")]
    fila = {"punto": pid, "latitud_punto": p["lat"], "longitud_punto": p["lon"],
            "origen": "alterno" if alt else "original",
            "latitud_consulta": alt["lat"] if alt else p["lat"],
            "longitud_consulta": alt["lon"] if alt else p["lon"],
            "distancia_km": alt["distancia_km"] if alt else 0}
    try:
        capas = d["properties"]["layers"]
        if not isinstance(capas, list) or not capas:
            raise ValueError("properties.layers vacio")
        for capa in capas:
            for dep in capa["depths"]:
                m = dep["values"]["mean"]
                if m is not None and not es_numero(m):
                    return con_ok(vacio(), 0), [(1, f"{capa['name']} {dep['label']}: valor no numerico {m!r}")]
                fila[f"{capa['name']}_{dep['label'].replace('-', '_')}"] = np.nan if m is None else m
    except Exception as e:
        return con_ok(vacio(), 0), [(1, f"estructura SoilGrids invalida (falta {e!r})")]
    return con_ok(pd.DataFrame([fila]), 1), []


def leer_grace(ruta):
    try:
        with xr.open_dataset(ruta) as ds:
            ds = ds.assign_coords(lon=(((ds.lon + 180) % 360) - 180)).sortby("lon")
            rec = ds[["lwe_thickness", "uncertainty", "land_mask", "scale_factor"]].sel(
                lat=slice(CAJA["lat_min"] - MARGEN, CAJA["lat_max"] + MARGEN),
                lon=slice(CAJA["lon_min"] - MARGEN, CAJA["lon_max"] + MARGEN)).load()
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"archivo GRACE ilegible: {e}")]
    filas, errores = [], []
    for p in PUNTOS:
        c = rec.sel(lat=p["lat"], lon=p["lon"], method="nearest")
        for i, (t, a, b) in enumerate(zip(c.time.values, c.lwe_thickness.values, c.uncertainty.values), 1):
            if pd.isna(t):
                errores.append((i, f"{p['id']}: fecha no decodificable"))
                continue
            filas.append({"punto": p["id"], "fecha": str(t)[:10], "celda_lat": float(c.lat), "celda_lon": float(c.lon),
                          "lwe_thickness": a, "uncertainty": b, "scale_factor": float(c.scale_factor),
                          "land_mask": int(c.land_mask)})
    df = pd.DataFrame(filas)
    return con_ok(df, len(df)), errores


def leer_imerg(ruta):
    nombre = Path(ruta).name
    m = re.search(r"3IMERG\.(\d{8})", nombre)
    if not m or not fecha_compacta_ok(m.group(1)):
        return con_ok(vacio(), 0), [(0, f"el nombre no trae una fecha 3IMERG.AAAAMMDD valida: {nombre}")]
    fecha = pd.Timestamp(m.group(1)).strftime("%Y-%m-%d")
    var = ["precipitation", "randomError", "precipitation_cnt_cond", "MWprecipitation"]
    try:
        d = nc.Dataset(ruta)
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"NetCDF ilegible: {e}")]
    try:
        d.set_auto_mask(False)
        faltan = [v for v in ["lat", "lon"] + var if v not in d.variables]
        if faltan:
            return con_ok(vacio(), 0), [(0, f"variables faltantes: {', '.join(faltan)}")]
        lat, lon = d["lat"][:].astype("f8"), d["lon"][:].astype("f8")
        arr = {}
        for v in var:
            a = d[v][0].T  # (lon, lat) -> (lat, lon)
            if a.dtype.kind == "f":
                a = np.where(a < -9000, np.nan, a).astype("f4")
            arr[v] = a
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"NetCDF ilegible o con forma inesperada: {e}")]
    finally:
        d.close()
    ii, jj, ids, errores = [], [], [], []
    for n, p in enumerate(PUNTOS, 1):
        i, j = cercano(lat, p["lat"]), cercano(lon, p["lon"])
        if abs(lat[i] - p["lat"]) > TOL_MALLA or abs(lon[j] - p["lon"]) > TOL_MALLA:
            errores.append((n, f"{p['id']}: punto fuera de la malla del archivo"))
            continue
        ii.append(i), jj.append(j), ids.append(p["id"])
    df = pd.DataFrame({v: arr[v][ii, jj] for v in var})
    df.insert(0, "celda_lon", [round(float(lon[j]), 2) for j in jj])
    df.insert(0, "celda_lat", [round(float(lat[i]), 2) for i in ii])
    df.insert(0, "fecha", fecha)
    df.insert(0, "punto", ids)
    return con_ok(df, len(df)), errores


SMAP_BASE = ["soil_moisture", "retrieval_qual_flag", "soil_moisture_error", "surface_temperature",
             "vegetation_water_content", "surface_flag"]


def cargar_malla_smap(ruta=None):
    ruta = Path(ruta) if ruta else RAIZ / "config" / "smap_malla.json"
    m = json.loads(ruta.read_text(encoding="utf-8"))
    nan = lambda xs: np.array([np.nan if x is None else x for x in xs], dtype="f8")
    return nan(m["lat"]), nan(m["lon"])


def leer_smap(ruta, malla=None):
    nombre = Path(ruta).name
    m = re.search(r"_E_(\d{8})_", nombre)
    if not m or not fecha_compacta_ok(m.group(1)):
        return con_ok(vacio(), 0), [(0, f"el nombre no trae una fecha _E_AAAAMMDD_ valida: {nombre}")]
    fecha = pd.Timestamp(m.group(1)).strftime("%Y-%m-%d")
    try:
        lat_f, lon_c = malla if malla is not None else cargar_malla_smap()
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"no se pudo leer config/smap_malla.json (correr scripts/generar_malla_smap.py): {e}")]
    try:
        d = nc.Dataset(ruta)
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"NetCDF ilegible: {e}")]
    arr = {}
    try:
        d.set_auto_mask(False)
        for s, grupo, suf in (("am", "Soil_Moisture_Retrieval_Data_AM", ""), ("pm", "Soil_Moisture_Retrieval_Data_PM", "_pm")):
            if grupo not in d.groups:
                return con_ok(vacio(), 0), [(0, f"falta el grupo {grupo}")]
            g = d.groups[grupo]
            faltan = [v + suf for v in SMAP_BASE if v + suf not in g.variables]
            if faltan:
                return con_ok(vacio(), 0), [(0, f"variables faltantes en {grupo}: {', '.join(faltan)}")]
            for v in SMAP_BASE:
                a = g[v + suf][:]
                if a.dtype.kind == "f":
                    a = np.where(a < -9000, np.nan, a).astype("f4")
                if a.shape != (len(lat_f), len(lon_c)):
                    return con_ok(vacio(), 0), [(0, f"{grupo}/{v + suf}: forma {a.shape} distinta de la malla "
                                                    f"{(len(lat_f), len(lon_c))}")]
                arr[f"{v}_{s}"] = a
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"NetCDF ilegible o con forma inesperada: {e}")]
    finally:
        d.close()
    ii, jj, ids, errores = [], [], [], []
    for n, p in enumerate(PUNTOS, 1):
        i, j = cercano(lat_f, p["lat"]), cercano(lon_c, p["lon"])
        if abs(lat_f[i] - p["lat"]) > TOL_MALLA or abs(lon_c[j] - p["lon"]) > TOL_MALLA:
            errores.append((n, f"{p['id']}: punto fuera de la malla SMAP"))
            continue
        ii.append(i), jj.append(j), ids.append(p["id"])
    claves = [f"{v}_{s}" for v in SMAP_BASE if v != "surface_flag" for s in ("am", "pm")]  # orden del original
    df = pd.DataFrame({k: arr[k][ii, jj] for k in claves})
    for k in ("retrieval_qual_flag_am", "retrieval_qual_flag_pm"):
        df[k] = df[k].where(df[k] != 65534).astype("Int64")
    df.insert(0, "celda_lon", [round(float(lon_c[j]), 4) for j in jj])
    df.insert(0, "celda_lat", [round(float(lat_f[i]), 4) for i in ii])
    df.insert(0, "fecha", fecha)
    df.insert(0, "punto", ids)
    return con_ok(df, len(df)), errores


def _punto_de(c):
    try:
        for p in PUNTOS:
            if abs(c["lat"] - p["lat"]) < 1e-6 and abs(c["lon"] - p["lon"]) < 1e-6:
                return p
    except Exception:
        pass
    return None


def leer_meteomatics(ruta, estatico=False):
    """Una fila por (punto, marca_utc) con los parametros de ESTE archivo (estatico: una fila por punto)."""
    try:
        data = leer_json(ruta)["data"]
        if not isinstance(data, list):
            raise ValueError("data no es una lista")
    except Exception as e:
        return con_ok(vacio(), 0), [(0, f"JSON ilegible o sin 'data': {e!r}")]
    tabla, errores, ok = {}, [], 0
    for par in data:
        try:
            param, coords = par["parameter"], par["coordinates"]
        except Exception:
            errores.append((0, "elemento de 'data' sin parameter/coordinates"))
            continue
        for ci, c in enumerate(coords, 1):
            p = _punto_de(c)
            if p is None:
                errores.append((ci, f"{param}: coordenada {ci} no coincide con ningun punto de zonas.json"))
                continue
            fechas = c.get("dates", []) if isinstance(c, dict) else []
            if estatico:
                fechas = fechas[:1]
                if not fechas:
                    errores.append((1, f"{param} {p['id']}: sin valor"))
            for di, x in enumerate(fechas, 1):
                try:
                    t = datetime.strptime(x["date"], FMT_ISO)
                except Exception:
                    errores.append((di, f"{param} {p['id']}: marca de tiempo invalida {x.get('date') if isinstance(x, dict) else x!r}"))
                    continue
                v = x.get("value")
                if not es_numero(v):
                    errores.append((di, f"{param} {p['id']}: valor no numerico {v!r} en {x['date']}"))
                    continue
                ok += 1
                if estatico:
                    fila = tabla.setdefault(p["id"], {"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"]})
                else:
                    fila = tabla.setdefault((p["id"], x["date"]), {
                        "punto": p["id"], "latitud": p["lat"], "longitud": p["lon"],
                        "dia_local": (t - timedelta(days=1)).strftime("%Y-%m-%d"), "marca_utc": x["date"]})
                fila[param] = v
    df = pd.DataFrame(list(tabla.values()))
    return con_ok(df, ok), errores


def combinar_meteomatics(dfs, estatico=False):
    """Une los DataFrames de varios archivos (clima/energia/suelo) en una fila por clave, como el original."""
    tabla = {}
    for df in dfs:
        for rec in df.to_dict("records"):
            k = rec["punto"] if estatico else (rec["punto"], rec["marca_utc"])
            fila = tabla.setdefault(k, {})
            fila.update({a: b for a, b in rec.items() if not (isinstance(b, float) and math.isnan(b))})
    df = pd.DataFrame(list(tabla.values()))
    if df.empty:
        return df
    if estatico:
        return df.sort_values(by="punto", key=lambda s: s.map(ORDEN), kind="stable")
    return df.sort_values(by=["punto", "marca_utc"], key=lambda s: s.map(ORDEN) if s.name == "punto" else s)


# ------------------------------------------------------------------ deteccion de tipo
def detectar_tipo(ruta):
    """Devuelve power, oni, ibtracs, soilgrids, meteo_hist, meteo_pron, meteo_est, imerg, smap, grace o None."""
    ruta = Path(ruta)
    n = ruta.name
    if fnmatch(n, "*3IMERG*_HND.nc4"):
        return "imerg"
    if fnmatch(n, "SMAP_L3_SM_P_E_*_HND.nc4"):
        return "smap"
    if fnmatch(n, "GRCTellus*.nc"):
        return "grace"
    ext = ruta.suffix.lower()
    if ext == ".json":
        meteo = ("meteo_est" if n == "estaticos.json" else "meteo_hist" if fnmatch(n, "hist_*.json")
                 else "meteo_pron" if fnmatch(n, "pronostico_*.json") else None)
        try:
            d = leer_json(ruta)
        except Exception:
            if meteo:
                return meteo
            carpeta = ruta.parent.name.lower()
            if carpeta in ("power", "soilgrids"):
                return carpeta
            return "soilgrids" if ruta.stem.endswith("_cercano") else None
        if isinstance(d, dict):
            prop = d.get("properties")
            if isinstance(prop, dict) and "parameter" in prop:
                return "power"
            if isinstance(prop, dict) and "layers" in prop:
                return "soilgrids"
            if isinstance(d.get("data"), list):
                return meteo
        return None
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            primera = f.readline()
    except Exception:
        return None
    if ext == ".txt" and [x.upper() for x in primera.split()] == ["SEAS", "YR", "TOTAL", "ANOM"]:
        return "oni"
    if ext == ".csv" and primera.startswith("SID,SEASON"):
        return "ibtracs"
    return None


# ------------------------------------------------------------------ fusion con la salida existente
def a_texto(df):
    return pd.read_csv(io.StringIO(df.to_csv(index=False)), dtype=str, keep_default_na=False)


def leer_txt(ruta):
    return pd.read_csv(ruta, dtype=str, keep_default_na=False)


def llave(df, claves):
    s = df[claves[0]]
    for c in claves[1:]:
        s = s + "\x1f" + df[c]
    return s


def ord_punto(col):
    def f(df):
        out = df.assign(_p=df["punto"].map(ORDEN).fillna(999))
        out = out.sort_values(["_p", col] if col else ["_p"], kind="stable")
        return out.drop(columns="_p")
    return f


def ord_col(col):
    return lambda df: df.sort_values(col, kind="stable")


def fusionar(destino, nuevo, claves, orden=None, modo="fila", avisos=None):
    """Anade `nuevo` a `destino` (CSV). Misma clave: la nueva reemplaza a la vieja (modo fila) o actualiza las
    celdas no vacias (modo celda) y se anota un aviso. Devuelve cuantas filas reemplazo."""
    destino = Path(destino)
    nuevo = a_texto(nuevo)
    kn = llave(nuevo, claves)
    dup = kn.duplicated(keep="last")
    if dup.any():
        if avisos is not None:
            avisos.append((destino.name, "", f"{int(dup.sum())} fila(s) repetidas en la misma corrida; gana la ultima"))
        nuevo, kn = nuevo[~dup], kn[~dup]
    nuevo = nuevo.reset_index(drop=True)
    kn = kn.reset_index(drop=True)
    reemplazadas = 0
    if destino.exists():
        viejo = leer_txt(destino)
        cols = list(viejo.columns) + [c for c in nuevo.columns if c not in viejo.columns]
        for c in cols:
            if c not in viejo.columns:
                viejo[c] = ""
            if c not in nuevo.columns:
                nuevo[c] = ""
        viejo, nuevo = viejo[cols], nuevo[cols]
        kv = llave(viejo, claves)
        esta = kn.isin(set(kv))
        reemplazadas = int(esta.sum())
        if reemplazadas:
            vi = viejo.assign(_k=kv).drop_duplicates("_k", keep="last").set_index("_k")
            ni = nuevo[esta].assign(_k=kn[esta]).set_index("_k")
            ref = vi.loc[ni.index, cols]
            if modo == "celda":
                dif = ((ref != ni[cols]) & (ni[cols] != "")).any(axis=1)
            else:
                dif = (ref != ni[cols]).any(axis=1)
            if avisos is not None:
                ej = ", ".join(k.replace("\x1f", "/") for k in list(ni.index[:3]))
                avisos.append((destino.name, ej, f"{reemplazadas} clave(s) ya existian y se reemplazaron "
                                                 f"({int(dif.sum())} con valores distintos); ej.: {ej}"))
        if modo == "celda":
            vi = viejo.assign(_k=kv).set_index("_k")
            nn = nuevo.assign(_k=kn).set_index("_k").replace("", np.nan)
            vi.update(nn[nn.index.isin(vi.index)])
            out = pd.concat([vi.reset_index(drop=True), nuevo[~esta]], ignore_index=True)
        else:
            viejo = viejo.assign(_o=np.arange(len(viejo)))
            pos = dict(zip(kv, viejo["_o"]))
            nuevo = nuevo.assign(_o=[pos.get(k, len(viejo) + i) for i, k in enumerate(kn)])
            out = pd.concat([viejo[~kv.isin(set(kn))], nuevo], ignore_index=True)
            out = out.sort_values("_o", kind="stable").drop(columns="_o")
    else:
        cols = list(nuevo.columns)
        out = nuevo
    if orden:
        out = orden(out)
    destino.parent.mkdir(parents=True, exist_ok=True)
    out[cols].to_csv(destino, index=False)
    return reemplazadas


def escribir_calidad(salida, puntos_tocados):
    dest = salida / "calidad_power.csv"
    nuevas = pd.concat([calidad_de_csv(salida / "power" / f"{pid}.csv", pid) for pid in puntos_tocados],
                       ignore_index=True)
    nuevas = a_texto(nuevas)
    if dest.exists():
        viejo = leer_txt(dest)
        viejo = viejo[~viejo["punto"].isin(puntos_tocados)]
        nuevas = pd.concat([viejo, nuevas], ignore_index=True)
    ord_punto(None)(nuevas).to_csv(dest, index=False)
    return dest


# ------------------------------------------------------------------ registro y errores
def anexar_csv(ruta, columnas, filas):
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    nuevo = not ruta.exists() or ruta.stat().st_size == 0
    with open(ruta, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        if nuevo:
            w.writerow(columnas)
        w.writerows(filas)


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def es_subruta(ruta, base):
    try:
        Path(ruta).resolve().relative_to(Path(base).resolve())
        return True
    except ValueError:
        return False


def listar_archivos(carpeta):
    return sorted(p for p in Path(carpeta).rglob("*")
                  if p.is_file() and not any(parte.startswith(".") for parte in p.relative_to(carpeta).parts))


LECTORES = {"power": leer_power, "oni": leer_oni, "ibtracs": leer_ibtracs, "soilgrids": leer_soilgrids,
            "grace": leer_grace, "imerg": leer_imerg, "smap": leer_smap,
            "meteo_hist": leer_meteomatics, "meteo_pron": leer_meteomatics,
            "meteo_est": lambda r: leer_meteomatics(r, estatico=True)}


def ejecutar(archivos, salida, base_nombres=None, log=print):
    """Procesa la lista de archivos y escribe en `salida`. Devuelve un resumen (dict)."""
    salida = Path(salida)
    salida.mkdir(parents=True, exist_ok=True)
    ahora = lambda: datetime.now().isoformat(timespec="seconds")
    nombre = lambda r: (str(Path(r).resolve().relative_to(Path(base_nombres).resolve()))
                        if base_nombres and es_subruta(r, base_nombres) else str(Path(r).resolve()))
    errores_filas, registro_filas, avisos = [], [], []
    acum = {}  # tipo -> lista de DataFrames
    resumen = {"archivos": 0, "ok": 0, "errores": 0, "desconocidos": 0, "salidas": []}

    # SMAP: dos archivos del mismo dia en la misma corrida -> gana el ultimo en orden alfabetico
    ganador = {}
    for r in sorted(archivos, key=lambda x: Path(x).name):
        if detectar_tipo(r) == "smap":
            m = re.search(r"_E_(\d{8})_", Path(r).name)
            if m:
                ganador[m.group(1)] = r
    ganadores = {str(Path(r).resolve()) for r in ganador.values()}

    malla = None
    for r in sorted(archivos, key=lambda x: Path(x).name):
        r = Path(r)
        arch = nombre(r)
        tipo = detectar_tipo(r)
        if tipo is None:
            resumen["desconocidos"] += 1
            errores_filas.append([ahora(), arch, "desconocido", 0, "tipo de archivo desconocido"])
            log(f"ERROR [desconocido] {arch} registro 0: tipo de archivo desconocido")
            continue
        if tipo == "smap" and str(r.resolve()) not in ganadores:
            log(f"AVISO [smap] {arch}: descartado, otro archivo del mismo dia va despues en orden alfabetico")
            avisos.append((arch, "", "descartado: otro archivo del mismo dia gana en orden alfabetico"))
            registro_filas.append([arch, sha256(r), ahora(), tipo, 0, 0])
            resumen["archivos"] += 1
            continue
        try:
            if tipo == "smap":
                if malla is None:
                    try:
                        malla = cargar_malla_smap()
                    except Exception:
                        malla = False
                df, errs = leer_smap(r, malla if malla is not False else None)
            else:
                df, errs = LECTORES[tipo](r)
        except Exception as e:  # el lector no deberia lanzar, pero un archivo malo no detiene a los demas
            df, errs = con_ok(vacio(), 0), [(0, f"error inesperado al leer: {e!r}")]
        for a in df.attrs.get("avisos", []):
            log(f"AVISO [{tipo}] {arch}: {a}")
            avisos.append((arch, "", a))
        for n, motivo in errs:
            errores_filas.append([ahora(), arch, tipo, n, motivo])
            log(f"ERROR [{tipo}] {arch} registro {n}: {motivo}")
        ok = df.attrs.get("ok", 0)
        if len(df):
            acum.setdefault(tipo, []).append(df)
        log(f"[{tipo}] {arch}: {ok} registros ok, {len(errs)} con error")
        resumen["archivos"] += 1
        resumen["ok"] += ok
        resumen["errores"] += len(errs)
        registro_filas.append([arch, sha256(r), ahora(), tipo, ok, len(errs)])

    escritos, avisos_fus = [], []

    def fus(dest, df, claves, orden=None, modo="fila"):
        rep = fusionar(dest, df, claves, orden, modo, avisos_fus)
        escritos.append(str(dest))
        return rep

    if "power" in acum:
        todo = pd.concat(acum["power"], ignore_index=True)
        tocados = sorted(todo["punto"].unique(), key=lambda x: ORDEN[x])
        for pid in tocados:
            fus(salida / "power" / f"{pid}.csv", todo[todo["punto"] == pid], ["fecha"], ord_col("fecha"))
        fus(salida / "power_diario_largo.csv", todo, ["punto", "fecha"], ord_punto("fecha"))
        escritos.append(str(escribir_calidad(salida, tocados)))
    if "oni" in acum:
        fus(salida / "oni.csv", pd.concat(acum["oni"], ignore_index=True), ["anio", "trimestre"])
    if "ibtracs" in acum:
        fus(salida / "huracanes_caribe_honduras.csv", pd.concat(acum["ibtracs"], ignore_index=True),
            ["sid", "fecha_hora_utc"])
    if "soilgrids" in acum:
        fus(salida / "suelo_por_punto.csv", pd.concat(acum["soilgrids"], ignore_index=True), ["punto"], ord_punto(None))
    for tipo, dest in (("grace", "grace_series.csv"), ("imerg", "imerg_series.csv"), ("smap", "smap_series.csv")):
        if tipo in acum:
            fus(salida / dest, pd.concat(acum[tipo], ignore_index=True), ["punto", "fecha"], ord_punto("fecha"))
    for tipo, dest in (("meteo_hist", "meteomatics_diario_largo.csv"), ("meteo_pron", "meteomatics_pronostico.csv")):
        if tipo in acum:
            df = combinar_meteomatics(acum[tipo])
            fus(salida / dest, df, ["punto", "marca_utc"], ord_punto("marca_utc"), modo="celda")
    if "meteo_est" in acum:
        df = combinar_meteomatics(acum["meteo_est"], estatico=True)
        fus(salida / "meteomatics_estaticos.csv", df, ["punto"], ord_punto(None), modo="celda")

    for d, clave, motivo in avisos_fus:
        log(f"AVISO {d}: {motivo}")
    avisos += avisos_fus
    if avisos:
        anexar_csv(salida / "avisos.csv", ["fecha_hora", "archivo_o_destino", "clave", "motivo"],
                   [[ahora(), d, c, m] for d, c, m in avisos])
    if errores_filas:
        anexar_csv(salida / "errores.csv", ["fecha_hora", "archivo", "tipo", "registro", "motivo"], errores_filas)
        escritos.append(str(salida / "errores.csv"))
    if registro_filas:
        anexar_csv(salida / ".procesados.csv",
                   ["archivo", "sha256", "fecha", "tipo", "registros_ok", "registros_error"], registro_filas)
    resumen["salidas"] = sorted(set(escritos))
    resumen["avisos"] = len(avisos)
    return resumen


def archivos_nuevos(entrada, salida):
    reg = Path(salida) / ".procesados.csv"
    vistos = set(leer_txt(reg)["sha256"]) if reg.exists() else set()
    nuevos = []
    for p in listar_archivos(entrada):
        h = sha256(p)
        if h not in vistos:
            vistos.add(h)  # el mismo contenido dos veces en la misma corrida se procesa una sola vez
            nuevos.append(p)
    return nuevos


def main(argv=None):
    ap = argparse.ArgumentParser(description="Procesa archivos nuevos con las reglas de 10_procesar.py (sin IA, sin red).")
    ap.add_argument("rutas", nargs="*", help="archivos (o carpetas) a procesar; sin rutas, busca nuevos en la entrada")
    ap.add_argument("--entrada", help="carpeta de entrada (defecto: entrada/ o AGRO_ENTRADA)")
    ap.add_argument("--salida", help="carpeta de salida (defecto: salida/ o AGRO_SALIDA)")
    a = ap.parse_args(argv)
    entrada_explicita = a.entrada or os.environ.get("AGRO_ENTRADA")
    entrada = Path(entrada_explicita) if entrada_explicita else RAIZ / "entrada"
    salida = Path(a.salida or os.environ.get("AGRO_SALIDA") or RAIZ / "salida")
    if es_subruta(salida, RAW) or es_subruta(salida, PRO):
        ap.error(f"la salida no puede estar dentro de raw/ ni de processed/: {salida}")
    archivos = []
    for r in a.rutas:
        p = Path(r)
        if p.is_dir():
            archivos += listar_archivos(p)
        elif p.is_file():
            archivos.append(p)
        else:
            ap.error(f"la ruta no existe: {r}")
    if not a.rutas:
        if not entrada.is_dir():
            if entrada_explicita:
                ap.error(f"la carpeta de entrada no existe: {entrada}")
            print(f"No existe la carpeta de entrada {entrada}; nada que procesar.")
        else:
            archivos = archivos_nuevos(entrada, salida)
            if not archivos:
                print(f"No hay archivos nuevos en {entrada}.")
    res = ejecutar(archivos, salida, base_nombres=None if a.rutas else entrada)
    print("\n=== Resumen ===")
    print(f"Archivos procesados: {res['archivos']}" + (f" (tipo desconocido, omitidos: {res['desconocidos']})" if res["desconocidos"] else ""))
    print(f"Registros ok: {res['ok']}")
    print(f"Registros con error: {res['errores'] + res['desconocidos']}")
    if res["avisos"]:
        print(f"Avisos: {res['avisos']} (ver avisos.csv)")
    print("Salidas:")
    for s in res["salidas"] or ["(ninguna)"]:
        print(f"  {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
