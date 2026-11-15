"""Fuentes que faltaban segun la lista de variables del equipo (2026-11-14), solo ultimos 20 anios
(desde 2006-01-01) y pensadas para disco escaso: series POR PUNTO en vez de mosaicos.

  gaez     FAO GAEZ v4 (no NASA): aptitud y rendimiento alcanzable de maiz, frijol, sorgo, cafe y
           yuca (secano, insumos alto y bajo, clima 1981-2010), duracion del periodo de crecimiento
           (LGP) y limitaciones del suelo. GeoTIFF globales de 5 arcmin tal como los publica FAO.
  era5     ERA5 (ECMWF, no NASA) servido por la API de archivo de Open-Meteo (sin cuenta), modelo
           era5, diario en hora de Honduras, 11 puntos. NO es la descarga oficial del CDS de
           Copernicus; para esa hace falta cuenta y llave CDS.
  enviar   Crea tareas de puntos en AppEEARS (NASA LP DAAC): SMAP L4 raiz (SPL4SMGP), MOD13Q1
           NDVI+EVI, HLS S30 (Sentinel-2) y HLS L30 (Landsat 8/9) con las bandas de NDVI y NDMI.
  bajar    Espera esas tareas y baja los CSV.

Correr (desde scripts/): ../.venv/bin/python 18_faltantes.py gaez|gaez_recorte|era5|enviar|bajar
Credenciales Earthdata: ~/.netrc. No se guardan en disco ni en logs.
"""
import base64
import json
import netrc
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from comun import RAIZ, RAW, TZ_HN, bajar, logger, resumen, zonas

DESDE = "2006-01-01"

# ---------------------------------------------------------------- GAEZ
S3 = "https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org"
CULTIVOS = {"mze": "maiz", "phb": "frijol", "srg": "sorgo", "cof": "cafe", "csv": "yuca"}


def gaez_urls():
    urls = []
    for c in CULTIVOS:
        for nivel, carpeta in (("H", "8110H"), ("L", "8110L")):
            for var in ("sx", "si", "yx"):  # indice 0-10000, clase, rendimiento alcanzable
                urls.append(f"{S3}/res05/CRUTS32/Hist/{carpeta}/{var}{nivel}r_{c}.tif")
    urls += [f"{S3}/res01/CRUTS32/Hist/lgd_CRUTS32_Hist_8110.tif",
             f"{S3}/res01/CRUTS32/Hist/lgd_CRUTS32_Hist_0010.tif"]
    urls += [f"{S3}/res01/CRUTS32/Hist/TS/lgd_{a}.tif" for a in range(2006, 2011)]  # FAO publica hasta 2010
    for n in ("H", "L"):
        urls.append(f"{S3}/LR/soi1/SQ0_idx_v9a{n}.tif")
        urls += [f"{S3}/LR/soi1/SQ{i}_mze_v9a{n}.tif" for i in range(0, 8)]
        urls.append(f"{S3}/LR/soi2/si{n}r_sst_mze.tif")
    urls.append(f"{S3}/LR/aez/aez_v9v2_CRUTS32_Hist_8110_100_avg.tif")
    return urls


def gaez(log):
    res = []
    for u in gaez_urls():
        res.append(bajar("gaez", u, RAW / "gaez" / u.rsplit("/", 1)[-1], log,
                         nota="FAO GAEZ v4, GeoTIFF global 5 arcmin sin recortar", timeout=300, intentos=2))
    resumen("gaez", res, RAW / "gaez")


# Las capas de recursos de tierra (limitaciones del suelo, aptitud de suelo y terreno, AEZ) vienen con
# compresion LERC, que no se puede leer sin librerias nativas. Para esas se pide al servicio de imagenes
# de FAO un recorte de Honduras SIN compresion, alineado a la malla original y sin remuestreo.
SERVICIO = "https://gaez-services.fao.org/server/rest/services/LR/ImageServer"
CAJA_GAEZ = (-89.75, 12.75, -82.75, 16.75)  # caja de zonas.json ampliada a multiplos de 5 arcmin


