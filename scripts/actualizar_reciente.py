"""Baja SOLO lo reciente de las fuentes que no se actualizan solas (para correr cada dia).

  NASA POWER   ultimos 90 dias de cada punto -> raw/power_act/<AAAAMMDD>/<punto>.json
  ONI (NOAA)   archivo completo (cambia 1 vez al mes) -> raw/oni_act/<AAAAMMDD>/oni.txt
procesar_nuevo.py los toma como archivos nuevos (sha256 distinto) y reemplaza por fecha, sin duplicar.
Uso: .venv/Scripts/python -I scripts/actualizar_reciente.py
"""
import json, time, urllib.request
from datetime import date, timedelta
from pathlib import Path

R = Path(__file__).resolve().parent.parent
PUNTOS = json.loads((R / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]
HOY = date.today()
PAR = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN"


def bajar(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "agroresilience"}), timeout=180) as r:
                dest.write_bytes(r.read())
            return True
        except Exception as e:
            print("  reintento", dest.name, e)
            time.sleep(10 * (i + 1))
    return False


carpeta = R / "raw" / "power_act" / HOY.strftime("%Y%m%d")
ini, fin = (HOY - timedelta(days=90)).strftime("%Y%m%d"), HOY.strftime("%Y%m%d")
for p in PUNTOS:
    if not (carpeta / f"{p['id']}.json").exists():
        ok = bajar(f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={PAR}&community=AG"
                   f"&longitude={p['lon']}&latitude={p['lat']}&start={ini}&end={fin}&format=JSON", carpeta / f"{p['id']}.json")
        print("POWER", p["id"], "ok" if ok else "FALLO")
bajar("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", R / "raw" / "oni_act" / HOY.strftime("%Y%m%d") / "oni.txt")
print("ONI ok")
