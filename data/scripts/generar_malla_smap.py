"""Genera config/smap_malla.json (latitud por fila, longitud por columna) desde processed/smap_honduras.nc.

Solo LEE processed/. Correr una vez desde la raiz: .venv/bin/python -I scripts/generar_malla_smap.py
procesar_nuevo.py usa esa malla para elegir la celda SMAP mas cercana a cada punto, igual que 10_procesar.py.
"""
import json
from pathlib import Path

import netCDF4 as nc
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "processed" / "smap_honduras.nc"
DESTINO = RAIZ / "config" / "smap_malla.json"


def lista(a):
    return [None if np.isnan(x) else float(x) for x in np.asarray(a, dtype="f8")]


if __name__ == "__main__":
    d = nc.Dataset(ORIGEN)
    d.set_auto_mask(False)
    malla = {"nota": "Malla EASE-Grid 2.0 de SMAP Honduras: lat por fila (y), lon por columna (x); null = sin dato en toda la serie. "
                     "Generada por scripts/generar_malla_smap.py desde processed/smap_honduras.nc.",
             "lat": lista(d["lat"][:]), "lon": lista(d["lon"][:])}
    d.close()
    DESTINO.write_text(json.dumps(malla, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{DESTINO}: {len(malla['lat'])} filas, {len(malla['lon'])} columnas")
