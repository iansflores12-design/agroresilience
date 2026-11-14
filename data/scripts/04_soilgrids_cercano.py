"""SoilGrids: para los puntos cuyo archivo crudo trae todo nulo, busca el punto
mas cercano con datos y lo baja a raw/soilgrids/<id>_cercano.json.

Busqueda: anillos de 0.05 y 0.10 grados (unos 5.5 y 11 km) en 8 direcciones
(N, NE, E, SE, S, SO, O, NO), en ese orden; se queda con el primero que
devuelve valor para clay 0-5cm. No verifica que el punto sea agricola.
El archivo original nulo no se toca. El punto elegido se anota en
config/zonas.json, campo "suelo_alterno".
"""
import json
import math
import time
import urllib.parse
import urllib.request

from comun import AGENTE, RAIZ, RAW, bajar, logger, resumen, ya_bajado

BASE = "https://rest.isric.org/soilgrids/v2.0/properties/query"
PROPIEDADES = ["clay", "sand", "silt", "soc", "phh2o", "bdod", "cec"]
PROFUNDIDADES = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"]
DIRS = [("N", 1, 0), ("NE", 1, 1), ("E", 0, 1), ("SE", -1, 1), ("S", -1, 0), ("SO", -1, -1), ("O", 0, -1), ("NO", 1, -1)]
ANILLOS = [0.05, 0.10]
ZONAS = RAIZ / "config" / "zonas.json"


def url(lat, lon, props, profs):
    return BASE + "?" + urllib.parse.urlencode(
        [("lon", lon), ("lat", lat)] + [("property", x) for x in props]
        + [("depth", x) for x in profs] + [("value", "mean")])


def nulos(ruta):
    capas = json.loads(ruta.read_text())["properties"]["layers"]
    return sum(1 for c in capas for d in c["depths"] if d["values"]["mean"] is None)


def sonda(lat, lon, log):
    """True si hay dato, False si nulo, None si error de red."""
    for i in range(3):
        try:
            req = urllib.request.Request(url(lat, lon, ["clay"], ["0-5cm"]), headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
            return d["properties"]["layers"][0]["depths"][0]["values"]["mean"] is not None
        except Exception as e:
            log.error("sonda %.2f,%.2f intento %d: %r", lat, lon, i + 1, e)
            time.sleep(10)
    return None


def km(lat1, lon1, lat2, lon2):
    r = 6371.0
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2)) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def main():
    log = logger("soilgrids")
    cfg = json.loads(ZONAS.read_text(encoding="utf-8"))
    resultados = []
    for p in cfg["puntos"]:
        original = RAW / "soilgrids" / f"{p['id']}.json"
        if not original.exists() or nulos(original) == 0:
            continue
        destino = RAW / "soilgrids" / f"{p['id']}_cercano.json"
        if ya_bajado(destino):
            resultados.append("omitido")
            continue
        hallado = None
        for anillo in ANILLOS:
            for nombre, dy, dx in DIRS:
                lat, lon = round(p["lat"] + dy * anillo, 2), round(p["lon"] + dx * anillo, 2)
                s = sonda(lat, lon, log)
                log.info("sonda %s %s %.2f grados -> %.2f,%.2f: %s", p["id"], nombre, anillo, lat, lon, s)
                time.sleep(2)
                if s:
                    hallado = (lat, lon, nombre)
                    break
            if hallado:
                break
        if not hallado:
            log.error("sin punto cercano con datos para %s", p["id"])
            resultados.append("fallo")
            continue
        lat, lon, nombre = hallado
        dist = round(km(p["lat"], p["lon"], lat, lon), 1)
        r = bajar("soilgrids", url(lat, lon, PROPIEDADES, PROFUNDIDADES), destino, log, timeout=180,
                  nota=f"punto alterno de {p['nombre']}: {lat},{lon} ({dist} km al {nombre}); ISRIC, no NASA")
        resultados.append(r)
        if r == "ok":
            p["suelo_alterno"] = {"lat": lat, "lon": lon, "distancia_km": dist, "direccion": nombre,
                                  "nulos": nulos(destino),
                                  "nota": "primer punto con datos de SoilGrids; no verificado como agricola"}
            ZONAS.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        time.sleep(2)
    resumen("soilgrids", resultados, RAW / "soilgrids")


if __name__ == "__main__":
    main()
