"""Protocolo experimental: entrenamiento base, backtesting walk-forward con ajuste fino, pruebas de estres
historico y pronostico operativo (clima + fisica + senales P1-P10)."""
from __future__ import annotations

import copy
import math
import time
import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import torch

from . import config as C
from . import data_pipeline as D
from . import enso as ENSO
from . import physics as F
from .device import Cronometro, Dispositivo, memoria, reiniciar_pico
from .model import Calibrador, crear_modelo, crear_perdida


# =========================================================================== contexto
@dataclass
class Contexto:
    cfg: C.KharisConfig
    panel: D.Panel
    lb: D.LineaBase
    esc: D.Escalador
    vent: D.Ventanas
    dev: Dispositivo
    t_train_fin: int
    t_val_ini: int
    t_bt_ini: int
    t_bt_fin: int
    ix_obj: list
    ix_exo: list = field(default_factory=list)   # [(canales de valor, canal de mascara)]
    masc_ruido: torch.Tensor | None = None       # [F] 1 en canales continuos, 0 en mascaras y ciclicas
    clim_q: np.ndarray | None = None             # [P, 366, nT, Q] cuantiles climatologicos del periodo base
    enso_g: np.ndarray | None = None             # [P, nT, 12, K] respuesta mensual al ONI (kharis/enso.py)

    @property
    def n_features(self) -> int:
        return len(self.esc.nombres_x)


def preparar_contexto(panel: D.Panel, cfg: C.KharisConfig, dev: Dispositivo, paquete: dict | None = None) -> Contexto:
    """Arma features, escalado y ventanas. Con `paquete` reutiliza linea base y escalado ya ajustados (sin fuga)."""
    T = len(panel.fechas)
    f_fin = pd.Timestamp(cfg.fin_entrenamiento)
    if panel.fechas[-1] <= f_fin + pd.Timedelta(days=cfg.seq_len + cfg.horizonte + 30):
        t_train_fin = int(T * 0.85)
        print(f"[datos] aviso: la serie no pasa de {cfg.fin_entrenamiento}; se entrena con el primer 85% ({panel.fechas[t_train_fin].date()})")
    else:
        t_train_fin = panel.t(f_fin)
    n_val = int(round(365.25 * cfg.anios_validacion))
    t_val_ini = max(t_train_fin - n_val + 1, int(t_train_fin * 0.6))
    t_bt_ini, t_bt_fin = t_train_fin + 1, min(panel.t(cfg.fin_backtest), T - 1)
    if paquete is None:
        D.resolver_variables(panel, t_train_fin, cfg)
        lb = D.ajustar_linea_base(panel, cfg.objetivos, t_train_fin)
    else:
        lb = D.LineaBase.desde_dict(paquete["linea_base"]).alinear(panel.puntos)
    crudo, nombres, libres = D.construir_features(panel.valores, panel.variables, panel.fechas, panel.estatico, lb, cfg.objetivos, cfg.exogenas)
    esc = D.ajustar_escalador(crudo, nombres, libres, cfg.objetivos, t_train_fin) if paquete is None else D.Escalador.desde_dict(paquete["escalador"])
    if list(esc.nombres_x) != list(nombres):
        raise ValueError("Las columnas de los datos no coinciden con las del modelo guardado.")
    ix_obj = [panel.idx(v) for v in cfg.objetivos]
    X, Y = esc.x(crudo), esc.y(panel.valores[:, :, ix_obj])
    if paquete is None:
        lb.media_esc = D.climatologia_escalada(Y, panel.fechas, t_train_fin)
    vent = D.Ventanas(X, Y, lb, esc, cfg, dev.device, panel.fechas.dayofyear.to_numpy() - 1)
    ix_exo = []
    for v in cfg.exogenas:
        vals = [nombres.index(v)] + ([nombres.index("d_oni90")] if v == "oni" and "d_oni90" in nombres else [])
        ix_exo.append((vals, nombres.index(f"m_{v}")))
    continuo = [not (n.startswith("m_") or n in ("sin_doy", "cos_doy", "sin_mes", "cos_mes")) for n in nombres]
    masc = torch.as_tensor(continuo, dtype=torch.float32, device=dev.device)
    clim_q = D.cuantiles_climatologicos(panel, cfg.objetivos, t_train_fin, cfg.cuantiles)
    enso_g = ENSO.coeficientes(panel, cfg.objetivos, t_train_fin, cfg.enso_variables, cfg.enso_meses_max)
    return Contexto(cfg, panel, lb, esc, vent, dev, t_train_fin, t_val_ini, t_bt_ini, t_bt_fin, ix_obj, ix_exo, masc, clim_q, enso_g)


def a_tensor(ctx: Contexto, p, t):
    return torch.as_tensor(p, device=ctx.dev.device), torch.as_tensor(t, device=ctx.dev.device)


def ocultar_exogenas(ctx: Contexto, x: torch.Tensor, prob: float) -> torch.Tensor:
    """Aumentacion: oculta al azar entradas complementarias (valor y mascara a 0).
    Asi la red no depende de ellas y funciona igual cuando un satelite no llega o en el pronostico largo."""
    if prob <= 0 or not ctx.ix_exo:
        return x
    x = x.clone()
    for vals, masc in ctx.ix_exo:
        fuera = torch.rand(x.shape[0], device=x.device) < prob
        for c in vals + [masc]:
            x[fuera, :, c] = 0.0
    return x


# =========================================================================== prediccion y metricas
@torch.no_grad()
def predecir(modelo, ctx: Contexto, p: np.ndarray, t: np.ndarray, lote: int = 4096) -> dict:
    """Prediccion cruda (sin calibrar) en unidades fisicas para los origenes (p, t)."""
    modelo.eval()
    H, V, Q = ctx.cfg.horizonte, len(ctx.cfg.objetivos), len(ctx.cfg.cuantiles)
    pt, tt = a_tensor(ctx, p, t)
    preds, cuants = [], []
    for i in range(0, len(p), lote):
        x, _, base = ctx.vent.lote(pt[i:i + lote], tt[i:i + lote])
        with ctx.dev.autocast():
            pr, q = modelo(x, base)
        preds.append(pr.float().cpu().numpy())
        cuants.append(q.float().cpu().numpy())
    pred = np.concatenate(preds) if preds else np.zeros((0, H, V), np.float32)
    cuant = np.concatenate(cuants) if cuants else np.zeros((0, H, V, Q), np.float32)
    pred = ctx.esc.y_inv(pred)
    cuant = np.moveaxis(ctx.esc.y_inv(np.moveaxis(cuant, 2, 3)), 3, 2)
    dias = t[:, None] + np.arange(1, H + 1)[None, :]
    obs = ctx.panel.valores[p[:, None], dias][:, :, ctx.ix_obj]
    doy = ctx.panel.fechas.dayofyear.to_numpy()[dias] - 1
    clim = ctx.lb.media[p[:, None], doy]
    persist = np.repeat(ctx.panel.valores[p, t][:, None, ctx.ix_obj], H, axis=1)
    return {"pred": pred, "cuant": cuant, "obs": obs, "clim": clim, "persist": persist, "p": p, "t": t}


def calibrar(r: dict, cal: Calibrador | None, objetivos: list, ctx: "Contexto | None" = None):
    """Aplica calibracion (si hay) y coherencia fisica. Devuelve (pred, cuant).
    Con `ctx` y los origenes de `r` ("p", "t") tambien mezcla con la climatologia (ver `mezclar`)."""
    pred, cuant = (cal.aplicar(r["pred"], r["cuant"]) if cal is not None and cal.ajustado else (r["pred"], r["cuant"]))
    if ctx is not None and "p" in r and "t" in r:
        dias = r["t"][:, None] + np.arange(1, pred.shape[1] + 1)[None, :]
        doy = ctx.panel.fechas.dayofyear.to_numpy()[dias] - 1
        pred, cuant = mezclar(ctx, pred, cuant, r["p"], doy)
    pred = F.acoplar_fisica(pred, objetivos)
    cuant = np.moveaxis(F.acoplar_fisica(np.moveaxis(cuant, 2, 3), objetivos), 3, 2)
    return pred, cuant


