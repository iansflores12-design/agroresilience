"""El Nino en el pronostico de temporada: anomalia mensual esperada segun el ONI del dia de emision.

anomalia(mes objetivo) = g[punto, variable, mes objetivo, adelanto] * ONI(emision), con g ajustado SOLO con
el periodo base y encogido por su estadistico t. La validacion cruzada dejando un anio fuera (analizar_enso.py,
reports/enso_validacion.json) mostro que ayuda en las temperaturas hasta 6 meses y no en lluvia, viento,
humedad ni radiacion: por eso solo se aplica a `cfg.enso_variables` y hasta `cfg.enso_meses_max`.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

RELATIVAS = {"PRECTOTCORR"}


def mensual(panel, variables: list):
    """Medias mensuales [P, V, n_meses] (NaN si faltan mas de 10 dias), ONI conocido el dia 1 de cada mes y los meses."""
    meses = panel.fechas.to_period("M")
    unicos = meses.unique()
    codigos = pd.Index(unicos).get_indexer(meses)
    P = len(panel.puntos)
    M = np.full((P, len(variables), len(unicos)), np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for j, v in enumerate(variables):
            x = panel.valores[:, :, panel.idx(v)].astype(np.float64)
            for i in range(len(unicos)):
                sel = x[:, codigos == i]
                n = np.isfinite(sel).sum(1)
                M[:, j, i] = np.where(n >= sel.shape[1] - 10, np.nanmean(sel, axis=1), np.nan)
        oni = np.nanmean(panel.valores[:, :, panel.idx("oni")].astype(np.float64), axis=0)
    serie = pd.Series(oni).ffill().to_numpy()
    primer = np.array([np.nonzero(codigos == i)[0][0] for i in range(len(unicos))])
    return M, serie[primer], unicos


def anomalias(M, mes_cal, entren, variables: list):
    """Anomalias frente a la climatologia mensual de los meses `entren` (la lluvia, relativa)."""
    P, V, _ = M.shape
    clim = np.full((P, V, 12), np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for m in range(12):
            clim[:, :, m] = np.nanmean(M[:, :, entren & (mes_cal == m)], axis=2)
    base = clim[:, :, mes_cal]
    A = M - base
    for j, v in enumerate(variables):
        if v in RELATIVAS:
            A[:, j] = np.clip(M[:, j] / np.maximum(base[:, j], 0.1) - 1.0, -1.0, 3.0)
    return A


def ajustar(A, oni, mes_cal, entren, max_adelanto: int = 12):
    """g[P, V, 12 meses objetivo, max_adelanto] por minimos cuadrados sin intercepto, encogido por t."""
    P, V, N = A.shape
    g = np.zeros((P, V, 12, max_adelanto))
    for k in range(1, max_adelanto + 1):
        e = np.arange(N - k)
        o = e + k
        ok_t = entren[e] & entren[o] & np.isfinite(oni[e])
        for m in range(12):
            sel = ok_t & (mes_cal[o] == m)
            if sel.sum() < 8:
                continue
            x, y = oni[e[sel]], A[:, :, o[sel]]
            okv = np.isfinite(y)
            xx, yy = np.where(okv, x[None, None, :], 0.0), np.where(okv, y, 0.0)
            sxx, sxy, n = (xx**2).sum(-1), (xx * yy).sum(-1), okv.sum(-1)
            b = sxy / np.maximum(sxx, 1e-9)
            s2 = (np.where(okv, yy - b[..., None] * xx, 0.0) ** 2).sum(-1) / np.maximum(n - 1, 1)
            t2 = (b / np.maximum(np.sqrt(s2 / np.maximum(sxx, 1e-9)), 1e-9)) ** 2
            g[:, :, m, k - 1] = np.where(n >= 8, b * np.clip(1 - 1 / np.maximum(t2, 1e-9), 0, 1), 0.0)
    return g


def coeficientes(panel, objetivos: list, t_fin: int, variables_enso: list, max_meses: int):
    """g[P, V_obj, 12, max_meses] ajustado con los meses completos hasta `t_fin`; ceros fuera de `variables_enso`.
    None si no hay ONI o no hay nada que ajustar."""
    if max_meses <= 0 or "oni" not in panel.variables or not set(variables_enso) & set(objetivos):
        return None
    M, oni, meses = mensual(panel, objetivos)
    fin = pd.Timestamp(panel.fechas[t_fin]).to_period("M")
    entren = np.array([m < fin or (m == fin and pd.Timestamp(panel.fechas[t_fin]).is_month_end) for m in meses])
    mes_cal = np.array([m.month - 1 for m in meses])
    g = ajustar(anomalias(M, mes_cal, entren, objetivos), oni, mes_cal, entren, max_meses)
    for j, v in enumerate(objetivos):
        if v not in variables_enso:
            g[:, j] = 0.0
    return g.astype(np.float32)


def anomalia_diaria(g, oni_emision: float, fecha_emision, fechas_obj) -> np.ndarray:
    """Anomalia esperada [P, D, V] para cada dia objetivo (0 en el mes de emision y mas alla del ultimo adelanto)."""
    P, V, _, K = g.shape
    fechas_obj = pd.DatetimeIndex(fechas_obj)
    salida = np.zeros((P, len(fechas_obj), V), dtype=np.float32)
    if not np.isfinite(oni_emision):
        return salida
    e = pd.Timestamp(fecha_emision)
    k = (fechas_obj.year - e.year) * 12 + (fechas_obj.month - e.month)
    for i, (kk, mes) in enumerate(zip(k, fechas_obj.month - 1)):
        if 1 <= kk <= K:
            salida[:, i] = g[:, :, mes, kk - 1] * oni_emision
    return salida
