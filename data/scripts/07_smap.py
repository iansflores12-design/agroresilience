"""SMAP SPL3SMP_E v006 (NSIDC, NASA): RECORTE de Honduras via OPeNDAP en la nube.

El archivo global pesa ~615 MB por dia (2,583 GB en total), asi que solo se baja
el recorte: filas 576-633 y columnas 966-1041 de la malla EASE-Grid 2.0 de 9 km
(lat 12.7 a 16.9, lon -89.8 a -82.8), grupos AM y PM, 8 variables por grupo.

Orden: mayo-noviembre de 2015, 2020, 2023 y 2025; despues el resto.
Correr: ../.venv/bin/python 07_smap.py [max_granulos]
"""
import os
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import earthaccess

from comun import RAIZ, RAW, en_manifiesto, logger, registrar, resumen

IX = "[576:633][966:1041]"
VARS = ["soil_moisture", "retrieval_qual_flag", "surface_flag", "latitude", "longitude",
        "soil_moisture_error", "surface_temperature", "vegetation_water_content"]
CE = ";".join([f"/Soil_Moisture_Retrieval_Data_AM/{v}{IX}" for v in VARS]
              + [f"/Soil_Moisture_Retrieval_Data_PM/{v}_pm{IX}" for v in VARS])
PRIORIDAD = ["2015", "2020", "2023", "2025"]
LIMITE_BYTES = 5 * 1024 ** 3
NOTA = f"RECORTE Honduras via OPeNDAP (no es el archivo global); indices {IX}; grupos AM y PM; NASA NSIDC"
local = threading.local()


def sesion():
    if not hasattr(local, "s"):
        local.s = earthaccess.get_requests_https_session()
    return local.s


def orden(g):
    f = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10]
    lluvias = "05" <= f[5:7] <= "11"
    if lluvias and f[:4] in PRIORIDAD:
        return (0, PRIORIDAD.index(f[:4]), f)
    return (1, 0, f)


def opendap(g):
    for u in g["umm"]["RelatedUrls"]:
        if "opendap" in u["URL"].lower():
            return u["URL"]
    return None


def bajar_uno(g, log):
    base = opendap(g)
    nombre = base.rsplit("/", 1)[1].replace(".h5", "") + "_HND.nc4"
    destino = RAW / "smap" / nombre
    url = base + ".dap.nc4?dap4.ce=" + urllib.parse.quote(CE)
    for i in range(1, 4):
        try:
            r = sesion().get(url, timeout=300)
            if r.status_code == 200 and "netcdf" in r.headers.get("content-type", ""):
                tmp = destino.with_name(nombre + ".parcial")
                tmp.write_bytes(r.content)
                tmp.rename(destino)
                return destino, url, None
            err = f"HTTP {r.status_code}: {r.text[:300]}"
        except Exception as e:
            err = repr(e)
        log.error("intento %d/3 %s: %s", i, nombre, err)
        time.sleep(10)
    return destino, url, err


def main():
    log = logger("smap")
    maximo = int(sys.argv[1]) if len(sys.argv) > 1 else None
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    granulos = sorted(earthaccess.search_data(short_name="SPL3SMP_E", version="006", count=-1), key=orden)
    hechos = en_manifiesto()
    (RAW / "smap").mkdir(parents=True, exist_ok=True)
    pendientes = []
    for g in granulos:
        if not opendap(g):
            log.error("sin enlace OPeNDAP: %s", g["meta"]["native-id"])
            continue
        nombre = opendap(g).rsplit("/", 1)[1].replace(".h5", "") + "_HND.nc4"
        ruta = RAW / "smap" / nombre
        if ruta.exists() and str(ruta.relative_to(RAIZ)) in hechos:
            continue
        pendientes.append(g)
    omitidos = len(granulos) - len(pendientes)
    if maximo:
        pendientes = pendientes[:maximo]
    log.info("SMAP: %d granulos en total, %d ya bajados, %d por bajar", len(granulos), omitidos, len(pendientes))
    resultados = ["omitido"] * omitidos
    usado = sum(p.stat().st_size for p in (RAW / "smap").glob("*.nc4"))
    with ThreadPoolExecutor(max_workers=4) as ex:
        futuros = [ex.submit(bajar_uno, g, log) for g in pendientes]
        for n, f in enumerate(as_completed(futuros), 1):
            destino, url, err = f.result()
            if err:
                resultados.append("fallo")
                continue
            registrar("smap", destino, url, NOTA)
            resultados.append("ok")
            usado += destino.stat().st_size
            if n % 100 == 0:
                log.info("avance: %d/%d, %.1f MB en disco", n, len(pendientes), usado / 1e6)
            if usado > LIMITE_BYTES:
                log.error("se alcanzo el limite de 5 GB; se detiene")
                for x in futuros:
                    x.cancel()
                break
    resumen("smap", resultados, RAW / "smap")


if __name__ == "__main__":
    main()
