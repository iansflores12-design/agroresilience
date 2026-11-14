"""Version procesada: sale SOLO de raw/ y nunca escribe en raw/.

Solo limpieza y orden. No calcula nada del motor del proyecto.
Correr desde la raiz: .venv/bin/python -I scripts/10_procesar.py [power oni ibtracs soilgrids grace imerg smap meteomatics]
Sin argumentos procesa todo. Al final reescribe processed/DICCIONARIO.md.
"""
import csv
import glob
import json
import math
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import netCDF4 as nc
import numpy as np
import pandas as pd
import xarray as xr

RAIZ = Path(__file__).resolve().parent.parent
RAW, PRO = RAIZ / "raw", RAIZ / "processed"
CFG = json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))
PUNTOS, CAJA = CFG["puntos"], CFG["caja_honduras"]
MARGEN = 0.5  # grados alrededor de la caja para los recortes
DIC = {}  # tabla -> dict(fuente, nota, columnas=[(col, unidad, descripcion)])


def km(lat1, lon1, lat2, lon2):
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2)) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def cercano(valores, x):
    return int(np.nanargmin(np.abs(np.asarray(valores, dtype=float) - x)))


# ---------------------------------------------------------------- POWER
def power():
    (PRO / "power").mkdir(parents=True, exist_ok=True)
    todos, calidad, unidades = [], [], {}
    for p in PUNTOS:
        d = json.loads((RAW / "power" / f"{p['id']}.json").read_text())
        relleno = d["header"]["fill_value"]
        par = d["properties"]["parameter"]
        unidades = {k: (v["units"], v["longname"]) for k, v in d["parameters"].items()}
        df = pd.DataFrame(par)
        df.index = pd.to_datetime(df.index, format="%Y%m%d")
        df = df.sort_index().replace(relleno, np.nan)
        for k in df.columns:
            s = df[k]
            calidad.append({"punto": p["id"], "parametro": k, "filas": len(s), "vacios": int(s.isna().sum()),
                            "minimo": s.min(), "maximo": s.max(),
                            "primer_dia": s.index.min().date(), "ultimo_dia": s.index.max().date(),
                            "primer_dia_con_dato": s.first_valid_index().date(),
                            "ultimo_dia_con_dato": s.last_valid_index().date()})
        df.insert(0, "fecha", df.index.strftime("%Y-%m-%d"))
        df.insert(0, "longitud", p["lon"])
        df.insert(0, "latitud", p["lat"])
        df.insert(0, "punto", p["id"])
        df.to_csv(PRO / "power" / f"{p['id']}.csv", index=False)
        todos.append(df)
    pd.concat(todos).to_csv(PRO / "power_diario_largo.csv", index=False)
    pd.DataFrame(calidad).to_csv(PRO / "calidad_power.csv", index=False)
    cols = [("punto", "", "id del punto en config/zonas.json"), ("latitud", "grados", "latitud pedida"),
            ("longitud", "grados", "longitud pedida"), ("fecha", "AAAA-MM-DD", "dia")]
    cols += [(k, u, n) for k, (u, n) in unidades.items()]
    DIC["power_diario_largo.csv y power/<punto>.csv"] = {
        "fuente": "NASA POWER, API diaria por punto, comunidad AG", "dataset": "power",
        "nota": "Relleno -999 convertido a vacio; no se rellena nada. Unidades tal como las reporta POWER.",
        "columnas": cols}
    DIC["calidad_power.csv"] = {
        "fuente": "derivado de raw/power", "dataset": "power", "nota": "Una fila por punto y parametro.",
        "columnas": [("punto", "", ""), ("parametro", "", "nombre POWER"), ("filas", "dias", "dias en la serie"),
                     ("vacios", "dias", "dias con relleno -999"), ("minimo", "unidad del parametro", ""),
                     ("maximo", "unidad del parametro", ""), ("primer_dia", "AAAA-MM-DD", "primer dia de la serie"),
                     ("ultimo_dia", "AAAA-MM-DD", "ultimo dia de la serie"),
                     ("primer_dia_con_dato", "AAAA-MM-DD", ""), ("ultimo_dia_con_dato", "AAAA-MM-DD", "")]}
    print("power: ok", len(todos), "puntos")