def mezclar(ctx: "Contexto", pred: np.ndarray, cuant: np.ndarray, p_idx: np.ndarray, doy: np.ndarray):
    """Mezcla la prediccion con la climatologia del punto y la fecha, con un peso por dia de horizonte y variable.

    La red aporta mucho a 1 dia y casi nada a 7 en lluvia; sus cuantiles, en cambio, salen igual de estrechos a
    cualquier horizonte (demasiado seguros). La mezcla w * red + (1 - w) * climatologia (de los cuantiles, que
    sigue siendo una distribucion ordenada, y de la media) corrige eso. Los pesos (`cfg.mezcla_media`,
    `cfg.mezcla_cuantiles`, [H][V]) se ajustaron con un motor entrenado hasta 2016 y validado en 2017-2020: no
    usan nada de 2021 en adelante. Sin pesos no hace nada.
    pred [N, H, V], cuant [N, H, V, Q], p_idx [N], doy [N, H]."""
    wm, wq = ctx.cfg.mezcla_media, ctx.cfg.mezcla_cuantiles
    if not wm or not wq or ctx.clim_q is None:
        return pred, cuant
    H = pred.shape[1]
    wm = np.asarray(wm, dtype=np.float64)[:H][None]            # [1, H, V]
    wq = np.asarray(wq, dtype=np.float64)[:H][None, :, :, None]
    p2 = np.asarray(p_idx)[:, None]
    cm = ctx.lb.media[p2, doy]                                  # [N, H, V]
    cq = ctx.clim_q[p2, doy]                                    # [N, H, V, Q]
    cm = np.where(np.isfinite(cm), cm, pred)
    cq = np.where(np.isfinite(cq), cq, cuant)
    return (wm * pred + (1 - wm) * cm).astype(np.float32), (wq * cuant + (1 - wq) * cq).astype(np.float32)


def _corr(a, b):
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3:
        return float("nan")
    a, b = a[ok] - a[ok].mean(), b[ok] - b[ok].mean()
    den = math.sqrt(float((a**2).sum() * (b**2).sum()))
    return float((a * b).sum() / den) if den > 0 else float("nan")


