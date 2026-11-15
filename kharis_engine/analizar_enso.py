"""Cuanto aporta El Nino (ONI) al pronostico de temporada? Validacion cruzada dejando un anio fuera.

Para cada punto, variable, mes objetivo y adelanto (1-12 meses) se ajusta la anomalia mensual frente al ONI
conocido el dia de emision (el panel ya trae el ONI con su retraso de publicacion):
    anomalia(mes objetivo) = g[punto, variable, mes objetivo, adelanto] * ONI(emision)
con encogimiento por su estadistico t (coeficientes ruidosos tienden a 0). La lluvia va en anomalia relativa.

Se ajusta y valida SOLO dentro de 1996-2020: cada anio se predice con lo aprendido sin ese anio (incluida la
climatologia). Si no mejora a la climatologia en esta validacion, no se usa. Con --congelada, ademas, ajusta
con 1996-2020 completo y mide 2021-2026 una sola vez.

  ..\\.venv_kharis\\Scripts\\python.exe analizar_enso.py [--congelada]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from kharis import data_pipeline as D

RAIZ = Path(__file__).resolve().parent
VARIABLES = ["T2M_MAX", "T2M_MIN", "T2M", "PRECTOTCORR", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN"]
RELATIVAS = {"PRECTOTCORR"}
ADELANTOS = range(1, 13)


def mensual(panel):
    """Medias mensuales [P, V, n_meses] (NaN si faltan mas de 10 dias) y ONI de emision [n_meses] (dia 1 del mes)."""
    meses = panel.fechas.to_period("M")
    unicos = meses.unique()
    P = len(panel.puntos)
    M = np.full((P, len(VARIABLES), len(unicos)), np.nan)
    codigos = pd.Index(unicos).get_indexer(meses)
    for j, v in enumerate(VARIABLES):
        x = panel.valores[:, :, panel.idx(v)].astype(np.float64)
        for i in range(len(unicos)):
            sel = x[:, codigos == i]
            n = np.isfinite(sel).sum(1)
            M[:, j, i] = np.where(n >= sel.shape[1] - 10, np.nanmean(np.where(np.isfinite(sel), sel, np.nan), axis=1), np.nan)
    oni = panel.valores[:, :, panel.idx("oni")].astype(np.float64)
    oni = np.nanmean(oni, axis=0)
    primer = np.array([np.nonzero(codigos == i)[0][0] for i in range(len(unicos))])
    # ONI conocido el dia 1: ultimo valor finito hasta ese dia
    serie = pd.Series(oni).ffill().to_numpy()
    return M, serie[primer], unicos


def anomalias(M, mes_cal, entren):
    """Climatologia mensual (solo meses `entren`) y anomalias. Lluvia relativa."""
    P, V, N = M.shape
    clim = np.full((P, V, 12), np.nan)
    for m in range(12):
        sel = entren & (mes_cal == m)
        clim[:, :, m] = np.nanmean(M[:, :, sel], axis=2)
    base = clim[:, :, mes_cal]
    A = M - base
    for j, v in enumerate(VARIABLES):
        if v in RELATIVAS:
            A[:, j] = np.clip(M[:, j] / np.maximum(base[:, j], 0.1) - 1.0, -1.0, 3.0)
    return A, clim


def ajustar(A, oni, mes_cal, entren):
    """g[P, V, 12 meses objetivo, 12 adelantos] con encogimiento por t."""
    P, V, N = A.shape
    g = np.zeros((P, V, 12, 12))
    for k in ADELANTOS:
        e = np.arange(N - k)                       # emision
        o = e + k                                  # objetivo
        ok_t = entren[e] & entren[o] & np.isfinite(oni[e])
        for m in range(12):
            sel = ok_t & (mes_cal[o] == m)
            if sel.sum() < 8:
                continue
            x = oni[e[sel]]                         # [n]
            y = A[:, :, o[sel]]                    # [P, V, n]
            okv = np.isfinite(y)
            xx = np.where(okv, x[None, None, :], 0.0)
            yy = np.where(okv, y, 0.0)
            sxx, sxy, n = (xx**2).sum(-1), (xx * yy).sum(-1), okv.sum(-1)
            b = sxy / np.maximum(sxx, 1e-9)
            res = np.where(okv, yy - b[..., None] * xx, 0.0)
            s2 = (res**2).sum(-1) / np.maximum(n - 1, 1)
            se = np.sqrt(s2 / np.maximum(sxx, 1e-9))
            t2 = (b / np.maximum(se, 1e-9)) ** 2
            g[:, :, m, k - 1] = np.where(n >= 8, b * np.clip(1 - 1 / np.maximum(t2, 1e-9), 0, 1), 0.0)
    return g


def evaluar(A, oni, mes_cal, prueba, g):
    """Errores absolutos de anomalia (ENSO vs climatologia = 0) por variable y adelanto."""
    P, V, N = A.shape
    err = {v: {k: [[], []] for k in ADELANTOS} for v in VARIABLES}
    for k in ADELANTOS:
        e = np.arange(N - k)
        o = e + k
        sel = prueba[o] & np.isfinite(oni[e])
        if not sel.any():
            continue
        pron = g[:, :, mes_cal[o[sel]], k - 1] * oni[e[sel]][None, None, :]
        y = A[:, :, o[sel]]
        for j, v in enumerate(VARIABLES):
            ok = np.isfinite(y[:, j])
            err[v][k][0].extend(np.abs(y[:, j][ok] - pron[:, j][ok]).tolist())
            err[v][k][1].extend(np.abs(y[:, j][ok]).tolist())
    return err


def resumir(err):
    out = {}
    for v in VARIABLES:
        fila = {}
        for nombre, ks in (("1-3 meses", range(1, 4)), ("4-6 meses", range(4, 7)), ("7-12 meses", range(7, 13))):
            a = sum((err[v][k][0] for k in ks), [])
            b = sum((err[v][k][1] for k in ks), [])
            fila[nombre] = round(1 - np.mean(a) / np.mean(b), 4) if a else None
        out[v] = fila
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--congelada", action="store_true", help="ajusta con 1996-2020 y mide 2021-2026 una sola vez")
    args = ap.parse_args()
    df, _ = D.limpiar(D.leer_varias([str(RAIZ / "datos" / "kharis_entrada.csv.gz")]))
    panel = D.panel_desde_df(df, inicio="1996-01-01")
    M, oni, meses = mensual(panel)
    anio = np.array([m.year for m in meses])
    mes_cal = np.array([m.month - 1 for m in meses])
    base = anio <= 2020

    # Validacion cruzada dejando un anio fuera, solo 1996-2020 (el anio fuera y su climatologia no se usan al ajustar)
    err_total = {v: {k: [[], []] for k in ADELANTOS} for v in VARIABLES}
    for Y in range(1996, 2021):
        entren = base & (anio != Y)
        A, _ = anomalias(M, mes_cal, entren)
        g = ajustar(A, oni, mes_cal, entren)
        e = evaluar(A, oni, mes_cal, anio == Y, g)
        for v in VARIABLES:
            for k in ADELANTOS:
                for i in (0, 1):
                    err_total[v][k][i].extend(e[v][k][i])
    cv = resumir(err_total)
    res = {"metodo": "anomalia mensual = g * ONI de emision, por punto, variable, mes y adelanto, encogida por t",
           "validacion_cruzada_1996_2020": cv}
    print("Validacion cruzada 1996-2020 (skill del ENSO frente a la climatologia en el promedio mensual; + es mejor):")
    for v, fila in cv.items():
        print(f"  {v:>18}: " + " | ".join(f"{k} {x:+.1%}" for k, x in fila.items()))

    if args.congelada:
        A, _ = anomalias(M, mes_cal, base)
        g = ajustar(A, oni, mes_cal, base)
        e = evaluar(A, oni, mes_cal, anio >= 2021, g)
        cong = resumir(e)
        res["congelada_2021_2026"] = cong
        print("\nPrueba congelada 2021-2026 (ajustado con 1996-2020, medido una vez):")
        for v, fila in cong.items():
            print(f"  {v:>18}: " + " | ".join(f"{k} {x:+.1%}" for k, x in fila.items()))
    salida = RAIZ / "reports" / "enso_validacion.json"
    salida.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(f"-> {salida}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
    sys.stdout.flush()
    os._exit(0)
