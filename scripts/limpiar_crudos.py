"""Borra archivos crudos de raw/ que YA estan procesados, para que el proyecto pese poco. Seguro y reanudable.

Solo borra un archivo si se puede comprobar que su contenido ya esta en processed/:
  - imerg, imerg_late, smap, grace, power, power_act, oni, oni_act, ibtracs: su sha256 esta en processed/.procesados.csv
  - gldas: su dia ya esta en processed/gldas_diario.csv para todos los puntos
  - era5_cds: el punto ya tiene su serie en processed/era5_diario.csv
No toca: meteomatics (el script decide que pedir segun lo que existe), soilgrids/ecostress (pesan casi nada),
las marcas .hecho_* (evitan volver a pedir a la NASA lo ya bajado) ni config/smap_malla.json.
Uso: .venv/Scripts/python -I scripts/limpiar_crudos.py [--simulacro]
"""
import hashlib, re, sys
from pathlib import Path

import pandas as pd

R = Path(__file__).resolve().parent.parent
E, S = R / "raw", R / "processed"
SIM = "--simulacro" in sys.argv
POR_HASH = ["imerg", "imerg_late", "smap", "grace", "power", "power_act", "oni", "oni_act", "ibtracs"]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def borrar(p, cuenta):
    cuenta[0] += 1
    cuenta[1] += p.stat().st_size
    if not SIM:
        p.unlink()


def main():
    total = [0, 0]
    reg = S / ".procesados.csv"
    hechos = set(pd.read_csv(reg, usecols=["sha256"])["sha256"]) if reg.exists() else set()
    for c in POR_HASH:
        d = E / c
        if not d.exists():
            continue
        n = [0, 0]
        for p in d.rglob("*"):
            if p.is_file() and not p.name.startswith(".") and sha256(p) in hechos:
                borrar(p, n)
        print(f"{c:<11} {n[0]:>6} archivos  {n[1] / 1e6:>8.0f} MB")
        total[0] += n[0]; total[1] += n[1]
    g = S / "gldas_diario.csv"
    if g.exists() and (E / "gldas").exists():
        v = pd.read_csv(g, usecols=["punto", "fecha"], dtype=str)
        npts = v["punto"].nunique()
        listos = set(v.groupby("fecha")["punto"].nunique().loc[lambda s: s >= npts].index.str.replace("-", ""))
        n = [0, 0]
        for p in (E / "gldas").glob("*.nc4"):
            m = re.search(r"\.A(\d{8})\.", p.name)
            if m and m.group(1) in listos:
                borrar(p, n)
        print(f"{'gldas':<11} {n[0]:>6} archivos  {n[1] / 1e6:>8.0f} MB")
        total[0] += n[0]; total[1] += n[1]
    e5 = S / "era5_diario.csv"
    if e5.exists() and (E / "era5_cds").exists():
        cuenta = pd.read_csv(e5, usecols=["punto"])["punto"].value_counts()
        n = [0, 0]
        for p in (E / "era5_cds").glob("*.csv"):
            if cuenta.get(p.stem, 0) >= 11000:
                borrar(p, n)
        print(f"{'era5_cds':<11} {n[0]:>6} archivos  {n[1] / 1e6:>8.0f} MB")
        total[0] += n[0]; total[1] += n[1]
    print(f"{'TOTAL':<11} {total[0]:>6} archivos  {total[1] / 1e6:>8.0f} MB" + ("  (simulacro, nada borrado)" if SIM else " liberados"))


if __name__ == "__main__":
    main()
