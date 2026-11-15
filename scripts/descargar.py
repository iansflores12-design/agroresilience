"""Descarga datos publicos sin login a raw/. Uso: python scripts/descargar.py"""
import json, sys, time, urllib.request, urllib.error
from pathlib import Path
RAIZ = Path(__file__).resolve().parent.parent
E = RAIZ / "raw"
PUNTOS = json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]
UA = {"User-Agent": "agroresilience-descarga"}

def bajar(url, dest, reintentos=3):
    dest = Path(dest); dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print("ya existe", dest.name); return True
    for i in range(reintentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                dest.write_bytes(r.read())
            print("ok", dest.name, dest.stat().st_size, "bytes"); return True
        except Exception as e:
            print("fallo", dest.name, i + 1, repr(e)); time.sleep(5 * (i + 1))
    return False

par = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN"
for p in PUNTOS:
    bajar(f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={par}&community=AG"
          f"&longitude={p['lon']}&latitude={p['lat']}&start=19960101&end=20261110&format=JSON",
          E / "power" / f"{p['id']}.json")
bajar("https://origin.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/detrend.nino34.ascii.txt",
      E / "oni" / "oni.txt")
bajar("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NA.list.v04r01.csv",
      E / "ibtracs" / "ibtracs_NA.csv")
for p in PUNTOS:
    q = "&".join(f"property={x}" for x in ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec"])
    q += "&" + "&".join(f"depth={d}" for d in ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]) + "&value=mean"
    bajar(f"https://rest.isric.org/soilgrids/v2.0/properties/query?lon={p['lon']}&lat={p['lat']}&{q}",
          E / "soilgrids" / f"{p['id']}.json")
    time.sleep(3)
