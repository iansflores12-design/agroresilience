"""ECOSTRESS por punto via NASA AppEEARS -> processed/ecostress_diario.csv

Paso 1 (UNA vez, lo escribes tu en una terminal; la contrasena NO se guarda ni se muestra):
    .venv/Scripts/python -I scripts/ecostress.py login
    (guarda solo un token temporal de 48 h en config/appeears_token.txt, que esta en .gitignore)
Paso 2:
    .venv/Scripts/python -I scripts/ecostress.py correr      (envia, espera, baja y adapta; reanudable)
Productos (desde 2018-07): ECO_L2T_LSTE (LST, K), ECO_L3T_JET (ET diaria, W/m2), ECO_L4T_ESI (ESI y PET).
Salida diaria por (punto, fecha): promedio de las pasadas sin nube; n_pasadas = cuantas entraron.
"""
import csv, getpass, io, json, sys, time
from pathlib import Path
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ, fusionar, ord_punto

API = "https://appeears.earthdatacloud.nasa.gov/api"
TOKEN = RAIZ / "config" / "appeears_token.txt"
DIR = RAIZ / "raw" / "ecostress"
PRODUCTOS = {
    "ECO_L2T_LSTE.002": ["LST", "LST_err", "cloud"],
    "ECO_L3T_JET.002": ["ETdaily", "ETinstUncertainty", "cloud"],
    "ECO_L4T_ESI.002": ["ESI", "PET", "cloud"],
}
NOMBRES = {"LST": "lst_k", "LST_err": "lst_err_k", "ETdaily": "et_diaria_wm2", "ETinstUncertainty": "et_incert_wm2",
           "ESI": "esi", "PET": "pet_wm2"}


def login():
    u = input("Usuario de Earthdata: ").strip()
    p = getpass.getpass("Contrasena (no se ve al escribir): ")
    r = requests.post(f"{API}/login", auth=(u, p), timeout=60)
    del p
    if r.status_code != 200:
        sys.exit(f"Login fallido ({r.status_code}). Revisa usuario y contrasena.")
    TOKEN.write_text(r.json()["token"], encoding="utf-8")
    print("Listo: token guardado (vence en ~48 h). Ya puedes cerrar esta terminal.")


def cab():
    if not TOKEN.exists():
        sys.exit("Falta el token: corre primero 'login'.")
    return {"Authorization": "Bearer " + TOKEN.read_text(encoding="utf-8").strip()}


def enviar(h, fin, pts=None, suf=""):
    pts = pts or PUNTOS
    est = DIR / f"tareas{suf}.json"
    tareas = json.loads(est.read_text()) if est.exists() else {}
    for prod, caps in PRODUCTOS.items():
        if prod in tareas:
            continue
        cuerpo = {"task_type": "point", "task_name": f"agro_{prod}{suf}", "params": {
            "dates": [{"startDate": "07-01-2018", "endDate": fin}],
            "layers": [{"product": prod, "layer": c} for c in caps],
            "coordinates": [{"id": p["id"], "latitude": p["lat"], "longitude": p["lon"], "category": "zona"} for p in pts]}}
        r = requests.post(f"{API}/task", json=cuerpo, headers=h, timeout=120)
        if r.status_code >= 400:
            sys.exit(f"AppEEARS rechazo {prod}: {r.status_code} {r.text[:300]}")
        tareas[prod] = r.json()["task_id"]
        print("enviada", prod, tareas[prod])
        DIR.mkdir(parents=True, exist_ok=True)
        est.write_text(json.dumps(tareas))
    return tareas


def esperar_y_bajar(h, tareas, suf=""):
    for prod, tid in tareas.items():
        destino = DIR / f"{prod}{suf}.csv"
        if destino.exists():
            continue
        while True:
            st = requests.get(f"{API}/task/{tid}", headers=h, timeout=60).json()
            print(f"  {prod}: {st.get('status')} {st.get('progress', {}).get('summary', '') if isinstance(st.get('progress'), dict) else ''}", flush=True)
            if st.get("status") == "done":
                break
            if st.get("status") in ("error", "failed"):
                sys.exit(f"{prod} fallo: {st}")
            time.sleep(60)
        arch = requests.get(f"{API}/bundle/{tid}", headers=h, timeout=60).json()["files"]
        f = next(a for a in arch if a["file_name"].endswith("-results.csv"))
        r = requests.get(f"{API}/bundle/{tid}/{f['file_id']}", headers=h, timeout=600)
        r.raise_for_status()
        destino.write_bytes(r.content)
        print("  bajado", destino.name, len(r.content), "bytes")


def adaptar():
    por_prod = []
    for prod, caps in PRODUCTOS.items():
        fs = [f for f in (DIR / f"{prod}.csv", DIR / f"{prod}_n.csv") if f.exists()]
        if not fs:
            continue
        d = pd.concat([pd.read_csv(f) for f in fs], ignore_index=True)
        pre = prod.replace(".", "_")
        nube = next((c for c in d.columns if c.startswith(pre + "_cloud")), None)
        if nube is not None:
            d = d[d[nube] == 0]
        sal = {"ID": "punto", "Date": "fecha"}
        cols = {}
        for c in caps:
            if c == "cloud":
                continue
            col = next((x for x in d.columns if x.startswith(f"{pre}_{c}_")), None)
            if col:
                cols[col] = NOMBRES[c]
        d = d[["ID", "Date"] + list(cols)].rename(columns={**sal, **cols})
        d = d.replace(-9999, pd.NA).dropna(subset=list(cols.values()), how="all")
        g = d.groupby(["punto", "fecha"], as_index=False).agg({**{v: "mean" for v in cols.values()}, "punto": "size"}) \
            if False else d.groupby(["punto", "fecha"]).agg({v: "mean" for v in cols.values()}).reset_index()
        g["n_" + prod.split(".")[0].lower()] = d.groupby(["punto", "fecha"]).size().values
        por_prod.append(g)
    if not por_prod:
        sys.exit("sin resultados que adaptar")
    out = por_prod[0]
    for g in por_prod[1:]:
        out = out.merge(g, on=["punto", "fecha"], how="outer")
    pos = {p["id"]: p for p in PUNTOS}
    out.insert(1, "latitud", out["punto"].map(lambda i: pos[i]["lat"]))
    out.insert(2, "longitud", out["punto"].map(lambda i: pos[i]["lon"]))
    fusionar(RAIZ / "processed" / "ecostress_diario.csv", out.round(4), ["punto", "fecha"], ord_punto("fecha"))
    print(f"ecostress_diario.csv: {len(out)} filas")


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    if modo == "login":
        login()
    elif modo == "correr":
        from datetime import date, timedelta
        h = cab()
        fin = (date.today() - timedelta(days=5)).strftime("%m-%d-%Y")
        nuevos = (RAIZ / "logs" / "nuevos.txt").read_text().strip().split(",") if "--nuevos" in sys.argv else None
        pts = [p for p in PUNTOS if p["id"] in nuevos] if nuevos else None
        suf = "_n" if nuevos else ""
        esperar_y_bajar(h, enviar(h, fin, pts, suf), suf)
        adaptar()
    elif modo == "adaptar":
        adaptar()
    else:
        print(__doc__)
