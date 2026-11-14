"""NASA POWER diario en MALLA de toda la caja de Honduras (0.5 grados), comunidad AG, NetCDF.

La API regional acepta 1 parametro por solicitud y maximo 366 dias, por eso se pide
un archivo por parametro y por anio (1981 a hoy - 5 dias). Caja: config/zonas.json.
Correr: python3 13_power_malla.py
"""
import urllib.parse
from datetime import datetime, timedelta

from comun import RAW, TZ_HN, bajar, logger, resumen, zonas

PARAMETROS = [
    "PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "ALLSKY_SFC_SW_DWN",
    "WS2M", "WS2M_MAX", "GWETROOT", "GWETTOP", "EVPTRNS", "EVLAND", "WS10M", "WS10M_MAX",
]
BASE = "https://power.larc.nasa.gov/api/temporal/daily/regional"


def main():
    log = logger("power_malla")
    c = zonas()["caja_honduras"]
    hoy = datetime.now(TZ_HN)
    fin_total = hoy - timedelta(days=5)
    resultados = []
    for anio in range(1981, fin_total.year + 1):
        ini = f"{anio}0101"
        fin = f"{anio}1231" if anio < fin_total.year else fin_total.strftime("%Y%m%d")
        for par in PARAMETROS:
            q = urllib.parse.urlencode({
                "start": ini, "end": fin, "community": "ag", "parameters": par, "format": "netcdf",
                "latitude-min": c["lat_min"], "latitude-max": c["lat_max"],
                "longitude-min": c["lon_min"], "longitude-max": c["lon_max"],
            })
            resultados.append(bajar("power_malla", f"{BASE}?{q}", RAW / "power_malla" / f"{par}_{anio}.nc", log,
                                    nota=f"malla Honduras 0.5 grados; {ini}-{fin}", timeout=600))
    resumen("power_malla", resultados, RAW / "power_malla")


if __name__ == "__main__":
    main()
