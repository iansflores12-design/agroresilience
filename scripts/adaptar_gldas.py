"""GLDAS Noah 0.25 (3 h, raw/gldas/*.nc4) -> processed/gldas_diario.csv, formato largo por (punto, fecha).
Humedad del suelo = promedio diario (kg/m2); evaporacion real y escorrentia superficial en mm/dia.
n_3h = cuantas lecturas de 3 h tuvo el dia (8 = completo).
Rapido e incremental: lee con netCDF4 en paralelo y solo los dias que aun no estan en la salida.
Uso: .venv/Scripts/python -I scripts/adaptar_gldas.py [carpeta_entrada] [--todo]
"""
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ, fusionar, ord_punto  # noqa: E402

V = ["SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst", "Evap_tavg", "Qs_acc"]
DEST = RAIZ / "processed" / "gldas_diario.csv"


def leer_lote(rutas):
    import netCDF4 as nc
    filas, idx = [], None
    for f in rutas:
        try:
            with nc.Dataset(f) as d:
                if idx is None:  # celda de TIERRA mas cercana (los puntos costeros caen en celdas de mar sin dato)
                    lat, lon = np.asarray(d["lat"][:], dtype="f8"), np.asarray(d["lon"][:], dtype="f8")
                    tierra = ~np.isnan(np.ma.filled(d["SoilMoi0_10cm_inst"][0].astype("f8"), np.nan))
                    LA, LO = np.meshgrid(lat, lon, indexing="ij")
                    idx = []
                    for p in PUNTOS:
                        dist = np.where(tierra, (LA - p["lat"]) ** 2 + ((LO - p["lon"]) * np.cos(np.radians(p["lat"]))) ** 2, np.inf)
                        i, j = np.unravel_index(int(np.argmin(dist)), dist.shape)
                        idx.append((p["id"], int(i), int(j), float(lat[i]), float(lon[j])))
                fecha = re.search(r"\.A(\d{8})\.", Path(f).name).group(1)
                arr = {v: np.ma.filled(d[v][0].astype("f8"), np.nan) for v in V}
                for pid, i, j, la, lo in idx:
                    filas.append((pid, fecha, la, lo, *[arr[v][i, j] for v in V]))
        except Exception as e:
            print("ERROR", Path(f).name, e, flush=True)
    return filas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    carpeta = Path(args[0]) if args else RAIZ / "raw" / "gldas"
    archivos = sorted(carpeta.glob("*.nc4"))
    if DEST.exists() and "--todo" not in sys.argv:  # incremental: salta dias ya completos (8 lecturas) para todos los puntos
        v = pd.read_csv(DEST, usecols=["fecha"], dtype={"fecha": str})
        completos = set(v["fecha"].str.replace("-", ""))  # dias ya agregados (sus crudos se pueden borrar)
        archivos = [a for a in archivos if re.search(r"\.A(\d{8})\.", a.name).group(1) not in completos]
    print(f"{len(archivos)} archivos por leer", flush=True)
    if not archivos:
        return
    lotes = [archivos[i:i + 400] for i in range(0, len(archivos), 400)]
    filas = []
    with ProcessPoolExecutor(8) as ex:
        for n, r in enumerate(ex.map(leer_lote, lotes), 1):
            filas += r
            if n % 20 == 0:
                print(f"  {n}/{len(lotes)} lotes", flush=True)
    df = pd.DataFrame(filas, columns=["punto", "fecha", "celda_lat", "celda_lon", *V])
    df["fecha"] = pd.to_datetime(df["fecha"], format="%Y%m%d").dt.strftime("%Y-%m-%d")
    g = df.groupby(["punto", "fecha"], as_index=False).agg(
        celda_lat=("celda_lat", "first"), celda_lon=("celda_lon", "first"),
        suelo_0_10cm=("SoilMoi0_10cm_inst", "mean"), suelo_10_40cm=("SoilMoi10_40cm_inst", "mean"),
        suelo_40_100cm=("SoilMoi40_100cm_inst", "mean"), evap_mm_dia=("Evap_tavg", lambda s: s.mean() * 86400),
        escorrentia_mm_dia=("Qs_acc", "sum"), n_3h=("Qs_acc", "count")).round(4)
    fusionar(DEST, g, ["punto", "fecha"], ord_punto("fecha"))
    print(f"gldas_diario.csv: {len(g):,} filas nuevas/actualizadas", flush=True)


if __name__ == "__main__":
    main()
