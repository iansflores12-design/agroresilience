"""ERA5 desde Copernicus CDS (serie horaria por punto) -> rellena processed/era5_diario.csv donde falten puntos o dias.

Necesita una cuenta gratis de Copernicus y su token personal en config/cds_token.txt (una linea; fuera de git):
  1) Crear cuenta / entrar en https://cds.climate.copernicus.eu  2) aceptar la licencia del dataset
     "ERA5 hourly time-series data on single levels from 1940 to present"  3) copiar tu "Personal Access Token"
     de https://cds.climate.copernicus.eu/profile
Uso: .venv/Scripts/python -I scripts/era5_cds.py [--puntos id,id] [--desde 1996-01-01]
Dia local de Honduras (UTC-6), igual que la version de Open-Meteo. et0_mm no existe en CDS: queda vacio.
"""
import argparse, io, sys, zipfile
from datetime import date, timedelta
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procesar_nuevo import PUNTOS, RAIZ, fusionar, ord_punto

DEST = RAIZ / "processed" / "era5_diario.csv"
VARS = ["2m_temperature", "2m_dewpoint_temperature", "total_precipitation", "10m_u_component_of_wind",
        "10m_v_component_of_wind", "surface_solar_radiation_downwards", "surface_pressure"]
# Nota: esta serie por punto de CDS NO trae humedad del suelo (swvl1-4): esas columnas quedan vacias para estos
# puntos (la humedad del suelo esta en GLDAS, SMAP y Meteomatics). ET0 se calcula con FAO-56 Penman-Monteith.


def cliente():
    import cdsapi
    f = RAIZ / "config" / "cds_token.txt"
    if not f.exists() or not f.read_text(encoding="utf-8").strip():
        import getpass
        print("Pega tu API key de Copernicus (https://cds.climate.copernicus.eu/profile). No se ve al pegar.")
        k = getpass.getpass("API key: ").strip()
        if len(k) < 20:
            sys.exit("Esa clave no parece valida (muy corta).")
        f.write_text(k, encoding="utf-8")
        print("Clave guardada en config/cds_token.txt (fuera de git). Sigo con la descarga...")
    return cdsapi.Client(url="https://cds.climate.copernicus.eu/api", key=f.read_text(encoding="utf-8").strip(), quiet=True)


def et0_fao56(tmax, tmin, tmean, tdew, u2, rs, p_kpa, lat, doy, z):
    """ET0 diaria (mm/dia), FAO-56 ecuacion 6, con G = 0."""
    es = (0.6108 * np.exp(17.27 * tmax / (tmax + 237.3)) + 0.6108 * np.exp(17.27 * tmin / (tmin + 237.3))) / 2
    ea = 0.6108 * np.exp(17.27 * tdew / (tdew + 237.3))
    delta = 4098 * (0.6108 * np.exp(17.27 * tmean / (tmean + 237.3))) / (tmean + 237.3) ** 2
    gamma = 0.000665 * p_kpa
    phi = np.radians(lat)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(-np.tan(phi) * np.tan(dec))
    ra = 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))
    rso = (0.75 + 2e-5 * z) * ra
    rns = 0.77 * rs
    sigma = 4.903e-9
    rnl = sigma * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * np.sqrt(ea)) * (1.35 * np.clip(rs / rso, 0, 1) - 0.35)
    rn = rns - rnl
    return (0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))


def diario(csv_bytes, lat, z):
    d = pd.read_csv(io.BytesIO(csv_bytes))
    t = pd.to_datetime(d["valid_time"]) - pd.Timedelta(hours=6)  # dia local de Honduras
    d = d.assign(fecha=t.dt.strftime("%Y-%m-%d"), viento=np.hypot(d["u10"], d["v10"]))
    g = d.groupby("fecha")
    o = pd.DataFrame({"t2m": g["t2m"].mean() - 273.15, "t2m_max": g["t2m"].max() - 273.15,
                      "t2m_min": g["t2m"].min() - 273.15, "tdew": g["d2m"].mean() - 273.15,
                      "tp_mm": g["tp"].sum() * 1000, "rs": g["ssrd"].sum() / 1e6,
                      "u2": g["viento"].mean() * 4.87 / np.log(67.8 * 10 - 5.42), "p": g["sp"].mean() / 1000})
    o = o[g.size() >= 20]  # descarta dias incompletos (bordes)
    doy = pd.to_datetime(o.index).dayofyear.values
    o["et0_mm"] = et0_fao56(o.t2m_max, o.t2m_min, o.t2m, o.tdew, o.u2, o.rs, o.p, lat, doy, z).clip(lower=0)
    out = o[["t2m", "t2m_max", "t2m_min", "tp_mm", "et0_mm"]].round(4).reset_index()
    for i in range(1, 5):
        out[f"swvl{i}"] = ""
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--puntos")
    ap.add_argument("--desde", default="1996-01-01")
    a = ap.parse_args()
    ids = set(a.puntos.split(",")) if a.puntos else None
    tengo = pd.read_csv(DEST, usecols=["punto", "fecha"], dtype=str) if DEST.exists() else pd.DataFrame(columns=["punto", "fecha"])
    cuenta = tengo.groupby("punto").size().to_dict()
    hasta = (date.today() - timedelta(days=6)).isoformat()
    c = cliente()
    topo = RAIZ / "processed" / "topografia_por_punto.csv"
    global ELEV
    ELEV = pd.read_csv(topo).set_index("punto")["elevacion_m"].to_dict() if topo.exists() else {}
    for p in PUNTOS:
        if (ids and p["id"] not in ids) or cuenta.get(p["id"], 0) >= 11000:
            continue
        print("pidiendo", p["id"], flush=True)
        dest_zip = RAIZ / "raw" / "era5_cds" / f"{p['id']}.csv"
        dest_zip.parent.mkdir(parents=True, exist_ok=True)
        if not dest_zip.exists():
            c.retrieve("reanalysis-era5-single-levels-timeseries", {
                "variable": VARS, "location": {"longitude": p["lon"], "latitude": p["lat"]},
                "date": [f"{a.desde}/{hasta}"], "data_format": "csv"}, str(dest_zip))
        raw = dest_zip.read_bytes()
        if raw[:2] == b"PK":
            z = zipfile.ZipFile(io.BytesIO(raw)); raw = z.read(z.namelist()[0])
        df = diario(raw, p["lat"], ELEV.get(p["id"], 0.0))
        df.insert(0, "longitud", p["lon"]); df.insert(0, "latitud", p["lat"]); df.insert(0, "punto", p["id"])
        fusionar(DEST, df, ["punto", "fecha"], ord_punto("fecha"))
        print(f"  {p['id']}: {len(df)} dias -> era5_diario.csv", flush=True)


if __name__ == "__main__":
    main()
