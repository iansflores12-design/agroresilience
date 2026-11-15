"""Observabilidad: exportacion ONNX (Netron), TensorBoard, graficas PNG de diagnostico y reportes de metricas."""
from __future__ import annotations

import copy
import csv
import json
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from . import physics as F

# Paleta fija (identidad por serie, no por orden de aparicion)
TINTA, TINTA2, TENUE, REJILLA, FONDO = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#fcfcfb"
AZUL, NARANJA, AQUA, AMARILLO, AZUL_CLARO = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#b7d3f6"
UNIDADES = {"T2M_MAX": "°C", "T2M_MIN": "°C", "T2M": "°C", "PRECTOTCORR": "mm/día", "WS2M_MAX": "m/s", "WS2M": "m/s",
            "RH2M": "%", "ALLSKY_SFC_SW_DWN": "MJ/m²/día", "reserva": "mm", "deficit": "mm/día"}


# =========================================================================== ONNX
def exportar_onnx(modelo, n_features: int, seq_len: int, ruta, tol: float = 1e-4, meta: dict | None = None) -> dict:
    """Exporta kharis_engine.onnx con ejes dinamicos (batch_size, seq_len) y nombres explicitos, y lo verifica.

    Entradas: clima_ventana [batch_size, seq_len, n_features] y climatologia_futura [batch_size, horizonte, n_objetivos].
    Salidas: prediccion y cuantiles.
    """
    import onnx
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    m = copy.deepcopy(modelo).to("cpu").float().eval()
    x = torch.randn(2, seq_len, n_features)
    base = torch.randn(2, m.horizonte, m.n_objetivos)
    nombres = dict(input_names=["clima_ventana", "climatologia_futura"], output_names=["prediccion", "cuantiles"])
    info = {"archivo": str(ruta), "exportador": None}
    errores = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:  # exportador clasico: grafo compacto y legible en Netron
            torch.onnx.export(m, (x, base), str(ruta), dynamo=False, opset_version=17, do_constant_folding=True,
                              dynamic_axes={"clima_ventana": {0: "batch_size", 1: "seq_len"}, "climatologia_futura": {0: "batch_size"},
                                            "prediccion": {0: "batch_size"}, "cuantiles": {0: "batch_size"}}, **nombres)
            info["exportador"] = "torchscript"
        except Exception as e:
            errores.append(f"torchscript: {type(e).__name__}: {e}")
        if info["exportador"] is None:
            try:
                lote, largo = torch.export.Dim("batch_size", min=1), torch.export.Dim("seq_len", min=2)
                prog = torch.onnx.export(m, (x, base), dynamo=True, **nombres,
                                         dynamic_shapes={"clima_ventana": {0: lote, 1: largo}, "climatologia_futura": {0: lote}})
                prog.save(str(ruta))
                info["exportador"] = "dynamo"
            except Exception as e:
                errores.append(f"dynamo: {type(e).__name__}: {e}")
    if info["exportador"] is None:
        raise RuntimeError("No se pudo exportar a ONNX:\n  " + "\n  ".join(errores))
    mo = onnx.load(str(ruta))
    mo.doc_string = "Kharis Engine (Fase 1) - AgroResilience Honduras. Entrada: ventana diaria escalada. Salidas en escala del modelo."
    mo.producer_name = "kharis-engine"
    for k, v in (meta or {}).items():
        e = mo.metadata_props.add()
        e.key, e.value = str(k), json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    onnx.checker.check_model(mo)
    onnx.save(mo, str(ruta))
    info["tamano_mb"] = round(ruta.stat().st_size / 2**20, 4)
    info["opset"] = int(mo.opset_import[0].version)
    info["entradas"] = [i.name for i in mo.graph.input]
    info["salidas"] = [o.name for o in mo.graph.output]
    info.update(verificar_onnx(ruta, m, n_features, seq_len, tol))
    return info


