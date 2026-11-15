"""Ingesta, limpieza, panel cronologico, linea base, features, ventanas, poda de datos y generador sintetico.

Reglas duras:
  * -999 (y demas centinelas / invalidos) -> NaN, nunca 0.
  * Orden cronologico estricto por punto, sobre una malla diaria regular.
  * Todo lo que se "aprende" de los datos (linea base, escalado, umbrales) se ajusta solo con el
    periodo de entrenamiento: no hay fuga temporal.
"""
from __future__ import annotations

import gzip
import json
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from . import config as C

LAT_HONDURAS = 14.8


# =========================================================================== lectura
def _leer_power_json(obj: dict, nombre: str) -> pd.DataFrame:
    """JSON de punto de NASA POWER (properties.parameter) -> tabla diaria."""
    par = obj["properties"]["parameter"]
    df = pd.DataFrame(par)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.rename_axis("fecha").reset_index()
    lon, lat, *z = obj.get("geometry", {}).get("coordinates", [np.nan, np.nan, np.nan])
    df["lat"], df["lon"], df["elevacion"] = lat, lon, (z[0] if z else np.nan)
    df["punto"] = nombre
    return df


def leer_tabla(ruta) -> pd.DataFrame:
    """Lee CSV / TSV / Parquet / JSON (con o sin .gz). Acepta el CSV con cabecera de NASA POWER."""
    ruta = Path(ruta)
    if not ruta.exists():
        raise FileNotFoundError(f"No existe el archivo de datos: {ruta}")
    suf = [s.lower() for s in ruta.suffixes]
    ext = suf[-2] if suf and suf[-1] == ".gz" and len(suf) > 1 else (suf[-1] if suf else "")
    if ext in (".parquet", ".pq"):
        return pd.read_parquet(ruta)
    if ext in (".json", ".jsonl", ".ndjson"):
        abrir = gzip.open if suf[-1] == ".gz" else open
        with abrir(ruta, "rt", encoding="utf-8") as f:
            texto = f.read()
        if ext != ".json":
            return pd.DataFrame([json.loads(l) for l in texto.splitlines() if l.strip()])
        obj = json.loads(texto)
        if isinstance(obj, dict) and "properties" in obj and "parameter" in obj.get("properties", {}):
            return _leer_power_json(obj, ruta.name.split(".")[0])
        if isinstance(obj, dict):
            obj = obj.get("datos", obj.get("data", obj))
        return pd.DataFrame(obj)
    sep = "\t" if ext in (".tsv", ".tab") else ","
    saltar = 0
    abrir = gzip.open if suf and suf[-1] == ".gz" else open
    with abrir(ruta, "rt", encoding="utf-8", errors="replace") as f:  # cabecera "-BEGIN HEADER- ... -END HEADER-"
        for i, linea in enumerate(f):
            if i == 0 and "-BEGIN HEADER-" not in linea:
                break
            if "-END HEADER-" in linea:
                saltar = i + 1
                break
            if i > 200:
                break
    return pd.read_csv(ruta, sep=sep, skiprows=saltar, low_memory=False)


def leer_varias(rutas) -> pd.DataFrame:
    rutas = [rutas] if isinstance(rutas, (str, Path)) else list(rutas)
    return pd.concat([leer_carpeta(r) if Path(r).is_dir() else leer_tabla(r) for r in rutas], ignore_index=True)


# =========================================================================== carpeta processed/ de AgroResilience
ONI_CENTRO = {t: i + 1 for i, t in enumerate(["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"])}
ONI_RETRASO_MESES = 2      # el ONI de un trimestre se publica ~2 meses despues de su mes central
NDVI_VIGENCIA_DIAS = 32    # una observacion satelital de NDVI se arrastra hacia adelante hasta 32 dias


