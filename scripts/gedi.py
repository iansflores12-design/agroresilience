"""GEDI L4B (biomasa aerea, 1 km, 2019-2023; ORNL DAAC) por punto -> processed/gedi_biomasa_por_punto.csv
Usa el token de Earthdata (config/earthdata_token.txt). Estatico: reejecutar solo reemplaza.
Columnas: biomasa_mg_ha (media), error_estandar_mg_ha, n_disparos (lidar), calidad (flag QF de GEDI).
Nota: GEDI sirve mas en zonas con arboles (cafe con sombra, bosque cercano); en cultivo bajo puede venir vacio."""
import sys
from pathlib import Path
import pandas as pd, requests, rasterio
from pyproj import Transformer
sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ

BASE = "https://data.ornldaac.earthdata.nasa.gov/protected/gedi/GEDI_L4B_Gridded_Biomass_V2_1/data/GEDI04_B_MW019MW223_02_002_02_R01000M_{}.tif"
CAPAS = {"MU": "biomasa_mg_ha", "SE": "error_estandar_mg_ha", "NS": "n_disparos", "QF": "calidad"}
tok = (RAIZ / "config" / "earthdata_token.txt").read_text(encoding="utf-8").strip()
s = requests.Session(); s.headers["Authorization"] = "Bearer " + tok


def firmado(url):
    for _ in range(6):
        r = s.get(url, allow_redirects=False, timeout=60)
        if r.status_code in (301, 302, 303, 307) and "Location" in r.headers:
            url = r.headers["Location"]
            if "amazonaws" in url or "cloudfront" in url or "X-Amz" in url:
                return url
            continue
        return url
    return url


filas = {p["id"]: {"punto": p["id"], "latitud": p["lat"], "longitud": p["lon"]} for p in PUNTOS}
for cod, col in CAPAS.items():
    with rasterio.open(firmado(BASE.format(cod))) as ds:
        tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        for p in PUNTOS:
            v = float(next(ds.sample([tr.transform(p["lon"], p["lat"])]))[0])
            filas[p["id"]][col] = None if (ds.nodata is not None and v == ds.nodata) or v < 0 else round(v, 2)
    print("capa", cod, "ok")
df = pd.DataFrame(list(filas.values()))
df.to_csv(RAIZ / "processed" / "gedi_biomasa_por_punto.csv", index=False)
print(df.to_string(index=False))
