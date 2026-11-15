"""Arma el dataset de ENTRENAMIENTO a partir de processed/ (solo lo que usa la herramienta). Reejecutable y determinista.

Uso: .venv/Scripts/python -I scripts/construir_dataset.py
Salidas en processed/modelo/:
  diario.csv.gz    una fila por (punto, fecha): clima, agua, suelo y vegetacion ya fusionados y en unidades comunes
  mensual.csv      una fila por (punto, anio, mes): los 9 indicadores de la propuesta + anomalias vs climatologia
  climatologia.csv una fila por (punto, mes): promedio y desviacion 1996-2025 (base de las anomalias)
  estatico.csv     una fila por punto: terreno, suelo, aptitud GAEZ, biomasa GEDI, tipo de zona
  diccionario.md   que es cada columna y de donde sale

Reglas de fusion (decisiones, en orden de prioridad):
  lluvia      IMERG (satelite NASA) -> si falta, NASA POWER
  ET0         FAO-56 Penman-Monteith con NASA POWER -> si falta, ERA5
  NDVI        Sentinel-2 (10 m) -> Landsat (30 m) -> MODIS (250 m, solo calidad 0-1); se interpola hasta 32 dias
  humedad     SMAP (superficie, desde 2015) y GLDAS (0-10, 10-40, 40-100 cm, desde 2000) por separado
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

R = Path(__file__).resolve().parent.parent
SAL, OUT = R / "processed", R / "processed" / "modelo"
ZONAS = json.loads((R / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]
INICIO, BASE_CLIMA = "1996-01-01", (1996, 2025)
LLUVIA_SECA, LLUVIA_INTENSA, T_ESTRES, NDVI_DESNUDO = 1.0, 50.0, 35.0, 0.2
GDD = {"maiz": (10, 30), "frijol": (10, 30), "sorgo": (10, 35), "cafe": (10, 30), "yuca": (12, 35)}  # (base, tope) en C


def leer(nombre, **kw):
    """Lee processed/<nombre> y sus parciales _nN (si aun no se unieron)."""
    fs = [SAL / nombre, *sorted(SAL.glob(nombre.replace(".csv", "_n[0-9].csv")))]
    fs = [f for f in fs if f.exists()]
    if not fs:
        print(f"  (falta {nombre}, se omite)")
        return pd.DataFrame()
    return pd.concat([pd.read_csv(f, **kw) for f in fs], ignore_index=True)


def et0_fao56(tmax, tmin, rh, u2, rs, lat, doy, z):
    """ET0 diaria (mm/dia) FAO-56 ec. 6 con humedad relativa media (ec. 19 simplificada) y G = 0."""
    tmean = (tmax + tmin) / 2
    e = lambda t: 0.6108 * np.exp(17.27 * t / (t + 237.3))
    es = (e(tmax) + e(tmin)) / 2
    ea = es * np.clip(rh, 0, 100) / 100
    delta = 4098 * e(tmean) / (tmean + 237.3) ** 2
    p = 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26
    gamma = 0.000665 * p
    phi = np.radians(lat)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(dec), -1, 1))
    ra = 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))
    rso = (0.75 + 2e-5 * z) * ra
    rnl = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * np.sqrt(ea)) * \
        (1.35 * np.clip(rs / rso, 0.3, 1) - 0.35)
    rn = 0.77 * rs - rnl
    return ((0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))).clip(lower=0)


def racha_max(seco):
    """Para una serie booleana diaria: largo de la racha en curso en cada dia."""
    g = (~seco).cumsum()
    return seco.groupby(g).cumsum()


# ------------------------------------------------------------------ estatico
def estatico():
    z = pd.DataFrame(ZONAS).rename(columns={"id": "punto", "lat": "latitud", "lon": "longitud"})
    z = z[["punto", "nombre", "departamento", "tipo", "cultivos_zona", "latitud", "longitud"]]
    topo = leer("topografia_por_punto.csv")
    if len(topo):
        z = z.merge(topo[["punto", "elevacion_m", "pendiente_pct", "orientacion_grados"]], on="punto", how="left")
    s = leer("suelo_por_punto.csv")
    if len(s):
        sup = {}
        for prop, div in (("clay", 10), ("sand", 10), ("silt", 10), ("soc", 10), ("phh2o", 10), ("nitrogen", 100), ("cec", 10)):
            cols = [c for c in s.columns if c.startswith(prop + "_") and c.split("_", 1)[1] in ("0_5cm", "5_15cm", "15_30cm")]
            if cols:  # promedio 0-30 cm ponderado por espesor (5, 10, 15 cm); unidades SoilGrids -> unidades comunes
                sup[f"suelo_{prop}_0_30"] = (s[cols[0]] * 5 + s[cols[1]] * 10 + s[cols[2]] * 15) / 30 / div
        z = z.merge(pd.DataFrame({"punto": s["punto"], **sup}).round(3), on="punto", how="left")
    g = leer("gaez_aptitud_por_punto.csv")
    if len(g):
        g = g[g["nivel_insumos"] == "Low"]  # pequeno productor: insumos bajos, secano
        piv = g.pivot_table(index="punto", columns="cultivo", values=["indice_aptitud", "rendimiento_alcanzable_kg_ha"], aggfunc="first")
        piv.columns = [f"gaez_{'aptitud' if a == 'indice_aptitud' else 'rend_kg_ha'}_{c.lower().replace(' ', '_')}" for a, c in piv.columns]
        z = z.merge(piv.reset_index(), on="punto", how="left")
    gedi = leer("gedi_biomasa_por_punto.csv")
    if len(gedi):
        z = z.merge(gedi[["punto", "biomasa_mg_ha"]].rename(columns={"biomasa_mg_ha": "gedi_biomasa_mg_ha"}), on="punto", how="left")
    me = leer("meteomatics_estaticos.csv")
    if len(me) and "soil_type:idx" in me:
        z = z.merge(me[["punto", "soil_type:idx"]].rename(columns={"soil_type:idx": "meteomatics_tipo_suelo"}), on="punto", how="left")
    return z


# ------------------------------------------------------------------ diario
def diario(est):
    p = leer("power_diario_largo.csv")
    d = p.rename(columns={"T2M": "tmed_c", "T2M_MAX": "tmax_c", "T2M_MIN": "tmin_c", "PRECTOTCORR": "lluvia_power_mm",
                          "RH2M": "humedad_rel_pct", "WS2M": "viento_2m_ms", "ALLSKY_SFC_SW_DWN": "radiacion_mj_m2"})
    d = d[d["fecha"] >= INICIO].drop(columns=["latitud", "longitud"])
    im = leer("imerg_series.csv")
    if len(im):
        d = d.merge(im[["punto", "fecha", "precipitation"]].rename(columns={"precipitation": "lluvia_imerg_mm"}), on=["punto", "fecha"], how="left")
    else:
        d["lluvia_imerg_mm"] = np.nan
    d["lluvia_mm"] = d["lluvia_imerg_mm"].fillna(d["lluvia_power_mm"])
    d["fuente_lluvia"] = np.where(d["lluvia_imerg_mm"].notna(), "imerg", "power")
    pos = est.set_index("punto")
    lat, z = d["punto"].map(pos["latitud"]), d["punto"].map(pos["elevacion_m"]).fillna(500)
    doy = pd.to_datetime(d["fecha"]).dt.day_of_year
    d["et0_mm"] = et0_fao56(d.tmax_c, d.tmin_c, d.humedad_rel_pct, d.viento_2m_ms, d.radiacion_mj_m2, lat, doy, z)
    e5 = leer("era5_diario.csv")
    if len(e5):
        d = d.merge(e5[["punto", "fecha", "et0_mm"]].rename(columns={"et0_mm": "et0_era5"}), on=["punto", "fecha"], how="left")
        d["et0_mm"] = d["et0_mm"].fillna(d.pop("et0_era5"))
    d["et0_mm"] = d["et0_mm"].round(2)
    d["balance_mm"] = (d["lluvia_mm"] - d["et0_mm"]).round(2)
    gl = leer("gldas_diario.csv")
    if len(gl):
        d = d.merge(gl[["punto", "fecha", "suelo_0_10cm", "suelo_10_40cm", "suelo_40_100cm", "evap_mm_dia", "escorrentia_mm_dia"]]
                    .rename(columns={"suelo_0_10cm": "gldas_suelo_0_10_kgm2", "suelo_10_40cm": "gldas_suelo_10_40_kgm2",
                                     "suelo_40_100cm": "gldas_suelo_40_100_kgm2", "evap_mm_dia": "gldas_evap_real_mm",
                                     "escorrentia_mm_dia": "gldas_escorrentia_mm"}), on=["punto", "fecha"], how="left")
    sm = leer("smap_series.csv")
    if len(sm):
        sm["smap_humedad_m3m3"] = sm[["soil_moisture_am", "soil_moisture_pm"]].mean(axis=1)
        d = d.merge(sm[["punto", "fecha", "smap_humedad_m3m3"]], on=["punto", "fecha"], how="left")
    mt = leer("meteomatics_diario_largo.csv")
    if len(mt):
        mt = mt.rename(columns={"dia_local": "fecha", "soil_moisture_index_-5cm:idx": "mm_humedad_idx_5cm",
                                "soil_moisture_index_-50cm:idx": "mm_humedad_idx_50cm"})
        d = d.merge(mt[["punto", "fecha", "mm_humedad_idx_5cm", "mm_humedad_idx_50cm"]].drop_duplicates(["punto", "fecha"]),
                    on=["punto", "fecha"], how="left")
    # NDVI fusionado
    obs = []
    s2 = leer("sentinel2_indices.csv")
    if len(s2):
        obs.append(s2.assign(fuente_ndvi="sentinel2", prio=1)[["punto", "fecha", "ndvi", "fuente_ndvi", "prio"]])
        d = d.merge(s2.groupby(["punto", "fecha"], as_index=False)["ndmi"].mean().rename(columns={"ndmi": "s2_ndmi"}), on=["punto", "fecha"], how="left")
    ls = leer("landsat_ndvi.csv")
    if len(ls):
        obs.append(ls.assign(fuente_ndvi="landsat", prio=2)[["punto", "fecha", "ndvi", "fuente_ndvi", "prio"]])
    mo = leer("modis_ndvi.csv")
    if len(mo):
        mo = mo[mo["calidad_pixel"] <= 1]
        obs.append(mo.assign(fuente_ndvi="modis", prio=3)[["punto", "fecha", "ndvi", "fuente_ndvi", "prio"]])
    if obs:
        o = pd.concat(obs).dropna(subset=["ndvi"])
        o = o[o["ndvi"].between(-1, 1)]  # fuera de rango = pixel saturado o mal corregido; se descarta
        o = o.sort_values("prio").drop_duplicates(["punto", "fecha"]).drop(columns="prio")
        d = d.merge(o.rename(columns={"ndvi": "ndvi_obs"}), on=["punto", "fecha"], how="left")
        d = d.sort_values(["punto", "fecha"])
        d["ndvi"] = d.groupby("punto")["ndvi_obs"].transform(
            lambda s: s.interpolate(limit=32, limit_area="inside")).round(4)
    ec = leer("ecostress_lst.csv")
    if len(ec):
        d = d.merge(ec.groupby(["punto", "fecha"], as_index=False)["lst_c"].mean().rename(columns={"lst_c": "ecostress_lst_c"}),
                    on=["punto", "fecha"], how="left")
    for c, (b, t) in GDD.items():
        d[f"gdd_{c}"] = ((d.tmax_c.clip(upper=t) + d.tmin_c.clip(upper=t)) / 2 - b).clip(lower=0).round(2)
    d = d.sort_values(["punto", "fecha"]).reset_index(drop=True)
    d["racha_seca_dias"] = d.groupby("punto", group_keys=False)["lluvia_mm"].apply(lambda s: racha_max(s < LLUVIA_SECA))
    return d


# ------------------------------------------------------------------ mensual
def tormentas(est):
    h = leer("huracanes_caribe_honduras.csv")
    if not len(h):
        return pd.DataFrame(columns=["punto", "anio", "mes"])
    h["t"] = pd.to_datetime(h["fecha_hora_utc"])
    filas = []
    for _, p in est.iterrows():
        la1, lo1 = np.radians(p.latitud), np.radians(p.longitud)
        la2, lo2 = np.radians(h.latitud), np.radians(h.longitud)
        dist = 2 * 6371 * np.arcsin(np.sqrt(np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2))
        c = h[dist <= 300].assign(punto=p.punto, anio=lambda x: x.t.dt.year, mes=lambda x: x.t.dt.month)
        if len(c):
            v = pd.to_numeric(c["viento_usa_kt"], errors="coerce").fillna(pd.to_numeric(c["viento_wmo_kt"], errors="coerce"))
            filas.append(c.assign(v=v).groupby(["punto", "anio", "mes"]).agg(tormentas_300km=("sid", "nunique"), viento_max_kt=("v", "max")).reset_index())
    return pd.concat(filas) if filas else pd.DataFrame(columns=["punto", "anio", "mes"])


def mensual(d, est):
    d = d.copy()
    f = pd.to_datetime(d["fecha"])
    d["anio"], d["mes"] = f.dt.year, f.dt.month
    agg = {"lluvia_mm": "sum", "et0_mm": "sum", "balance_mm": "sum", "racha_seca_dias": "max",
           "tmax_c": "mean", "tmin_c": "mean", **{f"gdd_{c}": "sum" for c in GDD}}
    for c in ("gldas_suelo_0_10_kgm2", "gldas_suelo_10_40_kgm2", "gldas_suelo_40_100_kgm2", "smap_humedad_m3m3",
              "mm_humedad_idx_50cm", "ndvi", "s2_ndmi", "ecostress_lst_c", "gldas_escorrentia_mm"):
        if c in d:
            agg[c] = "sum" if c == "gldas_escorrentia_mm" else "mean"
    g = d.groupby(["punto", "anio", "mes"])
    m = g.agg(agg).rename(columns={"racha_seca_dias": "max_dias_secos_consec"})
    m["dias_lluvia_intensa"] = g["lluvia_mm"].apply(lambda s: int((s > LLUVIA_INTENSA).sum()))
    m["dias_estres_termico"] = g["tmax_c"].apply(lambda s: int((s > T_ESTRES).sum()))
    if "ndvi" in d:
        m["dias_suelo_descubierto"] = g["ndvi"].apply(lambda s: int((s < NDVI_DESNUDO).sum()))
    m["dias"] = g.size()
    m = m.reset_index()
    # anomalias (z) contra la climatologia del mismo mes, solo anios completos del periodo base
    base = m[(m.anio >= BASE_CLIMA[0]) & (m.anio <= BASE_CLIMA[1]) & (m.dias >= 28)]
    vars_anom = [c for c in ("lluvia_mm", "balance_mm", "tmax_c", "gldas_suelo_10_40_kgm2", "smap_humedad_m3m3", "ndvi") if c in m]
    clima = base.groupby(["punto", "mes"])[vars_anom].agg(["mean", "std"])
    clima.columns = [f"{v}_{s}" for v, s in clima.columns]
    clima = clima.reset_index()
    m = m.merge(clima, on=["punto", "mes"], how="left")
    for v in vars_anom:
        m[f"anom_{v}"] = ((m[v] - m[f"{v}_mean"]) / m[f"{v}_std"].replace(0, np.nan)).round(3)
    m = m.drop(columns=[c for c in m.columns if c.endswith(("_mean", "_std"))])
    # riesgo de erosion (indice relativo 0-1): pendiente x lluvia intensa x suelo descubierto
    pend = m["punto"].map(est.set_index("punto")["pendiente_pct"]).fillna(0)
    lluvia_int = g["lluvia_mm"].apply(lambda s: s[s > LLUVIA_INTENSA].sum()).values
    desc = (m["dias_suelo_descubierto"] / m["dias"]).fillna(0) if "dias_suelo_descubierto" in m else 0
    bruto = (pend / 100) * lluvia_int * (0.5 + desc)
    m["riesgo_erosion"] = (bruto / bruto.quantile(0.99)).clip(0, 1).round(3)
    # ENSO (ONI del trimestre centrado en el mes) y tormentas tropicales cerca del punto
    oni = leer("oni.csv")
    if len(oni):
        centro = {t: i + 1 for i, t in enumerate(["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"])}
        oni["mes"] = oni["trimestre"].map(centro)
        m = m.merge(oni[["anio", "mes", "oni"]], on=["anio", "mes"], how="left")
    t = tormentas(est)
    if len(t):
        m = m.merge(t, on=["punto", "anio", "mes"], how="left")
        m["tormentas_300km"] = m["tormentas_300km"].fillna(0).astype(int)
    gr = leer("grace_series.csv")
    if len(gr):  # GRACE: apoyo grueso (~300 km); se usa como contexto, no como senal por parcela
        f = pd.to_datetime(gr["fecha"])
        gr = gr.assign(anio=f.dt.year, mes=f.dt.month).groupby(["punto", "anio", "mes"], as_index=False)["lwe_thickness"].mean()
        m = m.merge(gr.rename(columns={"lwe_thickness": "grace_agua_cm"}), on=["punto", "anio", "mes"], how="left")
    return m.round(3), clima.round(3)


def diccionario(tablas):
    txt = ["# Diccionario del dataset (modelo/)", "", "Generado por scripts/construir_dataset.py. Ver el encabezado del script para las reglas de fusion.", ""]
    for nombre, df in tablas.items():
        txt += [f"## {nombre}", "", f"{len(df):,} filas, {df.shape[1]} columnas.", "", "| columna | no vacios | ejemplo |", "|---|---|---|"]
        for c in df.columns:
            nn = df[c].notna().mean()
            ej = df[c].dropna().iloc[0] if df[c].notna().any() else ""
            txt.append(f"| {c} | {nn:.0%} | {ej} |")
        txt.append("")
    (OUT / "diccionario.md").write_text("\n".join(txt), encoding="utf-8")


def main():
    OUT.mkdir(exist_ok=True)
    print("estatico...")
    est = estatico()
    est.to_csv(OUT / "estatico.csv", index=False)
    print("diario...")
    d = diario(est)
    d.to_csv(OUT / "diario.csv.gz", index=False, compression="gzip")
    print("mensual...")
    m, clima = mensual(d, est)
    m.to_csv(OUT / "mensual.csv", index=False)
    clima.to_csv(OUT / "climatologia.csv", index=False)
    diccionario({"estatico.csv": est, "diario.csv.gz": d, "mensual.csv": m, "climatologia.csv": clima})
    print(f"listo: estatico {len(est)} puntos | diario {len(d):,} filas | mensual {len(m):,} filas -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
