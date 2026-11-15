"""Revisa que cada fuente procesada este completa (30 puntos, fechas esperadas) y dice que falta y con que script se baja.
Uso: .venv/Scripts/python -I scripts/auditar.py      (codigo de salida 1 si algo falta)
"""
import json, sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

R = Path(__file__).resolve().parent.parent
P = R / "processed"
IDS = [p["id"] for p in json.loads((R / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]]
HOY = date.today()

# fuente: (archivo, columna de fecha o None, desde, retraso tolerado en dias, columna que debe tener dato, script)
FUENTES = {
    "NASA POWER": ("power_diario_largo.csv", "fecha", "1996-01-01", 10, "T2M", "actualizar_reciente.py (diario) / descargar.py (historico)"),
    "IMERG": ("imerg_series.csv", "fecha", "2000-06-01", 7, "precipitation", "descargar_earthdata.py imerg imerg_late"),
    "SMAP": ("smap_series.csv", "fecha", "2015-04-01", 10, None, "descargar_earthdata.py smap"),
    "GLDAS": ("gldas_diario.csv", "fecha", "2000-01-01", 150, "suelo_10_40cm", "descargar_earthdata.py gldas + adaptar_gldas.py"),
    "ERA5": ("era5_diario.csv", "fecha", "1996-01-01", 12, "t2m", "fuentes_extra.py era5 (Open-Meteo) / era5_cds.py (Copernicus)"),
    "MODIS NDVI": ("modis_ndvi.csv", "fecha", "2000-02-18", 75, "ndvi", "fuentes_extra.py modis"),
    "Sentinel-2": ("sentinel2_indices.csv", "fecha", "2015-07-01", 40, "ndvi", "fuentes_extra.py sentinel2"),
    "Landsat": ("landsat_ndvi.csv", "fecha", "1996-01-01", 60, "ndvi", "fuentes_extra.py landsat"),
    "Meteomatics": ("meteomatics_diario_largo.csv", "dia_local", "1996-01-01", 7, "t_2m:C", "meteomatics.py (+ --nuevos)"),
    "ECOSTRESS LST": ("ecostress_lst.csv", "fecha", "2018-07-01", 60, "lst_c", "ecostress_directo.py"),
    "GRACE": ("grace_series.csv", "fecha", "2002-04-01", 200, "lwe_thickness", "descargar_earthdata.py grace"),
    "SoilGrids": ("suelo_por_punto.csv", None, None, None, "clay_0_5cm", "descargar.py + suelo_alterno.py"),
    "SRTM": ("topografia_por_punto.csv", None, None, None, "elevacion_m", "fuentes_extra.py dem"),
    "GAEZ": ("gaez_aptitud_por_punto.csv", None, None, None, "indice_aptitud", "gaez.py"),
    "GEDI": ("gedi_biomasa_por_punto.csv", None, None, None, None, "gedi.py"),
    "ONI": ("oni.csv", None, None, None, "oni", "actualizar_reciente.py"),
    "IBTrACS": ("huracanes_caribe_honduras.csv", None, None, None, None, "descargar.py"),
}


def main():
    faltas = 0
    print(f"{'fuente':<14} {'puntos':>7} {'desde':>11} {'hasta':>11} {'con dato':>9}  estado")
    for nombre, (arch, fcol, desde, retraso, col, script) in FUENTES.items():
        f = P / arch
        if not f.exists():
            print(f"{nombre:<14} {'-':>7} {'':>11} {'':>11} {'':>9}  FALTA el archivo -> {script}")
            faltas += 1
            continue
        d = pd.read_csv(f, low_memory=False)
        problemas = []
        if "punto" in d:
            faltan = [i for i in IDS if i not in set(d["punto"])]
            if faltan:
                problemas.append(f"faltan {len(faltan)} puntos: {', '.join(faltan[:5])}{'...' if len(faltan) > 5 else ''}")
        npts = d["punto"].nunique() if "punto" in d else "-"
        ini = fin = ""
        if fcol and fcol in d:
            ini, fin = str(d[fcol].min())[:10], str(d[fcol].max())[:10]
            if fin < (HOY - timedelta(days=retraso)).isoformat():
                problemas.append(f"atrasada (ultima {fin})")
        lleno = f"{d[col].notna().mean():.0%}" if col and col in d else ""
        if col and col in d and "punto" in d:
            vacios = [p for p, s in d.groupby("punto")[col] if s.notna().mean() == 0]
            if vacios:
                problemas.append(f"{len(vacios)} puntos sin dato: {', '.join(vacios[:5])}")
        estado = "ok" if not problemas else "; ".join(problemas) + f" -> {script}"
        faltas += bool(problemas)
        print(f"{nombre:<14} {npts:>7} {ini:>11} {fin:>11} {lleno:>9}  {estado}")
    return 1 if faltas else 0


if __name__ == "__main__":
    sys.exit(main())