# ---------------------------------------------------------------- ONI
def oni():
    filas = []
    for linea in (RAW / "noaa_oni" / "oni.ascii.txt").read_text().splitlines()[1:]:
        c = linea.split()
        if len(c) == 4:
            filas.append({"anio": int(c[1]), "trimestre": c[0], "sst_total": float(c[2]), "oni": float(c[3])})
    pd.DataFrame(filas).to_csv(PRO / "oni.csv", index=False)
    DIC["oni.csv"] = {"fuente": "NOAA CPC (no NASA), oni.ascii.txt", "dataset": "noaa_oni", "nota": "",
                      "columnas": [("anio", "", "columna YR"), ("trimestre", "", "trimestre movil, columna SEAS (DJF, JFM, ...)"),
                                   ("sst_total", "C", "temperatura del mar Nino 3.4, columna TOTAL"),
                                   ("oni", "C", "anomalia, columna ANOM")]}
    print("oni: ok", len(filas), "filas, ultimo", filas[-1]["trimestre"], filas[-1]["anio"])


# ---------------------------------------------------------------- IBTrACS
def dist_caja(lat, lon):
    """Distancia (km) del punto al borde mas cercano de la caja de Honduras; 0 si esta dentro."""
    la = min(max(lat, CAJA["lat_min"]), CAJA["lat_max"])
    lo = min(max(lon, CAJA["lon_min"]), CAJA["lon_max"])
    return km(lat, lon, la, lo)


def ibtracs():
    f = glob.glob(str(RAW / "ibtracs" / "*.csv"))[0]
    usar = ["SID", "SEASON", "NAME", "ISO_TIME", "NATURE", "LAT", "LON", "WMO_WIND", "WMO_PRES",
            "USA_WIND", "USA_PRES", "USA_SSHS", "DIST2LAND", "LANDFALL"]
    df = pd.read_csv(f, skiprows=[1], usecols=usar, dtype=str, keep_default_na=False)
    df = df.apply(lambda s: s.str.strip())
    df = df[df["SEASON"].astype(int) >= 1981].copy()
    df["LAT"], df["LON"] = df["LAT"].astype(float), df["LON"].astype(float)
    df["distancia_caja_km"] = [round(dist_caja(a, b), 1) for a, b in zip(df["LAT"], df["LON"])]
    cerca = df.groupby("SID")["distancia_caja_km"].min()
    sids = cerca[cerca <= 500].index
    df = df[df["SID"].isin(sids)].copy()
    df["dentro_500km"] = (df["distancia_caja_km"] <= 500).astype(int)
    df = df.rename(columns={"SID": "sid", "SEASON": "temporada", "NAME": "nombre", "ISO_TIME": "fecha_hora_utc",
                            "NATURE": "naturaleza", "LAT": "latitud", "LON": "longitud",
                            "WMO_WIND": "viento_wmo_kt", "WMO_PRES": "presion_wmo_mb",
                            "USA_WIND": "viento_usa_kt", "USA_PRES": "presion_usa_mb", "USA_SSHS": "categoria_sshs",
                            "DIST2LAND": "dist_tierra_km", "LANDFALL": "dist_tierra_6h_km"})
    df.to_csv(PRO / "huracanes_caribe_honduras.csv", index=False)
    DIC["huracanes_caribe_honduras.csv"] = {
        "fuente": "NOAA NCEI IBTrACS v04r01, cuenca NA (no NASA)", "dataset": "ibtracs",
        "nota": ("Tormentas de temporada 1981 en adelante con al menos una posicion a 500 km o menos de la caja de "
                 "Honduras (lat 12.9 a 16.6, lon -89.6 a -83.0). Distancia: haversine (radio 6371 km) de la posicion "
                 "al punto mas cercano del rectangulo; 0 si esta dentro. Se conservan todas las posiciones de cada "
                 "tormenta que califica. Valores vacios en el original siguen vacios."),
        "columnas": [("sid", "", "identificador IBTrACS"), ("temporada", "anio", ""), ("nombre", "", "UNNAMED si no tiene"),
                     ("fecha_hora_utc", "AAAA-MM-DD hh:mm:ss UTC", ""), ("naturaleza", "", "TS, ET, DS, etc."),
                     ("latitud", "grados", ""), ("longitud", "grados", ""),
                     ("viento_wmo_kt", "nudos", "viento sostenido maximo, agencia WMO"), ("presion_wmo_mb", "mb", ""),
                     ("viento_usa_kt", "nudos", "viento sostenido maximo, agencia de EE. UU."), ("presion_usa_mb", "mb", ""),
                     ("categoria_sshs", "", "Saffir-Simpson; negativos = no huracan"),
                     ("dist_tierra_km", "km", "DIST2LAND de IBTrACS"), ("dist_tierra_6h_km", "km", "LANDFALL de IBTrACS"),
                     ("distancia_caja_km", "km", "distancia a la caja de Honduras (calculada aqui)"),
                     ("dentro_500km", "0/1", "1 si esta posicion esta a 500 km o menos")]}
    print("ibtracs: ok", df["sid"].nunique(), "tormentas,", len(df), "posiciones")


