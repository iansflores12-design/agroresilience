"""Mallas para bajar el pronostico de Kharis a escala de parcela.

1. Altura: NASADEM (SRTM, 30 m) de Microsoft Planetary Computer, promediada a una malla de 0.02 grados
   (~2 km) sobre la caja de Honduras. Es la misma fuente que scripts/fuentes_extra.py (dem).
2. Lluvia: climatologia mensual de GPM IMERG (0.1 grados) con los archivos diarios de raw/imerg,
   SOLO 2001-2020 (el periodo base del motor; 2000 esta incompleto).

Salida: processed/escala_fina/malla_altura_002.npz y processed/escala_fina/imerg_clima_mensual.npz.
  .venv\\Scripts\\python.exe scripts\\escala_fina.py [--solo altura|lluvia]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
SAL = RAIZ / "processed" / "escala_fina"
PC = "https://planetarycomputer.microsoft.com/api/stac/v1"
RES = 0.02


def caja():
    c = json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))["caja_honduras"]
    return c["lat_min"], c["lat_max"], c["lon_min"], c["lon_max"]


def altura():
    import planetary_computer as pcm
    import pystac_client
    import rasterio
    from rasterio.enums import Resampling

    la0, la1, lo0, lo1 = caja()
    lats = np.round(np.arange(la0 + RES / 2, la1, RES), 4)
    lons = np.round(np.arange(lo0 + RES / 2, lo1, RES), 4)
    z = np.full((len(lats), len(lons)), np.nan, dtype=np.float32)
    cat = pystac_client.Client.open(PC)
    items = list(cat.search(collections=["nasadem"], bbox=[lo0, la0, lo1, la1]).items())
    print(f"[altura] {len(items)} mosaicos NASADEM")
    for k, it in enumerate(items, 1):
        it = pcm.sign(it)
        href = it.assets["elevation"].href
        for intento in range(3):
            try:
                with rasterio.open(href) as ds:
                    l, b, r, t = ds.bounds
                    n_f, n_c = max(1, round((t - b) / (RES / 2))), max(1, round((r - l) / (RES / 2)))   # 0.01 grados
                    a = ds.read(1, out_shape=(n_f, n_c), resampling=Resampling.average).astype(np.float32)
                    if ds.nodata is not None:
                        a[a == ds.nodata] = np.nan
                break
            except Exception as e:  # red inestable: reintenta
                print(f"  reintento {intento + 1}: {e}")
                time.sleep(3 * (intento + 1))
        else:
            print(f"  sin datos: {it.id}")
            continue
        df, dc = (t - b) / n_f, (r - l) / n_c
        fi = [i for i, la in enumerate(lats) if b <= la < t]
        ci = [j for j, lo in enumerate(lons) if l <= lo < r]
        for i in fi:
            for j in ci:
                # celda de 0.02 = promedio de los 2x2 valores de 0.01 que la cubren
                f0 = int((t - (lats[i] + RES / 2)) / df)
                c0 = int((lons[j] - RES / 2 - l) / dc)
                bloque = a[max(f0, 0): f0 + 2, max(c0, 0): c0 + 2]
                if bloque.size and np.isfinite(bloque).any():
                    z[i, j] = np.nanmean(bloque)
        print(f"  {k}/{len(items)} {it.id}")
    z[z < -50] = np.nan
    SAL.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(SAL / "malla_altura_002.npz", altura=z, lat=lats, lon=lons,
                        fuente="NASADEM (SRTM 30 m), Microsoft Planetary Computer, promedio a 0.02 grados")
    print(f"[altura] {np.isfinite(z).sum():,} celdas con dato de {z.size:,} -> {SAL / 'malla_altura_002.npz'}")


def lluvia():
    import netCDF4

    archivos = sorted(glob.glob(str(RAIZ / "raw" / "imerg" / "*.nc4")))
    suma = cuenta = None
    lats = lons = None
    usados = 0
    for f in archivos:
        m = re.search(r"\.(\d{8})-S", f)
        if not m:
            continue
        fecha = m.group(1)
        anio, mes = int(fecha[:4]), int(fecha[4:6])
        if not (2001 <= anio <= 2020):
            continue
        with netCDF4.Dataset(f) as d:
            p = np.asarray(d["precipitation"][0], dtype=np.float64).T     # [lat, lon]
            if lats is None:
                lats, lons = np.asarray(d["lat"][:]), np.asarray(d["lon"][:])
                suma, cuenta = np.zeros((12,) + p.shape), np.zeros((12,) + p.shape)
        ok = np.isfinite(p) & (p >= 0)
        suma[mes - 1] += np.where(ok, p, 0)
        cuenta[mes - 1] += ok
        usados += 1
    clima = (suma / np.maximum(cuenta, 1)).astype(np.float32)        # mm/dia promedio de cada mes
    clima[cuenta == 0] = np.nan
    SAL.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(SAL / "imerg_clima_mensual.npz", lluvia=clima, lat=lats, lon=lons, dias=cuenta.astype(np.int16),
                        fuente="GPM IMERG Final diario V07, promedio mensual 2001-2020 (mm/dia)")
    print(f"[lluvia] {usados:,} dias 2001-2020 -> {SAL / 'imerg_clima_mensual.npz'} | malla {clima.shape}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--solo", choices=["altura", "lluvia"])
    args = a.parse_args()
    if args.solo in (None, "lluvia"):
        lluvia()
    if args.solo in (None, "altura"):
        altura()
    sys.stdout.flush()
    os._exit(0)