def gaez_lerc():
    import tifffile
    out = []
    for f in sorted((RAW / "gaez").glob("*.tif")):
        with tifffile.TiffFile(f) as t:
            p = t.pages[0]
            if int(p.compression) == 34887:
                out.append((f.stem, p.tags[33550].value[0]))
    return out


def gaez_recorte(log):
    from comun import AGENTE
    res = []
    for nombre, paso in gaez_lerc():
        q = urllib.parse.urlencode({"where": f"download_url LIKE '%/{nombre}.tif'", "outFields": "objectid",
                                    "returnGeometry": "false", "f": "json"})
        req = urllib.request.Request(f"{SERVICIO}/query?{q}", headers={"User-Agent": AGENTE})
        feats = json.load(urllib.request.urlopen(req, timeout=90)).get("features", [])
        if len(feats) != 1:
            log.error("%s: %d coincidencias en el servicio, se omite", nombre, len(feats))
            res.append("fallo")
            continue
        oid = list(feats[0]["attributes"].values())[0]
        ancho = round((CAJA_GAEZ[2] - CAJA_GAEZ[0]) / paso)
        alto = round((CAJA_GAEZ[3] - CAJA_GAEZ[1]) / paso)
        q = urllib.parse.urlencode({
            "bbox": ",".join(map(str, CAJA_GAEZ)), "bboxSR": 4326, "imageSR": 4326, "size": f"{ancho},{alto}",
            "format": "tiff", "compression": "None", "interpolation": "RSP_NearestNeighbor",
            "mosaicRule": json.dumps({"mosaicMethod": "esriMosaicLockRaster", "lockRasterIds": [oid]}),
            "f": "image"})
        res.append(bajar("gaez_recorte", f"{SERVICIO}/exportImage?{q}", RAW / "gaez_recorte" / f"{nombre}.tif", log,
                         nota=f"FAO GAEZ v4 LR objectid {oid}; recorte Honduras sin compresion, vecino mas cercano, "
                              f"misma malla que el global (LERC ilegible sin librerias)", timeout=300))
    resumen("gaez_recorte", res, RAW / "gaez_recorte")


# ---------------------------------------------------------------- ERA5 (Open-Meteo)
ERA5_DIARIO = ["temperature_2m_mean", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
               "soil_moisture_0_to_7cm_mean", "soil_moisture_7_to_28cm_mean",
               "soil_moisture_28_to_100cm_mean", "soil_moisture_100_to_255cm_mean"]


def era5(log):
    fin = (datetime.now(TZ_HN) - timedelta(days=7)).strftime("%Y-%m-%d")  # ERA5 llega con ~5 dias
    res = []
    for p in zonas()["puntos"]:
        q = urllib.parse.urlencode({"latitude": p["lat"], "longitude": p["lon"], "start_date": DESDE,
                                    "end_date": fin, "models": "era5", "timezone": "America/Tegucigalpa",
                                    "daily": ",".join(ERA5_DIARIO)})
        r = bajar("era5", f"https://archive-api.open-meteo.com/v1/archive?{q}",
                  RAW / "era5" / f"{p['id']}.json", log, timeout=300, pausa=65,
                  nota=f"ERA5 via Open-Meteo (no CDS oficial), diario hora Honduras, {DESDE} a {fin}")
        res.append(r)
        if r == "ok":
            time.sleep(65)  # limite por minuto de Open-Meteo (pesa por variables x anios)
    resumen("era5", res, RAW / "era5")


# ---------------------------------------------------------------- AppEEARS por punto
API = "https://appeears.earthdatacloud.nasa.gov/api"
ESTADO = RAIZ / "manifest" / "appeears_puntos_tareas.json"
TAREAS = {
    "spl4smgp": ("SPL4SMGP.008", ["Geophysical_Data_sm_rootzone", "Geophysical_Data_sm_surface"], "03-31-2015"),
    "mod13q1": ("MOD13Q1.061", ["_250m_16_days_NDVI", "_250m_16_days_EVI", "_250m_16_days_pixel_reliability"],
                "01-01-2006"),
    "hlss30": ("HLSS30.020", ["B04", "B08", "B8A", "B11", "Fmask"], "11-28-2015"),
    "hlsl30": ("HLSL30.020", ["B04", "B05", "B06", "Fmask"], "04-11-2013"),
}


