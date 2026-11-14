"""Calcula el tamano por anio de IMERG y SMAP SIN bajar nada (solo consulta CMR).

Correr: ../.venv/bin/python 06_tamanos.py
"""
import os
from collections import defaultdict

import earthaccess

from comun import logger

PRODUCTOS = [
    ("imerg", {"short_name": "GPM_3IMERGDF", "version": "07"}),
    ("smap", {"short_name": "SPL3SMP_E", "version": "006"}),
]


def main():
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    for nombre, filtro in PRODUCTOS:
        log = logger(nombre)
        granulos = earthaccess.search_data(count=-1, **filtro)
        por_anio = defaultdict(lambda: [0, 0.0])
        fechas = []
        for g in granulos:
            ini = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10]
            fechas.append(ini)
            por_anio[ini[:4]][0] += 1
            por_anio[ini[:4]][1] += g.size
        total = sum(v[1] for v in por_anio.values())
        log.info("%s %s: %d granulos, %.2f GB global, %s a %s", nombre, filtro, len(granulos), total / 1024,
                 min(fechas) if fechas else "-", max(fechas) if fechas else "-")
        for anio in sorted(por_anio):
            n, mb = por_anio[anio]
            log.info("  %s: %d granulos, %.2f GB", anio, n, mb / 1024)


if __name__ == "__main__":
    main()
