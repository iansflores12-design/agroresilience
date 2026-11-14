"""GRACE / GRACE-FO mascon RL06.3 V4 (PO.DAAC, NASA). Requiere Earthdata (~/.netrc o variables de entorno).

Correr con el entorno virtual: ../.venv/bin/python 05_grace.py
"""
import sys
from pathlib import Path

import earthaccess

from comun import RAW, logger, registrar, resumen, ya_bajado

SHORT_NAME = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
LIMITE_GB = 5


def main():
    log = logger("grace")
    earthaccess.login(strategy="environment" if __import__("os").environ.get("EARTHDATA_USERNAME") else "netrc")
    granulos = earthaccess.search_data(short_name=SHORT_NAME, count=-1)
    total_mb = sum(g.size for g in granulos)
    log.info("%s: %d granulos, %.1f MB", SHORT_NAME, len(granulos), total_mb)
    if total_mb / 1024 > LIMITE_GB:
        log.error("pasa de %d GB; no se baja sin aprobacion", LIMITE_GB)
        sys.exit(1)
    destino = RAW / "grace"
    resultados = []
    for g in granulos:
        for url in g.data_links():
            ruta = destino / Path(url).name
            if ya_bajado(ruta):
                log.info("omitido (ya en manifiesto): %s", ruta.name)
                resultados.append("omitido")
                continue
            try:
                earthaccess.download([url], str(destino))
                registrar("grace", ruta, url, nota="NASA PO.DAAC; global, sin recortar")
                log.info("ok: %s (%d bytes)", ruta.name, ruta.stat().st_size)
                resultados.append("ok")
            except Exception as e:
                log.error("fallo %s: %r", url, e)
                resultados.append("fallo")
    resumen("grace", resultados, destino)


if __name__ == "__main__":
    main()