def token():
    u, _, p = netrc.netrc().authenticators("urs.earthdata.nasa.gov")
    req = urllib.request.Request(f"{API}/login", method="POST",
                                 headers={"Authorization": "Basic " + base64.b64encode(f"{u}:{p}".encode()).decode()})
    return json.load(urllib.request.urlopen(req, timeout=60))["token"]


def pedir(tk, ruta, datos=None):
    req = urllib.request.Request(f"{API}/{ruta}", data=json.dumps(datos).encode() if datos else None,
                                 headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))


def enviar(log):
    tk = token()
    fin = (datetime.now(TZ_HN) - timedelta(days=1)).strftime("%m-%d-%Y")
    coords = [{"id": p["id"], "category": p["id"], "latitude": p["lat"], "longitude": p["lon"]}
              for p in zonas()["puntos"]]
    ids = json.loads(ESTADO.read_text()) if ESTADO.exists() else {}
    for nombre, (prod, capas, ini) in TAREAS.items():
        if nombre in ids:
            continue
        t = {"task_type": "point", "task_name": f"honduras_puntos_{nombre}",
             "params": {"dates": [{"startDate": ini, "endDate": fin}],
                        "layers": [{"product": prod, "layer": c} for c in capas], "coordinates": coords}}
        r = pedir(tk, "task", t)
        ids[nombre] = r["task_id"]
        log.info("tarea enviada %s %s-%s: %s", nombre, ini, fin, r["task_id"])
        ESTADO.write_text(json.dumps(ids, indent=1))


def descargar(log):
    ids = json.loads(ESTADO.read_text())
    pendientes = dict(ids)
    res = {n: [] for n in ids}
    while pendientes:
        try:
            tk = token()
        except Exception as e:  # cortes de red o DNS: se reintenta en la siguiente vuelta
            log.error("sin token (%r); reintento en 2 minutos", e)
            time.sleep(120)
            continue
        for nombre, tid in list(pendientes.items()):
            try:
                est = pedir(tk, f"task/{tid}")["status"]
                archivos = pedir(tk, f"bundle/{tid}")["files"] if est == "done" else []
            except Exception as e:
                log.error("tarea %s: error de red al consultar (%r); se reintenta", nombre, e)
                continue
            log.info("tarea %s %s: %s", nombre, tid, est)
            if est in ("error", "deleted"):
                log.error("tarea %s termino en %s", tid, est)
                pendientes.pop(nombre)
            elif est == "done":
                for a in archivos:
                    arch = a["file_name"].rsplit("/", 1)[-1]
                    if arch.lower().endswith((".csv", ".json", ".txt", ".xml")):
                        res[nombre].append(bajar("appeears_puntos", f"{API}/bundle/{tid}/{a['file_id']}",
                                                 RAW / "appeears_puntos" / nombre / arch, log, timeout=600,
                                                 nota=f"AppEEARS tarea de puntos {tid}; 11 puntos de zonas.json",
                                                 cabeceras={"Authorization": f"Bearer {tk}"}))
                pendientes.pop(nombre)
        if pendientes:
            time.sleep(120)
    for nombre, r in res.items():
        resumen(f"appeears_{nombre}", r, RAW / "appeears_puntos" / nombre)


if __name__ == "__main__":
    accion = (sys.argv[1:] or ["gaez"])[0]
    log = logger({"gaez": "gaez", "gaez_recorte": "gaez", "era5": "era5"}.get(accion, "appeears_puntos"))
    {"gaez": gaez, "gaez_recorte": gaez_recorte, "era5": era5, "enviar": enviar, "bajar": descargar}[accion](log)
