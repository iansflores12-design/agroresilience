"""MOD13Q1 v061 NDVI + calidad (pixel_reliability) 250 m, 16 dias, 2000-02 a hoy, recortado por
AppEEARS (NASA LP DAAC) a TODA la caja de Honduras, GeoTIFF en EPSG:4326. Una tarea por tramo de anios.
Credenciales: ~/.netrc (urs.earthdata.nasa.gov); el token no se guarda en disco ni en logs.
Correr: python3 17_appeears_ndvi.py [enviar|bajar]   (enviar crea tareas; bajar espera y descarga)
"""
import json
import netrc
import sys
import time
import urllib.request
import urllib.error
import base64
from pathlib import Path

from comun import RAIZ, RAW, bajar, logger, registrar, resumen, zonas, en_manifiesto

API = "https://appeears.earthdatacloud.nasa.gov/api"
TRAMOS = [("02-18-2000", "12-31-2007"), ("01-01-2008", "12-31-2015"), ("01-01-2016", "12-31-2021"), ("01-01-2022", "11-10-2026")]
CAPAS = ["_250m_16_days_NDVI", "_250m_16_days_pixel_reliability"]
ESTADO = RAIZ / "manifest" / "appeears_tareas.json"


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
    c = zonas()["caja_honduras"]
    poly = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {
        "type": "Polygon", "coordinates": [[[c["lon_min"], c["lat_min"]], [c["lon_max"], c["lat_min"]],
                                             [c["lon_max"], c["lat_max"]], [c["lon_min"], c["lat_max"]],
                                             [c["lon_min"], c["lat_min"]]]]}}]}
    ids = json.loads(ESTADO.read_text()) if ESTADO.exists() else {}
    for ini, fin in TRAMOS:
        if ini in ids:
            continue
        t = {"task_type": "area", "task_name": f"honduras_mod13q1_{ini[-4:]}_{fin[-4:]}",
             "params": {"dates": [{"startDate": ini, "endDate": fin}],
                        "layers": [{"product": "MOD13Q1.061", "layer": l} for l in CAPAS],
                        "output": {"format": {"type": "geotiff"}, "projection": "geographic"},
                        "geo": poly}}
        r = pedir(tk, "task", t)
        ids[ini] = r["task_id"]
        log.info("tarea enviada %s-%s: %s %s", ini, fin, r["task_id"], r.get("status"))
    ESTADO.write_text(json.dumps(ids, indent=1))


def descargar(log):
    ids = json.loads(ESTADO.read_text())
    res = []
    for ini, tid in ids.items():
        while True:
            tk = token()
            est = pedir(tk, f"task/{tid}")["status"]
            log.info("tarea %s: %s", tid, est)
            if est == "done":
                break
            if est in ("error", "deleted"):
                log.error("tarea %s termino en %s", tid, est)
                break
            time.sleep(120)
        if est != "done":
            continue
        for a in pedir(tk, f"bundle/{tid}")["files"]:
            nombre = a["file_name"].rsplit("/", 1)[-1]
            if not nombre.lower().endswith((".tif", ".csv", ".json", ".txt", ".xml")):
                continue
            res.append(bajar("mod13q1_appeears", f"{API}/bundle/{tid}/{a['file_id']}", RAW / "mod13q1_appeears" / nombre,
                             log, nota=f"AppEEARS tarea {tid}; recorte caja Honduras 250 m", timeout=600,
                             cabeceras={"Authorization": f"Bearer {tk}"}))
    resumen("mod13q1_appeears", res, RAW / "mod13q1_appeears")


if __name__ == "__main__":
    log = logger("mod13q1_appeears")
    (enviar if (sys.argv[1:] or ["enviar"])[0] == "enviar" else descargar)(log)
