"""Pagina HTML de la prueba 2021-2026 del motor reforzado (mezcla con la climatologia + El Nino).

Junta en una sola pagina, por lugar (Honduras o cualquiera de los 30 puntos) y variable:
  - serie mensual 2021-2026: real, prediccion a 1 dia, proyeccion libre desde 2020 con su banda, climatologia
    y (solo Honduras) la proyeccion libre de la corrida anterior;
  - escala diaria: mejora frente a la climatologia por dia de adelanto (1 a 7), sin y con la mezcla;
  - multianual: anomalia de cada anio frente a la climatologia, real y proyectada, con la tolerancia de deriva;
  - lluvia por umbral (Brier) y El Nino (validacion cruzada y prueba congelada).

Todo con el motor congelado al 31-12-2020 (v001). Uso:
  ..\\.venv_kharis\\Scripts\\python.exe exportar_html_2021_2026.py [--antes RUTA_HTML_ANTERIOR]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from kharis import config as C
from kharis import continuous as K
from kharis import data_pipeline as D
from kharis import train_eval as TE
from kharis.device import seleccionar_dispositivo
from kharis.model import Calibrador

RAIZ = Path(__file__).resolve().parent
VARS = [("PRECTOTCORR", "Lluvia", "mm/día", 2), ("T2M_MAX", "Temp. máxima", "°C", 2), ("T2M_MIN", "Temp. mínima", "°C", 2),
        ("T2M", "Temp. media", "°C", 2), ("RH2M", "Humedad", "%", 1), ("WS2M", "Viento", "m/s", 2),
        ("ALLSKY_SFC_SW_DWN", "Radiación", "MJ/m²/día", 2)]
NOMBRES = {"brus_laguna": "Brus Laguna", "catacamas": "Catacamas", "choluteca": "Choluteca", "comayagua": "Comayagua",
           "copan_ruinas": "Copán Ruinas", "danli": "Danlí", "el_progreso": "El Progreso", "gracias": "Gracias",
           "juticalpa": "Juticalpa", "lago_yojoa": "Lago de Yojoa", "la_ceiba": "La Ceiba", "la_esperanza": "La Esperanza",
           "la_paz": "La Paz", "marcala": "Marcala", "nacaome": "Nacaome", "ocotepeque": "Ocotepeque", "olanchito": "Olanchito",
           "puerto_lempira": "Puerto Lempira", "roatan": "Roatán", "san_marcos_colon": "San Marcos de Colón",
           "santa_barbara": "Santa Bárbara", "santa_rosa": "Santa Rosa de Copán", "siguatepeque": "Siguatepeque",
           "sula": "Valle de Sula", "tegucigalpa": "Tegucigalpa", "tela": "Tela", "tocoa": "Tocoa", "trujillo": "Trujillo",
           "yoro": "Yoro", "zamorano": "Zamorano"}


def r(a, d=2):
    """Lista JSON con NaN -> None y redondeo."""
    a = np.asarray(a, dtype=np.float64)
    return [None if not np.isfinite(x) else round(float(x), d) for x in a.reshape(-1)]


def leer_antes(ruta: Path | None) -> dict:
    """Proyeccion libre regional de la corrida anterior, sacada del HTML viejo (const D = {...})."""
    if not ruta or not ruta.exists():
        return {}
    t = ruta.read_text(encoding="utf-8")
    m = re.search(r"const D=(\{.*?\});\s*const V=", t, re.S)
    if not m:
        return {}
    d = json.loads(m.group(1))
    return {v: d[v].get("libre") for v in d if "libre" in d[v]}


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--antes", default=str(Path.home() / "Downloads" / "kharis_recalculo_2021_2026_sin_deriva.html"))
    a.add_argument("--salida", default=str(RAIZ.parent / "kharis_documentacion" / "html" / "kharis_2021_2026_reforzado.html"))
    args = a.parse_args()

    paq = K.Registro(RAIZ / "artefactos").cargar("v001")
    cfg = C.KharisConfig.desde_dict(paq["cfg"])
    dev = seleccionar_dispositivo("auto", "auto")
    if paq["meta"].get("precision"):
        dev = dev.con_precision(paq["meta"]["precision"])
    df, _ = D.limpiar(D.leer_varias([str(RAIZ / "datos" / "kharis_entrada.csv.gz")]))
    panel = D.panel_desde_df(df, inicio=cfg.inicio_datos)
    ctx = TE.preparar_contexto(panel, cfg, dev, paq)
    obj = cfg.objetivos
    puntos = list(panel.puntos)
    P = len(puntos)

    # ---------- serie diaria de la prueba congelada (escrita por la corrida) ----------
    tab = pd.read_csv(RAIZ / "salidas" / "prediccion_vs_real_2021_2026.csv.gz", parse_dates=["fecha"])
    fechas = pd.DatetimeIndex(sorted(tab["fecha"].unique()))
    n = len(fechas)
    pos_p = {p: i for i, p in enumerate(puntos)}
    ip = tab["punto"].map(pos_p).to_numpy()
    it = fechas.get_indexer(tab["fecha"])
    clim_d = ctx.lb.media[:, fechas.dayofyear.to_numpy() - 1]          # [P, n, V]
    meses = fechas.to_period("M")
    cod, uni = pd.factorize(meses)
    etiquetas = [str(m) for m in uni]
    anios = sorted(set(fechas.year))

    def cubo(col):
        x = np.full((P, n), np.nan)
        x[ip, it] = tab[col].to_numpy(dtype=np.float64)
        return x

    def mensual(x):
        out = np.full((x.shape[0], len(uni)), np.nan)
        for j in range(len(uni)):
            m = cod == j
            ok = np.isfinite(x[:, m]).sum(1) >= 20
            with np.errstate(all="ignore"):
                out[:, j] = np.where(ok, np.nanmean(x[:, m], axis=1), np.nan)
        return out

    serie, stats, anual = {}, {}, {}
    for v, _, _, dec in VARS:
        j = obj.index(v)
        real, p1, libre, p10, p90 = (cubo(f"{v}_{c}") for c in ("real", "pred_1d", "libre", "libre_p10", "libre_p90"))
        clim = clim_d[:, :, j].astype(np.float64)
        mm = {k: mensual(x) for k, x in (("real", real), ("pred", p1), ("libre", libre), ("p10", p10), ("p90", p90), ("clim", clim))}
        serie[v] = {"honduras": {k: r(np.nanmean(x, axis=0), dec) for k, x in mm.items()}}
        stats[v] = {}
        anual[v] = {}
        for i, p in enumerate(["honduras"] + puntos):
            sel = slice(None) if p == "honduras" else slice(i - 1, i)
            if p != "honduras":
                serie[v][p] = {k: r(x[i - 1], dec) for k, x in mm.items()}
            e1 = np.abs(p1[sel] - real[sel])
            ec = np.abs(clim[sel] - real[sel])
            rm, lm, cm = (np.nanmean(mm[k][sel], axis=0) for k in ("real", "libre", "clim"))
            stats[v][p] = {"mae1": round(float(np.nanmean(e1)), 3), "maeclim": round(float(np.nanmean(ec)), 3),
                           "libre_mes": round(float(np.nanmean(np.abs(lm - rm))), 3), "clim_mes": round(float(np.nanmean(np.abs(cm - rm))), 3)}
            fila = {"real": [], "libre": []}
            for y in anios:
                m = fechas.year == y
                fila["real"].append(float(np.nanmean(real[sel][:, m] - clim[sel][:, m])))
                fila["libre"].append(float(np.nanmean(libre[sel][:, m] - clim[sel][:, m])))
            anual[v][p] = {k: r(x, 3) for k, x in fila.items()}

    # tolerancia de deriva (regional) y casos fuera
    der = pd.read_csv(RAIZ / "reports" / "deriva_2021_2026.csv")
    tol = {v: float(der[der["variable"] == v]["tolerancia"].iloc[0]) for v, *_ in VARS if (der["variable"] == v).any()}

    # ---------- escala diaria: mejora por dia de adelanto, sin y con mezcla ----------
    p, t = ctx.vent.origenes(ctx.t_bt_ini, ctx.t_bt_fin)
    rr = TE.predecir(TE.modelo_de_paquete(paq, dev), ctx, p, t)
    cal = Calibrador.desde_dict(paq["calibrador"])
    niveles = np.asarray(cfg.cuantiles, dtype=np.float32)
    dias = t[:, None] + np.arange(1, cfg.horizonte + 1)[None, :]
    doy = panel.fechas.dayofyear.to_numpy()[dias] - 1
    cq = ctx.clim_q[p[:, None], doy]
    cm = ctx.lb.media[p[:, None], doy]
    obs = rr["obs"].astype(np.float32)

    def pinball(q):
        d = obs[..., None] - q
        return np.maximum(niveles * d, (niveles - 1) * d).mean(-1)            # [N, H, V]

    l_clim = pinball(cq)
    e_clim = (cm - obs) ** 2
    horizonte = {}
    for nombre, con in (("sin", None), ("con", ctx)):
        pr, qq = TE.calibrar(rr, cal, obj, con)
        lk, ek = pinball(qq.astype(np.float32)), (pr - obs) ** 2
        for v, *_ in VARS:
            j = obj.index(v)
            horizonte.setdefault(v, {})
            for i, pt in enumerate(["honduras"] + puntos):
                m = np.ones(len(p), bool) if pt == "honduras" else (p == i - 1)
                ok = np.isfinite(obs[m, :, j])
                def media(x):
                    return np.array([np.nanmean(np.where(ok[:, h], x[m, h, j], np.nan)) for h in range(cfg.horizonte)])
                sk_q = 1 - media(lk) / media(l_clim)
                sk_r = 1 - np.sqrt(media(ek)) / np.sqrt(media(e_clim))
                horizonte[v].setdefault(pt, {})[nombre] = {"cuantiles": r(100 * sk_q, 1), "rmse": r(100 * sk_r, 1)}

    lluvia = {k: json.loads((RAIZ / "reports" / f).read_text(encoding="utf-8"))
              for k, f in (("antes", "lluvia_probabilistica_sin_mezcla.json"), ("ahora", "lluvia_probabilistica.json"))}
    enso = json.loads((RAIZ / "reports" / "enso_validacion.json").read_text(encoding="utf-8"))
    met = json.loads((RAIZ / "reports" / "metrics_summary.json").read_text(encoding="utf-8"))
    pc = met.get("prueba_congelada", {})

    datos = {
        "meses": etiquetas, "anios": anios, "vars": [list(x) for x in VARS],
        "lugares": [["honduras", "Honduras (promedio de 30 puntos)"]] + [[q, NOMBRES.get(q, q)] for q in puntos],
        "serie": serie, "stats": stats, "anual": anual, "tol": tol, "antes": leer_antes(Path(args.antes)),
        "horizonte": horizonte, "lluvia": lluvia, "enso": enso,
        "deriva": {"indice": pc.get("indice_deriva"), "fuera": pc.get("deriva_casos_fuera"), "casos": len(der)},
        "cobertura": pc.get("cobertura_banda_p10_p90", {}),
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
    }
    plantilla = (RAIZ / "plantilla_2021_2026.html").read_text(encoding="utf-8")
    html = plantilla.replace("/*__DATOS__*/null", json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    Path(args.salida).write_text(html, encoding="utf-8")
    print(f"-> {args.salida} ({Path(args.salida).stat().st_size / 1024:.0f} KB)")


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
