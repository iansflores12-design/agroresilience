"""Clasifica las tablas procesadas segun la lista de variables del equipo (clima, suelo y agua, vegetacion)
y las recorta a los ultimos 20 anios. Sin IA, sin red. No calcula indicadores: solo filtra y etiqueta.

Entrada: processed/ (salida de 10_procesar.py) y salida/ (salida de procesar_nuevo.py).
Si una tabla existe en ambas, se usa la de salida/ solo si processed/ no la tiene.
Salida: clasificado/<categoria>/<tabla>.csv y clasificado/CATALOGO.csv.

Ventanas (columna `ventana`, por anio de la fecha):
  2006-2015  -> parte de la linea base de 20 anios
  2016-2025  -> parte de la linea base de 20 anios y toda la de 10 anios
  2026       -> anio en curso, el que se compara contra la linea base
Las filas anteriores a 2006 se descartan. Las tablas sin fecha (suelo, terreno, aptitud) se copian enteras.

Correr (desde data/): .venv/bin/python -I scripts/19_clasificar.py
"""
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
PRO, SAL, DEST = RAIZ / "processed", RAIZ / "salida", RAIZ / "clasificado"
DESDE, ACTUAL = 2006, 2026

INDICADORES = {
    1: "Balance hidrico", 2: "Dias secos consecutivos", 3: "Dias de lluvia intensa", 4: "Grados-dia",
    5: "Dias de estres termico", 6: "Anomalia de humedad del suelo", 7: "Anomalia de NDVI y suelo descubierto",
    8: "Riesgo de erosion", 9: "Aptitud del cultivo (GAEZ)",
}

# tabla, categoria, fuente, variables clave, indicadores, resolucion, frecuencia, nota
TABLAS = [
    ("power_diario_largo.csv", "clima", "NASA POWER (AG)",
     "T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN", [1, 4, 5], "0.5 grados, por punto",
     "diaria", "Las seis variables de ETo Penman-Monteith"),
    ("imerg_series.csv", "clima", "GPM IMERG Final V07", "precipitation", [1, 2, 3, 8], "0.1 grados", "diaria",
     "Final llega hasta 2025-09-30"),
    ("imerg_late_series.csv", "clima", "GPM IMERG Late V07", "precipitation", [1, 2, 3, 8], "0.1 grados", "diaria",
     "Provisional; cubre desde 2025-10-01, donde Final aun no llega"),
    ("era5_series.csv", "clima", "ERA5 (via Open-Meteo)",
     "temperature_2m_*, precipitation_sum, soil_moisture_* (equivale a swvl1-4)", [6], "0.25 grados", "diaria",
     "Linea base historica. No es la descarga oficial del CDS"),
    ("meteomatics_diario_largo.csv", "clima", "Meteomatics (comercial)", "23 parametros", [], "por punto", "diaria",
     "Fuera de la lista del equipo; terminos de uso sin revisar"),
    ("smap_series.csv", "suelo_agua", "SMAP SPL3SMP_E", "soil_moisture_am, soil_moisture_pm", [6], "9 km",
     "diaria", "Humedad superficial, unos 5 cm"),
    ("smap_l4_series.csv", "suelo_agua", "SMAP SPL4SMGP", "sm_rootzone, sm_surface", [6], "9 km", "3 horas",
     "Zona de raices; la mas util para el indicador 6"),
    ("gldas_series.csv", "suelo_agua", "GLDAS Noah 2.1",
     "SoilMoi0_10cm, SoilMoi10_40cm, SoilMoi40_100cm, Evap_tavg, Qs_acc", [1, 6, 8], "0.25 grados", "mensual",
     "Qs_acc sirve para erosion"),
    ("gaez_por_punto.csv", "suelo_agua", "FAO GAEZ v4 (suelo y LGP)",
     "SQ0-SQ7 (limitaciones: nutrientes, enraizamiento, drenaje...), siXr_sst (suelo y terreno), lgd (LGP), aez",
     [9], "5 arcmin (~9 km); SQ y sst 30 arcsec", "estatica",
     "LGP de referencia 1981-2010 y 2000-2010; anual solo hasta 2010. FAO no publica SQ1 alto ni SQ2 bajo",
     ("capa", r"^(SQ|lgd|aez|si[HL]r_sst)", "gaez_suelo.csv")),
    ("srtm_por_punto.csv", "suelo_agua", "SRTMGL1", "elevacion_m, pendiente_grados, orientacion_grados", [8],
     "30 m", "estatica", ""),
    ("suelo_por_punto.csv", "suelo_agua", "SoilGrids v2.0", "arcilla, arena, pH, carbono por profundidad", [9],
     "250 m", "estatica", "Fuera de la lista; complementa GAEZ"),
    ("mod13q1_puntos.csv", "vegetacion", "MODIS MOD13Q1 v061", "NDVI, EVI, pixel_reliability", [7, 8], "250 m",
     "16 dias", ""),
    ("gaez_por_punto.csv", "vegetacion", "FAO GAEZ v4 (cultivos)",
     "sx (indice 0-10000), si (clase), yx (rendimiento alcanzable kg/ha) de maiz, frijol, sorgo, cafe, yuca; "
     "secano, insumos alto (H) y bajo (L)", [9], "5 arcmin (~9 km)", "estatica", "Clima de referencia 1981-2010",
     ("capa", r"^(sx|si|yx)[HL]r_(mze|phb|srg|cof|csv)$", "gaez_cultivos.csv")),
    ("hls_s30_puntos.csv", "vegetacion", "HLS S30 v2.0 (Sentinel-2)", "B04, B08, B8A, B11, Fmask (NDVI, NDMI)",
     [7, 8], "30 m", "2-3 dias", "Sentinel-2 armonizado por NASA; no es el producto de 10 m de Copernicus"),
    ("hls_l30_puntos.csv", "vegetacion", "HLS L30 v2.0 (Landsat 8/9)", "B04, B05, B06, Fmask (NDVI, NDMI)",
     [7], "30 m", "8-16 dias", "Uso anterior de la parcela; HLS empieza en 2013"),
    ("oni.csv", "contexto", "NOAA ONI", "oni", [], "", "trimestral", "Fuera de la lista; fase de El Nino"),
    ("huracanes_caribe_honduras.csv", "contexto", "NOAA IBTrACS", "posiciones de tormentas", [], "", "6 horas",
     "Fuera de la lista"),
    ("grace_series.csv", "contexto", "GRACE/GRACE-FO", "lwe_thickness", [], "0.5 grados", "mensual",
     "Fuera de la lista; agua total almacenada"),
]

