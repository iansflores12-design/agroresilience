"""Evaluacion probabilistica de la lluvia (prueba congelada 2021-2026).

El MAE castiga mal a la lluvia: premia predecir poco. Para un pronostico de lluvia se usan las metricas
de la OMM para pronosticos probabilisticos:

- Brier skill score (BSS) para "llueve >= u mm" con u = 1, 10, 20 y 50 mm.
- Skill del puntaje de cuantiles (promedio de la perdida pinball sobre los niveles; aproxima el CRPS).
- Area bajo la curva ROC para lluvia >= 20 mm.

Referencia: la climatologia del punto y la fecha (+-15 dias) calculada SOLO con 1996-2020.
Modelo: el que esta congelado al 31-12-2020 (por defecto v001). Nada posterior a 2020 ajusta nada.

  ..\\.venv_kharis\\Scripts\\python.exe evaluar_probabilistico.py [--version v001] [--salida reports/lluvia_probabilistica.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

from kharis import config as C
from kharis import continuous as K
from kharis import data_pipeline as D
from kharis import train_eval as TE
from kharis.device import seleccionar_dispositivo
from kharis.model import Calibrador

RAIZ = Path(__file__).resolve().parent
UMBRALES = (1.0, 10.0, 20.0, 50.0)
VENTANA_DOY = 15


def cargar_panel(cfg):
    ruta = RAIZ / "datos" / "kharis_entrada.csv.gz"
    df, _ = D.limpiar(D.leer_varias([str(ruta)]))
    return D.panel_desde_df(df, inicio=cfg.inicio_datos)


def prob_desde_cuantiles(cuant: np.ndarray, niveles: np.ndarray, u: float) -> np.ndarray:
    """P(Y >= u) interpolando la funcion de distribucion entre los cuantiles. cuant [..., Q] ordenados."""
    q = np.maximum.accumulate(cuant, axis=-1)
    # nivel tau con q_tau = u, interpolado linealmente; bajo q05 baja hasta 0 en Y = 0, sobre q99 se acota.
    tau = np.empty(q.shape[:-1], dtype=np.float64)
    debajo = u <= q[..., 0]
    tau[debajo] = (niveles[0] * np.clip(u / np.maximum(q[..., 0], 1e-6), 0, 1))[debajo]
    encima = u >= q[..., -1]
    tau[encima] = 0.995
    medio = ~(debajo | encima)
    if medio.any():
        qm = q[medio]
        k = np.clip((qm < u).sum(axis=-1), 1, len(niveles) - 1)
        q0, q1 = np.take_along_axis(qm, (k - 1)[:, None], -1)[:, 0], np.take_along_axis(qm, k[:, None], -1)[:, 0]
        t0, t1 = niveles[k - 1], niveles[k]
        f = np.where(q1 > q0, (u - q0) / np.maximum(q1 - q0, 1e-9), 0.5)
        tau[medio] = t0 + f * (t1 - t0)
    return 1.0 - tau


def climatologia(lluvia: np.ndarray, doy: np.ndarray, t_fin: int, niveles: np.ndarray):
    """Por punto y dia del anio (+-15 dias), solo con t <= t_fin: probabilidades de cada umbral y cuantiles."""
    P = lluvia.shape[0]
    prob = np.full((P, 366, len(UMBRALES)), np.nan)
    cuan = np.full((P, 366, len(niveles)), np.nan)
    d_ent = doy[: t_fin + 1]
    ll = lluvia[:, : t_fin + 1]
    for d in range(366):
        dist = np.abs(d_ent - d)
        dist = np.minimum(dist, 366 - dist)
        sel = ll[:, dist <= VENTANA_DOY]
        for i, u in enumerate(UMBRALES):
            ok = np.isfinite(sel)
            prob[:, d, i] = np.where(ok, sel >= u, False).sum(1) / np.maximum(ok.sum(1), 1)
        cuan[:, d, :] = np.nanquantile(sel, niveles, axis=1).T
    return prob, cuan


def brier(p, o):
    ok = np.isfinite(p) & np.isfinite(o)
    return float(np.mean((p[ok] - o[ok]) ** 2))


def auc(p, o):
    ok = np.isfinite(p) & np.isfinite(o)
    p, o = p[ok], o[ok].astype(bool)
    n1, n0 = o.sum(), (~o).sum()
    if n1 == 0 or n0 == 0:
        return float("nan")
    orden = np.argsort(p, kind="mergesort")
    rangos = np.empty(len(p))
    rangos[orden] = np.arange(1, len(p) + 1)
    return float((rangos[o].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def pinball(q, y, niveles):
    """Promedio de la perdida pinball sobre los niveles. q [..., Q], y [...]."""
    d = y[..., None] - q
    l = np.maximum(niveles * d, (niveles - 1) * d)
    return float(np.nanmean(l))


def fiabilidad(p, o, bins=10):
    ok = np.isfinite(p) & np.isfinite(o)
    p, o = p[ok], o[ok]
    filas = []
    for i in range(bins):
        m = (p >= i / bins) & (p < (i + 1) / bins if i < bins - 1 else p <= 1)
        if m.sum() >= 50:
            filas.append({"prob_pronosticada": round(float(p[m].mean()), 3), "frecuencia_real": round(float(o[m].mean()), 3), "n": int(m.sum())})
    return filas


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--version", default="v001")
    a.add_argument("--salida", default=str(RAIZ / "reports" / "lluvia_probabilistica.json"))
    a.add_argument("--artefactos", default=str(RAIZ / "artefactos"))
    a.add_argument("--sin-mezcla", action="store_true", help="evalua la red sola, sin mezclar con la climatologia")
    args = a.parse_args()
    t_ini = time.time()

    registro = K.Registro(Path(args.artefactos))
    paq = registro.cargar(args.version)
    cfg = C.KharisConfig.desde_dict(paq["cfg"])
    dev = seleccionar_dispositivo("auto", "auto")
    if paq["meta"].get("precision"):
        dev = dev.con_precision(paq["meta"]["precision"])
    panel = cargar_panel(cfg)
    ctx = TE.preparar_contexto(panel, cfg, dev, paq)
    if paq["meta"].get("datos_hasta") and str(paq["meta"]["datos_hasta"]) > cfg.fin_entrenamiento:
        sys.exit(f"La version {args.version} vio datos hasta {paq['meta']['datos_hasta']}: no sirve para la prueba congelada.")

    modelo = TE.modelo_de_paquete(paq, dev)
    p, t = ctx.vent.origenes(ctx.t_bt_ini, ctx.t_bt_fin)
    r = TE.predecir(modelo, ctx, p, t)
    pred, cuant = TE.calibrar(r, Calibrador.desde_dict(paq["calibrador"]), cfg.objetivos, None if args.sin_mezcla else ctx)
    j = cfg.objetivos.index("PRECTOTCORR")
    niveles = np.asarray(cfg.cuantiles, dtype=np.float64)
    obs = r["obs"][:, :, j].astype(np.float64)
    cq = cuant[:, :, j, :].astype(np.float64)

    doy = panel.fechas.dayofyear.to_numpy() - 1
    lluvia = panel.valores[:, :, panel.idx("PRECTOTCORR")].astype(np.float64)
    prob_clim, cuan_clim = climatologia(lluvia, doy, ctx.t_train_fin, niveles)
    dias = t[:, None] + np.arange(1, cfg.horizonte + 1)[None, :]
    d_obj = doy[dias]
    pc = prob_clim[p[:, None], d_obj]          # [N, H, U]
    qc = cuan_clim[p[:, None], d_obj]          # [N, H, Q]

    res = {"version": args.version, "entrenado_hasta": cfg.fin_entrenamiento, "periodo": [str(panel.fechas[ctx.t_bt_ini].date()), str(panel.fechas[ctx.t_bt_fin].date())],
           "n_origenes": int(len(p)), "referencia": f"climatologia 1996-2020 del punto, +-{VENTANA_DOY} dias", "por_horizonte": {}}
    for nombre, hs in (("1 dia", [0]), ("1 a 7 dias", list(range(cfg.horizonte))), ("7 dias", [cfg.horizonte - 1])):
        o, cqh, qch, pch = obs[:, hs], cq[:, hs], qc[:, hs], pc[:, hs]
        fila = {}
        for i, u in enumerate(UMBRALES):
            ev = np.where(np.isfinite(o), (o >= u).astype(np.float64), np.nan)
            pk = prob_desde_cuantiles(cqh, niveles, u)
            bk, bc = brier(pk, ev), brier(pch[..., i], ev)
            fila[f">= {u:g} mm"] = {"frecuencia": round(float(np.nanmean(ev)), 4), "brier_kharis": round(bk, 5), "brier_climatologia": round(bc, 5),
                                    "BSS": round(1 - bk / bc, 4) if bc > 0 else None,
                                    "AUC_kharis": round(auc(pk, ev), 4), "AUC_climatologia": round(auc(pch[..., i], ev), 4)}
            if u == 20.0 and nombre == "1 dia":
                fila[f">= {u:g} mm"]["fiabilidad"] = fiabilidad(pk, ev)
        qs_k, qs_c = pinball(cqh, o, niveles), pinball(qch, o, niveles)
        fila["puntaje_cuantiles"] = {"kharis": round(qs_k, 4), "climatologia": round(qs_c, 4), "skill": round(1 - qs_k / qs_c, 4)}
        res["por_horizonte"][nombre] = fila
    # Todas las variables: skill del puntaje de cuantiles y del RMSE de la media frente a la climatologia 1996-2020.
    dias_d = t[:, None] + np.arange(1, cfg.horizonte + 1)[None, :]
    doy_d = doy[dias_d]
    cmv, cqv = ctx.lb.media[p[:, None], doy_d], ctx.clim_q[p[:, None], doy_d]
    res["mezcla"] = not args.sin_mezcla
    res["todas"] = {}
    for jv, v in enumerate(cfg.objetivos):
        fila = {}
        for nombre, hs in (("1 dia", [0]), ("1 a 7 dias", list(range(cfg.horizonte))), ("7 dias", [cfg.horizonte - 1])):
            o = r["obs"][:, hs, jv].astype(np.float64)
            qs_k, qs_c = pinball(cuant[:, hs, jv].astype(np.float64), o, niveles), pinball(cqv[:, hs, jv].astype(np.float64), o, niveles)
            ek, ec = pred[:, hs, jv] - o, cmv[:, hs, jv] - o
            rk, rc = float(np.sqrt(np.nanmean(ek**2))), float(np.sqrt(np.nanmean(ec**2)))
            fila[nombre] = {"skill_cuantiles": round(1 - qs_k / qs_c, 4), "skill_rmse": round(1 - rk / rc, 4),
                            "MAE": round(float(np.nanmean(np.abs(ek))), 4), "MAE_clim": round(float(np.nanmean(np.abs(ec))), 4)}
        res["todas"][v] = fila
    print("\nTodas las variables (skill frente a la climatologia 1996-2020; + es mejor):")
    for v, fila in res["todas"].items():
        print(f"  {v:>18}: " + " | ".join(f"{k}: cuantiles {x['skill_cuantiles']:+.1%}, RMSE {x['skill_rmse']:+.1%}" for k, x in fila.items()))
    res["segundos"] = round(time.time() - t_ini, 1)
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    Path(args.salida).write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    for nombre, fila in res["por_horizonte"].items():
        print(f"\n[{nombre}]")
        for k, v in fila.items():
            if k == "puntaje_cuantiles":
                print(f"  puntaje de cuantiles: Kharis {v['kharis']} | climatologia {v['climatologia']} | skill {v['skill']:+.1%}")
            else:
                print(f"  {k:>9}: frecuencia {v['frecuencia']:.3f} | BSS {v['BSS']:+.1%} | AUC {v['AUC_kharis']:.3f} (clim {v['AUC_climatologia']:.3f})")
    print(f"\n-> {args.salida} ({res['segundos']} s)")


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
