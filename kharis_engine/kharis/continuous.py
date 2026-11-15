"""Aprendizaje continuo: ingesta incremental, deteccion de deriva, poda de datos, versionado y rollback.

Flujo de un lote nuevo [t0, t1]:
  1. La version activa predice el lote (fuera de muestra) -> error del lote y deriva.
  2. Se actualiza la calibracion con ese lote (mezcla exponencial, sin reentrenar).
  3. Ajuste fino corto de los pesos con muestreo ponderado: ventana deslizante + decaimiento temporal,
     conservando siempre los extremos (poda de datos obsoletos).
  4. Los ultimos `dias_holdout` dias del lote no se usan para ajustar: validan la candidata.
     Si empeora, se revierte (rollback automatico) y queda la version anterior.
"""
from __future__ import annotations

import copy
import json
import shutil
import time
from pathlib import Path

import numpy as np
import torch

from . import config as C
from . import data_pipeline as D
from . import train_eval as TE
from .model import Calibrador, crear_perdida


# =========================================================================== registro de versiones
class Registro:
    """Versiones ligeras del modelo en artefactos/versiones/ con indice registro.json."""

    def __init__(self, carpeta, max_versiones: int = 12):
        self.carpeta = Path(carpeta)
        self.dir_v = self.carpeta / "versiones"
        self.indice = self.carpeta / "registro.json"
        self.activo = self.carpeta / "kharis_engine.pt"
        self.max_versiones = max_versiones
        self.dir_v.mkdir(parents=True, exist_ok=True)

    def _leer(self) -> dict:
        if self.indice.exists():
            return json.loads(self.indice.read_text(encoding="utf-8"))
        return {"activa": None, "versiones": []}

    def _escribir(self, d: dict) -> None:
        self.indice.write_text(json.dumps(d, indent=2, ensure_ascii=False, default=_json), encoding="utf-8")

    def listar(self) -> dict:
        return self._leer()

    def reiniciar(self) -> None:
        """Borra el historial (un entrenamiento base nuevo empieza de v001)."""
        shutil.rmtree(self.dir_v, ignore_errors=True)
        self.dir_v.mkdir(parents=True, exist_ok=True)
        self._escribir({"activa": None, "versiones": []})

    def guardar(self, paquete: dict, info: dict, motivo: str = "", activar: bool = True) -> str:
        d = self._leer()
        n = 1 + max([int(v["version"][1:]) for v in d["versiones"]], default=0)
        version = f"v{n:03d}"
        paquete["meta"] = {**paquete.get("meta", {}), "version": version, "padre": d["activa"]}
        archivo = self.dir_v / f"{version}.pt"
        torch.save(paquete, archivo)
        ficha = {"version": version, "padre": d["activa"], "creada": time.strftime("%Y-%m-%d %H:%M:%S"), "motivo": motivo,
                 "datos_hasta": paquete["meta"].get("datos_hasta"), "tamano_mb": round(archivo.stat().st_size / 2**20, 3),
                 "archivo": f"versiones/{version}.pt", "info": _resumen_info(info)}
        d["versiones"].append(ficha)
        if activar:
            d["activa"] = version
            shutil.copyfile(archivo, self.activo)
        # huella minima: se conservan las ultimas versiones (y siempre la v001 base y la activa)
        sobran = [v for v in d["versiones"][1:-self.max_versiones] if v["version"] != d["activa"] and v.get("archivo")]
        for v in sobran:
            (self.carpeta / v["archivo"]).unlink(missing_ok=True)
            v["archivo"] = None
        self._escribir(d)
        return version

    def cargar(self, version: str | None = None) -> dict:
        d = self._leer()
        version = version or d["activa"]
        if version is None:
            raise FileNotFoundError(f"No hay ninguna version guardada en {self.carpeta}. Entrena primero.")
        ficha = next((v for v in d["versiones"] if v["version"] == version), None)
        if ficha is None or not ficha.get("archivo"):
            raise FileNotFoundError(f"La version {version} no existe o ya fue depurada.")
        return torch.load(self.carpeta / ficha["archivo"], map_location="cpu", weights_only=False)

    def rollback(self, version: str) -> str:
        """Vuelve a activar una version anterior. No borra nada: el historial queda intacto."""
        d = self._leer()
        ficha = next((v for v in d["versiones"] if v["version"] == version), None)
        if ficha is None or not ficha.get("archivo"):
            raise FileNotFoundError(f"La version {version} no existe o ya fue depurada.")
        d["activa"] = version
        d.setdefault("rollbacks", []).append({"a": version, "cuando": time.strftime("%Y-%m-%d %H:%M:%S")})
        shutil.copyfile(self.carpeta / ficha["archivo"], self.activo)
        self._escribir(d)
        return version


