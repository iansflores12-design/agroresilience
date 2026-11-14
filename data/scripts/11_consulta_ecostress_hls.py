"""Solo CONSULTA (no baja nada): granulos de ECOSTRESS ECO_L3T_JET v003 y HLSL30 v2.0
en el ultimo anio para Comayagua y Choluteca. Correr: .venv/bin/python scripts/11_consulta_ecostress_hls.py
"""
import json
import os
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import earthaccess

RAIZ = Path(__file__).resolve().parent.parent
PUNTOS = {p["id"]: p for p in json.loads((RAIZ / "config" / "zonas.json").read_text())["puntos"]}
PRODUCTOS = [("ECO_L3T_JET", "003"), ("HLSL30", "2.0")]

earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
fin = datetime.utcnow().date()
ini = fin - timedelta(days=365)
for sn, ver in PRODUCTOS:
    for pid in ("comayagua", "choluteca"):
        p = PUNTOS[pid]
        try:
            g = earthaccess.search_data(short_name=sn, version=ver, point=(p["lon"], p["lat"]),
                                        temporal=(str(ini), str(fin)), count=-1)
        except Exception as e:
            print(sn, ver, pid, "ERROR", repr(e)[:200])
            continue
        mb = sum(x.size for x in g)
        fechas = sorted(x["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10] for x in g)
        meses = Counter(f[:7] for f in fechas)
        teselas = Counter(x["meta"]["native-id"].split("_")[5] if sn.startswith("ECO") else x["meta"]["native-id"].split(".")[2] for x in g)
        nubes = [float(a["Values"][0]) for x in g for a in x["umm"].get("AdditionalAttributes", []) if a["Name"] == "CLOUD_COVERAGE"]
        print(f"{sn} v{ver} | {pid} | {ini} a {fin} | {len(g)} granulos | {mb/1024:.2f} GB | "
              f"{fechas[0] if fechas else '-'} a {fechas[-1] if fechas else '-'} | teselas {dict(teselas)}")
        print("   por mes:", dict(sorted(meses.items())))
        if nubes:
            print(f"   nubosidad: mediana {sorted(nubes)[len(nubes)//2]:.0f}%, con menos de 30%: {sum(1 for n in nubes if n < 30)}")
        if g:
            print("   archivos por granulo:", len(g[0].data_links()), "| ejemplo:", g[0]["meta"]["native-id"])
