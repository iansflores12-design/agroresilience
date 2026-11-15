"""Ajusta los pesos de la mezcla con la climatologia (cfg.mezcla_media y cfg.mezcla_cuantiles).

Protocolo sin fuga: se usa un motor entrenado SOLO hasta 2016 (otra carpeta) y se eligen los pesos con sus
predicciones de 2017-2020, que no vio. La climatologia de referencia tambien es la de 1996-2016. Nada de
2021 en adelante entra aqui: ese periodo queda intacto para la prueba congelada.

  ..\\.venv_kharis\\Scripts\\python.exe ajustar_mezcla.py --artefactos ..\\respaldos\\exp_hasta_2016\\artefactos
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

from kharis import config as C
from kharis import continuous as K
from kharis import data_pipeline as D
from kharis import train_eval as TE
from kharis.device import seleccionar_dispositivo
from kharis.model import Calibrador

RAIZ = Path(__file__).resolve().parent
GRILLA = np.round(np.arange(0.0, 1.0001, 0.05), 2)


def pinball(q, y, niveles):
    d = y[..., None] - q
    return np.nanmean(np.maximum(niveles * d, (niveles - 1) * d))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--artefactos", required=True, help="artefactos/ del motor entrenado hasta 2016")
    a.add_argument("--version", default="v001")
    a.add_argument("--desde", default="2017-01-01")
    a.add_argument("--hasta", default="2020-12-31")
    a.add_argument("--salida", default=str(RAIZ / "reports" / "mezcla_ajuste.json"))
    args = a.parse_args()

    paq = K.Registro(Path(args.artefactos)).cargar(args.version)
    cfg = C.KharisConfig.desde_dict(paq["cfg"])
    cfg.mezcla_media, cfg.mezcla_cuantiles = [], []          # se ajusta sobre la prediccion sin mezclar
    if cfg.fin_entrenamiento >= args.desde:
        sys.exit(f"El motor se entreno hasta {cfg.fin_entrenamiento}: no sirve para ajustar con {args.desde}-{args.hasta}.")
    dev = seleccionar_dispositivo("auto", "auto")
    if paq["meta"].get("precision"):
        dev = dev.con_precision(paq["meta"]["precision"])
    df, _ = D.limpiar(D.leer_varias([str(RAIZ / "datos" / "kharis_entrada.csv.gz")]))
    panel = D.panel_desde_df(df, inicio=cfg.inicio_datos)
    ctx = TE.preparar_contexto(panel, cfg, dev, paq)
    p, t = ctx.vent.origenes(panel.t(args.desde), panel.t(args.hasta))
    r = TE.predecir(TE.modelo_de_paquete(paq, dev), ctx, p, t)
    pred, cuant = TE.calibrar(r, Calibrador.desde_dict(paq["calibrador"]), cfg.objetivos)
    dias = t[:, None] + np.arange(1, cfg.horizonte + 1)[None, :]
    doy = panel.fechas.dayofyear.to_numpy()[dias] - 1
    cm = ctx.lb.media[p[:, None], doy]
    cq = ctx.clim_q[p[:, None], doy]
    niveles = np.asarray(cfg.cuantiles)
    H, V = cfg.horizonte, len(cfg.objetivos)
    wm, wq = np.ones((H, V)), np.ones((H, V))
    detalle = {}
    for j, v in enumerate(cfg.objetivos):
        detalle[v] = []
        for h in range(H):
            y = r["obs"][:, h, j].astype(np.float64)
            ok = np.isfinite(y) & np.isfinite(cm[:, h, j])
            y, pr, mc = y[ok], pred[ok, h, j].astype(np.float64), cm[ok, h, j].astype(np.float64)
            qk, qc = cuant[ok, h, j].astype(np.float64), cq[ok, h, j].astype(np.float64)
            mse = [np.mean((w * pr + (1 - w) * mc - y) ** 2) for w in GRILLA]
            qs = [pinball(w * qk + (1 - w) * qc, y, niveles) for w in GRILLA]
            wm[h, j], wq[h, j] = GRILLA[int(np.argmin(mse))], GRILLA[int(np.argmin(qs))]
            detalle[v].append({"h": h + 1, "w_media": float(wm[h, j]), "w_cuantiles": float(wq[h, j]),
                               "mse_red": float(mse[-1]), "mse_mezcla": float(min(mse)), "mse_clim": float(mse[0]),
                               "qs_red": float(qs[-1]), "qs_mezcla": float(min(qs)), "qs_clim": float(qs[0])})
    # Regularizacion: a mas horizonte la red nunca pesa mas que a menos (minimo acumulado).
    wm, wq = np.minimum.accumulate(wm, axis=0), np.minimum.accumulate(wq, axis=0)
    res = {"motor": args.artefactos, "entrenado_hasta": cfg.fin_entrenamiento, "ajuste": [args.desde, args.hasta], "n_origenes": int(len(p)),
           "objetivos": cfg.objetivos, "mezcla_media": np.round(wm, 2).tolist(), "mezcla_cuantiles": np.round(wq, 2).tolist(), "detalle": detalle}
    Path(args.salida).write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(f"origenes: {len(p):,} ({args.desde} a {args.hasta}), motor entrenado hasta {cfg.fin_entrenamiento}")
    print("peso de la red por horizonte (media | cuantiles):")
    for j, v in enumerate(cfg.objetivos):
        print(f"  {v:>18}: " + "  ".join(f"{wm[h, j]:.2f}|{wq[h, j]:.2f}" for h in range(H)))
    print(f"-> {args.salida}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code, file=sys.stderr)
        sys.stdout.flush()
        os._exit(0 if e.code in (None, 0) else 1)
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
    sys.stdout.flush()
    os._exit(0)