def leer_carpeta(carpeta) -> pd.DataFrame:
    """Lee la carpeta processed/ del proyecto (series largas `punto, fecha, ...`) y la une en el esquema Kharis.

    Base obligatoria : power_diario_largo.csv (o power/<punto>.csv) con los parametros de NASA POWER.
    Opcionales       : topografia_por_punto.csv (elevacion), imerg_series.csv (precipitation), smap_series.csv
                       (soil_moisture), era5_diario.csv (swvl1), sentinel2_indices/landsat_ndvi/modis_ndvi (NDVI), oni.csv.
    Todo lo opcional entra de forma causal: nada de un dia usa informacion de dias posteriores.
    """
    c = Path(carpeta)

    def leer(nombre, **kw):
        fs = [c / nombre, *sorted(c.glob(nombre.replace(".csv", "_n[0-9].csv")))]
        fs = [f for f in fs if f.exists()]
        return pd.concat([pd.read_csv(f, low_memory=False, **kw) for f in fs], ignore_index=True) if fs else pd.DataFrame()

    base = leer("power_diario_largo.csv")
    if base.empty and (c / "power").is_dir():
        base = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted((c / "power").glob("*.csv"))], ignore_index=True)
    if base.empty:
        raise FileNotFoundError(f"{c} no tiene power_diario_largo.csv ni power/<punto>.csv (NASA POWER es la base obligatoria).")
    base = normalizar_columnas(base)
    usadas = ["NASA POWER"]

    def unir(df, columnas: dict, nombre: str):
        nonlocal base
        if df.empty or not set(columnas) <= set(df.columns):
            return
        df = df.assign(fecha=pd.to_datetime(df["fecha"], errors="coerce").dt.normalize())
        df = df.dropna(subset=["fecha"]).drop_duplicates(["punto", "fecha"], keep="last")
        base = base.merge(df[["punto", "fecha", *columnas]].rename(columns=columnas), on=["punto", "fecha"], how="left")
        usadas.append(nombre)

    topo = leer("topografia_por_punto.csv")
    if topo.empty and (c / "modelo" / "estatico.csv").exists():
        topo = pd.read_csv(c / "modelo" / "estatico.csv")
    if not topo.empty and "elevacion_m" in topo.columns:
        base = base.drop(columns=["elevacion"], errors="ignore").merge(
            topo[["punto", "elevacion_m"]].rename(columns={"elevacion_m": "elevacion"}).drop_duplicates("punto"), on="punto", how="left")
        usadas.append("topografia")
    unir(leer("imerg_series.csv"), {"precipitation": "precipitation"}, "GPM IMERG")
    sm = leer("smap_series.csv")
    if not sm.empty and {"soil_moisture_am", "soil_moisture_pm"} <= set(sm.columns):
        sm["soil_moisture"] = sm[["soil_moisture_am", "soil_moisture_pm"]].mean(axis=1)
        unir(sm, {"soil_moisture": "soil_moisture"}, "SMAP")
    unir(leer("era5_diario.csv"), {"swvl1": "swvl1"}, "ERA5")
    # NDVI: Sentinel-2 -> Landsat -> MODIS (solo calidad 0-1), y se arrastra hacia adelante (causal)
    partes = []
    for prio, (nombre, filtro) in enumerate((("sentinel2_indices.csv", None), ("landsat_ndvi.csv", None), ("modis_ndvi.csv", "calidad_pixel"))):
        d = leer(nombre)
        if d.empty or "ndvi" not in d.columns:
            continue
        if filtro and filtro in d.columns:
            d = d[d[filtro] <= 1]
        partes.append(d[["punto", "fecha", "ndvi"]].assign(prio=prio))
    if partes:
        nd = pd.concat(partes, ignore_index=True).dropna(subset=["ndvi"])
        nd["fecha"] = pd.to_datetime(nd["fecha"], errors="coerce").dt.normalize()
        nd = nd.sort_values(["punto", "fecha", "prio"]).drop_duplicates(["punto", "fecha"], keep="first")
        base = base.merge(nd[["punto", "fecha", "ndvi"]].rename(columns={"ndvi": "NDVI"}), on=["punto", "fecha"], how="left")
        base = base.sort_values(["punto", "fecha"], kind="mergesort")
        base["NDVI"] = base.groupby("punto")["NDVI"].ffill(limit=NDVI_VIGENCIA_DIAS)
        usadas.append("NDVI (Sentinel-2/Landsat/MODIS)")
    oni = leer("oni.csv")
    if not oni.empty and {"anio", "trimestre", "oni"} <= set(oni.columns):
        oni = oni[oni["trimestre"].isin(list(ONI_CENTRO))]
        centro = pd.to_datetime(dict(year=oni["anio"].astype(int), month=oni["trimestre"].map(ONI_CENTRO).astype(int), day=1))
        per = pd.PeriodIndex(centro, freq="M") + ONI_RETRASO_MESES
        s = pd.Series(pd.to_numeric(oni["oni"], errors="coerce").to_numpy(), index=per).dropna()
        s = s[~s.index.duplicated(keep="last")].sort_index()
        meses = pd.period_range(s.index.min(), max(s.index.max(), base["fecha"].max().to_period("M")), freq="M")
        s = s.reindex(meses).ffill()
        base["oni"] = base["fecha"].dt.to_period("M").map(s).astype("float64")
        usadas.append("ONI")
    print(f"[datos] carpeta {c}: {', '.join(usadas)}")
    return base.reset_index(drop=True)