def verificar_onnx(ruta, modelo_cpu, n_features: int, seq_len: int, tol: float = 1e-4) -> dict:
    """Compara PyTorch vs ONNX con varios tamanos de lote y de ventana (prueba los ejes dinamicos)."""
    try:
        import onnxruntime as ort
        ses = ort.InferenceSession(str(ruta), providers=["CPUExecutionProvider"])
        correr = lambda a, c: ses.run(None, {"clima_ventana": a, "climatologia_futura": c})
        motor = f"onnxruntime {ort.__version__}"
    except ImportError:  # sin rueda de onnxruntime para este Python: evaluador de referencia oficial de ONNX
        import onnx
        from onnx.reference import ReferenceEvaluator
        ev = ReferenceEvaluator(str(ruta))
        correr = lambda a, c: ev.run(None, {"clima_ventana": a, "climatologia_futura": c})
        motor = f"onnx.reference {onnx.__version__} (onnxruntime no instalado)"
    gen = torch.Generator().manual_seed(1134)
    peor, casos = 0.0, []
    for b, l in ((1, seq_len), (4, seq_len), (3, seq_len + 19), (2, max(8, seq_len // 2))):
        x = torch.randn(b, l, n_features, generator=gen)
        base = torch.randn(b, modelo_cpu.horizonte, modelo_cpu.n_objetivos, generator=gen)
        with torch.no_grad():
            p, q = modelo_cpu(x, base)
        po, qo = correr(x.numpy(), base.numpy())
        d = max(float(np.abs(p.numpy() - po).max()), float(np.abs(q.numpy() - qo).max()))
        peor = max(peor, d)
        casos.append({"batch_size": b, "seq_len": l, "dif_max": d, "forma_prediccion": list(po.shape), "forma_cuantiles": list(qo.shape)})
    return {"verificado_con": motor, "dif_max": peor, "tolerancia": tol, "verificacion_ok": bool(peor <= tol), "casos": casos}


# =========================================================================== TensorBoard
class RegistroTB:
    """SummaryWriter con las curvas, histogramas, grafo y metricas de sistema. Inactivo = no hace nada."""

    def __init__(self, carpeta, activo: bool = True, nombre: str | None = None):
        self.w, self.dir = None, None
        if not activo:
            return
        try:
            from torch.utils.tensorboard import SummaryWriter
        except Exception as e:
            print(f"[tensorboard] no disponible ({e}); se sigue sin registrar")
            return
        self.dir = Path(carpeta) / (nombre or time.strftime("%Y%m%d-%H%M%S"))
        self.w = SummaryWriter(log_dir=str(self.dir), flush_secs=5)
        print(f"[tensorboard] registrando en {self.dir}  ->  tensorboard --logdir {Path(carpeta)}")

    def escalar(self, tag: str, valor, paso: int) -> None:
        if self.w is not None and valor is not None and np.isfinite(valor):
            self.w.add_scalar(tag, float(valor), paso)

    def histogramas(self, modelo, epoca: int) -> None:
        if self.w is None:
            return
        for n, p in modelo.named_parameters():
            self.w.add_histogram(f"weights/{n}", p.detach().float().cpu(), epoca)
            if p.grad is not None and torch.isfinite(p.grad).all():
                self.w.add_histogram(f"gradients/{n}", p.grad.detach().float().cpu(), epoca)
                self.w.add_scalar(f"gradients_norma/{n}", float(p.grad.detach().float().norm()), epoca)

    def grafo(self, modelo, x) -> None:
        if self.w is None:
            return
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                era = modelo.training
                modelo.eval()
                self.w.add_graph(modelo, tuple(a.float() for a in x) if isinstance(x, (tuple, list)) else x.float())
                modelo.train(era)
        except Exception as e:
            print(f"[tensorboard] no se pudo registrar el grafo: {type(e).__name__}")

    def epoca(self, ep: int, fila: dict, metricas: dict) -> None:
        if self.w is None:
            return
        for tag, k in (("Loss/train", "train_loss"), ("Loss/val", "val_loss"), ("Loss/extreme_tail", "val_cola"),
                       ("Loss/extreme_tail_train", "train_cola"), ("Loss/base_train", "train_base"), ("Loss/base_val", "val_base"),
                       ("Loss/cuantil_val", "val_cuantil"), ("LearningRate_epoca", "lr"), ("Sistema/segundos_por_epoca", "segundos"),
                       ("Sistema/vram_mb", "vram_mb"), ("Sistema/vram_pico_mb", "vram_pico_mb"), ("Sistema/ram_mb", "ram_mb")):
            self.escalar(tag, fila.get(k), ep)
        for v, m in metricas.items():
            for k in ("MAE", "RMSE", "Bias", "MAE_p95", "Bias_p95", "cobertura_picos_p95"):
                self.escalar(f"{k}/{v}", m.get(k), ep)
        self.w.flush()

    def texto(self, tag: str, contenido: str) -> None:
        if self.w is not None:
            self.w.add_text(tag, contenido)

    def cerrar(self) -> None:
        if self.w is not None:
            self.w.flush()
            self.w.close()


# =========================================================================== graficas
def _plt():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "figure.facecolor": FONDO, "axes.facecolor": FONDO, "savefig.facecolor": FONDO, "font.size": 9,
        "axes.edgecolor": "#c3c2b7", "axes.labelcolor": TINTA2, "xtick.color": TENUE, "ytick.color": TENUE,
        "axes.titlesize": 10, "axes.titlecolor": TINTA, "axes.grid": True, "grid.color": REJILLA, "grid.linewidth": 0.6,
        "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "legend.fontsize": 8,
        "text.color": TINTA, "axes.axisbelow": True,
    })
    return plt


def grafica_perdida(historial: list, ruta) -> None:
    """loss_curve.png: train vs val por epoca, mejor checkpoint marcado, y componentes base vs extremos."""
    plt = _plt()
    ep = [h["epoca"] for h in historial]
    mejor = min(historial, key=lambda h: h["val_loss"])
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.8), dpi=200)
    a = ax[0]
    a.plot(ep, [h["train_loss"] for h in historial], color=AZUL, lw=2, label="train_loss")
    a.plot(ep, [h["val_loss"] for h in historial], color=NARANJA, lw=2, label="val_loss")
    a.axvline(mejor["epoca"], color=TENUE, lw=1, ls="--")
    a.scatter([mejor["epoca"]], [mejor["val_loss"]], s=70, color=NARANJA, edgecolor=FONDO, linewidth=2, zorder=5)
    a.annotate(f"mejor checkpoint\népoca {mejor['epoca']}  val {mejor['val_loss']:.4f}", (mejor["epoca"], mejor["val_loss"]),
               xytext=(-10, 28), textcoords="offset points", ha="right", color=TINTA2, fontsize=8)
    a.set_title("Pérdida total (extreme-aware): entrenamiento vs validación", loc="left")
    a.set_xlabel("época"); a.set_ylabel("pérdida"); a.legend(loc="upper right")
    b = ax[1]
    b.plot(ep, [h["train_base"] for h in historial], color=AZUL, lw=2, label="base (Huber) train")
    b.plot(ep, [h["val_base"] for h in historial], color=NARANJA, lw=2, label="base (Huber) val")
    b.plot(ep, [h["train_cola"] for h in historial], color=AQUA, lw=2, ls="--", label="extremos ≥ p95 train")
    b.plot(ep, [h["val_cola"] for h in historial], color=AMARILLO, lw=2, ls="--", label="extremos ≥ p95 val")
    b.axvline(mejor["epoca"], color=TENUE, lw=1, ls="--")
    b.set_title("Componentes: pérdida base vs cola de extremos", loc="left")
    b.set_xlabel("época"); b.set_ylabel("Huber (escala del modelo)"); b.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(ruta)
    plt.close(fig)


