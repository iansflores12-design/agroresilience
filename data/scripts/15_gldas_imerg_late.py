"""RECORTE de Honduras por OPeNDAP en la nube (GES DISC, NASA) de:
  - GLDAS Noah 0.25 grados mensual v2.1 (2000-01 en adelante), todas las variables.
    Indices lat 290-306 (-59.875+0.25*i: 12.625 a 16.625), lon 360-388 (-89.875 a -82.875).
  - IMERG Late diario V07 (GPM_3IMERGDL) para cubrir los meses que Final aun no publica
    (desde 2025-10-01), misma ventana 0.1 grados que 08_imerg.py. Late es provisional.
Correr: ../.venv/bin/python 15_gldas_imerg_late.py [gldas|imerg_late]
"""
import os
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import earthaccess

from comun import RAIZ, RAW, en_manifiesto, logger, registrar, resumen

GLDAS_VARS = ["SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst", "SoilMoi100_200cm_inst",
              "SoilTMP0_10cm_inst", "SoilTMP10_40cm_inst", "SoilTMP40_100cm_inst", "SoilTMP100_200cm_inst",
              "RootMoist_inst", "CanopInt_inst", "AvgSurfT_inst", "Tair_f_inst", "Qair_f_inst", "Wind_f_inst",
              "Psurf_f_inst", "SWdown_f_tavg", "LWdown_f_tavg", "Swnet_tavg", "Lwnet_tavg", "Qle_tavg", "Qh_tavg",
              "Qg_tavg", "Evap_tavg", "ESoil_tavg", "ECanop_tavg", "Tveg_tavg", "PotEvap_tavg", "Rainf_tavg",
              "Rainf_f_tavg", "Snowf_tavg", "Qs_acc", "Qsb_acc", "Qsm_acc", "Albedo_inst", "SWE_inst", "SnowDepth_inst"]
CONF = {
    "gldas": dict(short="GLDAS_NOAH025_M", ver="2.1", dim="[0:0][290:306][360:388]", vars=GLDAS_VARS,
                  extra=["/time", "/lat[290:306]", "/lon[360:388]"], carpeta="gldas", desde="2000-01-01",
                  nota="RECORTE Honduras via OPeNDAP (no es el archivo global); GLDAS Noah 0.25 mensual v2.1, GES DISC"),
    "imerg_late": dict(short="GPM_3IMERGDL", ver="07", dim="[0:0][902:970][1027:1067]",
                       vars=["precipitation", "randomError", "MWprecipitation"],
                       extra=["/time", "/lon[902:970]", "/lat[1027:1067]"], carpeta="imerg_late", desde="2025-10-01",
                       nota="RECORTE Honduras via OPeNDAP; IMERG Late diario V07 (provisional), GES DISC"),
}
local = threading.local()


def sesion():
    if not hasattr(local, "s"):
        local.s = earthaccess.get_requests_https_session()
    return local.s


def opendap(g):
    for u in g["umm"]["RelatedUrls"]:
        if "opendap" in u["URL"].lower():
            return u["URL"]


def nombre_de(base):
    return urllib.parse.unquote(base.rsplit("/", 1)[1]).split(":")[-1].replace(".nc4", "") + "_HND.nc4"


def bajar_uno(base, destino, ce, log):
    url = base + ".dap.nc4?dap4.ce=" + urllib.parse.quote(ce)
    err = ""
    for i in range(1, 4):
        try:
            r = sesion().get(url, timeout=300)
            if r.status_code == 200 and "netcdf" in r.headers.get("content-type", ""):
                tmp = destino.with_name(destino.name + ".parcial")
                tmp.write_bytes(r.content)
                tmp.rename(destino)
                return url, None
            err = f"HTTP {r.status_code}: {r.text[:300]}"
        except Exception as e:
            err = repr(e)
        log.error("intento %d/3 %s: %s", i, destino.name, err)
        time.sleep(10)
    return url, err


def correr(clave):
    c = CONF[clave]
    log = logger(clave)
    granulos = earthaccess.search_data(short_name=c["short"], version=c["ver"], temporal=(c["desde"], "2026-12-31"), count=-1)
    hechos = en_manifiesto()
    carpeta = RAW / c["carpeta"]
    carpeta.mkdir(parents=True, exist_ok=True)
    ce = ";".join([f"/{v}{c['dim']}" for v in c["vars"]] + c["extra"])
    pend, resultados = [], []
    for g in granulos:
        base = opendap(g)
        if not base:
            continue
        ruta = carpeta / nombre_de(base)
        if ruta.exists() and str(ruta.relative_to(RAIZ)) in hechos:
            resultados.append("omitido")
        else:
            pend.append((base, ruta))
    log.info("%s: %d granulos, %d por bajar", clave, len(granulos), len(pend))
    with ThreadPoolExecutor(max_workers=4) as ex:
        futuros = {ex.submit(bajar_uno, b, r, ce, log): r for b, r in pend}
        for f in as_completed(futuros):
            url, err = f.result()
            ruta = futuros[f]
            if err:
                resultados.append("fallo")
            else:
                registrar(clave, ruta, url, c["nota"])
                resultados.append("ok")
    resumen(clave, resultados, carpeta)


if __name__ == "__main__":
    earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
    for k in (sys.argv[1:] or list(CONF)):
        correr(k)