# ---------------------------------------------------------------- SoilGrids
def soilgrids():
    filas, unidades = [], {}
    for p in PUNTOS:
        fila = {"punto": p["id"], "latitud_punto": p["lat"], "longitud_punto": p["lon"]}
        alt = p.get("suelo_alterno")
        f = RAW / "soilgrids" / (f"{p['id']}_cercano.json" if alt else f"{p['id']}.json")
        fila["origen"] = "alterno" if alt else "original"
        fila["latitud_consulta"] = alt["lat"] if alt else p["lat"]
        fila["longitud_consulta"] = alt["lon"] if alt else p["lon"]
        fila["distancia_km"] = alt["distancia_km"] if alt else 0
        for capa in json.loads(f.read_text())["properties"]["layers"]:
            um = capa["unit_measure"]
            unidades[capa["name"]] = um
            for d in capa["depths"]:
                fila[f"{capa['name']}_{d['label'].replace('-', '_')}"] = d["values"]["mean"]
        filas.append(fila)
    pd.DataFrame(filas).to_csv(PRO / "suelo_por_punto.csv", index=False)
    nombres = {"clay": "arcilla", "sand": "arena", "silt": "limo", "soc": "carbono organico del suelo",
               "phh2o": "pH en agua", "bdod": "densidad aparente", "cec": "capacidad de intercambio cationico"}
    cols = [("punto", "", ""), ("latitud_punto", "grados", "coordenada de zonas.json"), ("longitud_punto", "grados", ""),
            ("origen", "", "original = coordenada del punto; alterno = punto cercano con datos (el original vino nulo)"),
            ("latitud_consulta", "grados", "coordenada realmente consultada"), ("longitud_consulta", "grados", ""),
            ("distancia_km", "km", "distancia entre el punto y la coordenada consultada")]
    for k, um in unidades.items():
        cols.append((f"{k}_<profundidad>", um["mapped_units"],
                     f"{nombres.get(k, k)}, valor mean tal como lo entrega SoilGrids; dividir entre {um['d_factor']} "
                     f"para obtener {um['target_units']}. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm"))
    DIC["suelo_por_punto.csv"] = {"fuente": "ISRIC SoilGrids v2.0 (no NASA)", "dataset": "soilgrids",
                                  "nota": "Valores sin convertir (unidades mapeadas de SoilGrids). Los puntos alternos no estan verificados como agricolas.",
                                  "columnas": cols}
    print("soilgrids: ok", len(filas), "puntos;", sum(1 for f in filas if f["origen"] == "alterno"), "alternos")


