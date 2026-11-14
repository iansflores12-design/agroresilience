"""SoilGrids v2.0 (ISRIC, no NASA): propiedades de suelo por punto."""
import time
import urllib.parse

from comun import RAW, bajar, logger, resumen, zonas

BASE = "https://rest.isric.org/soilgrids/v2.0/properties/query"
PROPIEDADES = ["clay", "sand", "silt", "soc", "phh2o", "bdod", "cec"]
PROFUNDIDADES = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"]


def main():
    log = logger("soilgrids")
    resultados = []
    for p in zonas()["puntos"]:
        q = urllib.parse.urlencode(
            [("lon", p["lon"]), ("lat", p["lat"])]
            + [("property", x) for x in PROPIEDADES]
            + [("depth", x) for x in PROFUNDIDADES]
            + [("value", "mean")]
        )
        r = bajar("soilgrids", f"{BASE}?{q}", RAW / "soilgrids" / f"{p['id']}.json", log,
                  nota=f"punto {p['nombre']}; ISRIC, no NASA", timeout=120)
        resultados.append(r)
        if r != "omitido":
            time.sleep(2)
    resumen("soilgrids", resultados, RAW / "soilgrids")


if __name__ == "__main__":
    main()
