"""ECOSTRESS LST (ECO_L2T_LSTE v002, 70 m) leido directo de LP DAAC con el token de Earthdata -> processed/ecostress_lst.csv

Mas rapido que AppEEARS (no hay cola): busca las pasadas en CMR, se queda con las de dia (8:00-17:00 hora de Honduras)
y lee cada archivo una sola vez para todos los puntos que caen en el. Reanudable: salta pasadas ya guardadas.
Uso: .venv/Scripts/python -I scripts/ecostress_directo.py [--desde 2018-07-01] [--hilos 24]
Columnas: punto, latitud, longitud, fecha (dia local), hora_local, lst_c (temperatura de superficie, C), granulo.
"""
import argparse, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests
import rasterio
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ, fusionar, ord_punto

DEST = RAIZ / "processed" / "ecostress_lst.csv"
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
TOKEN = (RAIZ / "config" / "earthdata_token.txt").read_text(encoding="utf-8").strip()
_local = threading.local()


def sesion():
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
        _local.s.headers["Authorization"] = "Bearer " + TOKEN
    return _local.s


def granulos(p, desde, hasta):
    out, despues = [], None
    while True:
        h = {"CMR-Search-After": despues} if despues else {}
        r = requests.get(CMR, headers=h, timeout=120, params={
            "short_name": "ECO_L2T_LSTE", "version": "002", "point": f"{p['lon']},{p['lat']}",
            "temporal": f"{desde}T00:00:00Z,{hasta}T23:59:59Z", "page_size": 2000})
        r.raise_for_status()
        e = r.json()["feed"]["entry"]
        out += e
        despues = r.headers.get("CMR-Search-After")
        if not e or not despues:
            return out


def leer(gid, url, t_utc, pts):
    s = sesion()
    for i in range(3):
        try:
            r = s.get(url, allow_redirects=False, timeout=60)
            firmado = r.headers.get("Location", url) if r.status_code in (301, 302, 303, 307) else url
            filas = []
            with rasterio.open(firmado) as ds:
                tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
                for p in pts:
                    x, y = tr.transform(p["lon"], p["lat"])
                    v = float(next(ds.sample([(x, y)]))[0])
                    if v == v and 200 < v < 360:  # no NaN (nube o fuera de la pasada) y rango fisico
                        loc = t_utc - timedelta(hours=6)
                        filas.append({"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"],
                                      "fecha": loc.strftime("%Y-%m-%d"), "hora_local": loc.strftime("%H:%M"),
                                      "lst_c": round(v - 273.15, 2), "granulo": gid})
            return filas
        except Exception:
            time.sleep(3 * (i + 1))
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default="2018-07-01")
    ap.add_argument("--hilos", type=int, default=24)
    a = ap.parse_args()
    hasta = (date.today() - timedelta(days=3)).isoformat()
    hechos = set(pd.read_csv(DEST, usecols=["granulo"])["granulo"]) if DEST.exists() else set()
    tareas = {}  # granulo -> (url LST, hora, [puntos])
    for p in PUNTOS:
        for g in granulos(p, a.desde, hasta):
            t = datetime.fromisoformat(g["time_start"].replace("Z", "+00:00")).replace(tzinfo=None)
            if not (14 <= t.hour < 23):  # 8:00-17:00 en Honduras
                continue
            url = next((l["href"] for l in g["links"] if l["href"].startswith("https") and l["href"].endswith("_LST.tif")), None)
            if url and g["title"] not in hechos:
                tareas.setdefault(g["title"], [url, t, []])[2].append(p)
        print(f"  {p['id']}: pasadas de dia acumuladas {len(tareas)}", flush=True)
    print(f"{len(tareas)} archivos por leer con {a.hilos} hilos", flush=True)
    filas, n, t0 = [], 0, time.time()
    with ThreadPoolExecutor(a.hilos) as ex:
        fut = [ex.submit(leer, gid, u, t, pts) for gid, (u, t, pts) in tareas.items()]
        for f in as_completed(fut):
            filas += f.result()
            n += 1
            if n % 500 == 0 or n == len(fut):
                if filas:
                    fusionar(DEST, pd.DataFrame(filas), ["punto", "granulo"], ord_punto("fecha"))
                    filas = []
                ritmo = n / (time.time() - t0)
                print(f"  {n}/{len(fut)} archivos ({100 * n / len(fut):.0f}%), faltan ~{(len(fut) - n) / ritmo / 60:.0f} min", flush=True)
    print("listo:", DEST)


if __name__ == "__main__":
    main()
