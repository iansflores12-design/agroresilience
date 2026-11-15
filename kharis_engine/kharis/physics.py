"""Acoplamiento fisico determinista: GDD, Ra, ET0, ETc, balance hidrico, rachas, estres y senales P1-P10.

Nada aqui se entrena. Recibe clima diario (observado o predicho por la red) y devuelve variables fisicas e
indicadores operativos. Trabaja con arreglos [N, T] (N series, T dias) y ofrece envoltorios para DataFrame.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config as C

ETAPAS = {0: "fuera_de_ciclo", 1: "inicial", 2: "desarrollo", 3: "media", 4: "final"}

# Reglas de activacion de cada senal (valor y/o percentil historico del punto).
ACTIVACION = {
    "P1": dict(valor=10.0),                 # >= 10 dias de retraso
    "P2": dict(valor=10.0, percentil=80.0),  # racha >= 10 dias o percentil >= 80
    "P3": dict(percentil=80.0),
    "P4": dict(valor=15.0, percentil=90.0),
    "P5": dict(valor=3.0),
    "P6": dict(valor=0.4),
    "P7": dict(valor=1.0),
    "P8": dict(valor=0.5),
    "P9": dict(valor=2.0),
}


# =========================================================================== restricciones fisicas
def acoplar_fisica(valores: np.ndarray, objetivos: list) -> np.ndarray:
    """Hace fisicamente coherente una prediccion [..., n_objetivos]: lluvia/viento/radiacion >= 0,
    humedad en 0-100 y T2M_MIN <= T2M <= T2M_MAX."""
    v = np.array(valores, dtype=np.float32, copy=True)
    i = {n: k for k, n in enumerate(objetivos)}
    for n in ("PRECTOTCORR", "WS2M_MAX", "WS2M", "ALLSKY_SFC_SW_DWN"):
        if n in i:
            v[..., i[n]] = np.maximum(v[..., i[n]], 0.0)
    if "RH2M" in i:
        v[..., i["RH2M"]] = np.clip(v[..., i["RH2M"]], 0.0, 100.0)
    if "ALLSKY_SFC_SW_DWN" in i:
        v[..., i["ALLSKY_SFC_SW_DWN"]] = np.minimum(v[..., i["ALLSKY_SFC_SW_DWN"]], 45.0)
    if "T2M_MAX" in i and "T2M_MIN" in i:
        tx, tn = v[..., i["T2M_MAX"]].copy(), v[..., i["T2M_MIN"]].copy()
        v[..., i["T2M_MAX"]], v[..., i["T2M_MIN"]] = np.maximum(tx, tn), np.minimum(tx, tn)
        if "T2M" in i:
            v[..., i["T2M"]] = np.clip(v[..., i["T2M"]], v[..., i["T2M_MIN"]], v[..., i["T2M_MAX"]])
    return v


# =========================================================================== formulas
def radiacion_extraterrestre(lat: np.ndarray, doy: np.ndarray) -> np.ndarray:
    """Ra en MJ/m2/dia (FAO-56 ec. 21). lat [N] en grados, doy [T] (1..366) -> [N, T]."""
    phi = np.radians(np.where(np.isfinite(lat), lat, 14.8))[:, None]
    j = doy[None, :].astype(np.float64)
    dr = 1 + 0.033 * np.cos(2 * np.pi * j / 365)
    dec = 0.409 * np.sin(2 * np.pi * j / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(dec), -1, 1))
    return 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))


def et0_hargreaves(tmax, tmin, ra):
    """ET0 Hargreaves-Samani (mm/dia). Solo necesita temperatura y Ra."""
    tmed = (tmax + tmin) / 2
    return np.maximum(0.0023 * (tmed + 17.8) * np.sqrt(np.maximum(tmax - tmin, 0.0)) * ra * 0.408, 0.0)


def et0_penman(tmax, tmin, rh, u2, rs, ra, elev):
    """ET0 FAO-56 Penman-Monteith (mm/dia) con humedad relativa media y G = 0. Respaldo de Hargreaves."""
    z = np.where(np.isfinite(elev), elev, 500.0)[:, None]
    tmed = (tmax + tmin) / 2
    e = lambda t: 0.6108 * np.exp(17.27 * t / (t + 237.3))
    es = (e(tmax) + e(tmin)) / 2
    ea = es * np.clip(rh, 0, 100) / 100
    delta = 4098 * e(tmed) / (tmed + 237.3) ** 2
    gamma = 0.000665 * 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26
    rso = (0.75 + 2e-5 * z) * ra
    rnl = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * np.sqrt(np.maximum(ea, 0))) \
        * (1.35 * np.clip(rs / np.maximum(rso, 1e-6), 0.3, 1) - 0.35)
    rn = 0.77 * rs - rnl
    return np.maximum((0.408 * delta * rn + gamma * 900 / (tmed + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2)), 0.0)


def racha_seca(lluvia: np.ndarray, umbral: float = C.LLUVIA_SECA_MM) -> np.ndarray:
    """Dias secos consecutivos (lluvia < umbral) hasta cada dia. [N, T]. Un dia sin dato corta la racha."""
    seco = np.nan_to_num(lluvia, nan=np.inf) < umbral
    c = np.cumsum(seco, axis=1)
    return c - np.maximum.accumulate(np.where(~seco, c, 0), axis=1)


def calendario_cultivo(fechas: pd.DatetimeIndex, cultivo: str, ciclo: str) -> dict:
    """Etapa, kc y ventana de floracion de cada dia, segun fecha de siembra del ciclo."""
    par = C.CULTIVOS[cultivo]
    mes, dia = C.SIEMBRA[ciclo]
    anio = fechas.year.to_numpy()
    f = fechas.to_numpy().astype("datetime64[D]")
    fecha_siembra = lambda a: (a.astype("int64") - 1970).astype("datetime64[Y]").astype("datetime64[D]") \
        + np.timedelta64((pd.Timestamp(2001, mes, dia).dayofyear - 1), "D")
    anio_siembra = anio - (f < fecha_siembra(anio)).astype(int)
    d = (f - fecha_siembra(anio_siembra)).astype(int)
    e1, e2, e3, e4 = par["etapas"]
    kc_i, kc_m, kc_f = par["kc"]
    en_ciclo = d < (e1 + e2 + e3 + e4)
    kc = np.where(d < e1, kc_i, np.where(d < e1 + e2, kc_i + (kc_m - kc_i) * (d - e1) / e2,
                  np.where(d < e1 + e2 + e3, kc_m, kc_m + (kc_f - kc_m) * (d - e1 - e2 - e3) / e4)))
    etapa = np.where(d < e1, 1, np.where(d < e1 + e2, 2, np.where(d < e1 + e2 + e3, 3, 4)))
    f0, f1 = par["floracion"]
    return {"anio_siembra": anio_siembra, "dia_ciclo": np.where(en_ciclo, d, -1), "en_ciclo": en_ciclo,
            "kc": np.where(en_ciclo, kc, 0.30), "etapa": np.where(en_ciclo, etapa, 0),
            "floracion": en_ciclo & (d >= f0) & (d <= f1)}


def balance_hidrico(lluvia: np.ndarray, etc: np.ndarray, taw: float, p: float):
    """Balance diario de un solo estrato (FAO-56 simplificado). Arreglos [N, T].

    Devuelve reserva (mm), ks (0..1), etc_real, deficit (ETc no satisfecha) y exceso (drenaje/escorrentia).
    """
    N, T = lluvia.shape
    reserva, ks, real, deficit, exceso = (np.full((N, T), np.nan) for _ in range(5))
    dr = np.full(N, taw * 0.5)   # agotamiento inicial: suelo a media capacidad
    for t in range(T):
        ll, e = lluvia[:, t], etc[:, t]
        ok = np.isfinite(ll) & np.isfinite(e)
        nuevo, k, er, ex = paso_balance(dr, np.where(ok, ll, 0.0), np.where(ok, e, 0.0), taw, p)
        dr = np.where(ok, nuevo, dr)
        reserva[:, t] = np.where(ok, taw - dr, np.nan)
        ks[:, t], real[:, t] = np.where(ok, k, np.nan), np.where(ok, er, np.nan)
        deficit[:, t], exceso[:, t] = np.where(ok, e - er, np.nan), np.where(ok, ex, np.nan)
    return reserva, ks, real, deficit, exceso


def paso_balance(dr, lluvia, etc, taw: float, p: float):
    """Un dia de balance. dr = agotamiento al empezar el dia (0 = suelo lleno, taw = seco).
    Devuelve (dr nuevo, ks, etc_real, exceso)."""
    raw = p * taw
    k = np.where(dr <= raw, 1.0, (taw - dr) / max(taw - raw, 1e-6))
    er = k * etc
    nuevo = dr - lluvia + er
    return np.clip(nuevo, 0.0, taw), k, er, np.maximum(-nuevo, 0.0)


# Masa de probabilidad que representa cada cuantil al integrar sobre la distribucion predicha
def pesos_cuantiles(niveles) -> np.ndarray:
    q = np.asarray(niveles, dtype=np.float64)
    bordes = np.concatenate([[0.0], (q[1:] + q[:-1]) / 2, [1.0]])
    return np.diff(bordes)


def balance_un_dia(reserva_ayer, lluvia_q, pesos, etc, taw: float, p: float):
    """Pronostico a 1 dia del balance: parte de la reserva OBSERVADA de ayer e integra la lluvia predicha sobre
    sus cuantiles (el balance no es lineal: usar solo la lluvia media lo sesgaria).
    reserva_ayer [T], lluvia_q [T, Q], etc [T] -> (reserva esperada [T], deficit esperado [T])."""
    dr = (taw - reserva_ayer)[:, None]
    nuevo, _, er, _ = paso_balance(dr, lluvia_q, etc[:, None], taw, p)
    return ((taw - nuevo) * pesos).sum(axis=1), ((etc[:, None] - er) * pesos).sum(axis=1)


# =========================================================================== fisica diaria
def fisica_arreglos(fechas: pd.DatetimeIndex, lat: np.ndarray, elev: np.ndarray, clima: dict,
                    cultivo: str = "maiz", ciclo: str = "primera", metodo_et0: str = "hargreaves") -> dict:
    """clima: dict variable -> [N, T] (T2M_MAX, T2M_MIN, PRECTOTCORR obligatorias). Devuelve dict -> [N, T]."""
    tmax, tmin = clima["T2M_MAX"].astype(np.float64), clima["T2M_MIN"].astype(np.float64)
    lluvia = clima["PRECTOTCORR"].astype(np.float64)
    par = C.CULTIVOS[cultivo]
    doy = fechas.dayofyear.to_numpy()
    ra = radiacion_extraterrestre(np.asarray(lat, dtype=np.float64), doy)
    t_media = (tmax + tmin) / 2
    et0 = et0_hargreaves(tmax, tmin, ra)
    metodo = np.full(tmax.shape, "hargreaves", dtype=object)
    viento = clima.get("WS2M")
    if metodo_et0 == "penman" and all(k in clima for k in ("RH2M", "ALLSKY_SFC_SW_DWN")) and viento is not None:
        pm = et0_penman(tmax, tmin, clima["RH2M"].astype(np.float64), viento.astype(np.float64),
                        clima["ALLSKY_SFC_SW_DWN"].astype(np.float64), ra, np.asarray(elev, dtype=np.float64))
        usar = np.isfinite(pm)   # respaldo: donde Penman no se puede calcular queda Hargreaves
        et0, metodo = np.where(usar, pm, et0), np.where(usar, "penman", metodo)
    cal = calendario_cultivo(fechas, cultivo, ciclo)
    base, tope = par["gdd"]
    gdd = np.maximum((np.minimum(tmax, tope) + np.maximum(tmin, base)) / 2 - base, 0.0)
    gdd = np.where(np.isfinite(tmax) & np.isfinite(tmin), gdd, np.nan)
    # GDD acumulado desde la siembra de cada ciclo
    g0 = np.where(cal["en_ciclo"][None, :], np.nan_to_num(gdd), 0.0)
    cs = np.cumsum(g0, axis=1)
    inicio = np.r_[True, cal["anio_siembra"][1:] != cal["anio_siembra"][:-1]] | (cal["dia_ciclo"] == 0)
    refs = np.maximum.accumulate(np.where(inicio[None, :], cs - g0, 0.0), axis=1)
    gdd_acum = np.where(cal["en_ciclo"][None, :], cs - refs, 0.0)
    etc = cal["kc"][None, :] * et0
    taw = C.CAPACIDAD_SUELO_MM_M * par["zr"]
    reserva, ks, etc_real, deficit, exceso = balance_hidrico(lluvia, etc, taw, par["p"])
    dia_seco = np.nan_to_num(lluvia, nan=np.inf) < C.LLUVIA_SECA_MM
    calor = np.nan_to_num(tmax, nan=-np.inf) > C.T_ESTRES_C
    calor_flor = (np.nan_to_num(tmax, nan=-np.inf) > par["t_calor"]) & cal["floracion"][None, :]
    estres = np.where(cal["en_ciclo"][None, :], 1.0 - ks, np.nan)
    return {
        "t_media": t_media, "gdd": gdd, "gdd_acum": gdd_acum, "ra": ra, "et0": et0, "metodo_et0": metodo,
        "kc": np.broadcast_to(cal["kc"][None, :], tmax.shape), "etc": etc, "etc_real": etc_real,
        "reserva": reserva, "deficit": deficit, "exceso": exceso, "ks": ks, "estres_etapa": estres,
        "lluvia_intensa": np.nan_to_num(lluvia, nan=-np.inf) > C.LLUVIA_INTENSA_MM,
        "dia_seco": dia_seco, "dias_secos_consec": racha_seca(lluvia),
        "dia_calor": calor, "dia_calor_floracion": calor_flor,
        "etapa": np.broadcast_to(cal["etapa"][None, :], tmax.shape), "_cal": cal, "_taw": taw,
    }


COLUMNAS_FISICA = ["t_media", "gdd", "gdd_acum", "ra", "et0", "metodo_et0", "kc", "etc", "etc_real", "reserva", "deficit",
                   "exceso", "ks", "estres_etapa", "lluvia_intensa", "dia_seco", "dias_secos_consec", "dia_calor",
                   "dia_calor_floracion", "etapa"]


def fisica_a_dataframe(puntos: list, fechas: pd.DatetimeIndex, fis: dict, redondeo: int = 3) -> pd.DataFrame:
    P, T = len(puntos), len(fechas)
    d = {"punto": np.repeat(np.array(puntos, dtype=object), T), "fecha": np.tile(fechas.values, P)}
    for c in COLUMNAS_FISICA:
        a = np.asarray(fis[c]).reshape(-1)
        if c == "etapa":
            a = np.vectorize(ETAPAS.get)(a)
        elif a.dtype.kind == "f":
            a = np.round(a, redondeo)
        d[c] = a
    return pd.DataFrame(d)


# =========================================================================== senales P1..P10
@dataclass
class Referencia:
    """Historia de referencia por punto (solo periodo base) para percentiles y anomalias de las senales."""
    puntos: list
    anios: list
    mediana_inicio: np.ndarray    # [N]
    mes_lluvia: np.ndarray        # [N, 6, 2] media y std de lluvia media diaria por mes (may-oct)
    mes_tmax: np.ndarray          # [N, 6, 2]
    compuesto_nino: np.ndarray    # [N, 12]
    clim_t: np.ndarray            # [N, 366, 4] media/std de T2M_MAX y T2M_MIN
    lluvia_p999: np.ndarray       # [N]
    viento_p999: np.ndarray       # [N]
    distribucion: dict            # senal -> [N, n_anios] valores historicos (para percentiles)

    def repetir(self, m: int) -> "Referencia":
        r = lambda a: np.repeat(a, m, axis=0)
        return Referencia([p for p in self.puntos for _ in range(m)], self.anios, r(self.mediana_inicio), r(self.mes_lluvia),
                          r(self.mes_tmax), r(self.compuesto_nino), r(self.clim_t), r(self.lluvia_p999), r(self.viento_p999),
                          {k: r(v) for k, v in self.distribucion.items()})

    def alinear(self, puntos: list) -> "Referencia":
        """Reordena a otra lista de puntos; un punto nuevo usa el promedio de los conocidos."""
        if list(puntos) == list(self.puntos):
            return self
        pos = {p: i for i, p in enumerate(self.puntos)}
        ix = [pos.get(p, -1) for p in puntos]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            r = lambda a: np.stack([a[i] if i >= 0 else np.nanmean(a, axis=0) for i in ix])
            return Referencia(list(puntos), self.anios, r(self.mediana_inicio), r(self.mes_lluvia), r(self.mes_tmax),
                              r(self.compuesto_nino), r(self.clim_t), r(self.lluvia_p999), r(self.viento_p999),
                              {k: r(v) for k, v in self.distribucion.items()})

    def a_dict(self) -> dict:
        return dict(self.__dict__)

    @classmethod
    def desde_dict(cls, d: dict) -> "Referencia":
        return cls(**d)


def _mascara(fechas, m0, d0, m1, d1, anio):
    return np.asarray((fechas >= pd.Timestamp(anio, m0, d0)) & (fechas <= pd.Timestamp(anio, m1, d1)))


def _inicio_lluvias(lluvia, racha, fechas, anio):
    """Dia del anio del inicio de la temporada: 25 mm en 3 dias y sin racha seca >= 8 dias en los 30 siguientes."""
    r = C.INICIO_LLUVIAS
    N = lluvia.shape[0]
    tope_doy = pd.Timestamp(anio, *r["tope"]).dayofyear
    ix = np.nonzero(_mascara(fechas, *r["desde"], *r["tope"], anio))[0]
    res = np.full(N, np.nan)
    if len(ix) == 0:
        return res, np.zeros(N, dtype=bool)
    T = lluvia.shape[1]
    ll = np.nan_to_num(lluvia, nan=0.0)
    encontrado = np.zeros(N, dtype=bool)
    for t in ix:
        if t + 2 >= T:
            break
        s3 = ll[:, t:t + 3].sum(axis=1)
        fin = min(T, t + 30)
        seco_max = racha[:, t:fin].max(axis=1)
        ok = (ll[:, t] >= C.LLUVIA_SECA_MM) & (s3 >= r["mm_3d"]) & (seco_max < r["max_seco_30d"]) & ~encontrado
        res[ok] = fechas[t].dayofyear
        encontrado |= ok
    completa = bool(ix[-1] + 30 < T) or bool(fechas[-1] >= pd.Timestamp(anio, *r["tope"]))
    if completa:   # temporada vista entera y sin inicio: se registra el tope (inicio muy tardio)
        res[~encontrado] = tope_doy
    return res, encontrado


def _crudas_anuales(fechas: pd.DatetimeIndex, clima: dict, fis: dict, ref: Referencia | None, oni=None):
    """Valores crudos de las senales por (serie, anio). Devuelve (anios, dict nombre -> [N, n_anios])."""
    lluvia, tmax, tmin = clima["PRECTOTCORR"].astype(np.float64), clima["T2M_MAX"].astype(np.float64), clima["T2M_MIN"].astype(np.float64)
    viento = clima.get("WS2M_MAX", clima.get("WS2M"))
    N = lluvia.shape[0]
    racha = fis["dias_secos_consec"]
    cal = fis["_cal"]
    anios = sorted(set(fechas.year))
    m_ini, m_fin = C.TEMPORADA_LLUVIAS
    dias_mes_fin = pd.Timestamp(2001, m_fin, 1).days_in_month
    out = {k: np.full((N, len(anios)), np.nan) for k in (
        "inicio_doy", "racha_canicula", "lluvia_canicula_mm", "deficit_mm", "racha_max", "n_rachas_10d",
        "dias_calor_floracion", "estres_max", "estres_inicial", "estres_desarrollo", "estres_media", "estres_final",
        "dias_lluvia_intensa", "lluvia_max_1d", "lluvia_max_3d", "viento_max", "dias_viento_fuerte", "indice_extremos",
        "oni", "pct_fuera_rango", "z_max", "cobertura_temporada", "lluvia_temporada_mm")}
    vec = np.full((N, len(anios), 12), np.nan)   # anomalia mensual may-oct: 6 de lluvia + 6 de tmax
    ll3 = np.nan_to_num(lluvia, nan=0.0)
    ll3 = ll3 + np.pad(ll3, ((0, 0), (1, 0)))[:, :-1] + np.pad(ll3, ((0, 0), (2, 0)))[:, :-2]
    doy0 = fechas.dayofyear.to_numpy() - 1
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for j, a in enumerate(anios):
            ma = np.asarray(fechas.year == a)
            mt = _mascara(fechas, m_ini, 1, m_fin, dias_mes_fin, a)
            mc = _mascara(fechas, *C.CANICULA[0], *C.CANICULA[1], a)
            out["inicio_doy"][:, j], _ = _inicio_lluvias(lluvia, racha, fechas, a)
            if mc.any():
                desde = np.arange(1, mc.sum() + 1)[None, :]
                out["racha_canicula"][:, j] = np.minimum(racha[:, mc], desde).max(axis=1)
                out["lluvia_canicula_mm"][:, j] = np.nansum(lluvia[:, mc], axis=1)
            if mt.any():
                desde = np.arange(1, mt.sum() + 1)[None, :]
                rt = np.minimum(racha[:, mt], desde)
                out["racha_max"][:, j] = rt.max(axis=1)
                out["n_rachas_10d"][:, j] = (rt == 10).sum(axis=1)
                out["deficit_mm"][:, j] = np.nansum(fis["et0"][:, mt] - lluvia[:, mt], axis=1)
                out["lluvia_temporada_mm"][:, j] = np.nansum(lluvia[:, mt], axis=1)
                out["cobertura_temporada"][:, j] = np.isfinite(lluvia[:, mt]).sum(axis=1) / 184.0
            ms = np.asarray(cal["anio_siembra"] == a) & cal["en_ciclo"]
            if ms.any():
                out["dias_calor_floracion"][:, j] = fis["dia_calor_floracion"][:, ms].sum(axis=1)
                est = fis["estres_etapa"]
                por_etapa = []
                for e, nombre in ((1, "inicial"), (2, "desarrollo"), (3, "media"), (4, "final")):
                    me = ms & (cal["etapa"] == e)
                    v = np.nanmean(est[:, me], axis=1) if me.any() else np.full(N, np.nan)
                    out[f"estres_{nombre}"][:, j] = v
                    por_etapa.append(v)
                out["estres_max"][:, j] = np.nanmax(np.stack(por_etapa), axis=0)
            if ma.any():
                out["dias_lluvia_intensa"][:, j] = fis["lluvia_intensa"][:, ma].sum(axis=1)
                out["lluvia_max_1d"][:, j] = np.nanmax(lluvia[:, ma], axis=1)
                out["lluvia_max_3d"][:, j] = ll3[:, ma].max(axis=1)
                if viento is not None:
                    out["viento_max"][:, j] = np.nanmax(viento[:, ma], axis=1)
                    out["dias_viento_fuerte"][:, j] = (np.nan_to_num(viento[:, ma], nan=0.0) >= C.VIENTO_FUERTE_MS).sum(axis=1)
                out["indice_extremos"][:, j] = np.nanmax(np.stack([
                    out["lluvia_max_1d"][:, j] / (2 * C.LLUVIA_INTENSA_MM), out["lluvia_max_3d"][:, j] / (4 * C.LLUVIA_INTENSA_MM),
                    out["viento_max"][:, j] / (1.5 * C.VIENTO_FUERTE_MS)]), axis=0)
                if oni is not None and mt.any():
                    out["oni"][:, j] = np.nanmean(oni[:, mt], axis=1)
                if ref is not None:
                    d = doy0[ma]
                    zx = (tmax[:, ma] - ref.clim_t[:, d, 0]) / ref.clim_t[:, d, 1]
                    zn = (tmin[:, ma] - ref.clim_t[:, d, 2]) / ref.clim_t[:, d, 3]
                    fuera = (np.abs(zx) > 3) | (np.abs(zn) > 3) | (lluvia[:, ma] > ref.lluvia_p999[:, None])
                    if viento is not None:
                        fuera |= viento[:, ma] > ref.viento_p999[:, None]
                    out["pct_fuera_rango"][:, j] = 100.0 * fuera.mean(axis=1)
                    out["z_max"][:, j] = np.nanmax(np.maximum(np.abs(zx), np.abs(zn)), axis=1)
            for k, mes in enumerate(range(m_ini, m_fin + 1)):
                mm = ma & np.asarray(fechas.month == mes)
                if mm.sum() >= 10:
                    vec[:, j, k] = np.nanmean(lluvia[:, mm], axis=1)
                    vec[:, j, 6 + k] = np.nanmean(tmax[:, mm], axis=1)
    return anios, out, vec


def _anomalia(vec, ref: Referencia):
    z = np.empty_like(vec)
    z[:, :, :6] = (vec[:, :, :6] - ref.mes_lluvia[:, None, :, 0]) / ref.mes_lluvia[:, None, :, 1]
    z[:, :, 6:] = (vec[:, :, 6:] - ref.mes_tmax[:, None, :, 0]) / ref.mes_tmax[:, None, :, 1]
    return z


def _coseno(z, comp):
    ok = np.isfinite(z) & np.isfinite(comp)
    a, b = np.where(ok, z, 0.0), np.where(ok, comp, 0.0)
    den = np.sqrt((a**2).sum(-1) * (b**2).sum(-1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where((den > 1e-9) & (ok.sum(-1) >= 4), (a * b).sum(-1) / den, np.nan)


def construir_referencia(puntos, fechas, clima, fis, lb, objetivos, oni=None) -> Referencia:
    """Ajusta la referencia historica de las senales con el periodo que se le pase (usar solo el periodo base)."""
    lluvia = clima["PRECTOTCORR"]
    viento = clima.get("WS2M_MAX", clima.get("WS2M"))
    N = lluvia.shape[0]
    io = {v: k for k, v in enumerate(objetivos)}
    clim_t = np.stack([lb.media[:, :, io["T2M_MAX"]], lb.std[:, :, io["T2M_MAX"]],
                       lb.media[:, :, io["T2M_MIN"]], lb.std[:, :, io["T2M_MIN"]]], axis=2).astype(np.float64)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        p999 = np.nanpercentile(lluvia, 99.9, axis=1)
        v999 = np.nanpercentile(viento, 99.9, axis=1) if viento is not None else np.full(N, np.inf)
        provisional = Referencia(list(puntos), [], np.full(N, np.nan), np.zeros((N, 6, 2)), np.zeros((N, 6, 2)),
                                 np.zeros((N, 12)), clim_t, p999, v999, {})
        anios, crudas, vec = _crudas_anuales(fechas, clima, fis, provisional, oni)
        completos = [j for j, a in enumerate(anios) if (fechas.year == a).sum() >= 360]
        if not completos:
            completos = list(range(len(anios)))
        sel = lambda a: a[:, completos]
        ml = np.stack([np.nanmean(vec[:, completos, :6], axis=1), np.maximum(np.nanstd(vec[:, completos, :6], axis=1), 0.1)], axis=2)
        mx = np.stack([np.nanmean(vec[:, completos, 6:], axis=1), np.maximum(np.nanstd(vec[:, completos, 6:], axis=1), 0.1)], axis=2)
        provisional.mes_lluvia, provisional.mes_tmax = ml, mx
        z = _anomalia(vec, provisional)
        oni_a = crudas["oni"]
        es_nino = np.zeros(len(anios), dtype=bool)
        if np.isfinite(oni_a).any():
            es_nino = np.nanmean(oni_a, axis=0) >= 0.8
        if es_nino.sum() < 2:
            es_nino = np.array([a in C.ANIOS_NINO for a in anios])
        comp = np.nanmean(z[:, es_nino], axis=1) if es_nino.any() else np.zeros((N, 12))
        provisional.compuesto_nino = np.nan_to_num(comp)
        provisional.mediana_inicio = np.nan_to_num(np.nanmedian(sel(crudas["inicio_doy"]), axis=1), nan=150.0)
    provisional.anios = [anios[j] for j in completos]
    valores = _valores(crudas, _coseno(z, provisional.compuesto_nino[:, None, :]), provisional)
    provisional.distribucion = {k: sel(v) for k, v in valores.items()}
    return provisional


def _valores(crudas: dict, similitud: np.ndarray, ref: Referencia) -> dict:
    """Valor numerico de cada senal P1..P9."""
    return {
        "P1": crudas["inicio_doy"] - ref.mediana_inicio[:, None],
        "P2": crudas["racha_canicula"],
        "P3": crudas["deficit_mm"],
        "P4": crudas["racha_max"],
        "P5": crudas["dias_calor_floracion"],
        "P6": crudas["estres_max"],
        "P7": crudas["indice_extremos"],
        "P8": similitud,
        "P9": crudas["pct_fuera_rango"],
    }


def _percentil(valor: np.ndarray, hist: np.ndarray) -> np.ndarray:
    """Percentil (0-100) de cada valor [N, A] dentro de la historia de su punto [N, n]."""
    v, h = valor[:, :, None], hist[:, None, :]
    n = np.isfinite(h).sum(-1)
    with np.errstate(invalid="ignore"):
        r = ((h < v).sum(-1) + 0.5 * (h == v).sum(-1)) / np.maximum(n, 1) * 100.0
    return np.where(np.isfinite(valor) & (n > 0), r, np.nan)


def calcular_senales(fechas: pd.DatetimeIndex, clima: dict, fis: dict, ref: Referencia, oni=None):
    """Senales P1..P10 por (serie, anio). Devuelve (anios, dict columna -> [N, n_anios])."""
    anios, crudas, vec = _crudas_anuales(fechas, clima, fis, ref, oni)
    sim = _coseno(_anomalia(vec, ref), ref.compuesto_nino[:, None, :])
    val = _valores(crudas, sim, ref)
    res, alguna = {}, np.zeros_like(val["P1"], dtype=bool)
    for k in ("P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"):
        pct = _percentil(val[k], ref.distribucion[k])
        regla = ACTIVACION[k]
        act = np.zeros_like(alguna)
        if "valor" in regla:
            act |= np.nan_to_num(val[k], nan=-np.inf) >= regla["valor"]
        if "percentil" in regla:
            act |= np.nan_to_num(pct, nan=-np.inf) >= regla["percentil"]
        if k == "P7":
            act |= np.nan_to_num(crudas["dias_lluvia_intensa"], nan=0) >= 3
        if k == "P8":  # si hay ONI, ademas debe ser fase calida
            act &= ~(np.isfinite(crudas["oni"]) & (crudas["oni"] < 0.5))
        if k == "P9":
            act |= np.nan_to_num(crudas["z_max"], nan=0) >= 4.5
        res[f"{k}_valor"], res[f"{k}_percentil"], res[f"{k}_activo"] = val[k], pct, act
        alguna |= act
    res["P10_valor"] = (~alguna).astype(float)
    res["P10_percentil"] = np.full_like(val["P1"], np.nan)
    res["P10_activo"] = ~alguna
    for k in ("inicio_doy", "lluvia_canicula_mm", "n_rachas_10d", "estres_inicial", "estres_desarrollo", "estres_media",
              "estres_final", "dias_lluvia_intensa", "lluvia_max_1d", "lluvia_max_3d", "viento_max", "dias_viento_fuerte",
              "oni", "z_max", "lluvia_temporada_mm", "cobertura_temporada"):
        res[k] = crudas[k]
    return anios, res


def senales_a_dataframe(puntos: list, anios: list, res: dict, redondeo: int = 3) -> pd.DataFrame:
    N, A = len(puntos), len(anios)
    d = {"punto": np.repeat(np.array(puntos, dtype=object), A), "temporada": np.tile(np.array(anios), N)}
    for k, v in res.items():
        a = np.asarray(v).reshape(-1)
        d[k] = np.round(a, redondeo) if a.dtype.kind == "f" else a
    return pd.DataFrame(d)