# =========================================================================== limpieza
def normalizar_columnas(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: str(c).strip() for c in df.columns})
    ren = {a: c for a, c in C.ALIAS.items() if a in df.columns and c not in df.columns}
    df = df.rename(columns=ren)
    if "fecha" not in df.columns:
        if {"YEAR", "DOY"} <= set(df.columns):
            df["fecha"] = pd.to_datetime(df["YEAR"].astype(int).astype(str), format="%Y") + pd.to_timedelta(df["DOY"].astype(int) - 1, unit="D")
        elif {"YEAR", "MO", "DY"} <= set(df.columns):
            df["fecha"] = pd.to_datetime(dict(year=df["YEAR"], month=df["MO"], day=df["DY"]), errors="coerce")
        else:
            raise ValueError("Falta la columna 'fecha' (o YEAR+DOY / YEAR+MO+DY).")
    f = df["fecha"]
    if pd.api.types.is_numeric_dtype(f):  # 19960101
        df["fecha"] = pd.to_datetime(f.astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
    else:
        df["fecha"] = pd.to_datetime(f, errors="coerce")
    if getattr(df["fecha"].dt, "tz", None) is not None:
        df["fecha"] = df["fecha"].dt.tz_localize(None)
    df["fecha"] = df["fecha"].dt.normalize()
    for c in ("lat", "lon", "elevacion"):
        if c not in df.columns:
            df[c] = np.nan
    if "punto" not in df.columns:  # un punto = (lat, lon, elevacion)
        df["punto"] = ("p_" + df["lat"].round(3).astype(str) + "_" + df["lon"].round(3).astype(str)).where(df["lat"].notna(), "punto_unico")
    df["punto"] = df["punto"].astype(str)
    return df


def limpiar(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Centinelas e invalidos -> NaN, sin duplicados, orden cronologico estricto por punto."""
    df = normalizar_columnas(df)
    rep = {"filas_entrada": int(len(df)), "centinelas_a_nan": 0, "fuera_de_rango_a_nan": 0}
    numericas = [c for c in df.columns if c not in ("punto", "fecha", "estado_enso") and c in set(C.OBJETIVOS + C.EXOGENAS + C.CONTEXTO + ["lat", "lon", "elevacion"])]
    for c in numericas:
        s = pd.to_numeric(df[c], errors="coerce").astype("float64")
        cent = s.isin(C.CENTINELAS) & (c not in ("lat", "lon", "elevacion"))
        rep["centinelas_a_nan"] += int(cent.sum())
        s = s.mask(cent)
        s = s.mask(~np.isfinite(s))
        if c in C.LIMITES:
            lo, hi = C.LIMITES[c]
            mal = (s < lo) | (s > hi)
            rep["fuera_de_rango_a_nan"] += int(mal.sum())
            s = s.mask(mal)
        df[c] = s
    df = df[df["fecha"].notna()]
    antes = len(df)
    df = df.sort_values(["punto", "fecha"], kind="mergesort").drop_duplicates(["punto", "fecha"], keep="last")
    rep["duplicados_quitados"] = int(antes - len(df))
    rep["filas_salida"] = int(len(df))
    rep["puntos"] = int(df["punto"].nunique())
    rep["desde"], rep["hasta"] = str(df["fecha"].min().date()), str(df["fecha"].max().date())
    return df.reset_index(drop=True), rep


# =========================================================================== panel
@dataclass
class Panel:
    """Serie diaria regular por punto. valores[P, T, V] en unidades fisicas, NaN = sin dato."""
    puntos: list
    fechas: pd.DatetimeIndex
    variables: list
    valores: np.ndarray
    estatico: np.ndarray  # [P, 3] lat, lon, elevacion

    def idx(self, var: str) -> int:
        return self.variables.index(var)

    def var(self, nombre: str) -> np.ndarray:
        return self.valores[:, :, self.idx(nombre)]

    def t(self, fecha) -> int:
        """Indice del dia (recortado a la malla)."""
        return int(np.clip((pd.Timestamp(fecha) - self.fechas[0]).days, 0, len(self.fechas) - 1))

    def a_dataframe(self, t0: int = 0, t1: int | None = None) -> pd.DataFrame:
        t1 = len(self.fechas) if t1 is None else t1
        P, n = len(self.puntos), t1 - t0
        d = {"punto": np.repeat(np.array(self.puntos, dtype=object), n), "fecha": np.tile(self.fechas[t0:t1].values, P)}
        for j, c in enumerate(("lat", "lon", "elevacion")):
            d[c] = np.repeat(self.estatico[:, j], n)
        for j, v in enumerate(self.variables):
            d[v] = self.valores[:, t0:t1, j].reshape(-1)
        return pd.DataFrame(d)


def panel_desde_df(df: pd.DataFrame, variables: list | None = None, inicio=None) -> Panel:
    variables = variables or (C.OBJETIVOS + C.EXOGENAS)
    if inicio is not None:
        df = df[df["fecha"] >= pd.Timestamp(inicio)]
    if df.empty:
        raise ValueError("No hay filas de datos despues de limpiar.")
    puntos = sorted(df["punto"].unique())
    f0, f1 = df["fecha"].min(), df["fecha"].max()
    fechas = pd.date_range(f0, f1, freq="D")
    pi = pd.Categorical(df["punto"], categories=puntos).codes
    ti = (df["fecha"] - f0).dt.days.to_numpy()
    val = np.full((len(puntos), len(fechas), len(variables)), np.nan, dtype=np.float32)
    for j, v in enumerate(variables):
        if v in df.columns:
            val[pi, ti, j] = df[v].to_numpy(dtype=np.float32, na_value=np.nan)
    est = df.groupby("punto")[["lat", "lon", "elevacion"]].median().reindex(puntos).to_numpy(dtype=np.float32)
    if np.isnan(est[:, 0]).any():
        print(f"[datos] aviso: hay puntos sin latitud; se usa {LAT_HONDURAS} para la radiacion extraterrestre")
    return Panel(puntos, fechas, list(variables), val, est)


def resolver_variables(panel: Panel, t_fin_train: int, cfg: C.KharisConfig) -> None:
    """Fija en cfg que objetivos y exogenas existen de verdad en los datos de entrenamiento."""
    cob = lambda v: float(np.isfinite(panel.var(v)[:, : t_fin_train + 1]).mean()) if v in panel.variables else 0.0
    objetivos = []
    for v in C.OBJETIVOS:
        if cob(v) >= 0.01:
            objetivos.append(v)
        elif v in C.SUSTITUTOS and cob(C.SUSTITUTOS[v]) >= 0.01:
            print(f"[datos] aviso: no hay {v}; se usa {C.SUSTITUTOS[v]} como objetivo de viento")
            objetivos.append(C.SUSTITUTOS[v])
        else:
            print(f"[datos] aviso: no hay {v} en los datos; se omite del modelo")
    if len(objetivos) < 2:
        raise ValueError("Los datos no traen las variables objetivo de NASA POWER (T2M_MAX, PRECTOTCORR, ...).")
    cfg.objetivos = objetivos
    cfg.exogenas = [v for v in C.EXOGENAS if v not in objetivos and cob(v) >= 0.01]


# =========================================================================== linea base (climatologia)
def _suavizar_circular(a: np.ndarray, w: int = 31) -> np.ndarray:
    """Media movil circular sobre el eje 1 (dia del anio)."""
    k = w // 2
    ext = np.concatenate([a[:, -k:], a, a[:, :k]], axis=1)
    cs = np.cumsum(np.concatenate([np.zeros_like(ext[:, :1]), ext], axis=1), axis=1)
    return (cs[:, w:] - cs[:, :-w])


@dataclass
class LineaBase:
    """Climatologia diaria y umbrales de extremos por punto, ajustados SOLO con el periodo base."""
    puntos: list
    objetivos: list
    media: np.ndarray   # [P, 366, nT]
    std: np.ndarray     # [P, 366, nT]
    pct: dict           # {"p01","p05","p20","p80","p95","p99"} -> [P, nT]
    hasta: str
    media_esc: np.ndarray | None = None   # [P, 366, nT] climatologia en la escala del modelo: base de la prediccion

    def alinear(self, puntos: list) -> "LineaBase":
        """Reordena a otra lista de puntos; un punto desconocido usa el promedio de los conocidos."""
        if list(puntos) == list(self.puntos):
            return self
        pos = {p: i for i, p in enumerate(self.puntos)}
        ix = [pos.get(p, -1) for p in puntos]
        nuevos = [p for p, i in zip(puntos, ix) if i < 0]
        if nuevos:
            print(f"[datos] aviso: puntos sin linea base propia ({', '.join(nuevos[:5])}...): usan el promedio de los conocidos")
        tomar = lambda a: np.stack([a[i] if i >= 0 else np.nanmean(a, axis=0) for i in ix])
        return LineaBase(list(puntos), self.objetivos, tomar(self.media), tomar(self.std), {k: tomar(v) for k, v in self.pct.items()},
                         self.hasta, tomar(self.media_esc) if self.media_esc is not None else None)

    def repetir(self, m: int) -> "LineaBase":
        r = lambda a: np.repeat(a, m, axis=0)
        return LineaBase([p for p in self.puntos for _ in range(m)], self.objetivos, r(self.media), r(self.std),
                         {k: r(v) for k, v in self.pct.items()}, self.hasta, r(self.media_esc) if self.media_esc is not None else None)

    def a_dict(self) -> dict:
        return {"puntos": self.puntos, "objetivos": self.objetivos, "media": self.media, "std": self.std, "pct": self.pct,
                "hasta": self.hasta, "media_esc": self.media_esc}

    @classmethod
    def desde_dict(cls, d: dict) -> "LineaBase":
        return cls(d["puntos"], d["objetivos"], d["media"], d["std"], d["pct"], d["hasta"], d.get("media_esc"))


def climatologia_escalada(Y: np.ndarray, fechas: pd.DatetimeIndex, t_fin: int) -> np.ndarray:
    """Media por dia del anio (suavizada 31 dias) de los objetivos ya escalados, solo con el periodo base. [P, 366, nT]."""
    y = Y[:, : t_fin + 1].astype(np.float64)
    doy = fechas[: t_fin + 1].dayofyear.to_numpy() - 1
    ok = np.isfinite(y)
    x = np.where(ok, y, 0.0)
    P, _, nT = y.shape
    s1, n = np.zeros((P, 366, nT)), np.zeros((P, 366, nT))
    for d in range(366):
        m = doy == d
        if m.any():
            s1[:, d], n[:, d] = x[:, m].sum(1), ok[:, m].sum(1)
    return (_suavizar_circular(s1) / np.maximum(_suavizar_circular(n), 1.0)).astype(np.float32)


def cuantiles_climatologicos(panel: Panel, objetivos: list, t_fin: int, niveles, ventana: int = 15) -> np.ndarray:
    """Distribucion climatologica de cada punto y dia del anio (+-`ventana` dias), SOLO con el periodo base.

    Devuelve los cuantiles `niveles` como [P, 366, nT, Q] en unidades fisicas. Es la referencia con la que se
    mezcla el pronostico cuando la red ya no aporta (ver train_eval.mezclar)."""
    ix = [panel.idx(v) for v in objetivos]
    val = panel.valores[:, : t_fin + 1][:, :, ix].astype(np.float64)
    doy = panel.fechas[: t_fin + 1].dayofyear.to_numpy() - 1
    niv = np.asarray(niveles, dtype=np.float64)
    P, _, nT = val.shape
    salida = np.full((P, 366, nT, len(niv)), np.nan, dtype=np.float32)
    for d in range(366):
        dist = np.abs(doy - d)
        sel = np.sort(val[:, np.minimum(dist, 366 - dist) <= ventana], axis=1)   # los NaN quedan al final
        n = np.isfinite(sel).sum(axis=1)                                          # [P, nT]
        pos = niv[None, None, :] * np.maximum(n - 1, 0)[:, :, None]               # [P, nT, Q]
        lo, hi = np.floor(pos).astype(int), np.ceil(pos).astype(int)
        s = np.moveaxis(sel, 1, 2)                                                # [P, nT, n]
        a, b = np.take_along_axis(s, lo, axis=2), np.take_along_axis(s, hi, axis=2)
        q = a + (pos - lo) * (b - a)
        salida[:, d] = np.where(n[:, :, None] > 0, q, np.nan)
    return salida


def ajustar_linea_base(panel: Panel, objetivos: list, t_fin: int) -> LineaBase:
    ix = [panel.idx(v) for v in objetivos]
    val = panel.valores[:, : t_fin + 1][:, :, ix].astype(np.float64)   # [P, T, nT]
    doy = panel.fechas[: t_fin + 1].dayofyear.to_numpy() - 1
    P, _, nT = val.shape
    ok = np.isfinite(val)
    x = np.where(ok, val, 0.0)
    s1, s2, n = (np.zeros((P, 366, nT)) for _ in range(3))
    for d in range(366):
        m = doy == d
        if m.any():
            s1[:, d], s2[:, d], n[:, d] = x[:, m].sum(1), (x[:, m] ** 2).sum(1), ok[:, m].sum(1)
    s1, s2, n = _suavizar_circular(s1), _suavizar_circular(s2), np.maximum(_suavizar_circular(n), 1.0)
    media = s1 / n
    std = np.sqrt(np.maximum(s2 / n - media**2, 1e-6))
    std = np.maximum(std, 0.05 * np.nanmean(std, axis=1, keepdims=True) + 1e-3)
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pct = {f"p{q:02d}": np.nanpercentile(val, q, axis=1).astype(np.float32) for q in (1, 5, 20, 80, 95, 99)}
    return LineaBase(list(panel.puntos), list(objetivos), media.astype(np.float32), std.astype(np.float32), pct,
                     str(panel.fechas[t_fin].date()))


# =========================================================================== features
def media_movil(a: np.ndarray, w: int, minimo: int | None = None) -> np.ndarray:
    """Media de los ultimos w dias (incluye el actual) ignorando NaN. a: [N, T]."""
    minimo = max(1, w // 3) if minimo is None else minimo
    ok = np.isfinite(a)
    cs = np.cumsum(np.where(ok, a, 0.0), axis=1, dtype=np.float64)
    cn = np.cumsum(ok, axis=1, dtype=np.float64)
    if a.shape[1] > w:
        cs[:, w:] = cs[:, w:] - cs[:, :-w]
        cn[:, w:] = cn[:, w:] - cn[:, :-w]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(cn >= minimo, cs / np.maximum(cn, 1), np.nan)


def desplazar(a: np.ndarray, k: int) -> np.ndarray:
    """Rezago de k dias (lo que valia hace k dias). Sin dato -> NaN."""
    r = np.full_like(a, np.nan, dtype=np.float64)
    if a.shape[1] > k:
        r[:, k:] = a[:, :-k]
    return r


def _f(v: str, a: np.ndarray) -> np.ndarray:
    return np.log1p(np.maximum(a, 0.0)) if v in C.LOG1P else a


LARGO_HISTORIA = 1100   # dias de historia que necesitan las features mas largas (tendencia a 3 anios)


def construir_features(val: np.ndarray, variables: list, fechas: pd.DatetimeIndex, estatico: np.ndarray,
                       lb: LineaBase, objetivos: list, exogenas: list, miembros: int = 1):
    """Features crudas [N, T, F] (sin escalar), sus nombres y que canales NO se estandarizan.

    Los primeros len(objetivos) canales son los objetivos transformados: comparten escala con la salida.
    `miembros`: en el pronostico por conjuntos las N series son P puntos x M miembros (ordenadas por punto);
    las senales regionales se promedian entre puntos para cada miembro.
    """
    N, T, _ = val.shape

    def regional(a):   # promedio entre puntos (estado sinoptico de la region), por miembro
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            r = np.nanmean(a.reshape(N // miembros, miembros, T), axis=0)
        return np.tile(r, (N // miembros, 1))
    vi = {v: i for i, v in enumerate(variables)}
    doy = fechas.dayofyear.to_numpy() - 1
    mes = fechas.month.to_numpy()
    canales, nombres, libres = [], [], []

    def agregar(nombre, a, libre=False):
        canales.append(np.broadcast_to(a, (N, T)).astype(np.float32))
        nombres.append(nombre)
        libres.append(libre)

    obj = {v: val[:, :, vi[v]].astype(np.float64) for v in objetivos}
    for v in objetivos:
        agregar(v, _f(v, obj[v]))
    for v in exogenas:
        a = val[:, :, vi[v]].astype(np.float64)
        agregar(v, _f(v, a))
        agregar(f"m_{v}", np.isfinite(a).astype(np.float32), libre=True)
    agregar("m_base", np.mean([np.isfinite(obj[v]) for v in objetivos], axis=0), libre=True)

    ang = 2 * np.pi * doy / 365.25
    agregar("sin_doy", np.sin(ang)[None], True)
    agregar("cos_doy", np.cos(ang)[None], True)
    agregar("sin_mes", np.sin(2 * np.pi * mes / 12)[None], True)
    agregar("cos_mes", np.cos(2 * np.pi * mes / 12)[None], True)

    clim = {v: lb.media[:, doy, j].astype(np.float64) for j, v in enumerate(objetivos)}
    cstd = {v: lb.std[:, doy, j].astype(np.float64) for j, v in enumerate(objetivos)}
    if "PRECTOTCORR" in obj:
        ll = obj["PRECTOTCORR"]
        m30 = media_movil(ll, 30)
        agregar("lluvia_m7", np.log1p(media_movil(ll, 7)))
        agregar("lluvia_m30", np.log1p(m30))
        agregar("lluvia_m90", np.log1p(media_movil(ll, 90)))
        anom_ll = np.log1p(m30) - np.log1p(np.maximum(clim["PRECTOTCORR"], 0))
        agregar("anom_lluvia30", anom_ll)
        agregar("lag365_anom_lluvia30", desplazar(anom_ll, 365))
        agregar("clim_lluvia", np.log1p(np.maximum(clim["PRECTOTCORR"], 0)))
        reg = regional(ll)
        agregar("reg_lluvia", np.log1p(reg))
        agregar("reg_lluvia_m7", np.log1p(media_movil(reg, 7)))
    if "T2M_MAX" in obj:
        tx = obj["T2M_MAX"]
        anom_tx = (tx - clim["T2M_MAX"]) / cstd["T2M_MAX"]
        agregar("tmax_m7", media_movil(tx, 7))
        agregar("tmax_m30", media_movil(tx, 30))
        agregar("anom_tmax", anom_tx)
        agregar("lag365_anom_tmax30", desplazar(media_movil(anom_tx, 30), 365))
        agregar("clim_tmax", clim["T2M_MAX"])
        agregar("reg_anom_tmax", regional(anom_tx))
    if "T2M_MIN" in obj:
        agregar("anom_tmin", (obj["T2M_MIN"] - clim["T2M_MIN"]) / cstd["T2M_MIN"])
    tref = "T2M" if "T2M" in obj else ("T2M_MAX" if "T2M_MAX" in obj else None)
    if tref:  # senales no estacionarias: anomalia termica del ultimo anio y tendencia a 3 anios (calentamiento / regimen).
        # Se miden contra la linea base, asi que no extrapolan como lo haria un indice de tiempo.
        agregar("anom_t365", media_movil(obj[tref] - clim[tref], 365, minimo=120))
        agregar("tendencia_3a", media_movil(obj[tref] - clim[tref], 1095, minimo=365))
    if "RH2M" in obj:
        agregar("reg_anom_rh", regional((obj["RH2M"] - clim["RH2M"]) / cstd["RH2M"]))
    if "oni" in exogenas:
        o = val[:, :, vi["oni"]].astype(np.float64)
        agregar("d_oni90", o - desplazar(o, 90))
    est = np.where(np.isfinite(estatico), estatico, np.nan)
    for j, c in enumerate(("lat", "lon", "elevacion")):
        agregar(c, est[:, j][:, None])
    return np.stack(canales, axis=2), nombres, np.array(libres)


@dataclass
class Escalador:
    """Escalado invertible por variable, ajustado estrictamente con datos de entrenamiento."""
    nombres_x: list
    media_x: np.ndarray
    std_x: np.ndarray
    objetivos: list
    media_y: np.ndarray
    std_y: np.ndarray
    log_y: np.ndarray   # bool por objetivo
    tope_y: np.ndarray  # limite fisico superior por objetivo (evita desbordes al invertir)

    def x(self, crudo: np.ndarray) -> np.ndarray:
        z = (crudo - self.media_x) / self.std_x
        return np.nan_to_num(np.clip(z, -8, 8), nan=0.0).astype(np.float32)   # NaN -> 0 SOLO ya escalado (= media) y con mascara

    def y(self, fisico: np.ndarray) -> np.ndarray:
        t = np.where(self.log_y, np.log1p(np.maximum(fisico, 0.0)), fisico)
        return ((t - self.media_y) / self.std_y).astype(np.float32)

    def y_inv(self, escala: np.ndarray) -> np.ndarray:
        t = escala * self.std_y + self.media_y
        tl = np.minimum(t, np.log1p(self.tope_y))
        return np.where(self.log_y, np.expm1(tl), np.minimum(t, self.tope_y)).astype(np.float32)

    def a_dict(self) -> dict:
        return dict(self.__dict__)

    @classmethod
    def desde_dict(cls, d: dict) -> "Escalador":
        return cls(**d)


def ajustar_escalador(crudo: np.ndarray, nombres: list, libres: np.ndarray, objetivos: list, t_fin: int) -> Escalador:
    tr = crudo[:, : t_fin + 1].reshape(-1, crudo.shape[2]).astype(np.float64)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mu, sd = np.nanmean(tr, axis=0), np.nanstd(tr, axis=0)
    mu = np.where(np.isfinite(mu), mu, 0.0)
    sd = np.where(np.isfinite(sd) & (sd > 1e-6), sd, 1.0)
    mu[libres], sd[libres] = 0.0, 1.0
    nT = len(objetivos)
    return Escalador(list(nombres), mu.astype(np.float32), sd.astype(np.float32), list(objetivos),
                     mu[:nT].astype(np.float32), sd[:nT].astype(np.float32),
                     np.array([v in C.LOG1P for v in objetivos]),
                     np.array([C.LIMITES.get(v, (0, 1e6))[1] for v in objetivos], dtype=np.float32))


# =========================================================================== ventanas deslizantes
class Ventanas:
    """Ventanas deslizantes servidas directo desde tensores en el dispositivo (sin DataLoader).

    Origen t = ultimo dia de entrada. Entrada: dias t-L+1..t. Objetivo: dias t+1..t+H.
    """

    def __init__(self, X: np.ndarray, Y: np.ndarray, lb: LineaBase, esc: Escalador, cfg: C.KharisConfig, device, doy0: np.ndarray):
        self.L, self.H = cfg.seq_len, cfg.horizonte
        self.device = device
        self.X = torch.as_tensor(X, device=device)
        self.Y = torch.as_tensor(Y, device=device)
        self.clim = torch.as_tensor(lb.media_esc, device=device)                 # [P, 366, nT]
        self.doy = torch.as_tensor(doy0.astype(np.int64), device=device)         # [T] dia del anio (0..365)
        self.off_in = torch.arange(-self.L + 1, 1, device=device)
        self.off_out = torch.arange(1, self.H + 1, device=device)
        P, T, nT = Y.shape
        # dia valido como entrada: al menos la mitad de los objetivos presentes
        m_base = X[:, :, esc.nombres_x.index("m_base")]
        ent = np.cumsum(np.concatenate([np.zeros((P, 1)), m_base >= 0.5], axis=1), axis=1)
        sal = np.cumsum(np.concatenate([np.zeros((P, 1)), np.isfinite(Y).any(axis=2)], axis=1), axis=1)
        valido = np.zeros((P, T), dtype=bool)
        t = np.arange(self.L - 1, T - self.H)
        if len(t):
            frac_ent = (ent[:, t + 1] - ent[:, t + 1 - self.L]) / self.L
            n_sal = sal[:, t + 1 + self.H] - sal[:, t + 1]
            valido[:, t] = (frac_ent >= 0.9) & (n_sal > 0)
        self.valido = valido
        # umbrales de extremos en escala del modelo (por punto y variable)
        esc_y = lambda a: torch.as_tensor(esc.y(a), device=device)
        self.thr80, self.thr95 = esc_y(lb.pct["p80"]), esc_y(lb.pct["p95"])
        ambas = np.array([C.COLAS.get(v, "alta") == "ambas" for v in esc.objetivos])
        bajo = lambda a: torch.as_tensor(np.where(ambas, esc.y(a), -np.inf).astype(np.float32), device=device)
        self.thr20, self.thr05 = bajo(lb.pct["p20"]), bajo(lb.pct["p05"])
        # dia con un extremo critico (>= p99 de lluvia/viento/calor, <= p01 de frio): la poda nunca los descarta
        alto = np.where([C.CRITICAS.get(v) == "alta" for v in esc.objetivos], esc.y(lb.pct["p99"]), np.inf)
        bajo99 = np.where([C.CRITICAS.get(v) == "baja" for v in esc.objetivos], esc.y(lb.pct["p01"]), -np.inf)
        with np.errstate(invalid="ignore"):
            e95 = ((Y >= alto[:, None]) | (Y <= bajo99[:, None])).any(axis=2)
        ce = np.cumsum(np.concatenate([np.zeros((P, 1)), e95], axis=1), axis=1)
        self.origen_extremo = np.zeros((P, T), dtype=bool)
        if len(t):
            self.origen_extremo[:, t] = (ce[:, t + 1 + self.H] - ce[:, t + 1]) > 0

    def origenes(self, t_ini: int, t_fin: int, excluir_dias: np.ndarray | None = None):
        """Origenes validos cuyos dias objetivo caen todos en [t_ini, t_fin] (indices de dia).
        `excluir_dias` [T] bool: se descartan las ventanas con algun dia objetivo marcado."""
        m = self.valido.copy()
        m[:, : max(0, t_ini - 1)] = False
        m[:, max(0, t_fin - self.H + 1):] = False
        if excluir_dias is not None:
            m &= (self.dias_marcados(excluir_dias) == 0)[None, :]
        p, t = np.nonzero(m)
        return p.astype(np.int64), t.astype(np.int64)

    def dias_marcados(self, dias: np.ndarray) -> np.ndarray:
        """Para cada origen t: cuantos de sus dias objetivo (t+1..t+H) estan marcados en `dias` [T]."""
        T = len(dias)
        c = np.concatenate([[0], np.cumsum(dias.astype(np.int64))])
        t = np.arange(T)
        return c[np.minimum(t + 1 + self.H, T)] - c[np.minimum(t + 1, T)]

    def lote(self, p: torch.Tensor, t: torch.Tensor):
        """x [B, L, F], y [B, H, nT] y la climatologia de los dias objetivo [B, H, nT] (base de la prediccion)."""
        dias = t[:, None] + self.off_out
        x = self.X[p[:, None], t[:, None] + self.off_in]
        y = self.Y[p[:, None], dias]
        base = self.clim[p[:, None], self.doy[dias]]
        return x, y, base

    def extremos(self, p: torch.Tensor, y: torch.Tensor):
        """Banderas de extremo por elemento del objetivo (>= p80 / >= p95, y cola baja donde aplica)."""
        e80 = (y >= self.thr80[p][:, None]) | (y <= self.thr20[p][:, None])
        e95 = (y >= self.thr95[p][:, None]) | (y <= self.thr05[p][:, None])
        return e80.float(), e95.float()


# =========================================================================== poda de datos (data decay / pruning)
def pesos_retencion(t_origen: np.ndarray, es_extremo: np.ndarray, t_ref: int, cfg: C.KharisConfig, deriva: bool = False):
    """Peso de muestreo por ventana: ventana deslizante + decaimiento temporal + extremos protegidos.

    * Dentro de la ventana (ventana_anios): peso = 0.5 ** (edad / vida_media).
    * Fuera de la ventana: se poda (peso 0), salvo los extremos, que conservan `peso_extremos`.
    * Con deriva detectada, la vida media se acorta a la mitad: el regimen viejo pesa menos.
    """
    edad = np.maximum(t_ref - t_origen, 0).astype(np.float64)
    vida = cfg.vida_media_dias * (0.5 if deriva else 1.0)
    w = 0.5 ** (edad / max(vida, 1.0))
    dentro = edad <= cfg.ventana_anios * 365.25
    w = np.where(dentro, w, 0.0)
    w = np.where(es_extremo, np.maximum(w, cfg.peso_extremos), w)
    info = {"ventanas_totales": int(len(w)), "retenidas_recientes": int((dentro & ~es_extremo).sum()),
            "extremos_conservados": int((es_extremo & (w > 0)).sum()), "podadas": int((w <= 0).sum()),
            "vida_media_dias": float(vida), "ventana_anios": float(cfg.ventana_anios)}
    return w, info


# =========================================================================== datos sinteticos
def generar_sintetico(inicio="1981-01-01", fin="2026-06-30", n_puntos: int = 5, semilla: int = 1134) -> pd.DataFrame:
    """Esquema multivariable de Honduras simulado: estacionalidad bimodal con canicula, tendencia de
    calentamiento, El Nino (1982, 1997, 2015, 2023) y huracanes (Mitch 1998, Eta e Iota 2020).
    Incluye centinelas -999 a proposito para ejercitar la limpieza.
    """
    rng = np.random.default_rng(semilla)
    fechas = pd.date_range(inicio, fin, freq="D")
    T = len(fechas)
    doy, anio = fechas.dayofyear.to_numpy(), fechas.year.to_numpy()
    tdec = anio + doy / 365.25
    # ONI: oscilacion + picos forzados en los anios de Super El Nino
    oni = 0.7 * np.sin(2 * np.pi * tdec / 3.7) + 0.4 * np.sin(2 * np.pi * tdec / 5.3 + 1.0)
    for a in (1982, 1997, 2015, 2023):
        oni += 2.0 * np.exp(-0.5 * ((tdec - (a + 0.92)) / 0.38) ** 2)
    oni = np.clip(oni, -2.2, 2.8)
    nino = np.clip(oni, 0, None)
    # temporada de lluvias mayo-octubre con canicula (bajon julio-agosto)
    est = 1 / (1 + np.exp(-(doy - 128) / 9.0)) * 1 / (1 + np.exp((doy - 305) / 9.0))
    canic = 1 - 0.55 * np.exp(-0.5 * ((doy - 212) / 16.0) ** 2) * (1 + 0.35 * nino)
    humedo = np.clip(est * canic, 0, 1)
    ciclones = [("1998-10-26", "1998-11-01", 1.0), ("2020-11-03", "2020-11-07", 0.75), ("2020-11-16", "2020-11-19", 0.8),
                ("1988-10-20", "1988-10-23", 0.4), ("2005-10-17", "2005-10-20", 0.45), ("2011-10-12", "2011-10-16", 0.4)]
    nombres = ["valle_central", "corredor_seco", "costa_norte", "altiplano", "oriente", "occidente", "mosquitia", "sur"]
    lat = np.array([14.45, 13.30, 15.70, 14.30, 14.66, 14.77, 15.25, 13.50])
    lon = np.array([-87.64, -87.19, -87.45, -88.17, -86.22, -88.78, -84.50, -87.40])
    elev = np.array([580.0, 50.0, 20.0, 1650.0, 400.0, 1100.0, 10.0, 120.0])
    seco = np.array([1.0, 0.6, 1.4, 1.1, 1.0, 1.05, 1.6, 0.7])   # factor de lluvia por zona
    filas = []
    for p in range(n_puntos):
        k = p % len(nombres)
        e_t = np.zeros(T)
        ruido = rng.normal(0, 1, T)
        for i in range(1, T):
            e_t[i] = 0.75 * e_t[i - 1] + 0.66 * ruido[i]
        tbase = 30.5 - 0.0062 * elev[k] + 2.3 * np.cos(2 * np.pi * (doy - 118) / 365.25) + 0.03 * (tdec - 1996) + 0.55 * oni
        # ocurrencia de lluvia con persistencia (cadena de Markov) y efecto El Nino
        p_h = np.clip((0.06 + 0.62 * humedo * seco[k] ** 0.5) * (1 - 0.22 * nino), 0.01, 0.95)
        u = rng.random(T)
        llueve = np.zeros(T, dtype=bool)
        for i in range(1, T):
            llueve[i] = u[i] < np.clip(p_h[i] + (0.22 if llueve[i - 1] else -0.06), 0.005, 0.97)
        lluvia = np.where(llueve, rng.gamma(0.75, 13.0 * seco[k] * (0.5 + humedo) * (1 - 0.15 * nino), T), 0.0)
        viento = np.exp(rng.normal(0.55 + 0.25 * (1 - est), 0.33, T))
        racha = 1.55 + np.abs(rng.normal(0, 0.28, T))
        for a, b, f in ciclones:
            m = (fechas >= a) & (fechas <= b)
            cerca = f * (1.25 if k in (2, 6) else 1.0)
            lluvia[m] += rng.gamma(4.0, 32.0 * cerca, m.sum())
            viento[m] = viento[m] * (2.2 + 2.5 * cerca) + 2.0
            llueve[m] = True
        mojado = pd.Series(lluvia).rolling(3, min_periods=1).mean().to_numpy()
        tmed = tbase + 1.4 * e_t - 0.9 * np.tanh(mojado / 12.0)
        amp = 5.6 - 1.6 * np.tanh(mojado / 10.0) + 0.5 * rng.normal(0, 1, T)
        tmax, tmin = tmed + np.maximum(amp, 1.0), tmed - np.maximum(amp, 1.0) * 0.9
        rh = np.clip(58 + 26 * np.tanh(pd.Series(lluvia).rolling(7, min_periods=1).mean().to_numpy() / 6.0) + 9 * humedo - 1.2 * e_t + rng.normal(0, 4, T), 18, 100)
        rad = np.clip(20.5 + 3.2 * np.cos(2 * np.pi * (doy - 110) / 365.25) - 7.5 * np.tanh(lluvia / 15.0) + rng.normal(0, 1.8, T), 2.5, 30)
        suelo = np.zeros(T)
        for i in range(1, T):
            suelo[i] = np.clip(suelo[i - 1] * 0.93 + lluvia[i] * 0.004, 0, 0.42)
        ndvi = np.clip(0.28 + 0.9 * pd.Series(suelo).rolling(45, min_periods=1).mean().to_numpy() + rng.normal(0, 0.02, T), 0.05, 0.92)
        d = pd.DataFrame({
            "punto": nombres[k] if p < len(nombres) else f"{nombres[k]}_{p}", "fecha": fechas,
            "lat": lat[k], "lon": lon[k], "elevacion": elev[k],
            "T2M": tmed, "T2M_MAX": tmax, "T2M_MIN": tmin, "PRECTOTCORR": lluvia, "RH2M": rh,
            "WS2M": viento, "WS2M_MAX": viento * racha, "ALLSKY_SFC_SW_DWN": rad,
            "precipitation": np.where(anio >= 2000, lluvia * np.exp(rng.normal(0, 0.25, T)), np.nan),
            "soil_moisture": np.where(anio >= 2015, 0.08 + suelo + rng.normal(0, 0.01, T), np.nan),
            "NDVI": np.where(anio >= 2000, ndvi, np.nan), "oni": oni,
        })
        for c in ("T2M_MAX", "PRECTOTCORR", "RH2M", "ALLSKY_SFC_SW_DWN"):  # huecos con centinela, como en POWER
            d.loc[rng.random(T) < 0.004, c] = -999.0
        d.loc[d["fecha"] < "1984-01-01", "ALLSKY_SFC_SW_DWN"] = -999.0
        filas.append(d)
    df = pd.concat(filas, ignore_index=True)
    num = df.select_dtypes("number").columns
    df[num] = df[num].round(3)
    return df
