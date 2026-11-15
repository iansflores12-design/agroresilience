"""Genera config/smap_malla.json (lat por fila, lon por columna) desde un archivo SMAP recortado de raw/smap/.
Uso: .venv/Scripts/python -I scripts/generar_malla_smap.py [archivo.nc4]"""
import glob, json, sys
from pathlib import Path
import netCDF4 as nc
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
cand = sys.argv[1:] or sorted(glob.glob(str(RAIZ / "raw" / "smap" / "*_HND.nc4")))
if not cand:
    print("sin archivos SMAP; se conserva config/smap_malla.json" if (RAIZ / "config" / "smap_malla.json").exists() else "sin archivos SMAP")
    sys.exit(0)
f = cand[0]
from pyproj import Transformer
d = nc.Dataset(f)  # lat/lon del grupo vienen vacios donde no hay dato: se calculan desde x/y EASE-Grid 2.0 (EPSG:6933)
x, y = np.asarray(d["x_global"][:], dtype="f8"), np.asarray(d["y_global"][:], dtype="f8")
t = Transformer.from_crs("EPSG:6933", "EPSG:4326", always_xy=True)
col = np.array([t.transform(xx, y[0])[0] for xx in x])
fila = np.array([t.transform(x[0], yy)[1] for yy in y])
cv = lambda a: [None if np.isnan(x) else round(float(x), 6) for x in a]
(RAIZ / "config" / "smap_malla.json").write_text(json.dumps({"lat": cv(fila), "lon": cv(col)}), encoding="utf-8")
print(f"malla {len(fila)} x {len(col)} desde {Path(f).name}")
