"""ECOSTRESS ECO_L3T_JET v003 (NASA LP DAAC): teselas completas que cubren Comayagua y Choluteca,
del 2025-11-14 al 2026-11-14 (unos 2.7 GB). Requiere Earthdata.
Correr desde scripts/: ../.venv/bin/python 12_ecostress.py
"""
import os
from pathlib import Path

import earthaccess

from comun import RAW, logger, registrar, resumen, ya_bajado, zonas

INI, FIN = "2025-11-14", "2026-11-14"
LIMITE_GB = 5


def main():
    log = logger("ecostress")
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    puntos = {p["id"]: p for p in zonas()["puntos"]}
    granulos = {}
    for pid in ("comayagua", "choluteca"):
        p = puntos[pid]
        for g in earthaccess.search_data(short_name="ECO_L3T_JET", version="003", point=(p["lon"], p["lat"]),
                                         temporal=(INI, FIN), count=-1):
            granulos[g["meta"]["native-id"]] = (g, pid)
    total = sum(g.size for g, _ in granulos.values()) / 1024
    log.info("ECO_L3T_JET: %d granulos, %.2f GB", len(granulos), total)
    if total > LIMITE_GB:
        raise SystemExit("pasa de 5 GB; no se baja sin aprobacion")
    destino = RAW / "ecostress"
    res = []
    for nid, (g, pid) in sorted(granulos.items()):
        enlaces = [u for u in g.data_links() if not ya_bajado(destino / Path(u).name)]
        res += ["omitido"] * (len(g.data_links()) - len(enlaces))
        if not enlaces:
            continue
        try:
            earthaccess.download(enlaces, str(destino), threads=4)
        except Exception as e:
            log.error("fallo granulo %s: %r", nid, e)
        for u in enlaces:
            ruta = destino / Path(u).name
            if ruta.exists() and ruta.stat().st_size > 0:
                registrar("ecostress", ruta, u, nota=f"tesela completa que cubre {pid}; NASA LP DAAC")
                res.append("ok")
            else:
                log.error("no se bajo: %s", u)
                res.append("fallo")
        log.info("granulo %s: %d archivos", nid, len(enlaces))
    resumen("ecostress", res, destino)


if __name__ == "__main__":
    main()
