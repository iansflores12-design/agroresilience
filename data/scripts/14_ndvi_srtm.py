"""NDVI/EVI mensual 1 km (MOD13A3 v061 desde 2000, VNP13A3 v002 desde 2012) y SRTM 1 arcsec
para toda la caja de Honduras. Archivos completos de cada tesela/hoja que toca la caja
(h09v07 y h10v07; las teselas se bajan enteras, sin recortar). Requiere Earthdata.
Correr: ../.venv/bin/python 14_ndvi_srtm.py [producto]   producto: MOD13A3 | VNP13A3 | SRTMGL1
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import earthaccess

from comun import RAIZ, RAW, en_manifiesto, logger, registrar, resumen, zonas

PRODUCTOS = {
    "MOD13A3": ("061", "NASA LP DAAC MOD13A3 v061, tesela completa sin recortar"),
    "VNP13A3": ("002", "NASA LP DAAC VNP13A3 v002, tesela completa sin recortar"),
    "SRTMGL1": ("003", "NASA LP DAAC SRTMGL1 v003, hoja completa sin recortar"),
}
MARGEN_LIBRE = 8 * 1024 ** 3  # no bajar si quedan menos de 8 GB libres


def libre():
    s = os.statvfs(RAW)
    return s.f_bavail * s.f_frsize


def main():
    log = logger("ndvi_srtm")
    quedan = sys.argv[1:] or list(PRODUCTOS)
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    c = zonas()["caja_honduras"]
    caja = (c["lon_min"], c["lat_min"], c["lon_max"], c["lat_max"])
    for nombre in quedan:
        ver, nota = PRODUCTOS[nombre]
        carpeta = RAW / nombre.lower()
        carpeta.mkdir(parents=True, exist_ok=True)
        granulos = earthaccess.search_data(short_name=nombre, version=ver, bounding_box=caja, count=-1)
        hechos = en_manifiesto()
        resultados = []
        pend = []
        for g in granulos:
            for enlace in g.data_links(access="external"):
                if enlace.endswith((".hdf", ".h5", ".hgt.zip", ".zip")) or "hgt" in enlace:
                    ruta = carpeta / enlace.rsplit("/", 1)[1]
                    if ruta.exists() and str(ruta.relative_to(RAIZ)) in hechos:
                        resultados.append("omitido")
                    else:
                        pend.append((enlace, ruta))
        log.info("%s: %d granulos, %d por bajar", nombre, len(granulos), len(pend))
        sesion = earthaccess.get_requests_https_session()
        for enlace, ruta in pend:
            if libre() < MARGEN_LIBRE:
                log.error("quedan menos de 8 GB libres; se detiene")
                break
            tmp = ruta.with_name(ruta.name + ".parcial")
            try:
                with sesion.get(enlace, stream=True, timeout=300) as r:
                    r.raise_for_status()
                    with open(tmp, "wb") as f:
                        for b in r.iter_content(1 << 20):
                            f.write(b)
                tmp.rename(ruta)
                registrar(nombre.lower(), ruta, enlace, nota)
                resultados.append("ok")
                log.info("ok: %s", ruta.name)
            except Exception as e:
                log.error("fallo %s: %r", ruta.name, e)
                resultados.append("fallo")
                if tmp.exists():
                    tmp.unlink()
        resumen(nombre.lower(), resultados, carpeta)


if __name__ == "__main__":
    main()