# ---------------------------------------------------------------- GRACE
def grace():
    f = glob.glob(str(RAW / "grace" / "*.nc"))[0]
    ds = xr.open_dataset(f)
    ds = ds.assign_coords(lon=(((ds.lon + 180) % 360) - 180)).sortby("lon")
    rec = ds[["lwe_thickness", "uncertainty", "land_mask", "scale_factor"]].sel(
        lat=slice(CAJA["lat_min"] - MARGEN, CAJA["lat_max"] + MARGEN),
        lon=slice(CAJA["lon_min"] - MARGEN, CAJA["lon_max"] + MARGEN))
    rec.to_netcdf(PRO / "grace_honduras.nc")
    filas = []
    for p in PUNTOS:
        c = rec.sel(lat=p["lat"], lon=p["lon"], method="nearest")
        for t, a, b in zip(c.time.values, c.lwe_thickness.values, c.uncertainty.values):
            filas.append({"punto": p["id"], "fecha": str(t)[:10], "celda_lat": float(c.lat), "celda_lon": float(c.lon),
                          "lwe_thickness": a, "uncertainty": b, "scale_factor": float(c.scale_factor),
                          "land_mask": int(c.land_mask)})
    pd.DataFrame(filas).to_csv(PRO / "grace_series.csv", index=False)
    DIC["grace_series.csv y grace_honduras.nc"] = {
        "fuente": "NASA PO.DAAC, TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4", "dataset": "grace",
        "nota": ("Recorte: caja de Honduras mas 0.5 grados; longitudes pasadas de 0-360 a -180-180. Serie: celda de "
                 "0.5 grados mas cercana a cada punto. La resolucion real es de mascons de 3 grados, asi que puntos "
                 "vecinos comparten valores. scale_factor se entrega aparte y NO se aplico. Meses sin dato en el original "
                 "(vacio entre GRACE y GRACE-FO, 2017-2018) no aparecen."),
        "columnas": [("punto", "", ""), ("fecha", "AAAA-MM-DD", "fecha central del mes segun el archivo"),
                     ("celda_lat", "grados", "centro de la celda usada"), ("celda_lon", "grados", ""),
                     ("lwe_thickness", "cm", "anomalia de espesor equivalente de agua"),
                     ("uncertainty", "cm", "incertidumbre 1-sigma"),
                     ("scale_factor", "adimensional", "factor de ganancia CRI, no aplicado"),
                     ("land_mask", "0/1", "1 = tierra")]}
    print("grace: ok", len(rec.time), "meses,", dict(rec.sizes))