def _json(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def _resumen_info(info: dict) -> dict:
    return json.loads(json.dumps({k: v for k, v in info.items() if k != "metricas_lote_detalle"}, default=_json))


# =========================================================================== deriva
def _psi(ref: np.ndarray, nuevo: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index entre dos muestras (bordes = deciles de la referencia)."""
    ref, nuevo = ref[np.isfinite(ref)], nuevo[np.isfinite(nuevo)]
    if len(ref) < 100 or len(nuevo) < 30:
        return float("nan")
    bordes = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)[1:-1]))
    a = np.bincount(np.searchsorted(bordes, ref), minlength=len(bordes) + 1) / len(ref)
    b = np.bincount(np.searchsorted(bordes, nuevo), minlength=len(bordes) + 1) / len(nuevo)
    a, b = np.clip(a, 1e-4, None), np.clip(b, 1e-4, None)
    return float(((b - a) * np.log(b / a)).sum())


def detectar_deriva(ctx: TE.Contexto, t0: int, t1: int, mae_lote: dict, mae_ref: dict) -> dict:
    """Deriva de distribucion (PSI sobre anomalias desestacionalizadas) y deriva de error (MAE lote / referencia)."""
    cfg = ctx.cfg
    doy = ctx.panel.fechas.dayofyear.to_numpy() - 1
    res = {"psi": {}, "desvio_medio": {}, "razon_error": {}}
    for j, v in enumerate(cfg.objetivos):
        x = ctx.panel.valores[:, :, ctx.ix_obj[j]]
        z = (x - ctx.lb.media[:, doy, j]) / ctx.lb.std[:, doy, j]
        ref, nuevo = z[:, : ctx.t_train_fin + 1].ravel(), z[:, t0: t1 + 1].ravel()
        res["psi"][v] = round(_psi(ref, nuevo), 4)
        res["desvio_medio"][v] = round(float(np.nanmean(nuevo) - np.nanmean(ref)), 4) if np.isfinite(nuevo).any() else float("nan")
        if v in mae_lote and mae_ref.get(v):
            res["razon_error"][v] = round(mae_lote[v] / mae_ref[v], 4)
    psi_max = np.nanmax(list(res["psi"].values())) if res["psi"] else float("nan")
    razon = float(np.mean(list(res["razon_error"].values()))) if res["razon_error"] else float("nan")
    res["psi_max"], res["razon_error_media"] = round(float(psi_max), 4), round(razon, 4)
    res["deriva_distribucion"] = bool(np.isfinite(psi_max) and psi_max > cfg.umbral_psi)
    res["deriva_error"] = bool(np.isfinite(razon) and razon > cfg.umbral_error)
    res["hay_deriva"] = res["deriva_distribucion"] or res["deriva_error"]
    return res


# =========================================================================== ajuste fino con poda
def dias_holdout(t0: int, t1: int, T: int, cfg: C.KharisConfig) -> np.ndarray:
    """Dias del lote reservados para validar la candidata: bloques de 30 dias repartidos por todo el lote
    (cubren todas las estaciones). En lotes cortos, la segunda mitad."""
    m = np.zeros(T, dtype=bool)
    n, bloque = t1 - t0 + 1, 30
    nb = n // bloque
    if nb < 3:
        m[t0 + n // 2: t1 + 1] = True
        return m
    k = int(np.clip(round(cfg.dias_holdout / bloque), 1, nb // 2))
    paso = nb // k
    for b in range(paso - 1, nb, paso):
        m[t0 + b * bloque: min(t0 + (b + 1) * bloque, t1 + 1)] = True
    return m


def ajuste_fino(modelo, ctx: TE.Contexto, t_limite: int, deriva: bool, tb=None, etiqueta: str = "", excluir_dias=None):
    """Ajuste fino corto con muestreo ponderado por la politica de retencion.
    Usa solo dias <= t_limite y nunca los dias reservados (`excluir_dias`)."""
    cfg, dev = ctx.cfg, ctx.dev
    torch.manual_seed(cfg.semilla + t_limite)
    p, t = ctx.vent.origenes(0, t_limite, excluir_dias)
    pesos, poda = D.pesos_retencion(t, ctx.vent.origen_extremo[p, t], t_limite, cfg, deriva)
    vivos = pesos > 0
    p, t, pesos = p[vivos], t[vivos], pesos[vivos]
    if len(p) < cfg.lote:
        return modelo, {**poda, "pasos": 0}
    pt, tt = TE.a_tensor(ctx, p, t)
    w = torch.as_tensor(pesos, dtype=torch.float32, device=dev.device)
    perdida = crear_perdida(cfg).to(dev.device)
    pasos = cfg.cont_epocas * cfg.cont_pasos
    opt = torch.optim.AdamW(modelo.parameters(), lr=cfg.cont_lr, weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=pasos)
    amp = dev.scaler()
    modelo.train()
    acum = 0.0
    for i in range(pasos):
        idx = torch.multinomial(w, cfg.lote, replacement=True)
        comp = TE._paso_entrenamiento(modelo, perdida, ctx, opt, amp, pt[idx], tt[idx], cfg.p_ocultar_exogenas)
        sched.step()
        acum += float(comp["valor"])
        if tb is not None and i % 20 == 0:
            tb.escalar(f"Continuo/loss_{etiqueta}", float(comp["valor"]), i)
    modelo.eval()
    return modelo, {**poda, "pasos": pasos, "loss_media": acum / max(pasos, 1)}


# =========================================================================== actualizacion incremental
def actualizar_incremental(ctx: TE.Contexto, paquete: dict, t0: int, t1: int, tb=None, etiqueta: str = ""):
    """Incorpora los dias [t0, t1] a la version `paquete`. Devuelve (paquete nuevo, informe).

    El paquete nuevo puede traer: calibracion nueva + pesos nuevos, solo calibracion nueva, o nada nuevo
    (si todo empeora en el holdout). Nunca se queda con algo peor que lo que habia.
    """
    cfg, dev = ctx.cfg, ctx.dev
    obj = cfg.objetivos
    mae_ref = paquete["meta"].get("mae_ref", {})
    ref_err = (mae_ref, paquete["meta"].get("rmse_ref", {}))
    modelo0 = TE.modelo_de_paquete(paquete, dev)
    cal0 = Calibrador.desde_dict(paquete["calibrador"])
    p, t = ctx.vent.origenes(t0, t1)
    info = {"lote_desde": str(ctx.panel.fechas[t0].date()), "lote_hasta": str(ctx.panel.fechas[t1].date()), "ventanas_lote": int(len(p))}
    if len(p) < cfg.calib_min_muestras:
        info.update(deriva={"hay_deriva": False}, calibracion_aceptada=False, pesos_aceptados=False, nota="lote demasiado corto: sin cambios")
        nuevo = copy.deepcopy(paquete)
        nuevo["meta"]["datos_hasta"] = info["lote_hasta"]
        return nuevo, info
    # 1) error fuera de muestra de la version activa sobre el lote
    r_lote = TE.predecir(modelo0, ctx, p, t)
    pred_l, cuant_l = TE.calibrar(r_lote, cal0, obj)
    met = TE.calcular_metricas(pred_l, cuant_l, r_lote, ctx)
    mae_lote = {v: met[v]["MAE"] for v in met}
    info["mae_lote"] = mae_lote
    info["metricas_lote_detalle"] = met
    info["deriva"] = deriva = detectar_deriva(ctx, t0, t1, mae_lote, mae_ref)
    # 2) particion del lote: ajuste | holdout (bloques reservados que validan a la candidata)
    reservados = dias_holdout(t0, t1, len(ctx.panel.fechas), cfg)
    n_res = ctx.vent.dias_marcados(reservados)[t]
    aj, ho = n_res == 0, n_res == cfg.horizonte
    info["ventanas_holdout"] = int(ho.sum())
    if ho.sum() < 100 or aj.sum() < cfg.calib_min_muestras:
        info.update(calibracion_aceptada=False, pesos_aceptados=False, nota="lote demasiado corto para validar: sin cambios")
        nuevo = copy.deepcopy(paquete)
        nuevo["meta"]["datos_hasta"] = info["lote_hasta"]
        return nuevo, info
    r_aj = {k: (v[aj] if isinstance(v, np.ndarray) else v) for k, v in r_lote.items()}
    r_ho = {k: (v[ho] if isinstance(v, np.ndarray) else v) for k, v in r_lote.items()}
    s0 = TE.puntaje(TE.calibrar(r_ho, cal0, obj)[0], r_ho, ref_err, obj)
    # 3) calibracion candidata (se ajusta sin el holdout)
    cal_a = cal0.copia().ajustar(r_aj["pred"], r_aj["cuant"], r_aj["obs"], olvido=cfg.calib_olvido)
    s_cal = TE.puntaje(TE.calibrar(r_ho, cal_a, obj)[0], r_ho, ref_err, obj)
    cal_ok = bool(np.isfinite(s_cal) and s_cal <= s0 * cfg.tolerancia_rollback)
    cal_val = cal_a if cal_ok else cal0
    s_ref = s_cal if cal_ok else s0
    # 4) pesos candidatos: ajuste fino con poda (nunca ve los dias reservados)
    modelo1, poda = ajuste_fino(copy.deepcopy(modelo0), ctx, t1, deriva["hay_deriva"], tb, etiqueta, excluir_dias=reservados)
    pesos_ok, s_pesos = False, float("nan")
    if poda["pasos"] > 0:
        r1 = TE.predecir(modelo1, ctx, p[ho], t[ho])
        s_pesos = TE.puntaje(TE.calibrar(r1, cal_val, obj)[0], r1, ref_err, obj)
        pesos_ok = bool(np.isfinite(s_pesos) and s_pesos <= s_ref * cfg.tolerancia_rollback * (1 - cfg.mejora_minima_pesos))
    # 5) version resultante
    cal_final = cal0.copia().ajustar(r_lote["pred"], r_lote["cuant"], r_lote["obs"], olvido=cfg.calib_olvido) if cal_ok else cal0
    modelo_final = modelo1 if pesos_ok else modelo0
    nuevo = copy.deepcopy({k: v for k, v in paquete.items() if k != "estado"})
    nuevo["estado"] = {k: v.detach().cpu().clone() for k, v in modelo_final.state_dict().items()}
    nuevo["calibrador"] = cal_final.a_dict()
    nuevo["meta"]["datos_hasta"] = info["lote_hasta"]
    nuevo["meta"]["actualizaciones"] = nuevo["meta"].get("actualizaciones", 0) + 1
    info.update(puntaje_holdout_actual=round(s0, 5), puntaje_holdout_calibracion=round(s_cal, 5),
                puntaje_holdout_pesos=round(s_pesos, 5) if np.isfinite(s_pesos) else None,
                calibracion_aceptada=cal_ok, pesos_aceptados=pesos_ok, poda=poda,
                rollback_automatico=bool(poda["pasos"] > 0 and not pesos_ok))
    if tb is not None:
        paso = nuevo["meta"]["actualizaciones"]
        tb.escalar("Continuo/psi_max", deriva["psi_max"], paso)
        tb.escalar("Continuo/razon_error", deriva["razon_error_media"], paso)
        tb.escalar("Continuo/puntaje_holdout_actual", s0, paso)
        if np.isfinite(s_pesos):
            tb.escalar("Continuo/puntaje_holdout_candidata", s_pesos, paso)
    return nuevo, info


def actualizar_con_datos_nuevos(ctx: TE.Contexto, registro: Registro, tb=None):
    """Modo operativo: toma la version activa, detecta que dias son nuevos y los incorpora."""
    paquete = registro.cargar()
    hasta = paquete["meta"].get("datos_hasta")
    t0 = ctx.panel.t(hasta) + 1 if hasta else ctx.t_bt_ini
    presentes = np.isfinite(ctx.panel.valores[:, :, ctx.ix_obj]).mean(axis=(0, 2))
    t1 = int(np.nonzero(presentes >= 0.5)[0][-1])
    if t1 < t0:
        print(f"[continuo] no hay dias nuevos despues de {hasta}: nada que actualizar")
        return paquete, None
    nuevo, info = actualizar_incremental(ctx, paquete, t0, t1, tb=tb, etiqueta="operativo")
    if info.get("nota"):
        # Lote corto: no alcanza para validar una calibracion ni unos pesos nuevos. No se guarda version ni se avanza
        # `datos_hasta`: los dias se acumulan y entran completos en la proxima actualizacion (no se pierden).
        print(f"[continuo] {t1 - t0 + 1} dias nuevos ({info['lote_desde']} a {info['lote_hasta']}): todavia son pocos para recalibrar. "
              f"Se acumulan para la proxima actualizacion; el pronostico ya parte del ultimo dia.")
        return paquete, None
    version = registro.guardar(nuevo, info, motivo=f"lote {info['lote_desde']} a {info['lote_hasta']}")
    info["version"] = version
    d = info["deriva"]
    print(f"[continuo] lote {info['lote_desde']} a {info['lote_hasta']} ({info['ventanas_lote']:,} ventanas)")
    print(f"[continuo] deriva: {'SI' if d.get('hay_deriva') else 'no'} (PSI max {d.get('psi_max')}, razon de error {d.get('razon_error_media')})")
    if "poda" in info:
        pd_ = info["poda"]
        print(f"[continuo] poda: {pd_['podadas']:,} ventanas descartadas, {pd_['extremos_conservados']:,} extremos conservados, "
              f"{pd_['retenidas_recientes']:,} recientes")
        print(f"[continuo] calibracion {'aceptada' if info['calibracion_aceptada'] else 'rechazada'}; "
              f"pesos {'aceptados' if info['pesos_aceptados'] else 'revertidos (rollback automatico)'} -> {version} activa")
    return nuevo, info