def calcular_metricas(pred, cuant, r: dict, ctx: Contexto) -> dict:
    """MAE, RMSE, sesgo, correlacion, desempeno en extremos (>= p80 y >= p95), cobertura de picos y de cuantiles."""
    cfg = ctx.cfg
    obs, p = r["obs"], r["p"]
    q = list(cfg.cuantiles)
    res = {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for j, v in enumerate(cfg.objetivos):
            o, y = obs[:, :, j].astype(np.float64), pred[:, :, j].astype(np.float64)
            ok = np.isfinite(o) & np.isfinite(y)
            if ok.sum() == 0:
                continue
            e = np.where(ok, y - o, np.nan)
            t80, t95 = ctx.lb.pct["p80"][p, j][:, None], ctx.lb.pct["p95"][p, j][:, None]
            m80, m95 = ok & (o >= t80), ok & (o >= t95)
            pico_pred = ok & (y >= t95)
            m = {
                "MAE": np.nanmean(np.abs(e)), "RMSE": math.sqrt(np.nanmean(e**2)), "Bias": np.nanmean(e), "Corr": _corr(y, o),
                "MAE_h1": np.nanmean(np.abs(e[:, 0])), f"MAE_h{cfg.horizonte}": np.nanmean(np.abs(e[:, -1])),
                "MAE_p80": np.abs(e[m80]).mean() if m80.any() else np.nan, "Bias_p80": e[m80].mean() if m80.any() else np.nan,
                "MAE_p95": np.abs(e[m95]).mean() if m95.any() else np.nan, "Bias_p95": e[m95].mean() if m95.any() else np.nan,
                "RMSE_p95": math.sqrt((e[m95] ** 2).mean()) if m95.any() else np.nan,
                "cobertura_picos_p95": (y[m95] >= np.broadcast_to(t80, y.shape)[m95]).mean() if m95.any() else np.nan,
                "precision_picos_p95": (o[pico_pred] >= np.broadcast_to(t80, o.shape)[pico_pred]).mean() if pico_pred.any() else np.nan,
                "MAE_climatologia": np.nanmean(np.abs(np.where(ok, r["clim"][:, :, j] - o, np.nan))),
                "MAE_persistencia": np.nanmean(np.abs(np.where(ok, r["persist"][:, :, j] - o, np.nan))),
                "n": int(ok.sum()), "n_p95": int(m95.sum()),
            }
            m["skill_vs_climatologia"] = 1 - m["MAE"] / m["MAE_climatologia"] if m["MAE_climatologia"] > 0 else np.nan
            m["skill_vs_persistencia"] = 1 - m["MAE"] / m["MAE_persistencia"] if m["MAE_persistencia"] > 0 else np.nan
            # La media se juzga mejor con RMSE (en variables sesgadas como la lluvia, el MAE premia predecir cero)
            ec = np.where(ok, r["clim"][:, :, j] - o, np.nan)
            m["RMSE_climatologia"] = math.sqrt(np.nanmean(ec**2))
            m["skill_rmse_vs_climatologia"] = 1 - m["RMSE"] / m["RMSE_climatologia"] if m["RMSE_climatologia"] > 0 else np.nan
            m["skill_h1_vs_climatologia"] = 1 - m["MAE_h1"] / np.nanmean(np.abs(ec[:, 0])) if np.isfinite(ec[:, 0]).any() else np.nan
            m["skill_rmse_h1_vs_climatologia"] = 1 - math.sqrt(np.nanmean(e[:, 0] ** 2)) / math.sqrt(np.nanmean(ec[:, 0] ** 2)) \
                if np.isfinite(ec[:, 0]).any() else np.nan
            m["Corr_h1"] = _corr(y[:, 0], o[:, 0])
            if 0.5 in q:   # MAE usando la mediana predicha como pronostico puntual
                m["MAE_mediana"] = np.nanmean(np.abs(np.where(ok, cuant[:, :, j, q.index(0.5)] - o, np.nan)))
            if 0.9 in q:   # alerta por cuantil alto: el q90 predicho alcanza el umbral p80 cuando ocurre un extremo
                c90 = cuant[:, :, j, q.index(0.9)]
                m["cobertura_picos_p95_q90"] = (c90[m95] >= np.broadcast_to(t80, c90.shape)[m95]).mean() if m95.any() else np.nan
                m["tasa_alerta_q90"] = (c90[ok] >= np.broadcast_to(t80, c90.shape)[ok]).mean()   # con que frecuencia salta la alerta
            for nivel in (0.9, 0.95):
                if nivel in q:
                    c = cuant[:, :, j, q.index(nivel)]
                    m[f"cobertura_q{int(nivel * 100)}"] = (o[ok] <= c[ok]).mean()
                    m[f"cobertura_q{int(nivel * 100)}_en_p95"] = (o[m95] <= c[m95]).mean() if m95.any() else np.nan
            lo, hi = cuant[:, :, j, 0], cuant[:, :, j, q.index(0.95) if 0.95 in q else -1]
            m["cobertura_banda"] = ((o[ok] >= lo[ok]) & (o[ok] <= hi[ok])).mean()
            res[v] = {k: (round(float(x), 5) if isinstance(x, (float, np.floating)) else x) for k, x in m.items()}
    return res


def puntaje(pred, r: dict, ref_err: tuple, objetivos: list) -> float:
    """Error global normalizado: promedio entre variables de (MAE/MAE_ref + RMSE/RMSE_ref)/2. Menor es mejor.
    El RMSE entra para que una candidata que aplasta los picos no gane solo por bajar el MAE."""
    mae_ref, rmse_ref = ref_err
    s = []
    for j, v in enumerate(objetivos):
        e = pred[:, :, j].astype(np.float64) - r["obs"][:, :, j]
        if np.isfinite(e).any():
            mae, rmse = float(np.nanmean(np.abs(e))), math.sqrt(float(np.nanmean(e**2)))
            s.append(0.5 * (mae / max(mae_ref.get(v, 1.0), 1e-6) + rmse / max(rmse_ref.get(v, mae_ref.get(v, 1.0)), 1e-6)))
    return float(np.mean(s)) if s else float("nan")


# =========================================================================== entrenamiento
def _paso_entrenamiento(modelo, perdida, ctx, opt, escalador_amp, p, t, prob_ocultar):
    x, y, base = ctx.vent.lote(p, t)
    x = ocultar_exogenas(ctx, x, prob_ocultar)
    if ctx.cfg.ruido_entrada > 0:   # aumentacion: ruido leve en las entradas continuas, frena la memorizacion
        x = x + ctx.cfg.ruido_entrada * torch.randn_like(x) * ctx.masc_ruido
    e80, e95 = ctx.vent.extremos(p, y)
    opt.zero_grad(set_to_none=True)
    with ctx.dev.autocast():
        pred, cuant = modelo(x, base)
    comp = perdida(pred, cuant, y, e80, e95)
    escalador_amp.scale(comp["total"]).backward()
    escalador_amp.unscale_(opt)
    torch.nn.utils.clip_grad_norm_(modelo.parameters(), 1.0)
    escalador_amp.step(opt)
    escalador_amp.update()
    return comp


@torch.no_grad()
def evaluar_perdida(modelo, perdida, ctx: Contexto, p, t, lote: int = 4096) -> dict:
    modelo.eval()
    pt, tt = a_tensor(ctx, p, t)
    acum, n = {"total": 0.0, "base": 0.0, "cuantil": 0.0, "cola": 0.0}, 0
    for i in range(0, len(p), lote):
        pp, ts = pt[i:i + lote], tt[i:i + lote]
        x, y, base = ctx.vent.lote(pp, ts)
        with ctx.dev.autocast():
            pred, cuant = modelo(x, base)
        comp = perdida(pred, cuant, y, *ctx.vent.extremos(pp, y))
        for k in acum:
            acum[k] += float(comp[k]) * len(pp)
        n += len(pp)
    return {k: v / max(n, 1) for k, v in acum.items()}


def entrenar(ctx: Contexto, tb=None, al_mejorar=None):
    """Entrenamiento base (hasta fin_entrenamiento). Devuelve (modelo con los mejores pesos, historial)."""
    cfg, dev = ctx.cfg, ctx.dev
    fijar_semilla(cfg.semilla)
    modelo = crear_modelo(cfg, ctx.n_features).to(dev.device)
    perdida = crear_perdida(cfg).to(dev.device)
    p_tr, t_tr = ctx.vent.origenes(0, ctx.t_val_ini - 1)
    p_va, t_va = ctx.vent.origenes(ctx.t_val_ini, ctx.t_train_fin)
    if len(p_tr) == 0 or len(p_va) == 0:
        raise ValueError("No hay suficientes dias para armar ventanas de entrenamiento y validacion.")
    ptr, ttr = a_tensor(ctx, p_tr, t_tr)
    pasos = max(1, min(cfg.pasos_por_epoca, math.ceil(len(p_tr) / cfg.lote)))
    opt = torch.optim.AdamW(modelo.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=cfg.lr, total_steps=cfg.epocas * pasos, pct_start=0.15)
    amp = dev.scaler()
    sub = np.linspace(0, len(p_va) - 1, min(len(p_va), 20000)).astype(int)   # muestra fija de validacion para metricas
    print(f"[entrenar] ventanas: {len(p_tr):,} entrenamiento, {len(p_va):,} validacion | {pasos} pasos/epoca, lote {cfg.lote} | {dev.resumen()}")
    if tb is not None:
        x0, _, b0 = ctx.vent.lote(ptr[:2], ttr[:2])
        tb.grafo(modelo, (x0, b0))
    historial, mejor, mejor_estado, sin_mejora, paso_global = [], float("inf"), None, 0, 0
    reloj = Cronometro()
    reiniciar_pico(dev)
    for ep in range(1, cfg.epocas + 1):
        modelo.train()
        acum = {"total": 0.0, "base": 0.0, "cuantil": 0.0, "cola": 0.0}
        for _ in range(pasos):
            idx = torch.randint(len(p_tr), (cfg.lote,), device=dev.device)
            comp = _paso_entrenamiento(modelo, perdida, ctx, opt, amp, ptr[idx], ttr[idx], cfg.p_ocultar_exogenas)
            sched.step()
            paso_global += 1
            for k in acum:
                acum[k] += float(comp[k].detach())
            if tb is not None and paso_global % 20 == 0:
                tb.escalar("Loss/train_paso", float(comp["valor"]), paso_global)
                tb.escalar("LearningRate", sched.get_last_lr()[0], paso_global)
        if tb is not None:
            tb.histogramas(modelo, ep)      # pesos y gradientes del ultimo paso de la epoca
        tr = {k: v / pasos for k, v in acum.items()}
        va = evaluar_perdida(modelo, perdida, ctx, p_va, t_va)
        dt = reloj.vuelta()
        mem = memoria(dev)
        fila = {"epoca": ep, "train_loss": tr["total"], "val_loss": va["total"], "train_base": tr["base"], "val_base": va["base"],
                "train_cola": tr["cola"], "val_cola": va["cola"], "train_cuantil": tr["cuantil"], "val_cuantil": va["cuantil"],
                "lr": sched.get_last_lr()[0], "segundos": dt, **mem}
        es_mejor = va["total"] < mejor - 1e-5
        if es_mejor:
            mejor, sin_mejora = va["total"], 0
            mejor_estado = copy.deepcopy(modelo.state_dict())
            if al_mejorar is not None:
                al_mejorar(modelo, ep, va["total"])
        else:
            sin_mejora += 1
        fila["mejor"] = es_mejor
        historial.append(fila)
        if tb is not None:
            r = predecir(modelo, ctx, p_va[sub], t_va[sub])
            met = calcular_metricas(*calibrar(r, None, cfg.objetivos), r, ctx)
            tb.epoca(ep, fila, met)
        print(f"  epoca {ep:3d}/{cfg.epocas}  train {tr['total']:.4f}  val {va['total']:.4f}  cola(val) {va['cola']:.4f}  "
              f"lr {fila['lr']:.2e}  {dt:.1f}s{'  *' if es_mejor else ''}")
        if sin_mejora >= cfg.paciencia:
            print(f"[entrenar] parada temprana en la epoca {ep} (sin mejora en {cfg.paciencia} epocas)")
            break
    modelo.load_state_dict(mejor_estado)
    return modelo, historial


def fijar_semilla(semilla: int) -> None:
    """Reproducibilidad: misma semilla + mismos datos + mismo equipo -> mismos resultados."""
    import random
    random.seed(semilla)
    np.random.seed(semilla)
    torch.manual_seed(semilla)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(semilla)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def consolidar(modelo, ctx: Contexto, tb=None):
    """Repaso final con TODO el bloque base (incluida la validacion), a tasa baja.
    La mejor epoca ya se eligio con la validacion; aqui el modelo termina de ver 1996-2020 completo."""
    cfg, dev = ctx.cfg, ctx.dev
    if cfg.epocas_consolidacion <= 0:
        return modelo
    torch.manual_seed(cfg.semilla + 1)
    p, t = ctx.vent.origenes(0, ctx.t_train_fin)
    pt, tt = a_tensor(ctx, p, t)
    perdida = crear_perdida(cfg).to(dev.device)
    pasos = max(1, min(cfg.pasos_por_epoca, math.ceil(len(p) / cfg.lote))) * cfg.epocas_consolidacion
    opt = torch.optim.AdamW(modelo.parameters(), lr=cfg.lr * 0.1, weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=pasos)
    amp = dev.scaler()
    modelo.train()
    acum, t0 = 0.0, time.perf_counter()
    for i in range(pasos):
        idx = torch.randint(len(p), (cfg.lote,), device=dev.device)
        comp = _paso_entrenamiento(modelo, perdida, ctx, opt, amp, pt[idx], tt[idx], cfg.p_ocultar_exogenas)
        sched.step()
        acum += float(comp["valor"])
        if tb is not None and i % 20 == 0:
            tb.escalar("Loss/consolidacion", float(comp["valor"]), i)
    modelo.eval()
    print(f"[entrenar] consolidacion con todo el bloque base hasta {ctx.panel.fechas[ctx.t_train_fin].date()}: "
          f"{pasos} pasos, perdida {acum / pasos:.4f}, {time.perf_counter() - t0:.1f}s")
    return modelo


# =========================================================================== paquete (modelo + todo lo necesario para usarlo)
def crear_paquete(modelo, ctx: Contexto, cal: Calibrador, ref: F.Referencia | None, meta: dict) -> dict:
    return {
        "formato": 1, "cfg": ctx.cfg.a_dict(), "n_features": ctx.n_features,
        "estado": {k: v.detach().cpu().clone() for k, v in modelo.state_dict().items()},
        "escalador": ctx.esc.a_dict(), "linea_base": ctx.lb.a_dict(), "calibrador": cal.a_dict(),
        "referencia": ref.a_dict() if ref is not None else None,
        "estatico": {p: [float(x) for x in ctx.panel.estatico[i]] for i, p in enumerate(ctx.panel.puntos)},
        "meta": dict(meta),
    }


def modelo_de_paquete(paq: dict, dev: Dispositivo):
    cfg = C.KharisConfig.desde_dict(paq["cfg"])
    modelo = crear_modelo(cfg, paq["n_features"]).to(dev.device)
    modelo.load_state_dict(paq["estado"])
    modelo.eval()
    return modelo


def referencia_senales(ctx: Contexto) -> F.Referencia | None:
    """Referencia historica de las senales P1-P10, solo con el periodo base (sin fuga)."""
    o = ctx.cfg.objetivos
    if not {"T2M_MAX", "T2M_MIN", "PRECTOTCORR"} <= set(o):
        return None
    t1 = ctx.t_train_fin + 1
    clima = _clima_dict(ctx.panel.valores[:, :t1], ctx.panel.variables)
    fechas = ctx.panel.fechas[:t1]
    fis = F.fisica_arreglos(fechas, ctx.panel.estatico[:, 0], ctx.panel.estatico[:, 2], clima, ctx.cfg.cultivo, ctx.cfg.ciclo, ctx.cfg.metodo_et0)
    return F.construir_referencia(ctx.panel.puntos, fechas, clima, fis, ctx.lb, o, clima.get("oni"))


def _clima_dict(val: np.ndarray, variables: list) -> dict:
    d = {v: val[:, :, i] for i, v in enumerate(variables) if np.isfinite(val[:, :, i]).any()}
    if "WS2M" not in d and "WS2M_MAX" in d:
        d["WS2M"] = d["WS2M_MAX"] / 1.6
    return d


# =========================================================================== backtesting walk-forward
def backtesting(ctx: Contexto, paquete_base: dict, registro, tb=None) -> dict:
    """Backtesting retrospectivo anio por anio (walk-forward).

    Cada anio se predice con lo aprendido SOLO hasta el dia anterior. Luego ese anio entra como lote nuevo
    (calibracion + ajuste fino con poda), se versiona y se pasa al siguiente. Devuelve predicciones y metricas
    "antes" (modelo base sin calibrar) y "despues" (walk-forward calibrado), ambas fuera de muestra.
    """
    from . import continuous as K
    cfg, dev = ctx.cfg, ctx.dev
    modelo_base = modelo_de_paquete(paquete_base, dev)
    p, t = ctx.vent.origenes(ctx.t_bt_ini, ctx.t_bt_fin)
    if len(p) == 0:
        print("[backtest] no hay datos posteriores al entrenamiento: se omite")
        return {}
    base = predecir(modelo_base, ctx, p, t)
    pred_antes, cuant_antes = calibrar(base, None, cfg.objetivos)
    pred_desp, cuant_desp = np.empty_like(base["pred"]), np.empty_like(base["cuant"])
    anio_obj = ctx.panel.fechas.year.to_numpy()[t + 1]
    paquete, pasos = paquete_base, []
    for a in sorted(set(anio_obj)):
        m = anio_obj == a
        modelo = modelo_de_paquete(paquete, dev)
        r = predecir(modelo, ctx, p[m], t[m])
        pred_desp[m], cuant_desp[m] = calibrar(r, Calibrador.desde_dict(paquete["calibrador"]), cfg.objetivos, ctx)
        t0 = max(ctx.t_bt_ini, ctx.panel.t(f"{a}-01-01"))
        t1 = min(ctx.t_bt_fin, ctx.panel.t(f"{a}-12-31"))
        paquete, info = K.actualizar_incremental(ctx, paquete, t0, t1, tb=tb, etiqueta=f"backtest {a}")
        version = registro.guardar(paquete, info, motivo=f"walk-forward {a}")
        info["version"] = version
        pasos.append(info)
        print(f"[backtest] {a}: {int(m.sum()):,} ventanas | deriva={'si' if info['deriva']['hay_deriva'] else 'no'} "
              f"| calibracion {'aceptada' if info['calibracion_aceptada'] else 'rechazada'}, pesos {'aceptados' if info['pesos_aceptados'] else 'revertidos'} -> {version}")
    antes = calcular_metricas(pred_antes, cuant_antes, base, ctx)
    despues = calcular_metricas(pred_desp, cuant_desp, base, ctx)
    por_anio = {}
    for a in sorted(set(anio_obj)):
        m = anio_obj == a
        sub = {k: (v[m] if isinstance(v, np.ndarray) else v) for k, v in base.items()}
        por_anio[int(a)] = {"antes": calcular_metricas(pred_antes[m], cuant_antes[m], sub, ctx),
                            "despues": calcular_metricas(pred_desp[m], cuant_desp[m], sub, ctx)}
    return {"r": base, "pred_antes": pred_antes, "cuant_antes": cuant_antes, "pred_despues": pred_desp, "cuant_despues": cuant_desp,
            "metricas_antes": antes, "metricas_despues": despues, "por_anio": por_anio, "pasos": pasos, "paquete_final": paquete}


# =========================================================================== pruebas de estres
def pruebas_estres(ctx: Contexto, paquete_base: dict, bt: dict) -> list:
    """Resiliencia en eventos sin precedentes: error, cobertura de picos y tasa de fallo por evento.

    Eventos dentro del backtest -> prediccion walk-forward (fuera de muestra).
    Eventos anteriores -> modelo base (dentro de muestra: sirve de cota optimista y se marca asi).
    """
    cfg, dev = ctx.cfg, ctx.dev
    cal_base = Calibrador.desde_dict(paquete_base["calibrador"])
    modelo_base = modelo_de_paquete(paquete_base, dev)
    mae_ref = paquete_base["meta"].get("mae_ref", {})
    q = list(cfg.cuantiles)
    i_hi = q.index(0.95) if 0.95 in q else len(q) - 1
    res = []
    # el modelo base ya vio todo el bloque de entrenamiento, validacion incluida: esos eventos son "dentro de muestra"
    f0, f1 = ctx.panel.fechas[0], ctx.panel.fechas[-1]
    for nombre, ini, fin, tipo in C.EVENTOS_ESTRES:
        ini, fin = pd.Timestamp(ini), pd.Timestamp(fin)
        ev = {"evento": nombre, "tipo": tipo, "desde": str(ini.date()), "hasta": str(fin.date())}
        if fin < f0 + pd.Timedelta(days=cfg.seq_len) or ini > f1:
            res.append({**ev, "estado": "sin_datos", "nota": f"los datos cubren {f0.date()} a {f1.date()}"})
            continue
        ta, tb_ = ctx.panel.t(max(ini, f0)), ctx.panel.t(min(fin, f1))
        en_muestra = ta <= ctx.t_train_fin
        if en_muestra:
            p, t = ctx.vent.origenes(ta, tb_)
            if len(p) == 0:
                res.append({**ev, "estado": "sin_datos", "nota": "sin ventanas validas en el periodo"})
                continue
            r = predecir(modelo_base, ctx, p, t)
            pred, cuant = calibrar(r, cal_base, cfg.objetivos, ctx)
        else:
            if not bt:
                res.append({**ev, "estado": "sin_datos", "nota": "sin backtesting"})
                continue
            tt = bt["r"]["t"]
            m = (tt + 1 >= ta) & (tt + cfg.horizonte <= tb_)
            if not m.any():
                res.append({**ev, "estado": "sin_datos", "nota": "sin ventanas validas en el periodo"})
                continue
            r = {k: (v[m] if isinstance(v, np.ndarray) else v) for k, v in bt["r"].items()}
            pred, cuant = bt["pred_despues"][m], bt["cuant_despues"][m]
        met = calcular_metricas(pred, cuant, r, ctx)
        for j, v in enumerate(cfg.objetivos):
            if v not in met:
                continue
            o, y = r["obs"][:, :, j], pred[:, :, j]
            ok = np.isfinite(o)
            fuera = ok & ((o < cuant[:, :, j, 0]) | (o > cuant[:, :, j, i_hi]))
            met[v]["tasa_fallo_banda"] = round(float(fuera.sum() / max(ok.sum(), 1)), 5)        # nominal ~0.10
            sev = ok & (np.abs(y - o) > 3 * mae_ref.get(v, np.inf))
            met[v]["tasa_fallo_severo"] = round(float(sev.sum() / max(ok.sum(), 1)), 5)         # |error| > 3 x MAE normal
            met[v]["max_obs"], met[v]["max_pred_h1"] = round(float(np.nanmax(o)), 3), round(float(np.nanmax(y[:, 0])), 3)
            met[v]["max_q99_h1"] = round(float(np.nanmax(cuant[:, 0, j, -1])), 3)
        ev.update(estado="evaluado", en_muestra=bool(en_muestra), ventanas=int(len(r["p"])), metricas=met)
        if "PRECTOTCORR" in cfg.objetivos:
            j = cfg.objetivos.index("PRECTOTCORR")
            ev["lluvia_acumulada_obs_mm"] = round(float(np.nansum(r["obs"][:, 0, j]) / len(ctx.panel.puntos)), 2)
            ev["lluvia_acumulada_pred_mm"] = round(float(np.nansum(pred[:, 0, j]) / len(ctx.panel.puntos)), 2)
        res.append(ev)
    return res


# =========================================================================== pronostico operativo
def _muestrear(cuant: np.ndarray, niveles: np.ndarray, u: np.ndarray) -> np.ndarray:
    """Muestra por inversa de la CDF definida por los cuantiles. cuant [N,H,V,Q], u [N,H,V] en (0,1)."""
    u = np.clip(u, 0.004, 0.998)
    i = np.clip(np.searchsorted(niveles, u), 1, len(niveles) - 1)
    lo = np.take_along_axis(cuant, (i - 1)[..., None], axis=-1)[..., 0]
    hi = np.take_along_axis(cuant, i[..., None], axis=-1)[..., 0]
    frac = (u - niveles[i - 1]) / (niveles[i] - niveles[i - 1])
    return lo + frac * (hi - lo)


_U_MIN, _U_MAX = 0.004, 0.998            # los mismos limites que aplica _muestrear
_PCT = "weibull"                        # percentiles entre miembros: con pocos miembros la interpolacion lineal estrecha la banda
_ESCALA = ("PRECTOTCORR", "WS2M", "WS2M_MAX")   # cola larga y piso en cero: se corrigen por escala, el resto por desplazamiento
_CEROS = ("PRECTOTCORR",)                 # muchos dias en cero: su dispersion no se reescala


def _media_muestreo(cuant: np.ndarray, niveles: np.ndarray, objetivos: list) -> np.ndarray:
    """Valor esperado exacto de `_muestrear` con u uniforme: el area bajo la curva de cuantiles por tramos. [N,H,V]"""
    q0 = cuant[..., 0] + (_U_MIN - niveles[0]) / (niveles[1] - niveles[0]) * (cuant[..., 1] - cuant[..., 0])
    q1 = cuant[..., -2] + (_U_MAX - niveles[-2]) / (niveles[-1] - niveles[-2]) * (cuant[..., -1] - cuant[..., -2])
    q = np.concatenate([q0[..., None], cuant, q1[..., None]], axis=-1)
    q = np.moveaxis(F.acoplar_fisica(np.moveaxis(q, -1, -2), objetivos), -2, -1).astype(np.float64)
    u = np.concatenate([[_U_MIN], niveles, [_U_MAX]])
    return (0.5 * (q[..., 1:] + q[..., :-1]) * np.diff(u)).sum(axis=-1) + _U_MIN * q[..., 0] + (1 - _U_MAX) * q[..., -1]


def _muestrear_sin_sesgo(pred: np.ndarray, cuant: np.ndarray, niveles: np.ndarray, u: np.ndarray, objetivos: list) -> np.ndarray:
    """Muestra de los cuantiles cuya media coincide con la media calibrada de la red (`pred`).

    Unir los cuantiles con rectas infla la media de las variables de cola larga: la lluvia muestreada sale ~45% por
    encima de la media calibrada. En el pronostico largo ese exceso vuelve a entrar como dato y se acumula (deriva).
    Aqui se quita en el origen: la forma de la distribucion sale de los cuantiles y el nivel, de la media calibrada."""
    m = F.acoplar_fisica(_muestrear(cuant, niveles, u), objetivos).astype(np.float64)
    esperado = _media_muestreo(cuant, niveles, objetivos)
    for j, v in enumerate(objetivos):
        if v in _ESCALA:
            m[..., j] *= np.clip(pred[..., j] / np.maximum(esperado[..., j], 1e-6), 0.2, 2.0)
        else:
            m[..., j] += pred[..., j] - esperado[..., j]
    return F.acoplar_fisica(m, objetivos)


def _anclar(muestra: np.ndarray, pred: np.ndarray, normal: np.ndarray, peso: np.ndarray, P: int, M: int, objetivos: list,
            normal_std: np.ndarray | None = None):
    """Ancla la media y la dispersion del conjunto a la climatologia del punto (peso por variable: 0 = nada, 1 = del todo).

    Mas alla de unas semanas no hay informacion para saber si un mes saldra mas calido o mas lluvioso de lo normal, y un
    modelo que se alimenta de sus propias salidas tiende a asentarse en un clima propio (deriva). Por eso, a medida que
    crece el adelanto, a cada punto se le quita la anomalia media del conjunto en el bloque: por diferencia, o por factor
    en lluvia y viento (conserva los dias secos). Cada miembro mantiene sus rachas y extremos alrededor de lo normal.
    Con `normal_std` [P, H, V] tambien se ancla la dispersion: los miembros, al alimentarse de sus propias salidas, se van
    separando entre si y acaban produciendo dias "fuera de rango" que no existen. A largo plazo cada dia debe repartirse
    como en la climatologia del punto, asi que la distancia de cada miembro a la media del conjunto se reescala hasta
    igualar la desviacion tipica climatologica (salvo en la lluvia, que tiene muchos ceros y ya queda acotada por su media).
    muestra/pred [P*M, H, V]; normal [P, H, V] = climatologia de los dias del bloque. Devuelve (muestra, pred) ancladas."""
    H, V = pred.shape[1], pred.shape[2]
    m4, p4 = muestra.reshape(P, M, H, V).astype(np.float64), pred.reshape(P, M, H, V).astype(np.float64)
    media, ref = p4.mean(axis=(1, 2)), normal.mean(axis=1)      # [P, V]
    for j, v in enumerate(objetivos):
        if v in _ESCALA:
            f = (np.clip(ref[:, j] / np.maximum(media[:, j], 1e-6), 0.25, 4.0) ** peso[j])[:, None, None]
            m4[..., j] *= f
            p4[..., j] *= f
        else:
            d = (peso[j] * (media[:, j] - ref[:, j]))[:, None, None]
            m4[..., j] -= d
            p4[..., j] -= d
    if normal_std is not None and M > 1:
        centro = m4.mean(axis=1, keepdims=True)                                    # [P, 1, H, V] media del conjunto por dia
        desv = m4 - centro
        s_conj = np.sqrt((desv**2).sum(axis=(1, 2)) / ((M - 1) * H))               # [P, V] dispersion del conjunto en el bloque
        s_ref = normal_std.mean(axis=1)                                            # [P, V] dispersion climatologica de esos dias
        for j, v in enumerate(objetivos):
            if v in _CEROS:
                continue
            f = np.clip(s_ref[:, j] / np.maximum(s_conj[:, j], 1e-6), 0.5, 1.5) ** peso[j]
            m4[..., j] = centro[..., j] + desv[..., j] * f[:, None, None]
    return F.acoplar_fisica(m4.reshape(P * M, H, V), objetivos), F.acoplar_fisica(p4.reshape(P * M, H, V), objetivos)


def pronosticar(ctx: Contexto, paquete: dict, dias: int | None = None, miembros: int | None = None,
                t_base: int | None = None, con_fisica: bool = True, anclar: bool = True) -> dict:
    """Pronostico por conjuntos a `dias` vista desde el ultimo dia con datos (o desde el dia `t_base`).

    La red predice bloques de `horizonte` dias. Cada miembro se extiende de forma autoregresiva muestreando de
    los cuantiles calibrados, de modo que las series conservan rachas secas y picos (no son un promedio liso).
    Devuelve tablas listas para la fase siguiente: clima_diario, fisica_diaria y senales P1-P10.
    Con `t_base` no se usa ninguna observacion posterior a ese dia (sirve para pruebas retrospectivas).
    Con `anclar`, la media del conjunto vuelve de forma gradual a la climatologia del punto (ver `_anclar`): en las
    primeras semanas manda la red; despues, lo normal de cada fecha. Asi el pronostico largo no puede derivar.
    """
    cfg, dev, panel = ctx.cfg, ctx.dev, ctx.panel
    dias, M = dias or cfg.dias_pronostico, miembros or cfg.miembros
    modelo = modelo_de_paquete(paquete, dev)
    cal = Calibrador.desde_dict(paquete["calibrador"])
    rng = np.random.default_rng(cfg.semilla)
    L, H, obj = cfg.seq_len, cfg.horizonte, cfg.objetivos
    V, P = len(obj), len(panel.puntos)
    N = P * M
    niveles = np.array(cfg.cuantiles)
    # ultimo dia con datos suficientes en todos los puntos
    presentes = np.isfinite(panel.valores[:, :, ctx.ix_obj]).mean(axis=(0, 2))
    t_fin = int(np.nonzero(presentes >= 0.5)[0][-1]) if t_base is None else int(t_base)
    largo = L + D.LARGO_HISTORIA
    cola = min(largo, t_fin + 1)
    val = np.repeat(panel.valores[:, t_fin + 1 - cola: t_fin + 1], M, axis=0).copy()   # [N, cola, V_all]
    fechas = panel.fechas[t_fin + 1 - cola: t_fin + 1]
    est = np.repeat(panel.estatico, M, axis=0)
    lbN = ctx.lb.repetir(M)
    clim_esc = torch.as_tensor(lbN.media_esc, device=dev.device)
    i_oni = panel.variables.index("oni") if "oni" in panel.variables else None
    oni_ult = None
    if i_oni is not None:
        o = panel.valores[:, : t_fin + 1, i_oni]
        oni_ult = np.array([s[np.isfinite(s)][-1] if np.isfinite(s).any() else np.nan for s in o])
    grupos = sorted({C.GRUPOS_MUESTREO.get(v, (v, 1))[0] for v in obj})
    g_ix = np.array([grupos.index(C.GRUPOS_MUESTREO.get(v, (v, 1))[0]) for v in obj])
    g_sg = np.array([C.GRUPOS_MUESTREO.get(v, (v, 1))[1] for v in obj], dtype=np.float64)
    z = rng.normal(size=(N, len(grupos)))
    rho = cfg.rho_muestreo
    rapidas = np.array([v in _ESCALA for v in obj])
    p_rep = np.repeat(np.arange(P), M)                       # punto de cada miembro
    # El Nino: anomalia esperada de cada dia pronosticado segun el ONI conocido hoy (solo donde la validacion lo respalda)
    f_todos = pd.date_range(panel.fechas[t_fin] + pd.Timedelta(days=1), periods=math.ceil(dias / H) * H, freq="D")
    anom_enso = np.zeros((P, len(f_todos), V), dtype=np.float32)
    if ctx.enso_g is not None and oni_ult is not None:
        anom_enso = ENSO.anomalia_diaria(ctx.enso_g, float(np.nanmean(oni_ult)) if np.isfinite(oni_ult).any() else float("nan"),
                                         panel.fechas[t_fin], f_todos)
    bloques = math.ceil(dias / H)
    miembros_val = np.empty((N, bloques * H, V), dtype=np.float32)
    medias_val = np.empty((N, bloques * H, V), dtype=np.float32)   # media calibrada de cada miembro dada su propia historia
    primero = None
    t0 = time.perf_counter()
    for b in range(bloques):
        crudo, _, _ = D.construir_features(val, panel.variables, fechas, est, lbN, obj, cfg.exogenas, miembros=M)
        x = torch.as_tensor(ctx.esc.x(crudo[:, -L:]), device=dev.device)
        f_obj = pd.date_range(fechas[-1] + pd.Timedelta(days=1), periods=H, freq="D")
        base = clim_esc[:, torch.as_tensor(f_obj.dayofyear.to_numpy() - 1, device=dev.device)]
        with torch.no_grad(), dev.autocast():
            pr, q = modelo(x, base)
        pred = ctx.esc.y_inv(pr.float().cpu().numpy())
        cuant = np.moveaxis(ctx.esc.y_inv(np.moveaxis(q.float().cpu().numpy(), 2, 3)), 3, 2)
        pred, cuant = cal.aplicar(pred, cuant) if cal.ajustado else (pred, cuant)
        pred, cuant = mezclar(ctx, pred, cuant, p_rep, np.broadcast_to(f_obj.dayofyear.to_numpy() - 1, (N, H)))
        pred, cuant = calibrar({"pred": pred, "cuant": cuant}, None, obj)   # coherencia fisica
        if b == 0:
            primero = (pred.reshape(P, M, H, V)[:, 0], cuant.reshape(P, M, H, V, -1)[:, 0])
        u = np.empty((N, H, V))
        for h in range(H):   # latente AR(1) por grupo: persistencia dia a dia y coherencia entre variables
            z = rho * z + math.sqrt(1 - rho**2) * rng.normal(size=z.shape)
            zz = z[:, g_ix] * g_sg + 0.35 * rng.normal(size=(N, V))
            u[:, h] = 0.5 * (1 + np.vectorize(math.erf)(zz / math.sqrt(2 * (1 + 0.35**2))))
        muestra = _muestrear_sin_sesgo(pred, cuant, niveles, u, obj)
        if anclar and b * H >= cfg.ancla_inicio_dias:
            # lluvia y viento: la red no aporta mas alla de su primer bloque -> ancla completa enseguida. El resto, gradual.
            rampa = float(np.clip((b * H - cfg.ancla_inicio_dias) / max(cfg.ancla_rampa_dias, 1), 0.0, 1.0))
            peso = cfg.ancla_peso * np.where(rapidas, 1.0, rampa)
            doy_obj = f_obj.dayofyear.to_numpy() - 1
            normal = ctx.lb.media[:, doy_obj] + anom_enso[:, b * H:(b + 1) * H]
            muestra, pred = _anclar(muestra, pred, normal, peso, P, M, obj, ctx.lb.std[:, doy_obj])
        miembros_val[:, b * H:(b + 1) * H] = muestra
        medias_val[:, b * H:(b + 1) * H] = pred
        nuevas = np.full((N, H, val.shape[2]), np.nan, dtype=np.float32)
        nuevas[:, :, ctx.ix_obj] = muestra
        if i_oni is not None:   # ENSO cambia lento: se persiste el ultimo valor conocido
            nuevas[:, :, i_oni] = np.repeat(oni_ult, M)[:, None]
        val = np.concatenate([val, nuevas], axis=1)[:, -largo:]
        fechas = fechas.append(f_obj)[-val.shape[1]:]
    dur = time.perf_counter() - t0
    f_pron = pd.date_range(panel.fechas[t_fin] + pd.Timedelta(days=1), periods=dias, freq="D")
    miembros_val, medias_val = miembros_val[:, :dias], medias_val[:, :dias]
    miembros_val = miembros_val.reshape(P, M, dias, V)

    # ---- clima diario: media y percentiles del conjunto (primer bloque: salida directa calibrada de la red).
    # La media promedia las medias calibradas de los miembros, no sus sorteos: mismo valor esperado, mucho menos ruido.
    media = medias_val.reshape(P, M, dias, V).mean(axis=1)
    p10, p50, p90 = (np.percentile(miembros_val, k, axis=1, method=_PCT) for k in (10, 50, 90))
    h1 = min(H, dias)
    pred1, cuant1 = primero
    media[:, :h1] = pred1[:, :h1]
    qi = lambda nivel: np.stack([[np.interp(nivel, niveles, cuant1[i, h, v]) for v in range(V)] for i in range(P) for h in range(h1)]).reshape(P, h1, V)
    p10[:, :h1], p50[:, :h1], p90[:, :h1] = qi(0.10), qi(0.50), qi(0.90)
    d = {"punto": np.repeat(np.array(panel.puntos, dtype=object), dias), "fecha": np.tile(f_pron.values, P),
         "dia_adelanto": np.tile(np.arange(1, dias + 1), P), "tipo": "pronostico"}
    for j, v in enumerate(obj):
        d[v] = np.round(media[:, :, j].reshape(-1), 3)
        d[f"{v}_p10"], d[f"{v}_p50"], d[f"{v}_p90"] = (np.round(a[:, :, j].reshape(-1), 3) for a in (p10, p50, p90))
    clima_df = pd.DataFrame(d)
    salida = {"clima_diario": clima_df, "fecha_base": panel.fechas[t_fin], "fechas": f_pron, "miembros": M,
              "segundos": dur, "fisica_diaria": None, "senales": None,
              "arr_media": media, "arr_p10": p10, "arr_p50": p50, "arr_p90": p90,   # [P, dias, V]
              "arr_miembros": miembros_val}                                          # [P, M, dias, V] (para diagnostico y pruebas)

    # ---- fisica y senales por miembro: contexto observado (desde enero del anio anterior) + pronostico
    if con_fisica and paquete.get("referencia") is not None and {"T2M_MAX", "T2M_MIN", "PRECTOTCORR"} <= set(obj):
        ref = F.Referencia.desde_dict(paquete["referencia"]).alinear(panel.puntos)
        t_ctx = panel.t(f"{panel.fechas[t_fin].year - 1}-01-01")
        obs = np.repeat(panel.valores[:, t_ctx: t_fin + 1], M, axis=0)
        n_obs = obs.shape[1]
        todo = np.full((N, n_obs + dias, obs.shape[2]), np.nan, dtype=np.float32)
        todo[:, :n_obs] = obs
        todo[:, n_obs:, ctx.ix_obj] = miembros_val.reshape(N, dias, V)
        if i_oni is not None:
            todo[:, n_obs:, i_oni] = np.repeat(oni_ult, M)[:, None]
        f_todo = panel.fechas[t_ctx: t_fin + 1].append(f_pron)
        clima = _clima_dict(todo, panel.variables)
        fis = F.fisica_arreglos(f_todo, est[:, 0], est[:, 2], clima, cfg.cultivo, cfg.ciclo, cfg.metodo_et0)
        refN = ref.repetir(M)
        anios, sen = F.calcular_senales(f_todo, clima, fis, refN, clima.get("oni"))
        # resumen del conjunto por punto y dia (solo dias pronosticados)
        fd = {"punto": np.repeat(np.array(panel.puntos, dtype=object), dias), "fecha": np.tile(f_pron.values, P), "tipo": "pronostico"}
        for c in F.COLUMNAS_FISICA:
            a = np.asarray(fis[c])[:, n_obs:].reshape(P, M, dias)
            if c in ("metodo_et0", "etapa"):
                a0 = a[:, 0].reshape(-1)
                fd[c] = np.vectorize(F.ETAPAS.get)(a0) if c == "etapa" else a0
            elif a.dtype == bool:
                fd[f"prob_{c}"] = np.round(a.mean(axis=1).reshape(-1), 3)
            else:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    fd[c] = np.round(np.nanmedian(a.astype(np.float64), axis=1).reshape(-1), 3)
                    if c in ("reserva", "deficit", "et0", "etc", "dias_secos_consec"):
                        fd[f"{c}_p10"] = np.round(np.nanpercentile(a.astype(np.float64), 10, axis=1, method=_PCT).reshape(-1), 3)
                        fd[f"{c}_p90"] = np.round(np.nanpercentile(a.astype(np.float64), 90, axis=1, method=_PCT).reshape(-1), 3)
        salida["fisica_diaria"] = pd.DataFrame(fd)
        # senales: mediana, banda y probabilidad de activacion entre miembros
        A = len(anios)
        sd = {"punto": np.repeat(np.array(panel.puntos, dtype=object), A), "temporada": np.tile(np.array(anios), P)}
        frac = np.array([((f_todo.year == a) & (np.arange(len(f_todo)) >= n_obs)).sum() / max((f_todo.year == a).sum(), 1) for a in anios])
        sd["fraccion_pronosticada"] = np.tile(np.round(frac, 3), P)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for k, v in sen.items():
                a = np.asarray(v).reshape(P, M, A)
                if a.dtype == bool:
                    prob = a.mean(axis=1)
                    sd[k.replace("_activo", "_prob")] = np.round(prob.reshape(-1), 3)
                    sd[k] = (prob >= 0.5).reshape(-1)
                else:
                    a = a.astype(np.float64)
                    sd[k] = np.round(np.nanmedian(a, axis=1).reshape(-1), 3)
                    if k.endswith("_valor"):
                        sd[f"{k}_p10"] = np.round(np.nanpercentile(a, 10, axis=1, method=_PCT).reshape(-1), 3)
                        sd[f"{k}_p90"] = np.round(np.nanpercentile(a, 90, axis=1, method=_PCT).reshape(-1), 3)
        sdf = pd.DataFrame(sd)
        salida["senales"] = sdf[sdf["temporada"] >= panel.fechas[t_fin].year].reset_index(drop=True)
    return salida


# =========================================================================== prueba congelada (entrenar hasta X, predecir despues)
def _medir(y, o, c) -> dict:
    """Error de la prediccion y contra lo real o, y de la climatologia c como referencia."""
    ok = np.isfinite(y) & np.isfinite(o) & np.isfinite(c)
    if ok.sum() < 3:
        return {}
    e, ec = (y[ok] - o[ok]).astype(np.float64), (c[ok] - o[ok]).astype(np.float64)
    mae, mae_c = float(np.abs(e).mean()), float(np.abs(ec).mean())
    return {"MAE": round(mae, 4), "RMSE": round(math.sqrt(float((e**2).mean())), 4), "Bias": round(float(e.mean()), 4),
            "Corr": round(_corr(y[ok], o[ok]), 4), "Corr_anomalia": round(_corr(y[ok] - c[ok], o[ok] - c[ok]), 4),
            "MAE_climatologia": round(mae_c, 4), "skill_vs_climatologia": round(1 - mae / mae_c, 4) if mae_c > 0 else None,
            "n": int(ok.sum())}


def prueba_congelada(ctx: Contexto, paquete_base: dict, bt: dict, miembros: int = 12) -> dict:
    """La prueba directa: todo se congela al final del entrenamiento (pesos, calibracion, linea base) y se
    predice el periodo posterior completo, comparando contra lo real. Nada posterior ajusta nada.

      a_1_dia / a_7_dias : cada dia se predice con 1 o 7 dias de adelanto, usando solo observaciones previas.
      libre              : el motor arranca el ultimo dia de entrenamiento y proyecta TODO el periodo de corrido,
                           sin ver ninguna observacion posterior. Se compara mes a mes (un dia concreto a anios
                           de distancia no es predecible; el promedio del mes si).
    """
    cfg, panel = ctx.cfg, ctx.panel
    obj, H = cfg.objetivos, cfg.horizonte
    P, V = len(panel.puntos), len(obj)
    t0, t1 = ctx.t_bt_ini, ctx.t_bt_fin
    n = t1 - t0 + 1
    fechas = panel.fechas[t0: t1 + 1]
    r = bt["r"]
    pred, _ = calibrar(r, Calibrador.desde_dict(paquete_base["calibrador"]), obj, ctx)   # calibrador ajustado solo hasta 2020
    real = panel.valores[:, t0: t1 + 1][:, :, ctx.ix_obj]
    p1, p7 = (np.full((P, n, V), np.nan, dtype=np.float32) for _ in range(2))
    k = r["t"] + 1 - t0
    p1[r["p"], k] = pred[:, 0]
    k = r["t"] + H - t0
    ok = k < n
    p7[r["p"][ok], k[ok]] = pred[ok, H - 1]
    clim = ctx.lb.media[:, fechas.dayofyear.to_numpy() - 1]
    libre = pronosticar(ctx, paquete_base, dias=n, miembros=miembros, t_base=ctx.t_train_fin, con_fisica=False)
    lm, l10, l90 = libre["arr_media"], libre["arr_p10"], libre["arr_p90"]
    # promedios mensuales por punto (minimo 20 dias con dato)
    cod, meses = pd.factorize(fechas.to_period("M"))

    def mensual(a):
        out = np.full((P, len(meses), V), np.nan)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for j in range(len(meses)):
                m = np.asarray(cod == j)
                if m.sum() >= 20:
                    out[:, j] = np.where(np.isfinite(a[:, m]).sum(axis=1) >= 20, np.nanmean(a[:, m], axis=1), np.nan)
        return out

    real_m, p1_m, lm_m, clim_m = mensual(real), mensual(p1), mensual(lm), mensual(clim)
    l10_m, l90_m = mensual(l10), mensual(l90)
    anio = fechas.year.to_numpy()
    todo, modo_largo = f"{fechas[0].year}-{fechas[-1].year}", f"a_{H}_dias"
    filas = []
    for j, v in enumerate(obj):
        for modo, arr in (("a_1_dia", p1), (modo_largo, p7), ("libre_diario", lm)):
            for etiqueta, m in [(todo, np.ones(n, dtype=bool))] + [(str(a), anio == a) for a in sorted(set(anio))]:
                d = _medir(arr[:, m, j], real[:, m, j], clim[:, m, j])
                if d:
                    filas.append({"modo": modo, "variable": v, "periodo": etiqueta, **d})
        for modo, arr in (("a_1_dia_mensual", p1_m), ("libre_mensual", lm_m)):
            d = _medir(arr[:, :, j], real_m[:, :, j], clim_m[:, :, j])
            if d:
                filas.append({"modo": modo, "variable": v, "periodo": todo, **d})
    # tabla diaria punto x fecha: real, prediccion a 1 y 7 dias, y corrida libre con su banda
    tabla = {"punto": np.repeat(np.array(panel.puntos, dtype=object), n), "fecha": np.tile(fechas.values, P)}
    for j, v in enumerate(obj):
        for nombre, arr in (("real", real), ("pred_1d", p1), (f"pred_{H}d", p7), ("libre", lm), ("libre_p10", l10), ("libre_p90", l90)):
            tabla[f"{v}_{nombre}"] = np.round(arr[:, :, j].reshape(-1), 2)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        regional = {k2: np.nanmean(a, axis=0) for k2, a in (("real", real_m), ("a_1_dia", p1_m), ("libre", lm_m), ("libre_p10", l10_m),
                                                             ("libre_p90", l90_m), ("climatologia", clim_m))}
        # ---- control de deriva: la media proyectada de cada anio contra la climatologia con la que se entreno. No depende
        # de lo que paso despues. Tolerancia: media desviacion tipica de la variabilidad natural entre anios (del entrenamiento).
        f_tr = panel.fechas[: ctx.t_train_fin + 1]
        an_tr = panel.valores[:, : ctx.t_train_fin + 1][:, :, ctx.ix_obj] - ctx.lb.media[:, f_tr.dayofyear.to_numpy() - 1]
        a_tr = f_tr.year.to_numpy()
        sigma = np.nanstd(np.stack([np.nanmean(an_tr[:, a_tr == a], axis=(0, 1)) for a in sorted(set(a_tr))]), axis=0)
        deriva = []
        for j, v in enumerate(obj):
            for a in sorted(set(anio)):
                d = float(np.mean(lm[:, anio == a, j] - clim[:, anio == a, j]))
                deriva.append({"variable": v, "periodo": str(a), "deriva": round(d, 4), "tolerancia": round(0.5 * float(sigma[j]), 4),
                               "fuera": bool(abs(d) > 0.5 * sigma[j])})
        cobertura = {v: round(float(((real[:, :, j] >= l10[:, :, j]) & (real[:, :, j] <= l90[:, :, j]))[np.isfinite(real[:, :, j])].mean()), 4)
                     for j, v in enumerate(obj)}
    n_fuera = sum(d["fuera"] for d in deriva)
    return {"entrenado_hasta": str(panel.fechas[ctx.t_train_fin].date()), "desde": str(fechas[0].date()), "hasta": str(fechas[-1].date()),
            "miembros_libre": miembros, "segundos_libre": round(libre["segundos"], 1), "filas": filas, "periodo": todo, "modo_largo": modo_largo,
            "tabla": pd.DataFrame(tabla), "meses": meses.to_timestamp(), "regional": regional, "objetivos": obj,
            "deriva": deriva, "deriva_fuera": n_fuera, "indice_deriva": round(n_fuera / max(len(deriva), 1), 4), "cobertura_banda": cobertura}


def senales_historicas(ctx: Contexto, paquete: dict):
    """Fisica diaria y senales P1-P10 sobre todo el clima observado. Devuelve (fisica dict, DataFrame senales)."""
    if paquete.get("referencia") is None:
        return None, None
    ref = F.Referencia.desde_dict(paquete["referencia"]).alinear(ctx.panel.puntos)
    clima = _clima_dict(ctx.panel.valores, ctx.panel.variables)
    fis = F.fisica_arreglos(ctx.panel.fechas, ctx.panel.estatico[:, 0], ctx.panel.estatico[:, 2], clima,
                            ctx.cfg.cultivo, ctx.cfg.ciclo, ctx.cfg.metodo_et0)
    anios, sen = F.calcular_senales(ctx.panel.fechas, clima, fis, ref, clima.get("oni"))
    df = F.senales_a_dataframe(ctx.panel.puntos, anios, sen)
    df.insert(2, "tipo", "observado")
    return fis, df