# Lo de la lista que no tiene tabla por punto (para que el catalogo muestre el hueco)
SIN_TABLA = [
    ("vegetacion", "ECOSTRESS ECO_L3T_JET", "LST, ET", [1], "70 m", "irregular",
     "Fase posterior. Bajado en raw/ecostress (2025-12 a 2026-10), sin procesar"),
    ("vegetacion", "Sentinel-2 L2A (Copernicus, 10 m)", "B04, B08, B11", [7], "10 m", "5 dias",
     "Falta: requiere cuenta Copernicus. Se usa HLS S30 en su lugar"),
    ("vegetacion", "Landsat 5/7 (antes de 2013)", "NDVI historico", [7], "30 m", "16 dias",
     "Falta: no esta en HLS; requiere cuenta USGS. MOD13Q1 cubre 2006-2012"),
    ("clima", "ERA5 oficial (CDS Copernicus)", "t2m, tp, swvl1-swvl4", [6], "0.25 grados", "horaria",
     "Falta la descarga oficial: requiere cuenta y llave CDS. Se usa ERA5 via Open-Meteo"),
]


def columna_fecha(df):
    for c in ("fecha", "dia_local", "fecha_hora_utc"):
        if c in df.columns:
            return c, pd.to_datetime(df[c].str[:10], errors="coerce").dt.year
    if "anio" in df.columns:
        return "anio", pd.to_numeric(df["anio"], errors="coerce")
    return None, None


def ventana(anio):
    if anio >= ACTUAL:
        return str(ACTUAL)
    return "2016-2025" if anio >= 2016 else "2006-2015"


def main():
    filas = []
    for tabla, cat, fuente, var, ind, res, frec, nota, *filtro in TABLAS:
        ruta = PRO / tabla if (PRO / tabla).exists() else SAL / tabla
        base = dict(categoria=cat, fuente=fuente, variables=var,
                    indicadores="; ".join(f"{i}. {INDICADORES[i]}" for i in ind), resolucion=res,
                    frecuencia=frec, nota=nota)
        if not ruta.exists():
            filas.append({**base, "tabla": "", "estado": "sin procesar"})
            print(f"FALTA {tabla}")
            continue
        df = pd.read_csv(ruta, dtype=str, keep_default_na=False)
        if filtro:
            columna, patron, tabla = filtro[0]
            df = df[df[columna].str.contains(patron, regex=True)]
        col, anio = columna_fecha(df)
        n = {}
        if col:
            df = df[anio >= DESDE].copy()
            df.insert(0, "ventana", anio[anio >= DESDE].astype(int).map(ventana))
            n = df["ventana"].value_counts().to_dict()
            fechas = df[col].str[:10]
            desde, hasta = (fechas.min(), fechas.max()) if len(df) else ("", "")
        else:
            desde = hasta = ""
        destino = DEST / cat / tabla
        destino.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(destino, index=False)
        filas.append({**base, "tabla": str(destino.relative_to(DEST)), "estado": "listo",
                      "origen": str(ruta.relative_to(RAIZ)), "desde": desde, "hasta": hasta, "filas": len(df),
                      "filas_2006_2015": n.get("2006-2015", ""), "filas_2016_2025": n.get("2016-2025", ""),
                      "filas_2026": n.get("2026", "")})
        print(f"{cat:11s} {tabla:34s} {len(df):>8} filas  {desde} a {hasta}")
    for cat, fuente, var, ind, res, frec, nota in SIN_TABLA:
        filas.append(dict(categoria=cat, fuente=fuente, variables=var,
                          indicadores="; ".join(f"{i}. {INDICADORES[i]}" for i in ind), resolucion=res,
                          frecuencia=frec, nota=nota, tabla="",
                          estado="raw sin procesar" if "Bajado" in nota else "falta"))
    cols = ["categoria", "fuente", "estado", "tabla", "origen", "variables", "indicadores", "resolucion",
            "frecuencia", "desde", "hasta", "filas", "filas_2006_2015", "filas_2016_2025", "filas_2026", "nota"]
    orden = {"clima": 0, "suelo_agua": 1, "vegetacion": 2, "contexto": 3}
    cat_df = pd.DataFrame(filas).reindex(columns=cols).sort_values("categoria", key=lambda s: s.map(orden),
                                                                     kind="stable")
    cat_df.to_csv(DEST / "CATALOGO.csv", index=False)
    print(f"\nCatalogo: {DEST / 'CATALOGO.csv'} ({len(cat_df)} filas)")


if __name__ == "__main__":
    main()