# ---------------------------------------------------------------- IMERG
def imerg():
    archivos = sorted(glob.glob(str(RAW / "imerg" / "*_HND.nc4")))
    var = ["precipitation", "randomError", "precipitation_cnt_cond", "MWprecipitation"]
    fechas, datos = [], {v: [] for v in var}
    lat = lon = None
    for f in archivos:
        d = nc.Dataset(f)
        d.set_auto_mask(False)
        if lat is None:
            lat, lon = d["lat"][:].astype("f8"), d["lon"][:].astype("f8")
        fechas.append(pd.Timestamp(re.search(r"3IMERG\.(\d{8})", f).group(1)))
        for v in var:
            datos[v].append(d[v][0].T)  # (lon, lat) -> (lat, lon)
        d.close()
    ds = xr.Dataset(coords={"time": fechas, "lat": lat, "lon": lon})
    unidades = {"precipitation": "mm/day", "randomError": "mm/day", "MWprecipitation": "mm/day",
                "precipitation_cnt_cond": "count"}
    for v in var:
        a = np.stack(datos[v])
        if a.dtype.kind == "f":
            a = np.where(a < -9000, np.nan, a).astype("f4")
        ds[v] = (("time", "lat", "lon"), a, {"units": unidades[v]})
    ds.to_netcdf(PRO / "imerg_honduras.nc", encoding={v: {"zlib": True, "complevel": 4} for v in var})
    partes = []
    for p in PUNTOS:
        i, j = cercano(lat, p["lat"]), cercano(lon, p["lon"])
        df = pd.DataFrame({v: ds[v].values[:, i, j] for v in var})
        df.insert(0, "celda_lon", round(float(lon[j]), 2))
        df.insert(0, "celda_lat", round(float(lat[i]), 2))
        df.insert(0, "fecha", [t.strftime("%Y-%m-%d") for t in fechas])
        df.insert(0, "punto", p["id"])
        partes.append(df)
    pd.concat(partes).to_csv(PRO / "imerg_series.csv", index=False)
    DIC["imerg_series.csv y imerg_honduras.nc"] = {
        "fuente": "NASA GES DISC, GPM_3IMERGDF V07 (Final, diario)", "dataset": "imerg",
        "nota": ("Los archivos crudos ya son un recorte de Honduras; aqui solo se unen en un NetCDF (time, lat, lon) y se "
                 "convierte el relleno -9999.9 a vacio. Serie: celda de 0.1 grados mas cercana a cada punto. El dia es UTC. "
                 "Final llega hasta 2025-09-30."),
        "columnas": [("punto", "", ""), ("fecha", "AAAA-MM-DD (UTC)", ""), ("celda_lat", "grados", "centro de la celda usada"),
                     ("celda_lon", "grados", ""), ("precipitation", "mm/day", "lluvia diaria, estimacion combinada"),
                     ("randomError", "mm/day", "error aleatorio de la estimacion"),
                     ("precipitation_cnt_cond", "conteo", "numero de medias horas con lluvia en el dia"),
                     ("MWprecipitation", "mm/day", "lluvia solo de sensores de microondas")]}
    print("imerg: ok", len(fechas), "dias,", dict(ds.sizes))


