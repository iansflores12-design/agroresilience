"""Busqueda de tamano y regularizacion de la red en la GPU, juzgada SOLO con la validacion (ultimos anios del
bloque base). No toca el periodo de backtesting, asi que no hay fuga hacia las metricas finales.

  python buscar_config.py                 (usa ../processed o datos/kharis_entrada.csv.gz)
  python buscar_config.py --data RUTA --epocas 8
  python buscar_config.py --reiniciar     (olvida lo ya probado)

Es reanudable: guarda reports/busqueda_gpu.json despues de cada candidata y, si se corta, sigue donde iba.
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
from kharis import data_pipeline as D
from kharis import export_viz as V
from kharis import train_eval as TE
from kharis.device import contar_parametros, elegir_precision, seleccionar_dispositivo, tamano_modelo_mb
from kharis.model import crear_modelo

RAIZ = Path(__file__).resolve().parent

CANDIDATAS = [
    dict(nombre="reg-64",       canales=64, bloques=5, seq_len=64,  dropout=0.25, weight_decay=1e-3, lr=1e-3, ruido_entrada=0.0),
    dict(nombre="chica-32",     canales=32, bloques=5, seq_len=64,  dropout=0.20, weight_decay=1e-3, lr=1e-3, ruido_entrada=0.0),
    dict(nombre="fuerte-64",    canales=64, bloques=5, seq_len=64,  dropout=0.40, weight_decay=1e-2, lr=7e-4, ruido_entrada=0.05),
    dict(nombre="ruido-96",     canales=96, bloques=5, seq_len=64,  dropout=0.35, weight_decay=1e-2, lr=7e-4, ruido_entrada=0.10),
    dict(nombre="lenta-64",     canales=64, bloques=5, seq_len=64,  dropout=0.30, weight_decay=1e-2, lr=4e-4, ruido_entrada=0.05),
    dict(nombre="larga-64x128", canales=64, bloques=6, seq_len=128, dropout=0.30, weight_decay=1e-2, lr=7e-4, ruido_entrada=0.05),
]


def main():
    ap = argparse.ArgumentParser(description="Busqueda de configuracion de Kharis en GPU (solo validacion). Reanudable.")
    ap.add_argument("--data", nargs="+")
    ap.add_argument("--epocas", type=int, default=8)
    ap.add_argument("--lote", type=int, default=1024)
    ap.add_argument("--dispositivo", default="auto")
    ap.add_argument("--amp", default="auto")
    ap.add_argument("--reiniciar", action="store_true")
    a = ap.parse_args()
    rutas = a.data
    if not rutas:
        for cand in (RAIZ.parent / "processed", RAIZ / "datos" / "kharis_entrada.csv.gz"):
            if (cand / "power_diario_largo.csv").exists() or cand.is_file():
                rutas = [str(cand)]
                break
    if not rutas:
        sys.exit("Faltan los datos: usa --data RUTA.")
    salida = RAIZ / "reports" / "busqueda_gpu.json"
    salida.parent.mkdir(exist_ok=True)
    resultados = []
    if salida.exists() and not a.reiniciar:
        resultados = json.loads(salida.read_text(encoding="utf-8")).get("resultados", [])
    hechas = {r["nombre"] for r in resultados}
    dev = seleccionar_dispositivo(a.dispositivo, a.amp)
    print(f"Busqueda de configuracion | {dev.resumen()} | ya probadas: {sorted(hechas) or 'ninguna'}", flush=True)
    df, _ = D.limpiar(D.leer_varias(rutas))
    for cand in CANDIDATAS:
        if cand["nombre"] in hechas:
            continue
        cfg = C.KharisConfig(epocas=a.epocas, lote=a.lote, paciencia=3, **{k: v for k, v in cand.items() if k != "nombre"})
        panel = D.panel_desde_df(df, inicio=cfg.inicio_datos)
        ctx = TE.preparar_contexto(panel, cfg, dev)
        ctx.dev, amp = elegir_precision(dev, lambda: crear_modelo(cfg, ctx.n_features), (cfg.lote, cfg.seq_len, ctx.n_features),
                                        (cfg.lote, cfg.horizonte, len(cfg.objetivos)), a.amp)
        t0 = time.perf_counter()
        modelo, hist = TE.entrenar(ctx)
        seg = time.perf_counter() - t0
        p, t = ctx.vent.origenes(ctx.t_val_ini, ctx.t_train_fin)
        r = TE.predecir(modelo, ctx, p, t)
        met = TE.calcular_metricas(*TE.calibrar(r, None, cfg.objetivos), r, ctx)
        mejor = min(hist, key=lambda h: h["val_loss"])
        fila = {**cand, "val_loss": round(mejor["val_loss"], 5), "mejor_epoca": mejor["epoca"], "epocas": len(hist),
                "corr_media": round(float(np.mean([m["Corr"] for m in met.values()])), 4),
                "parametros": contar_parametros(modelo), "tamano_mb": tamano_modelo_mb(modelo), "segundos": round(seg, 1),
                "precision": amp["elegida"], "pasos_por_s": {k: v["pasos_por_s"] for k, v in amp.get("medicion", {}).items()},
                "mae": {v: m["MAE"] for v, m in met.items()}}
        resultados.append(fila)
        V.guardar_json({"generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "dispositivo": dev.resumen(), "criterio": "val_loss (solo validacion)",
                        "resultados": sorted(resultados, key=lambda f: f["val_loss"])}, salida)   # se guarda tras cada candidata
        print(f"==> {cand['nombre']:<13} val_loss {fila['val_loss']:.4f} (epoca {fila['mejor_epoca']}/{fila['epocas']})  corr {fila['corr_media']:.3f}  "
              f"{fila['tamano_mb']} MB  {seg:.0f}s  {amp['elegida']} {fila['pasos_por_s']}\n", flush=True)
        del modelo, ctx
    resultados.sort(key=lambda f: f["val_loss"])
    g = resultados[0]
    print("Ranking por val_loss (menor es mejor):")
    for f in resultados:
        print(f"  {f['nombre']:<13} {f['val_loss']:.4f}  corr {f['corr_media']:.3f}  {f['tamano_mb']} MB  mejor epoca {f['mejor_epoca']}")
    print(f"\nMejor: {g['nombre']}  ->  python run_kharis.py --canales {g['canales']} --bloques {g['bloques']} --seq-len {g['seq_len']} "
          f"--dropout {g['dropout']} --weight-decay {g['weight_decay']} --lr {g['lr']} --ruido-entrada {g['ruido_entrada']}")


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)   # ver salir_limpio() en run_kharis.py
