"""FAO GAEZ v4 (sin cuenta) -> processed/gaez_aptitud_por_punto.csv y processed/gaez_recursos_por_punto.csv

aptitud: por punto x cultivo x nivel de insumos (secano), periodo historico 1981-2010 (clima CRU TS 3.2):
  indice_aptitud (0-10000), clase_aptitud, rendimiento_alcanzable_kg_ha (cropland actual), url de la capa.
recursos (servicio LR): longitud del periodo de crecimiento, limitaciones del suelo, terreno, etc. por punto.
Es estatico (no cambia por fecha); reejecutar solo reemplaza. Uso: .venv/Scripts/python -I scripts/gaez.py
"""
import sys
from pathlib import Path
import pandas as pd
import requests
import rasterio
sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ

SAL = RAIZ / "processed"
BASE = "https://gaez-services.fao.org/server/rest/services"
CULTIVOS = ["Maize", "Phaseolus bean", "Sorghum", "Coffee", "Cassava"]
CLAVE = {"sx": "indice_aptitud", "si": "clase_aptitud", "yc": "rendimiento_alcanzable_kg_ha"}


def consultar(servicio, where, campos):
    out, off = [], 0
    while True:
        r = requests.get(f"{BASE}/{servicio}/ImageServer/query", timeout=120, params={
            "where": where, "outFields": campos, "returnGeometry": "false", "resultOffset": off,
            "resultRecordCount": 1000, "f": "json"}).json()
        out += [x["attributes"] for x in r["features"]]
        if not r.get("exceededTransferLimit"):
            return out
        off += 1000


def aptitud():
    lista = ",".join("'" + c + "'" for c in CULTIVOS)
    items = consultar("res05", f"year='1981-2010' AND crop IN ({lista})",
                      "name,crop,water_supply,input_level,c02_fertilization,download_url")
    sel = [a for a in items if a["water_supply"].strip() == "Rainfed" and a["name"][:2] in CLAVE
           and not a["name"].startswith(("sx1", "sx2", "sx3"))]
    filas = {}
    for a in sel:
        with rasterio.open(a["download_url"]) as ds:
            for p in PUNTOS:
                v = next(ds.sample([(p["lon"], p["lat"])]))[0]
                v = None if (ds.nodata is not None and v == ds.nodata) or v < 0 else float(v)
                k = (p["id"], a["crop"], a["input_level"], a["c02_fertilization"])
                f = filas.setdefault(k, {"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"], "cultivo": a["crop"],
                                         "agua": "secano", "nivel_insumos": a["input_level"], "co2": a["c02_fertilization"],
                                         "periodo": "1981-2010"})
                f[CLAVE[a["name"][:2]]] = v
    df = pd.DataFrame(list(filas.values()))
    df.to_csv(SAL / "gaez_aptitud_por_punto.csv", index=False)
    print(f"gaez_aptitud_por_punto.csv: {len(df)} filas ({len(sel)} capas)")


def recursos():
    filas = []
    for p in PUNTOS:
        r = requests.get(f"{BASE}/LR/ImageServer/identify", timeout=120, params={
            "geometry": f'{{"x":{p["lon"]},"y":{p["lat"]}}}', "geometryType": "esriGeometryPoint",
            "returnGeometry": "false", "returnCatalogItems": "true", "f": "json"}).json()
        vals = r["properties"]["Values"]
        for it, v in zip(r["catalogItems"]["features"], vals):
            a = it["attributes"]
            try:
                x = float(v)
            except ValueError:
                x = None
            filas.append({"punto": p["id"], "capa": a.get("Name") or a.get("name"), "tema": a.get("sub_theme_name"),
                          "variable": a.get("variable"), "periodo": a.get("year"), "escenario": a.get("rcp"),
                          "unidades": a.get("units"), "valor": x})
    df = pd.DataFrame(filas)
    df.to_csv(SAL / "gaez_recursos_por_punto.csv", index=False)
    print(f"gaez_recursos_por_punto.csv: {len(df)} filas")


if __name__ == "__main__":
    SAL.mkdir(exist_ok=True)
    aptitud()
    recursos()