# ---------------------------------------------------------------- SMAP
def smap():
    archivos = sorted(glob.glob(str(RAW / "smap" / "*_HND.nc4")))
    por_fecha, descartados = {}, []
    for f in archivos:  # si hay dos archivos del mismo dia se usa el ultimo en orden alfabetico
        dia = re.search(r"_E_(\d{8})_", f).group(1)
        if dia in por_fecha:
            descartados.append(Path(por_fecha[dia]).name)
        por_fecha[dia] = f
    base = ["soil_moisture", "retrieval_qual_flag", "soil_moisture_error", "surface_temperature",
            "vegetation_water_content", "surface_flag"]
    datos = {f"{v}_{s}": [] for v in base for s in ("am", "pm")}
    lat_f = lon_c = None
    for dia in sorted(por_fecha):
        d = nc.Dataset(por_fecha[dia])
        d.set_auto_mask(False)
        for s, grupo, suf in (("am", "Soil_Moisture_Retrieval_Data_AM", ""), ("pm", "Soil_Moisture_Retrieval_Data_PM", "_pm")):
            g = d.groups[grupo]
            la, lo = g["latitude" + suf][:], g["longitude" + suf][:]
            la = np.where(la < -9000, np.nan, la)
            lo = np.where(lo < -9000, np.nan, lo)
            if lat_f is None:
                lat_f, lon_c = np.full(la.shape[0], np.nan), np.full(la.shape[1], np.nan)
            with np.errstate(all="ignore"):
                lat_f = np.fmax(lat_f, np.where(np.isnan(la).all(axis=1), np.nan, np.nanmax(np.nan_to_num(la, nan=-999), axis=1)))
                lon_c = np.fmax(lon_c, np.where(np.isnan(lo).all(axis=0), np.nan, np.nanmax(np.nan_to_num(lo, nan=-999), axis=0)))
            for v in base:
                a = g[v + suf][:]
                if a.dtype.kind == "f":
                    a = np.where(a < -9000, np.nan, a).astype("f4")
                datos[f"{v}_{s}"].append(a)
        d.close()
    fechas = [pd.Timestamp(x) for x in sorted(por_fecha)]
    ds = xr.Dataset(coords={"time": fechas, "lat": ("y", lat_f), "lon": ("x", lon_c)})
    unidades = {"soil_moisture": "cm3/cm3", "soil_moisture_error": "cm3/cm3", "surface_temperature": "K",
                "vegetation_water_content": "kg/m2", "retrieval_qual_flag": "bits", "surface_flag": "bits"}
    for k, lista in datos.items():
        ds[k] = (("time", "y", "x"), np.stack(lista), {"units": unidades[k[:-3]]})
    ds.to_netcdf(PRO / "smap_honduras.nc", encoding={k: {"zlib": True, "complevel": 4} for k in datos})
    partes = []
    for p in PUNTOS:
        i, j = cercano(lat_f, p["lat"]), cercano(lon_c, p["lon"])
        df = pd.DataFrame({k: ds[k].values[:, i, j] for k in datos if not k.startswith("surface_flag")})
        for k in ("retrieval_qual_flag_am", "retrieval_qual_flag_pm"):
            df[k] = df[k].where(df[k] != 65534).astype("Int64")
        df.insert(0, "celda_lon", round(float(lon_c[j]), 4))
        df.insert(0, "celda_lat", round(float(lat_f[i]), 4))
        df.insert(0, "fecha", [t.strftime("%Y-%m-%d") for t in fechas])
        df.insert(0, "punto", p["id"])
        partes.append(df)
    pd.concat(partes).to_csv(PRO / "smap_series.csv", index=False)
    DIC["smap_series.csv y smap_honduras.nc"] = {
        "fuente": "NASA NSIDC, SPL3SMP_E v006 (9 km, diario)", "dataset": "smap",
        "nota": ("Los archivos crudos ya son un recorte de Honduras; aqui se unen en un NetCDF (time, y, x) con pasada "
                 "AM (6 am, descendente) y PM (6 pm, ascendente). Relleno -9999 (y 65534 en banderas) convertido a vacio. "
                 "La latitud de cada fila y la longitud de cada columna se tomaron de las celdas con dato (malla EASE-Grid 2.0). "
                 "Serie: celda mas cercana a cada punto; SMAP no observa cada celda todos los dias, asi que hay muchos vacios. "
                 f"Fechas con dos archivos: se uso el ultimo en orden alfabetico y se dejaron fuera {len(descartados)}: "
                 + ", ".join(descartados) + ". No se filtro por bandera de calidad."),
        "columnas": [("punto", "", ""), ("fecha", "AAAA-MM-DD", "dia del archivo"), ("celda_lat", "grados", "centro de la celda usada"),
                     ("celda_lon", "grados", ""), ("soil_moisture_am / _pm", "cm3/cm3", "humedad del suelo superficial (0-5 cm)"),
                     ("retrieval_qual_flag_am / _pm", "bits", "bandera de calidad; 0 = recuperacion recomendada"),
                     ("soil_moisture_error_am / _pm", "cm3/cm3", "error estimado"),
                     ("surface_temperature_am / _pm", "K", "temperatura efectiva del suelo usada en la recuperacion"),
                     ("vegetation_water_content_am / _pm", "kg/m2", "contenido de agua de la vegetacion"),
                     ("surface_flag_am / _pm (solo en el .nc)", "bits", "bandera de superficie")]}
    print("smap: ok", len(fechas), "dias,", dict(ds.sizes), "descartados", len(descartados))


