"""Meteomatics (servicio comercial, NO es de la NASA; cuenta del hackathon, vence 2026-11-22).

Credenciales: ~/.netrc (machine api.meteomatics.com) o variables METEOMATICS_USERNAME / METEOMATICS_PASSWORD.
Limite de la cuenta: 1000 solicitudes por dia. Este script usa unas 145.

Valores diarios pedidos a las 06:00Z: la ventana de 24 h termina a medianoche de Honduras (UTC-6),
asi que la fecha AAAA-MM-DDT06:00Z resume el dia local anterior.
Una solicitud por anio y por grupo de parametros, con los 11 puntos juntos.
"""
import base64
import netrc
import os
import time
from datetime import datetime, timedelta

from comun import RAW, TZ_HN, bajar, logger, resumen, zonas

BASE = "https://api.meteomatics.com/"
GRUPOS = {
    "clima": ["t_max_2m_24h:C", "t_min_2m_24h:C", "t_mean_2m_24h:C", "precip_24h:mm",
              "relative_humidity_mean_2m_24h:p", "relative_humidity_max_2m_24h:p",
              "relative_humidity_min_2m_24h:p", "wind_speed_mean_10m_24h:ms", "wind_gusts_10m_24h:ms"],
    "energia": ["global_rad_24h:J", "evapotranspiration_24h:mm", "sunshine_duration_24h:h", "dew_point_2m:C",
                "t_0m:C", "t_-15cm:C", "leaf_wetness:idx", "frost_days:d"],
    "suelo": ["soil_moisture_index_-15cm:idx", "soil_moisture_index_-50cm:idx", "soil_moisture_index_-150cm:idx",
              "soil_moisture_deficit:mm", "volumetric_soil_water_-15cm:m3m3", "drought_index:idx"],
}
ESTATICOS = ["soil_type:idx", "elevation:m"]
DIAS_PRONOSTICO = 14


def cabecera():
    u, p = os.environ.get("METEOMATICS_USERNAME"), os.environ.get("METEOMATICS_PASSWORD")
    if not (u and p):
        a = netrc.netrc().authenticators("api.meteomatics.com")
        if not a:
            raise SystemExit("Faltan credenciales de Meteomatics (netrc o variables de entorno)")
        u, p = a[0], a[2]
    return {"Authorization": "Basic " + base64.b64encode(f"{u}:{p}".encode()).decode()}


def main():
    log = logger("meteomatics")
    cab = cabecera()
    puntos = "+".join(f"{p['lat']},{p['lon']}" for p in zonas()["puntos"])
    destino = RAW / "meteomatics"
    hoy = datetime.now(TZ_HN).date()
    res = []

    def pedir(nombre, rango, params, nota):
        url = f"{BASE}{rango}/{','.join(params)}/{puntos}/json"
        r = bajar("meteomatics", url, destino / nombre, log, nota=nota + "; Meteomatics, no NASA",
                  timeout=600, cabeceras=cab)
        res.append(r)
        if r != "omitido":
            time.sleep(1)

    pedir("estaticos.json", f"{hoy}T06:00:00Z", ESTATICOS, "tipo de suelo y elevacion por punto")
    for anio in range(hoy.year, 1980, -1):
        ini = f"{anio}-01-01T06:00:00Z"
        cerrado = anio < hoy.year
        fin = f"{anio}-12-31T06:00:00Z" if cerrado else f"{hoy}T06:00:00Z"
        for g, params in GRUPOS.items():
            sufijo = "" if cerrado else f"_hasta_{hoy}"
            pedir(f"hist_{g}_{anio}{sufijo}.json", f"{ini}--{fin}:P1D", params, f"historico diario {anio}, grupo {g}")
    ini, fin = hoy + timedelta(days=1), hoy + timedelta(days=DIAS_PRONOSTICO)
    for g, params in GRUPOS.items():
        pedir(f"pronostico_{g}_emitido_{hoy}.json", f"{ini}T06:00:00Z--{fin}T06:00:00Z:P1D", params,
              f"PRONOSTICO (no observacion) emitido {hoy}, grupo {g}")
    resumen("meteomatics", res, destino)


if __name__ == "__main__":
    main()
