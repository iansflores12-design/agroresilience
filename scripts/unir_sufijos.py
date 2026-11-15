"""Une processed/<fuente>_<sufijo>.csv en processed/<fuente>.csv (por punto y fecha) y borra los parciales.
Uso: .venv/Scripts/python -I scripts/unir_sufijos.py"""
import re, sys
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import RAIZ, fusionar, ord_punto
SAL = RAIZ / "processed"
for f in sorted(SAL.glob("*_n[0-9].csv")):
    base = SAL / (re.sub(r"_n[0-9]$", "", f.stem) + ".csv")
    fusionar(base, pd.read_csv(f), ["punto", "fecha"], ord_punto("fecha"))
    f.unlink()
    print("unido", f.name, "->", base.name)