# ---------------------------------------------------------------- Meteomatics
def meteomatics():
    def leer(patron):
        tabla = {}
        for f in sorted(glob.glob(str(RAW / "meteomatics" / patron))):
            for par in json.loads(Path(f).read_text())["data"]:
                for p, c in zip(PUNTOS, par["coordinates"]):
                    assert abs(c["lat"] - p["lat"]) < 1e-6 and abs(c["lon"] - p["lon"]) < 1e-6, f
                    for x in c["dates"]:
                        tabla.setdefault((p["id"], x["date"]), {})[par["parameter"]] = x["value"]
        filas = []
        for (pid, fecha), vals in tabla.items():
            t = datetime.strptime(fecha, "%Y-%m-%dT%H:%M:%SZ")
            p = next(q for q in PUNTOS if q["id"] == pid)
            filas.append({"punto": pid, "latitud": p["lat"], "longitud": p["lon"],
                          "dia_local": (t - timedelta(days=1)).strftime("%Y-%m-%d"), "marca_utc": fecha, **vals})
        orden = {p["id"]: n for n, p in enumerate(PUNTOS)}
        return pd.DataFrame(filas).sort_values(by=["punto", "marca_utc"], key=lambda s: s.map(orden) if s.name == "punto" else s)

    hist = leer("hist_*.json")
    hist.to_csv(PRO / "meteomatics_diario_largo.csv", index=False)
    pron = leer("pronostico_*.json")
    pron.to_csv(PRO / "meteomatics_pronostico.csv", index=False)
    est = json.loads((RAW / "meteomatics" / "estaticos.json").read_text())["data"]
    filas = [{"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"]} for p in PUNTOS]
    for par in est:
        for fila, c in zip(filas, par["coordinates"]):
            fila[par["parameter"]] = c["dates"][0]["value"]
    pd.DataFrame(filas).to_csv(PRO / "meteomatics_estaticos.csv", index=False)
    desc = {
        "t_max_2m_24h:C": ("C", "temperatura maxima a 2 m en las 24 h previas"),
        "t_min_2m_24h:C": ("C", "temperatura minima a 2 m en las 24 h previas"),
        "t_mean_2m_24h:C": ("C", "temperatura media a 2 m en las 24 h previas"),
        "precip_24h:mm": ("mm", "lluvia acumulada en las 24 h previas"),
        "relative_humidity_mean_2m_24h:p": ("%", "humedad relativa media 24 h"),
        "relative_humidity_max_2m_24h:p": ("%", "humedad relativa maxima 24 h"),
        "relative_humidity_min_2m_24h:p": ("%", "humedad relativa minima 24 h"),
        "wind_speed_mean_10m_24h:ms": ("m/s", "viento medio a 10 m en 24 h"),
        "wind_gusts_10m_24h:ms": ("m/s", "racha maxima a 10 m en 24 h"),
        "global_rad_24h:J": ("J/m2", "radiacion global acumulada en 24 h"),
        "evapotranspiration_24h:mm": ("mm", "evapotranspiracion acumulada en 24 h"),
        "sunshine_duration_24h:h": ("h", "horas de sol en 24 h"),
        "dew_point_2m:C": ("C", "punto de rocio a 2 m, valor instantaneo a las 06:00Z"),
        "t_0m:C": ("C", "temperatura en superficie, instantanea a las 06:00Z"),
        "t_-15cm:C": ("C", "temperatura del suelo a 15 cm, instantanea a las 06:00Z"),
        "leaf_wetness:idx": ("indice", "humedad de hoja, instantanea a las 06:00Z"),
        "frost_days:d": ("dias", "dias de helada segun Meteomatics"),
        "soil_moisture_index_-15cm:idx": ("indice", "indice de humedad del suelo a 15 cm"),
        "soil_moisture_index_-50cm:idx": ("indice", "indice de humedad del suelo a 50 cm"),
        "soil_moisture_index_-150cm:idx": ("indice", "indice de humedad del suelo a 150 cm"),
        "soil_moisture_deficit:mm": ("mm", "deficit de humedad del suelo"),
        "volumetric_soil_water_-15cm:m3m3": ("m3/m3", "agua volumetrica del suelo a 15 cm"),
        "drought_index:idx": ("indice", "indice de sequia de Meteomatics"),
        "soil_type:idx": ("indice", "tipo de suelo segun Meteomatics"),
        "elevation:m": ("m", "elevacion del modelo"),
    }
    cols = [("punto", "", ""), ("latitud", "grados", ""), ("longitud", "grados", ""),
            ("dia_local", "AAAA-MM-DD", "dia de Honduras que resume el valor (marca_utc menos un dia)"),
            ("marca_utc", "ISO 8601", "marca de tiempo pedida, 06:00Z = medianoche de Honduras")]
    cols += [(k, u, d) for k, (u, d) in desc.items() if k in hist.columns]
    DIC["meteomatics_diario_largo.csv y meteomatics_pronostico.csv"] = {
        "fuente": "Meteomatics API (comercial, no NASA), cuenta del hackathon", "dataset": "meteomatics",
        "nota": ("Valores de modelo/reanalisis, no de estacion. Los parametros *_24h cubren las 24 h que terminan en marca_utc. "
                 "meteomatics_pronostico.csv es PRONOSTICO emitido el dia de la descarga, no observacion. "
                 "Descripciones redactadas a partir del nombre del parametro; confirmar en la documentacion de Meteomatics."),
        "columnas": cols}
    DIC["meteomatics_estaticos.csv"] = {
        "fuente": "Meteomatics API (comercial, no NASA)", "dataset": "meteomatics", "nota": "",
        "columnas": [("punto", "", ""), ("latitud", "grados", ""), ("longitud", "grados", "")]
                    + [(k, *desc[k]) for k in ("soil_type:idx", "elevation:m")]}
    print("meteomatics: ok", len(hist), "filas historicas,", len(pron), "de pronostico")


