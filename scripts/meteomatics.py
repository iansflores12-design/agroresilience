"""Meteomatics para los puntos de config/zonas.json -> raw/meteomatics/ (hist_AAAA.json, pronostico_FECHA.json, estaticos.json)
y luego los procesa procesar_nuevo.py (meteomatics_diario_largo.csv, meteomatics_pronostico.csv, meteomatics_estaticos.csv).

Las credenciales se piden por teclado al iniciar (la contrasena no se ve ni se guarda; vive solo en memoria mientras corre).
    .venv/Scripts/python -I scripts/meteomatics.py [--desde 1996] [--hasta AAAA]
Detecta solo que parametros permite tu plan (prueba cada uno con 1 punto y 1 dia) y descarga esos.
Dia local de Honduras (UTC-6): cada dia se pide a las 06:00Z, igual que la regla de dia_local de procesar_nuevo.py.
"""
import argparse, getpass, json, subprocess, sys, time
from datetime import date, timedelta
from pathlib import Path
import requests

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "raw" / "meteomatics"
PUNTOS = json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]
if "--nuevos" in sys.argv:  # solo los puntos agregados despues (logs/nuevos.txt), en su propia carpeta
    ids = (RAIZ / "logs" / "nuevos.txt").read_text().strip().split(",")
    PUNTOS = [p for p in PUNTOS if p["id"] in ids]
    OUT = RAIZ / "raw" / "meteomatics_n"
    sys.argv.remove("--nuevos")
COORDS = "+".join(f"{p['lat']},{p['lon']}" for p in PUNTOS)
BASE = "https://api.meteomatics.com"
DIARIOS = ["t_2m:C", "t_max_2m_24h:C", "t_min_2m_24h:C", "precip_24h:mm", "relative_humidity_2m:p", "wind_speed_10m:ms",
           "global_rad_24h:Wh", "evapotranspiration_24h:mm", "soil_moisture_index_-5cm:idx", "soil_moisture_index_-50cm:idx",
           "soil_moisture_index_-150cm:idx", "t_soil_5cm:C"]
ESTATICOS = ["elevation:m", "soil_type:idx", "is_forest_land:idx", "is_rural_land:idx", "is_water:idx", "slope_angle:d"]


def pedir(auth, ruta, intentos=4):
    for i in range(intentos):
        try:
            r = requests.get(f"{BASE}/{ruta}", auth=auth, timeout=180)
        except requests.RequestException:
            time.sleep(5 * (i + 1)); continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(10 * (i + 1)); continue
        return r
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=1996)
    ap.add_argument("--hasta", type=int, default=date.today().year)
    a = ap.parse_args()
    import os
    if os.environ.get("METEOMATICS_USER") and os.environ.get("METEOMATICS_PASSWORD"):  # modo automatico
        auth = (os.environ["METEOMATICS_USER"], os.environ["METEOMATICS_PASSWORD"])
    else:
        auth = (input("Usuario Meteomatics: ").strip(), getpass.getpass("Contrasena (no se ve): "))
    OUT.mkdir(parents=True, exist_ok=True)
    un = f"{PUNTOS[0]['lat']},{PUNTOS[0]['lon']}"
    t0 = "2024-06-02T06:00:00Z"
    r = pedir(auth, f"{t0}/t_2m:C/{un}/json")
    if r.status_code in (401, 403):
        sys.exit(f"Credenciales rechazadas ({r.status_code}).")
    print("Probando parametros de tu plan...")
    ok_d, ok_e = [], []
    for par in DIARIOS:
        r = pedir(auth, f"{t0}/{par}/{un}/json"); good = r.status_code == 200
        print(f"  {'OK ' if good else 'no '} {par}" + ("" if good else f"  ({r.status_code})"))
        ok_d += [par] if good else []
        time.sleep(0.5)
    for par in ESTATICOS:
        r = pedir(auth, f"now/{par}/{un}/json"); good = r.status_code == 200
        print(f"  {'OK ' if good else 'no '} {par}" + ("" if good else f"  ({r.status_code})"))
        ok_e += [par] if good else []
        time.sleep(0.5)
    if not ok_d:
        sys.exit("Ningun parametro diario permitido por el plan.")
    if ok_e:
        dest = OUT / "estaticos.json"
        if not dest.exists():
            r = pedir(auth, f"now/{','.join(ok_e)}/{COORDS}/json")
            if r.status_code == 200:
                dest.write_text(r.text, encoding="utf-8"); print("estaticos.json ok")
    hoy = date.today()
    LOTES = [ok_d[i:i + 6] for i in range(0, len(ok_d), 6)]  # tu plan: max 10 parametros por pedido
    for anio in range(a.desde, a.hasta + 1):
        d0 = date(anio, 1, 2)  # el valor de 24 h del 2 de enero 06:00Z cubre el dia local 1 de enero
        d1 = min(date(anio + 1, 1, 1), hoy - timedelta(days=2))
        if d1 < d0:
            continue
        for g, lote in enumerate(LOTES):
            dest = OUT / f"hist_{anio}_{g}.json"
            if dest.exists() and anio < hoy.year:
                continue
            r = pedir(auth, f"{d0}T06:00:00Z--{d1}T06:00:00Z:P1D/{','.join(lote)}/{COORDS}/json")
            if r.status_code == 200:
                dest.write_text(r.text, encoding="utf-8"); print(f"hist_{anio}_{g}.json ok ({len(r.content)//1024} KB)", flush=True)
            else:
                print(f"hist_{anio}_{g}: {r.status_code} {r.text[:160]}", flush=True)
            time.sleep(1)
    for g, lote in enumerate(LOTES):
        r = pedir(auth, f"{hoy}T06:00:00Z--{hoy + timedelta(days=7)}T06:00:00Z:P1D/{','.join(lote)}/{COORDS}/json")
        if r.status_code == 200:
            (OUT / f"pronostico_{hoy}_{g}.json").write_text(r.text, encoding="utf-8"); print("pronostico ok", g)
        else:
            print("pronostico", g, r.status_code, r.text[:160])
    del auth
    print("\nProcesando con procesar_nuevo.py ...")
    subprocess.run([sys.executable, "-I", str(RAIZ / "scripts" / "procesar_nuevo.py"), str(OUT)])


if __name__ == "__main__":
    main()
