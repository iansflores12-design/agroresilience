"""NASA POWER diario por punto, comunidad AG, 1981-01-01 a (hoy - 5 dias)."""
import sys
import urllib.parse
from datetime import datetime, timedelta

from comun import RAW, TZ_HN, bajar, logger, resumen, zonas

PARAMETROS = [
    "PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "ALLSKY_SFC_SW_DWN",
    "WS2M", "WS2M_MAX", "GWETROOT", "GWETTOP",
    # sumados tras la prueba del 2026-11-13 (existen en AG):
    "EVPTRNS", "EVLAND", "WS10M", "WS10M_MAX",
]
BASE = "https://power.larc.nasa.gov/api/temporal/daily/point"


def main():
    log = logger("power")
    dias_atras = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    fin = (datetime.now(TZ_HN) - timedelta(days=dias_atras)).strftime("%Y%m%d")
    resultados = []
    for p in zonas()["puntos"]:
        q = urllib.parse.urlencode({
            "parameters": ",".join(PARAMETROS), "community": "AG",
            "longitude": p["lon"], "latitude": p["lat"],
            "start": "19810101", "end": fin, "format": "JSON",
        })
        resultados.append(bajar("power", f"{BASE}?{q}", RAW / "power" / f"{p['id']}.json", log,
                                nota=f"punto {p['nombre']}; fin={fin}"))
    resumen("power", resultados, RAW / "power")


if __name__ == "__main__":
    main()
