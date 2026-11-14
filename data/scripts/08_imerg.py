"""GPM IMERG Final diario V07 (GES DISC, NASA): RECORTE de Honduras via OPeNDAP en la nube.

El archivo global pesa ~29 MB por dia (291 GB en total), asi que solo se baja el
recorte: indices de lon 902-970 y lat 1027-1067 de la malla de 0.1 grados
(lon -89.75 a -82.95, lat 12.75 a 16.75), 4 variables.

Orden: 2020, 2023, 2015, 2024 en adelante, despues el resto desde 2000 y al final 1998-1999.
Final tiene retraso de meses: el anio en curso puede faltar.
Correr: ../.venv/bin/python 08_imerg.py [max_granulos]
"""
import os
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import earthaccess

from comun import RAIZ, RAW, en_manifiesto, logger, registrar, resumen

IX = "[0:0][902:970][1027:1067]"
VARS = ["precipitation", "randomError", "precipitation_cnt_cond", "MWprecipitation"]
CE = ";".join([f"/{v}{IX}" for v in VARS] + ["/time", "/lon[902:970]", "/lat[1027:1067]"])
LIMITE_BYTES = 5 * 1024 ** 3
NOTA = f"RECORTE Honduras via OPeNDAP (no es el archivo global); indices time,lon,lat {IX}; NASA GES DISC"
local = threading.local()


def sesion():
    if not hasattr(local, "s"):
        local.s = earthaccess.get_requests_https_session()
    return local.s


def orden(g):
    f = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10]
    a = f[:4]
    if a == "2020":
        return (0, f)
    if a == "2023":
        return (1, f)
    if a == "2015":
        return (2, f)
    if a >= "2024":
        return (3, f)
    if a >= "2000":
        return (4, f)
    return (5, f)


def opendap(g):
    for u in g["umm"]["RelatedUrls"]:
        if "opendap" in u["URL"].lower():
            return u["URL"]
    return None


def bajar_uno(g, log):
    base = opendap(g)
    nombre = urllib.parse.unquote(base.rsplit("/", 1)[1]).split(":")[-1].replace(".nc4", "") + "_HND.nc4"
    destino = RAW / "imerg" / nombre
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
    log = logger("imerg")
    maximo = int(sys.argv[1]) if len(sys.argv) > 1 else None
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    granulos = sorted(earthaccess.search_data(short_name="GPM_3IMERGDF", version="07", count=-1), key=orden)
    hechos = en_manifiesto()
    (RAW / "imerg").mkdir(parents=True, exist_ok=True)
    pendientes = []
    for g in granulos:
        if not opendap(g):
            log.error("sin enlace OPeNDAP: %s", g["meta"]["native-id"])
            continue
        nombre = urllib.parse.unquote(opendap(g).rsplit("/", 1)[1]).split(":")[-1].replace(".nc4", "") + "_HND.nc4"
        ruta = RAW / "imerg" / nombre
        if ruta.exists() and str(ruta.relative_to(RAIZ)) in hechos:
            continue
        pendientes.append(g)
    omitidos = len(granulos) - len(pendientes)
    if maximo:
        pendientes = pendientes[:maximo]
    log.info("IMERG: %d granulos en total, %d ya bajados, %d por bajar", len(granulos), omitidos, len(pendientes))
    resultados = ["omitido"] * omitidos
    usado = sum(p.stat().st_size for p in (RAW / "imerg").glob("*.nc4"))
    with ThreadPoolExecutor(max_workers=4) as ex:
        futuros = [ex.submit(bajar_uno, g, log) for g in pendientes]
        for n, f in enumerate(as_completed(futuros), 1):
            destino, url, err = f.result()
            if err:
                resultados.append("fallo")
                continue
            registrar("imerg", destino, url, NOTA)
            resultados.append("ok")
            usado += destino.stat().st_size
            if n % 100 == 0:
                log.info("avance: %d/%d, %.1f MB en disco", n, len(pendientes), usado / 1e6)
            if usado > LIMITE_BYTES:
                log.error("se alcanzo el limite de 5 GB; se detiene")
                for x in futuros:
                    x.cancel()
                break
    resumen("imerg", resultados, RAW / "imerg")


if __name__ == "__main__":
    main()