# ---------------------------------------------------------------- Diccionario
def diccionario():
    fechas = {}
    with open(RAIZ / "manifest" / "raw_manifest.csv", newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            d = fila["fecha_descarga_hn"][:10]
            a, b = fechas.get(fila["dataset"], (d, d))
            fechas[fila["dataset"]] = (min(a, d), max(b, d))
    cache = PRO / ".diccionario.json"
    previo = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    previo.update(DIC)
    cache.write_text(json.dumps(previo, ensure_ascii=False, indent=1), encoding="utf-8")
    out = ["# Diccionario de datos de processed/", "",
           "> `processed/` no se carga a la aplicación hasta que los organizadores confirmen por escrito que limpiar archivos antes del evento está permitido.",
           "", "Todo sale de `raw/` con `scripts/10_procesar.py`. Solo limpieza y orden: sin percentiles, grados-día, balances ni puntajes. Los vacíos son datos faltantes en el origen; no se rellenó nada.", ""]
    for tabla, d in previo.items():
        a, b = fechas.get(d["dataset"], ("?", "?"))
        out += [f"## {tabla}", "", f"- Fuente: {d['fuente']}",
                f"- Fecha de descarga (hora de Honduras): {a}" + ("" if a == b else f" a {b}")]
        if d["nota"]:
            out.append(f"- Notas: {d['nota']}")
        out += ["", "| Columna | Unidad | Descripción |", "| --- | --- | --- |"]
        out += [f"| `{c}` | {u} | {x} |" for c, u, x in d["columnas"]]
        out.append("")
    (PRO / "DICCIONARIO.md").write_text("\n".join(out), encoding="utf-8")
    print("diccionario: ok", len(previo), "tablas")


PASOS = {"power": power, "oni": oni, "ibtracs": ibtracs, "soilgrids": soilgrids, "grace": grace,
         "imerg": imerg, "smap": smap, "meteomatics": meteomatics}

if __name__ == "__main__":
    PRO.mkdir(exist_ok=True)
    for nombre in (sys.argv[1:] or list(PASOS)):
        PASOS[nombre]()
    diccionario()