def _suave(a: np.ndarray, w: int) -> np.ndarray:
    return pd.Series(a).rolling(w, min_periods=max(1, w // 3), center=True).mean().to_numpy()


def grafica_pred_vs_real(paneles: list, ruta) -> None:
    """pred_vs_real.png. `paneles`: lista de periodos, cada uno con titulo, fechas y series por variable:
    {"titulo", "fechas", "series": {var: {"obs", "pred", "lo", "hi"}}}."""
    plt = _plt()
    import matplotlib.dates as mdates
    if not paneles:
        return
    filas = [v for v in ("T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS2M_MAX", "WS2M", "reserva", "deficit") if any(v in p["series"] for p in paneles)]
    nf, nc = len(filas), len(paneles)
    fig, axs = plt.subplots(nf, nc, figsize=(5.2 * nc, 2.6 * nf), dpi=200, squeeze=False)
    for c, pnl in enumerate(paneles):
        f = pnl["fechas"]
        largo = len(f) > 400
        for r, v in enumerate(filas):
            a = axs[r][c]
            s = pnl["series"].get(v)
            if s is None:
                a.set_axis_off()
                continue
            obs, pred = s["obs"], s["pred"]
            if largo:   # periodos largos: media movil de 15 dias para que se lea
                obs, pred = _suave(obs, 15), _suave(pred, 15)
            elif s.get("lo") is not None:
                a.fill_between(f, s["lo"], s["hi"], color=AZUL_CLARO, alpha=0.6, lw=0, label="banda q05–q95")
            a.plot(f, obs, color=TINTA2, lw=1.4, label="valor real")
            a.plot(f, pred, color=AZUL, lw=1.4, label="predicción Kharis (1 día)")
            a.set_ylabel(f"{v}\n{UNIDADES.get(v, '')}", fontsize=8)
            loc = mdates.AutoDateLocator(minticks=3, maxticks=6)
            a.xaxis.set_major_locator(loc)
            a.xaxis.set_major_formatter(mdates.ConciseDateFormatter(loc))
            if r == 0:
                a.set_title(pnl["titulo"] + ("\n(media móvil 15 días)" if largo else ""), loc="left", fontsize=9)
            if r == 0 and c == 0:
                a.legend(loc="upper left", ncol=1)
    fig.suptitle("Predicción vs. valor real — Kharis Engine", x=0.01, ha="left", fontsize=13, color=TINTA)
    fig.tight_layout(rect=(0, 0, 1, 0.975))
    fig.savefig(ruta)
    plt.close(fig)


def grafica_residuos(bt: dict, ctx, ruta, max_puntos: int = 5000) -> None:
    """residuals_extremes.png: residuos antes/despues de calibrar (todo y >= p95) y dispersion en >= p80."""
    plt = _plt()
    obj = ctx.cfg.objetivos
    r = bt["r"]
    q = list(ctx.cfg.cuantiles)
    i_q95 = q.index(0.95) if 0.95 in q else None
    rng = np.random.default_rng(0)
    fig, axs = plt.subplots(3, len(obj), figsize=(3.9 * len(obj), 10.5), dpi=200, squeeze=False)
    for j, v in enumerate(obj):
        o = r["obs"][:, :, j].ravel()
        ya, yd = bt["pred_antes"][:, :, j].ravel(), bt["pred_despues"][:, :, j].ravel()
        p = np.repeat(r["p"], r["obs"].shape[1])
        ok = np.isfinite(o)
        t80, t95 = ctx.lb.pct["p80"][p, j], ctx.lb.pct["p95"][p, j]
        for fila, masc, titulo in ((0, ok, "todos los días"), (1, ok & (o >= t95), "extremos ≥ p95")):
            a = axs[fila][j]
            ea, ed = (ya - o)[masc], (yd - o)[masc]
            if len(ea) == 0:
                a.set_axis_off()
                continue
            lim = np.percentile(np.abs(np.concatenate([ea, ed])), 99.5) + 1e-9
            bins = np.linspace(-lim, lim, 61)
            a.hist(ea, bins=bins, histtype="step", color=NARANJA, lw=1.8, density=True, label="media, antes de calibrar")
            a.hist(ed, bins=bins, histtype="step", color=AZUL, lw=1.8, density=True, label="media, después de calibrar")
            nota = f"sesgo  {ea.mean():+.2f} → {ed.mean():+.2f}\nMAE  {np.abs(ea).mean():.2f} → {np.abs(ed).mean():.2f}\nn = {len(ea):,}"
            if fila == 1 and i_q95 is not None:   # en los extremos, el cuantil alto es el que debe alcanzarlos
                eq = (bt["cuant_despues"][:, :, j, i_q95].ravel() - o)[masc]
                a.hist(eq, bins=bins, histtype="step", color=AQUA, lw=1.8, density=True, label="cuantil 95, después de calibrar")
                nota += f"\nq95: sesgo {eq.mean():+.2f}"
            a.axvline(0, color=TENUE, lw=1)
            a.set_title(f"{v} — {titulo}", loc="left")
            a.set_xlabel(f"residuo = predicción − real ({UNIDADES.get(v, '')})")
            a.text(0.98, 0.97, nota, transform=a.transAxes, ha="right", va="top", fontsize=8, color=TINTA2)
            a.set_yticks([])
            if j == 0:
                a.set_ylabel("densidad")
                a.legend(loc="upper left", fontsize=7)
        a = axs[2][j]
        m80 = np.nonzero(ok & (o >= t80))[0]
        if len(m80) == 0:
            a.set_axis_off()
            continue
        if len(m80) > max_puntos:
            m80 = rng.choice(m80, max_puntos, replace=False)
        a.scatter(o[m80], ya[m80], s=5, color=NARANJA, alpha=0.35, lw=0, label="antes")
        a.scatter(o[m80], yd[m80], s=5, color=AZUL, alpha=0.35, lw=0, label="después")
        lo, hi = float(np.min(o[m80])), float(np.percentile(o[m80], 99.9))
        a.plot([lo, hi], [lo, hi], color=TINTA2, lw=1, ls="--")
        a.set_xlim(lo, hi)
        a.set_title(f"{v} — dispersión en ≥ p80", loc="left")
        a.set_xlabel(f"valor real ({UNIDADES.get(v, '')})")
        if j == 0:
            a.set_ylabel("predicción")
            a.legend(loc="upper left", markerscale=3)
    fig.suptitle("Residuos y extremos en el backtesting (fuera de muestra): antes vs. después de la calibración",
                 x=0.01, ha="left", fontsize=13, color=TINTA)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(ruta)
    plt.close(fig)


def grafica_prueba(pr: dict, ruta) -> None:
    """prueba_2021_2026.png: promedio mensual de todos los puntos. Lo real contra Kharis congelado al final del
    entrenamiento: a 1 dia, y proyectando todo el periodo sin ver ninguna observacion posterior."""
    plt = _plt()
    obj, meses, reg = pr["objetivos"], pr["meses"], pr["regional"]
    nf = (len(obj) + 1) // 2
    fig, axs = plt.subplots(nf, 2, figsize=(15, 3.1 * nf), dpi=200, squeeze=False)
    for j, v in enumerate(obj):
        a = axs[j // 2][j % 2]
        a.fill_between(meses, reg["libre_p10"][:, j], reg["libre_p90"][:, j], color="#f8d5c6", alpha=0.7, lw=0, label="proyección libre: banda p10–p90")
        a.plot(meses, reg["libre"][:, j], color=NARANJA, lw=1.6, label="proyección libre (sin ver nada después del entrenamiento)")
        a.plot(meses, reg["a_1_dia"][:, j], color=AZUL, lw=1.6, label="predicción a 1 día")
        a.plot(meses, reg["real"][:, j], color=TINTA, lw=1.6, label="valor real")
        a.set_title(f"{v} ({UNIDADES.get(v, '')})", loc="left")
    for j in range(len(obj), nf * 2):
        axs[j // 2][j % 2].set_axis_off()
    fig.suptitle(f"Prueba congelada: entrenado hasta {pr['entrenado_hasta']}, predicho {pr['desde']} a {pr['hasta']} — promedio mensual de todos los puntos",
                 x=0.01, ha="left", fontsize=12, color=TINTA)
    manijas, etiquetas = axs[0][0].get_legend_handles_labels()   # una sola leyenda, fuera de los paneles
    fig.legend(manijas, etiquetas, loc="upper left", bbox_to_anchor=(0.01, 0.965), ncol=4, fontsize=8, frameon=False)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(ruta)
    plt.close(fig)


# =========================================================================== series para pred_vs_real
def series_periodo(ctx, TE, paquete_base: dict, bt: dict, i_punto: int, ini, fin) -> dict | None:
    """Series diarias (prediccion a 1 dia) de un punto en [ini, fin], con balance hidrico observado y predicho."""
    from .model import Calibrador
    cfg, panel = ctx.cfg, ctx.panel
    obj = cfg.objetivos
    ta, tb = panel.t(max(pd.Timestamp(ini), panel.fechas[0])), panel.t(min(pd.Timestamp(fin), panel.fechas[-1]))
    t0 = max(cfg.seq_len, ta - 200)    # 200 dias previos para estabilizar el balance hidrico
    dentro = ta <= ctx.t_train_fin
    if dentro:
        p, t = ctx.vent.origenes(t0, tb)
        m = p == i_punto
        if not m.any():
            return None
        r = TE.predecir(TE.modelo_de_paquete(paquete_base, ctx.dev), ctx, p[m], t[m])
        pred, cuant = TE.calibrar(r, Calibrador.desde_dict(paquete_base["calibrador"]), obj)
        t_or = r["t"]
    else:
        if not bt:
            return None
        m = (bt["r"]["p"] == i_punto) & (bt["r"]["t"] + 1 >= t0) & (bt["r"]["t"] + 1 <= tb)
        if not m.any():
            return None
        pred, cuant, t_or = bt["pred_despues"][m], bt["cuant_despues"][m], bt["r"]["t"][m]
    q = list(cfg.cuantiles)
    i_hi = q.index(0.95) if 0.95 in q else len(q) - 1
    n = tb - t0 + 1
    P1, LO, HI = (np.full((n, len(obj)), np.nan, dtype=np.float32) for _ in range(3))
    Q1 = np.full((n, len(obj), len(q)), np.nan, dtype=np.float32)
    k = t_or + 1 - t0
    ok = (k >= 0) & (k < n)
    P1[k[ok]], LO[k[ok]], HI[k[ok]], Q1[k[ok]] = pred[ok, 0], cuant[ok, 0, :, 0], cuant[ok, 0, :, i_hi], cuant[ok, 0]
    O = panel.valores[i_punto, t0: tb + 1][:, ctx.ix_obj]
    fechas = panel.fechas[t0: tb + 1]
    series = {v: {"obs": O[:, j], "pred": P1[:, j], "lo": LO[:, j], "hi": HI[:, j]} for j, v in enumerate(obj)}
    if {"T2M_MAX", "T2M_MIN", "PRECTOTCORR"} <= set(obj):
        # balance hidrico: observado vs pronostico a 1 dia (estado observado de ayer + clima predicho de hoy)
        lat, elev = panel.estatico[i_punto: i_punto + 1, 0], panel.estatico[i_punto: i_punto + 1, 2]
        fo = F.fisica_arreglos(fechas, lat, elev, {v: O[None, :, j] for j, v in enumerate(obj)}, cfg.cultivo, cfg.ciclo, cfg.metodo_et0)
        fp = F.fisica_arreglos(fechas, lat, elev, {v: np.where(np.isfinite(P1), P1, O)[None, :, j] for j, v in enumerate(obj)},
                               cfg.cultivo, cfg.ciclo, cfg.metodo_et0)   # solo para ETc con las temperaturas predichas
        par = F.C.CULTIVOS[cfg.cultivo]
        ayer = np.concatenate([[np.nan], fo["reserva"][0][:-1]])
        res_p, def_p = F.balance_un_dia(ayer, Q1[:, obj.index("PRECTOTCORR")].astype(np.float64), F.pesos_cuantiles(q),
                                        fp["etc"][0], fo["_taw"], par["p"])
        series["reserva"] = {"obs": fo["reserva"][0], "pred": res_p, "lo": None, "hi": None}
        series["deficit"] = {"obs": fo["deficit"][0], "pred": def_p, "lo": None, "hi": None}
    c0 = ta - t0
    return {"fechas": fechas[c0:], "dentro_de_muestra": bool(dentro),
            "series": {v: {k2: (a[c0:] if a is not None else None) for k2, a in s.items()} for v, s in series.items()}}


# =========================================================================== reportes
def _json(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (pd.Timestamp, Path)):
        return str(o)
    return str(o)


def _limpiar_nan(o):
    if isinstance(o, dict):
        return {str(k): _limpiar_nan(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_limpiar_nan(v) for v in o]
    if isinstance(o, (float, np.floating)) and not np.isfinite(o):
        return None
    return o


def guardar_json(obj, ruta) -> None:
    Path(ruta).write_text(json.dumps(_limpiar_nan(obj), indent=2, ensure_ascii=False, default=_json), encoding="utf-8")


def guardar_resumen(resumen: dict, carpeta) -> None:
    """metrics_summary.json (estructura completa) y metrics_summary.csv (formato largo: seccion, variable, metrica, valor)."""
    carpeta = Path(carpeta)
    guardar_json(resumen, carpeta / "metrics_summary.json")
    filas = []

    def variables(seccion, d):
        for v, m in (d or {}).items():
            for k, x in m.items():
                filas.append((seccion, v, k, x))

    for k, x in (resumen.get("sistema") or {}).items():
        if not isinstance(x, (dict, list)):
            filas.append(("sistema", "", k, x))
    for k, x in (resumen.get("modelo") or {}).items():
        if not isinstance(x, (dict, list)):
            filas.append(("modelo", "", k, x))
    variables("validacion", resumen.get("validacion"))
    bt = resumen.get("backtest") or {}
    variables("backtest_antes_calibracion", bt.get("antes"))
    variables("backtest_despues_calibracion", bt.get("despues"))
    for a, d in (bt.get("por_anio") or {}).items():
        variables(f"backtest_{a}_antes", d.get("antes"))
        variables(f"backtest_{a}_despues", d.get("despues"))
    for ev in resumen.get("estres") or []:
        if ev.get("estado") == "evaluado":
            variables(f"estres: {ev['evento']}" + (" (dentro de muestra)" if ev.get("en_muestra") else " (fuera de muestra)"), ev["metricas"])
        else:
            filas.append((f"estres: {ev['evento']}", "", "estado", ev.get("estado")))
    with open(carpeta / "metrics_summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["seccion", "variable", "metrica", "valor"])
        for s, v, k, x in filas:
            if isinstance(x, (float, np.floating)):
                x = "" if not np.isfinite(x) else round(float(x), 6)
            w.writerow([s, v, k, x])
