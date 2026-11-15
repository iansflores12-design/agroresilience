"""Para puntos sin dato en SoilGrids (cascos urbanos, agua), toma el pixel de suelo valido mas cercano (hasta ~5 km)
leyendo directo los mapas globales de SoilGrids 250 m (files.isric.org, sin limite de API) y lo deja listo para
procesar_nuevo.py: raw/soilgrids/<id>_cercano.json (mismo formato que la API REST) + "suelo_alterno" en config/zonas.json.
Reanudable: salta puntos que ya tienen suelo_alterno. Uso: .venv/Scripts/python -I scripts/suelo_alterno.py
"""
import json, math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer

R = Path(__file__).resolve().parent.parent
ZF, ENT = R / "config" / "zonas.json", R / "raw" / "soilgrids"
PROPS = ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec"]
DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]
URL = "/vsicurl/https://files.isric.org/soilgrids/latest/data/{p}/{p}_{d}_mean.vrt"
MEDIO = 20  # ventana de 41 x 41 pixeles de 250 m (~5 km a cada lado)


def validos(d):
    return sum(1 for l in d["properties"]["layers"] for x in l["depths"] if x["values"]["mean"] is not None)


def main():
    z = json.loads(ZF.read_text(encoding="utf-8"))
    pend = []
    for p in z["puntos"]:
        f = ENT / f"{p['id']}.json"
        if not p.get("suelo_alterno") and f.exists() and validos(json.loads(f.read_text(encoding="utf-8"))) == 0:
            pend.append(p)
    print(f"{len(pend)} puntos sin suelo", flush=True)
    if not pend:
        return
    capas = {p["id"]: {pr: {"name": pr, "depths": []} for pr in PROPS} for p in pend}
    elegido = {}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="3"):
        for pr in PROPS:
            for dp in DEPTHS:
                with rasterio.open(URL.format(p=pr, d=dp)) as ds:
                    tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
                    inv = Transformer.from_crs(ds.crs, "EPSG:4326", always_xy=True)
                    for p in pend:
                        f, c = ds.index(*tr.transform(p["lon"], p["lat"]))
                        if p["id"] not in elegido:  # el pixel se elige una vez (con la primera capa) y se reusa en todas
                            w = ds.read(1, window=rasterio.windows.Window(c - MEDIO, f - MEDIO, 2 * MEDIO + 1, 2 * MEDIO + 1))
                            ii, jj = np.nonzero(w != ds.nodata)
                            if not len(ii):
                                elegido[p["id"]] = None
                            else:
                                k = int(np.argmin((ii - MEDIO) ** 2 + (jj - MEDIO) ** 2))
                                fi, ci = f - MEDIO + int(ii[k]), c - MEDIO + int(jj[k])
                                lo, la = inv.transform(*ds.xy(fi, ci))
                                km = math.hypot(int(ii[k]) - MEDIO, int(jj[k]) - MEDIO) * 0.25
                                elegido[p["id"]] = (fi, ci, round(la, 5), round(lo, 5), round(km, 2))
                        e = elegido[p["id"]]
                        v = None
                        if e:
                            x = int(ds.read(1, window=rasterio.windows.Window(e[1], e[0], 1, 1))[0, 0])
                            v = None if x == ds.nodata else x
                        capas[p["id"]][pr]["depths"].append({"label": dp, "values": {"mean": v}})
                print(f"  capa {pr} lista", flush=True)
    for p in pend:
        e = elegido.get(p["id"])
        if not e:
            print(f"{p['id']}: sin suelo valido a menos de 5 km")
            continue
        out = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [e[3], e[2]]},
               "properties": {"layers": list(capas[p["id"]].values()), "fuente": "SoilGrids 250 m (mapas globales)"}}
        (ENT / f"{p['id']}_cercano.json").write_text(json.dumps(out), encoding="utf-8")
        p["suelo_alterno"] = {"lat": e[2], "lon": e[3], "distancia_km": e[4]}
        print(f"{p['id']}: suelo valido a {e[4]} km", flush=True)
    ZF.write_text(json.dumps(z, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
