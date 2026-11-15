"""CLI principal de Kharis Engine.

  python run_kharis.py --demo-synthetic --export-onnx --tensorboard
  python run_kharis.py --data datos/kharis_honduras.csv.gz --export-onnx --tensorboard
  python run_kharis.py --data-1996-2020 base.csv --data-2020-2026 reciente.csv
  python run_kharis.py --data datos/kharis_honduras.csv.gz --actualizar      (aprendizaje continuo con dias nuevos)
  python run_kharis.py --data datos/kharis_honduras.csv.gz --pronosticar     (solo pronostico con la version activa)
  python run_kharis.py --versiones | --rollback v003
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from kharis import __version__
from kharis import config as C
from kharis import continuous as K
from kharis import data_pipeline as D
from kharis import export_viz as V
from kharis import physics as F
from kharis import train_eval as TE
from kharis.device import contar_parametros, elegir_precision, medir_latencia, memoria, seleccionar_dispositivo, tamano_modelo_mb
from kharis.model import Calibrador, crear_modelo

RAIZ = Path(__file__).resolve().parent


def carpetas(raiz: Path) -> dict:
    d = {k: raiz / k for k in ("artefactos", "reports", "runs", "salidas")}
    for p in d.values():
        p.mkdir(parents=True, exist_ok=True)
    return d


def cargar_datos(args, cfg):
    if args.demo_synthetic:
        print("[datos] modo sintetico: esquema multivariable de Honduras con huracanes y El Nino simulados")
        crudo = D.generar_sintetico(semilla=cfg.semilla)
    else:
        rutas = (args.data or []) + (getattr(args, "data_1996_2020") or []) + (getattr(args, "data_2020_2026") or [])
        if not rutas:   # sin --data: la carpeta processed/ del proyecto, o la copia unificada que viaja en el zip
            for cand in (RAIZ.parent / "processed", RAIZ / "datos" / "kharis_entrada.csv.gz"):
                if (cand / "power_diario_largo.csv").exists() or cand.is_file():
                    rutas = [str(cand)]
                    break
        if not rutas:
            return None, None
        print(f"[datos] leyendo {', '.join(str(r) for r in rutas)} ...")
        crudo = D.leer_varias(rutas)
    df, rep = D.limpiar(crudo)
    print(f"[datos] {rep['filas_salida']:,} filas, {rep['puntos']} puntos, {rep['desde']} a {rep['hasta']} | "
          f"centinelas -> NaN: {rep['centinelas_a_nan']:,} | fuera de rango -> NaN: {rep['fuera_de_rango_a_nan']:,} | duplicados: {rep['duplicados_quitados']:,}")
    if not args.demo_synthetic and any(Path(r).is_dir() for r in rutas):
        # copia unificada y limpia de lo leido: deja la corrida reproducible sin la carpeta original
        cols = [c for c in C.CLAVES + C.OBJETIVOS + C.EXOGENAS + C.CONTEXTO if c in df.columns]
        destino = RAIZ / "datos" / "kharis_entrada.csv.gz"
        destino.parent.mkdir(parents=True, exist_ok=True)
        df[df["fecha"] >= pd.Timestamp(cfg.inicio_datos)][cols].to_csv(destino, index=False, float_format="%.5g", date_format="%Y-%m-%d")
        print(f"[datos] copia unificada -> {destino} ({destino.stat().st_size / 2**20:.1f} MB)")
    panel = D.panel_desde_df(df, inicio=cfg.inicio_datos)
    return panel, rep


def abrir_servidor(nombre: str, comando: list, url: str) -> None:
    """Levanta TensorBoard o Netron como proceso aparte (sigue vivo al terminar el entrenamiento)."""
    import subprocess
    try:
        banderas = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
        subprocess.Popen(comando, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, creationflags=banderas)
        print(f"[{nombre}] abierto en {url}")
    except Exception as e:
        print(f"[{nombre}] no se pudo abrir ({e})")


def exportar(paquete, cfg, dirs, dev) -> dict:
    modelo = TE.modelo_de_paquete(paquete, dev)
    meta = {"version": paquete["meta"].get("version", ""), "objetivos": cfg.objetivos, "cuantiles": list(cfg.cuantiles),
            "horizonte_dias": cfg.horizonte, "seq_len_entrenamiento": cfg.seq_len, "features": paquete["escalador"]["nombres_x"]}
    info = V.exportar_onnx(modelo, paquete["n_features"], cfg.seq_len, dirs["artefactos"] / "kharis_engine.onnx", cfg.tol_onnx, meta)
    estado = "OK" if info["verificacion_ok"] else "FUERA DE TOLERANCIA"
    print(f"[onnx] {info['archivo']} ({info['tamano_mb']} MB, opset {info['opset']}, exportador {info['exportador']})")
    print(f"[onnx] verificacion PyTorch vs ONNX con {info['verificado_con']}: dif. max {info['dif_max']:.2e} (tol {info['tolerancia']:.0e}) -> {estado}")
    print(f"[onnx] para verlo: netron {info['archivo']}   (o arrastrarlo a https://netron.app)")
    return info


def escribir_salidas(dirs, ctx, paquete, pron, cfg) -> dict:
    """Contrato de salida para la fase siguiente: clima diario, fisica diaria y senales P1-P10 (CSV + JSON)."""
    s = dirs["salidas"]
    pron["clima_diario"].to_csv(s / "clima_diario.csv", index=False)
    archivos = {"clima_diario": "salidas/clima_diario.csv"}
    if pron["fisica_diaria"] is not None:
        pron["fisica_diaria"].to_csv(s / "fisica_diaria.csv", index=False)
        pron["senales"].to_csv(s / "senales_p1_p10.csv", index=False)
        archivos.update(fisica_diaria="salidas/fisica_diaria.csv", senales="salidas/senales_p1_p10.csv")
    fis, hist = TE.senales_historicas(ctx, paquete)
    if hist is not None:
        hist.to_csv(s / "senales_historicas.csv", index=False)
        t0 = ctx.t_bt_ini
        fd = F.fisica_a_dataframe(ctx.panel.puntos, ctx.panel.fechas[t0:], {k: (np.asarray(v)[:, t0:] if k in F.COLUMNAS_FISICA else v) for k, v in fis.items()})
        fd.insert(2, "tipo", "observado")
        fd.to_csv(s / "fisica_diaria_observada.csv.gz", index=False)
        archivos.update(senales_historicas="salidas/senales_historicas.csv", fisica_observada="salidas/fisica_diaria_observada.csv.gz")
    # JSON anidado por punto
    cd = pron["clima_diario"]
    puntos = []
    for i, p in enumerate(ctx.panel.puntos):
        c = cd[cd["punto"] == p]
        item = {"punto": p, "lat": float(ctx.panel.estatico[i, 0]), "lon": float(ctx.panel.estatico[i, 1]), "elevacion": float(ctx.panel.estatico[i, 2]),
                "clima_diario": {"fecha": [str(x)[:10] for x in c["fecha"].to_numpy()],
                                 **{v: {"media": c[v].tolist(), "p10": c[f"{v}_p10"].tolist(), "p50": c[f"{v}_p50"].tolist(), "p90": c[f"{v}_p90"].tolist()} for v in cfg.objetivos}}}
        if pron["fisica_diaria"] is not None:
            f = pron["fisica_diaria"][pron["fisica_diaria"]["punto"] == p]
            item["fisica_diaria"] = {k: f[k].tolist() for k in f.columns if k not in ("punto", "fecha", "tipo")}
            sn = pron["senales"][pron["senales"]["punto"] == p]
            item["senales"] = []
            for _, fila in sn.iterrows():
                d = {"temporada": int(fila["temporada"]), "fraccion_pronosticada": float(fila["fraccion_pronosticada"])}
                for k in C.PATRONES:
                    d[k] = {"valor": fila.get(f"{k}_valor"), "valor_p10": fila.get(f"{k}_valor_p10"), "valor_p90": fila.get(f"{k}_valor_p90"),
                            "percentil": fila.get(f"{k}_percentil"), "probabilidad": fila.get(f"{k}_prob"), "activo": bool(fila.get(f"{k}_activo"))}
                d["detalle"] = {k: fila[k] for k in sn.columns if not k.startswith("P") and k not in ("punto", "temporada", "fraccion_pronosticada")}
                item["senales"].append(d)
        puntos.append(item)
    contrato = {
        "contrato": "kharis.salida.v1", "motor": f"Kharis Engine {__version__}", "generado": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "version_modelo": paquete["meta"].get("version"), "fecha_base": str(pron["fecha_base"].date()),
        "dias_pronostico": int(len(pron["fechas"])), "miembros": int(pron["miembros"]), "horizonte_red_dias": cfg.horizonte,
        "cultivo": cfg.cultivo, "ciclo": cfg.ciclo, "metodo_et0": cfg.metodo_et0, "objetivos": cfg.objetivos,
        "unidades": {v: V.UNIDADES.get(v, "") for v in cfg.objetivos}, "patrones": C.PATRONES, "activacion": F.ACTIVACION,
        "nota": "media/p10/p50/p90 salen del conjunto de miembros; los primeros dias (horizonte de la red) son la salida directa calibrada.",
        "puntos": puntos,
    }
    V.guardar_json(contrato, s / "kharis_salida.json")
    archivos["json"] = "salidas/kharis_salida.json"
    archivos.update(escribir_web(dirs, ctx, paquete, pron, cfg))
    print(f"[salidas] pronostico de {len(pron['fechas'])} dias desde {pron['fecha_base'].date()} ({pron['miembros']} miembros, {pron['segundos']:.1f}s) -> {s}")
    return archivos


def escribir_web(dirs, ctx, paquete, pron, cfg, dias_historia: int = 90) -> dict:
    """Salida ligera para un sitio web: un JSON pequeno por punto y un indice (salidas/web/).

    El sitio no corre la red: lee estos archivos y dibuja. Cada punto trae los ultimos dias observados, el pronostico
    diario (media, p10, p90), los indices fisicos que siguen su calculo desde lo observado y las senales P1-P10.
    Se regeneran en cada entrenamiento, actualizacion o pronostico."""
    import json
    import re
    w = dirs["salidas"] / "web"
    w.mkdir(parents=True, exist_ok=True)
    panel, obj = ctx.panel, cfg.objetivos
    cd, fd, sn = pron["clima_diario"], pron["fisica_diaria"], pron["senales"]
    t1 = panel.t(pron["fecha_base"])
    t0 = max(0, t1 - dias_historia + 1)
    dec = {v: (1 if v == "RH2M" else 2) for v in obj}

    def lista(a, d=2):
        return [None if not np.isfinite(x) else round(float(x), d) for x in np.asarray(a, dtype=np.float64)]

    def compacto(o) -> str:
        return json.dumps(V._limpiar_nan(o), separators=(",", ":"), ensure_ascii=False, default=V._json)

    col_fis = [c for c in ("et0", "etc", "reserva", "reserva_p10", "reserva_p90", "deficit", "ks", "gdd_acum", "dias_secos_consec",
                           "prob_lluvia_intensa", "prob_dia_seco", "prob_dia_calor", "prob_dia_calor_floracion")
               if fd is not None and c in fd.columns]
    g_c = dict(tuple(cd.groupby("punto", sort=False)))
    g_f = dict(tuple(fd.groupby("punto", sort=False))) if fd is not None else {}
    g_s = dict(tuple(sn.groupby("punto", sort=False))) if sn is not None else {}
    puntos, total = [], 0
    for i, p in enumerate(panel.puntos):
        c = g_c[p]
        item = {"punto": p, "lat": float(panel.estatico[i, 0]), "lon": float(panel.estatico[i, 1]), "elevacion": float(panel.estatico[i, 2]),
                "historia": {"inicio": str(panel.fechas[t0].date()),
                             **{v: lista(panel.valores[i, t0: t1 + 1, ctx.ix_obj[j]], dec[v]) for j, v in enumerate(obj)}},
                "pronostico": {"inicio": str(pron["fechas"][0].date()), "dias": int(len(pron["fechas"])),
                               **{v: {"media": lista(c[v], dec[v]), "p10": lista(c[f"{v}_p10"], dec[v]), "p90": lista(c[f"{v}_p90"], dec[v])}
                                  for v in obj}}}
        if p in g_f:
            item["fisica"] = {k: lista(g_f[p][k]) for k in col_fis}
            item["senales"] = [{"temporada": int(f["temporada"]), "fraccion_pronosticada": float(f["fraccion_pronosticada"]),
                                **{k: {"valor": f.get(f"{k}_valor"), "percentil": f.get(f"{k}_percentil"), "probabilidad": f.get(f"{k}_prob"),
                                       "activo": bool(f.get(f"{k}_activo"))} for k in C.PATRONES}} for _, f in g_s[p].iterrows()]
        archivo = re.sub(r"[^A-Za-z0-9_-]", "_", str(p)) + ".json"
        texto = compacto(item)
        (w / archivo).write_text(texto, encoding="utf-8")
        total += len(texto)
        puntos.append({"punto": p, "lat": item["lat"], "lon": item["lon"], "elevacion": item["elevacion"], "archivo": archivo,
                       "kb": round(len(texto) / 1024, 1)})
    indice = {"contrato": "kharis.web.v1", "motor": f"Kharis Engine {__version__}", "generado": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "version_modelo": paquete["meta"].get("version"), "fecha_base": str(pron["fecha_base"].date()),
              "dias_pronostico": int(len(pron["fechas"])), "dias_historia": int(t1 - t0 + 1), "miembros": int(pron["miembros"]),
              "objetivos": obj, "unidades": {v: V.UNIDADES.get(v, "") for v in obj}, "fisica": col_fis, "patrones": C.PATRONES,
              "cultivo": cfg.cultivo, "ciclo": cfg.ciclo, "puntos": puntos,
              "nota": "Series diarias: el valor k corresponde a 'inicio' + k dias. null = sin dato."}
    (w / "indice.json").write_text(compacto(indice), encoding="utf-8")
    print(f"[web] {len(puntos)} puntos -> {w} ({total / 1024 / max(len(puntos), 1):.0f} KB por punto, {total / 2**20:.1f} MB en total)")
    return {"web": "salidas/web/indice.json"}


def graficas(dirs, ctx, paquete_base, bt, estres, historial, cfg):
    V.grafica_perdida(historial, dirs["reports"] / "loss_curve.png")
    puntos = ctx.panel.puntos
    rep = cfg.punto_reporte if cfg.punto_reporte in puntos else ("tegucigalpa" if "tegucigalpa" in puntos else puntos[0])
    i_rep = puntos.index(rep)
    paneles = []
    if bt:
        s = V.series_periodo(ctx, TE, paquete_base, bt, i_rep, ctx.panel.fechas[ctx.t_bt_ini], ctx.panel.fechas[ctx.t_bt_fin])
        if s:
            paneles.append({**s, "titulo": f"Backtesting {ctx.panel.fechas[ctx.t_bt_ini].year}–{ctx.panel.fechas[ctx.t_bt_fin].year} · {rep} · fuera de muestra"})
    j_ll = cfg.objetivos.index("PRECTOTCORR") if "PRECTOTCORR" in cfg.objetivos else 0
    for ev in estres:
        if ev.get("estado") != "evaluado":
            continue
        ini, fin = pd.Timestamp(ev["desde"]), pd.Timestamp(ev["hasta"])
        i = i_rep
        if ev["tipo"] == "ciclon":   # punto mas golpeado y unos dias de contexto
            ta, tb = ctx.panel.t(ini), ctx.panel.t(fin)
            i = int(np.nanargmax(np.nansum(ctx.panel.valores[:, ta: tb + 1, ctx.ix_obj[j_ll]], axis=1)))
            ini, fin = ini - pd.Timedelta(days=12), fin + pd.Timedelta(days=10)
        s = V.series_periodo(ctx, TE, paquete_base, bt, i, ini, fin)
        if s:
            marca = "dentro de muestra" if s["dentro_de_muestra"] else "fuera de muestra"
            paneles.append({**s, "titulo": f"{ev['evento']} · {puntos[i]} · {marca}"})
    V.grafica_pred_vs_real(paneles, dirs["reports"] / "pred_vs_real.png")
    if bt:
        V.grafica_residuos(bt, ctx, dirs["reports"] / "residuals_extremes.png")
    print(f"[reportes] loss_curve.png, pred_vs_real.png, residuals_extremes.png -> {dirs['reports']}")


def escribir_prueba(dirs, pr: dict) -> dict:
    """Guarda la prueba congelada (entrenar hasta X, predecir todo lo posterior, comparar con lo real)."""
    a0, a1 = pr["desde"][:4], pr["hasta"][:4]
    filas = pd.DataFrame(pr["filas"])
    filas.to_csv(dirs["reports"] / f"prueba_{a0}_{a1}.csv", index=False)
    V.grafica_prueba(pr, dirs["reports"] / f"prueba_{a0}_{a1}.png")
    pr["tabla"].to_csv(dirs["salidas"] / f"prediccion_vs_real_{a0}_{a1}.csv.gz", index=False, date_format="%Y-%m-%d")
    tot = filas[filas["periodo"] == pr["periodo"]].set_index(["modo", "variable"])
    largo = pr["modo_largo"]
    print(f"\nPrueba congelada: entrenado hasta {pr['entrenado_hasta']}, predicho {pr['desde']} a {pr['hasta']} y comparado con lo real")
    print(f"  {'variable':<20}{'a 1 dia':>9}{largo.replace('_', ' '):>9}{'climatol.':>10} |{'libre mes':>10}{'clim. mes':>10}{'corr anom':>10}   (MAE)")
    for v in pr["objetivos"]:
        g = lambda modo, col: tot.loc[(modo, v), col] if (modo, v) in tot.index else float("nan")
        print(f"  {v:<20}{g('a_1_dia', 'MAE'):>9.3f}{g(largo, 'MAE'):>9.3f}{g('a_1_dia', 'MAE_climatologia'):>10.3f} |"
              f"{g('libre_mensual', 'MAE'):>10.3f}{g('libre_mensual', 'MAE_climatologia'):>10.3f}{g('libre_mensual', 'Corr_anomalia'):>10.3f}")
    print("  (a 1 y 7 dias: usa observaciones previas a cada dia. libre: proyecta todo el periodo sin ver nada posterior al entrenamiento;")
    print("   se compara el promedio mensual. corr anom: correlacion de las anomalias mensuales, 0 = no distingue meses raros)")
    peor = max(pr["deriva"], key=lambda d: abs(d["deriva"]) / max(d["tolerancia"], 1e-9))
    print(f"  Deriva de la proyeccion libre (media proyectada de cada anio - climatologia del punto): {pr['deriva_fuera']} de {len(pr['deriva'])} casos "
          f"fuera de tolerancia -> indice de deriva {pr['indice_deriva']:.2f}")
    print(f"   (peor caso: {peor['variable']} {peor['periodo']}, {peor['deriva']:+.3f} con tolerancia {peor['tolerancia']:.3f}) | "
          f"cobertura de la banda p10-p90: " + ", ".join(f"{v} {c:.2f}" for v, c in pr["cobertura_banda"].items()))
    pd.DataFrame(pr["deriva"]).to_csv(dirs["reports"] / f"deriva_{a0}_{a1}.csv", index=False)
    print(f"[reportes] prueba_{a0}_{a1}.csv, prueba_{a0}_{a1}.png -> {dirs['reports']} | prediccion_vs_real_{a0}_{a1}.csv.gz -> {dirs['salidas']}")
    return {"entrenado_hasta": pr["entrenado_hasta"], "desde": pr["desde"], "hasta": pr["hasta"], "miembros_libre": pr["miembros_libre"],
            "segundos_libre": pr["segundos_libre"], "resumen": [f for f in pr["filas"] if f["periodo"] == pr["periodo"]],
            "indice_deriva": pr["indice_deriva"], "deriva_casos_fuera": pr["deriva_fuera"], "deriva": pr["deriva"],
            "cobertura_banda_p10_p90": pr["cobertura_banda"]}


def imprimir_tabla(titulo, antes, despues):
    nan = float("nan")
    print(f"\n{titulo}")
    print(f"  {'variable':<26}{'MAE':>7}{'MAE 1d':>8}{'RMSE':>8}{'Bias':>8}{'Corr 1d':>8}{'picos q90':>10}{'cob q95':>8}"
          f"{'skill MAE 1d':>13}{'skill RMSE':>11}")
    for v in despues:
        for etiqueta, m in (("antes", antes.get(v) if antes else None), ("despues" if antes else "", despues[v])):
            if m is None:
                continue
            print(f"  {(v + ' ' + etiqueta).strip():<26}{m['MAE']:>7.3f}{m.get('MAE_h1', nan):>8.3f}{m['RMSE']:>8.3f}{m['Bias']:>+8.3f}"
                  f"{m.get('Corr_h1', nan):>8.3f}{m.get('cobertura_picos_p95_q90', nan):>10.2f}{m.get('cobertura_q95', nan):>8.2f}"
                  f"{m.get('skill_h1_vs_climatologia', nan):>+13.3f}{m.get('skill_rmse_vs_climatologia', nan):>+11.3f}")
    print("  (skill = mejora frente a predecir la climatologia del punto; MAE 1d y Corr 1d = pronostico a 1 dia; el resto promedia 1-7 dias)")


def modo_entrenar(args, cfg, dirs, dev, panel, rep_datos):
    registro = K.Registro(dirs["artefactos"])
    ctx = TE.preparar_contexto(panel, cfg, dev)
    # precision mixta: se mide fp32 / fp16 / bf16 con la red real en esta GPU y se elige (bf16 en RTX 30+)
    dev, info_amp = elegir_precision(dev, lambda: crear_modelo(cfg, ctx.n_features), (cfg.lote, cfg.seq_len, ctx.n_features),
                                     (cfg.lote, cfg.horizonte, len(cfg.objetivos)), cfg.amp)
    ctx.dev = dev
    if "medicion" in info_amp:
        med = "  ".join(f"{k} {v['pasos_por_s']:.1f} pasos/s" for k, v in info_amp["medicion"].items())
        print(f"[device] precision mixta: {med}  ->  {info_amp['elegida']} ({info_amp['motivo']})")
    print(f"[datos] objetivos: {', '.join(cfg.objetivos)}")
    print(f"[datos] exogenas con mascara: {', '.join(cfg.exogenas) or '(ninguna)'} | {ctx.n_features} features por dia")
    print(f"[datos] entrenamiento {panel.fechas[0].date()} a {panel.fechas[ctx.t_val_ini - 1].date()} | validacion {panel.fechas[ctx.t_val_ini].date()} a "
          f"{panel.fechas[ctx.t_train_fin].date()} | backtesting {panel.fechas[ctx.t_bt_ini].date()} a {panel.fechas[ctx.t_bt_fin].date()}")
    tb = V.RegistroTB(dirs["runs"], cfg.tensorboard)
    if args.abrir_tensorboard:
        abrir_servidor("tensorboard", [sys.executable, "-m", "tensorboard.main", "--logdir", str(dirs["runs"]), "--port", "6006"], "http://localhost:6006")
    t_ini = time.perf_counter()
    mejor_ckpt = dirs["artefactos"] / "mejor_checkpoint.pt"

    def al_mejorar(modelo, ep, val):
        import torch
        torch.save({"estado": modelo.state_dict(), "epoca": ep, "val_loss": val}, mejor_ckpt)

    modelo, historial = TE.entrenar(ctx, tb, al_mejorar)
    seg_entrenamiento = time.perf_counter() - t_ini
    mejor = min(historial, key=lambda h: h["val_loss"])
    # calibracion inicial con la validacion (fuera de muestra para los pesos)
    p_va, t_va = ctx.vent.origenes(ctx.t_val_ini, ctx.t_train_fin)
    r_val = TE.predecir(modelo, ctx, p_va, t_va)
    pred0, cuant0 = TE.calibrar(r_val, None, cfg.objetivos)
    met_val = TE.calcular_metricas(pred0, cuant0, r_val, ctx)
    cal = Calibrador(cfg.cuantiles, cfg.calib_bins, cfg.calib_min_muestras).ajustar(r_val["pred"], r_val["cuant"], r_val["obs"])
    ref = TE.referencia_senales(ctx)
    modelo = TE.consolidar(modelo, ctx, tb)   # termina de ver 1996-2020 completo
    seg_entrenamiento = time.perf_counter() - t_ini
    meta = {"mae_ref": {v: met_val[v]["MAE"] for v in met_val}, "rmse_ref": {v: met_val[v]["RMSE"] for v in met_val},
            "datos_hasta": str(panel.fechas[ctx.t_train_fin].date()), "precision": dev.precision,
            "entrenado": time.strftime("%Y-%m-%d %H:%M:%S"), "dispositivo": dev.resumen(), "mejor_epoca": mejor["epoca"], "val_loss": mejor["val_loss"]}
    paquete_base = TE.crear_paquete(modelo, ctx, cal, ref, meta)
    registro.reiniciar()
    v_base = registro.guardar(paquete_base, {"val_loss": mejor["val_loss"], "mejor_epoca": mejor["epoca"]}, motivo="entrenamiento base")
    print(f"[entrenar] listo en {seg_entrenamiento:.1f}s | mejor epoca {mejor['epoca']} (val {mejor['val_loss']:.4f}) | version {v_base}")
    imprimir_tabla("Validacion (modelo base, sin calibrar)", None, met_val)

    bt, estres, prueba = {}, [], None
    paquete = paquete_base
    if not args.sin_backtest:
        bt = TE.backtesting(ctx, paquete_base, registro, tb)
        if bt:
            paquete = bt["paquete_final"]
            imprimir_tabla(f"Backtesting {panel.fechas[ctx.t_bt_ini].date()} a {panel.fechas[ctx.t_bt_fin].date()} (fuera de muestra): antes vs despues de calibrar/ajustar",
                           bt["metricas_antes"], bt["metricas_despues"])
        estres = TE.pruebas_estres(ctx, paquete_base, bt)
        print("\nPruebas de estres historico")
        for ev in estres:
            if ev["estado"] != "evaluado":
                print(f"  {ev['evento']:<22} {ev['estado']} ({ev.get('nota', '')})")
                continue
            m = ev["metricas"]
            ll, tx = m.get("PRECTOTCORR", {}), m.get("T2M_MAX", {})
            print(f"  {ev['evento']:<22} {'dentro' if ev['en_muestra'] else 'fuera '} de muestra | lluvia MAE {ll.get('MAE', float('nan')):.2f} mm, "
                  f"picos p95 {ll.get('cobertura_picos_p95', float('nan')):.2f}, fallo banda {ll.get('tasa_fallo_banda', float('nan')):.2f} | "
                  f"T2M_MAX MAE {tx.get('MAE', float('nan')):.2f} °C, fallo severo {tx.get('tasa_fallo_severo', float('nan')):.3f}")
        graficas(dirs, ctx, paquete_base, bt, estres, historial, cfg)
        if bt:
            prueba = escribir_prueba(dirs, TE.prueba_congelada(ctx, paquete_base, bt))
    else:
        V.grafica_perdida(historial, dirs["reports"] / "loss_curve.png")

    info_onnx = exportar(paquete, cfg, dirs, dev)   # siempre al terminar de entrenar: la version activa
    modelo_final = TE.modelo_de_paquete(paquete, dev)
    lat = medir_latencia(modelo_final, dev, cfg.seq_len, ctx.n_features)
    mem = memoria(dev)
    pron = TE.pronosticar(ctx, paquete)
    archivos = escribir_salidas(dirs, ctx, paquete, pron, cfg)
    activo = dirs["artefactos"] / "kharis_engine.pt"
    resumen = {
        "generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "motor": f"Kharis Engine {__version__}",
        "datos": {**(rep_datos or {}), "objetivos": cfg.objetivos, "exogenas": cfg.exogenas, "features_por_dia": ctx.n_features,
                  "entrenamiento": [str(panel.fechas[0].date()), str(panel.fechas[ctx.t_val_ini - 1].date())],
                  "validacion": [str(panel.fechas[ctx.t_val_ini].date()), str(panel.fechas[ctx.t_train_fin].date())],
                  "backtesting": [str(panel.fechas[ctx.t_bt_ini].date()), str(panel.fechas[ctx.t_bt_fin].date())]},
        "sistema": {"dispositivo": dev.resumen(), "precision": dev.precision, "precision_mixta": info_amp, **mem, **lat,
                    "segundos_entrenamiento": round(seg_entrenamiento, 2),
                    "segundos_por_epoca": round(float(np.mean([h["segundos"] for h in historial])), 3),
                    "segundos_pronostico": round(pron["segundos"], 2)},
        "modelo": {"arquitectura": "TCN residual causal dilatada + cabezales de media y cuantiles", "parametros": contar_parametros(modelo_final),
                   "tamano_pesos_mb": tamano_modelo_mb(modelo_final), "tamano_onnx_mb": info_onnx["tamano_mb"],
                   "tamano_paquete_mb": round(activo.stat().st_size / 2**20, 3), "campo_receptivo_dias": modelo_final.campo_receptivo,
                   "seq_len": cfg.seq_len, "horizonte": cfg.horizonte, "cuantiles": list(cfg.cuantiles),
                   "epocas": len(historial), "mejor_epoca": mejor["epoca"], "val_loss": mejor["val_loss"], "version_activa": registro.listar()["activa"]},
        "onnx": info_onnx, "historial": historial, "validacion": met_val,
        "backtest": {"antes": bt.get("metricas_antes"), "despues": bt.get("metricas_despues"), "por_anio": bt.get("por_anio"),
                     "walk_forward": [K._resumen_info(p) for p in bt.get("pasos", [])]} if bt else None,
        "prueba_congelada": prueba, "estres": estres, "salidas": archivos, "config": cfg.a_dict(),
    }
    V.guardar_resumen(resumen, dirs["reports"])
    tb.texto("resumen", f"version activa {resumen['modelo']['version_activa']} | {resumen['modelo']['parametros']:,} parametros | {resumen['modelo']['tamano_pesos_mb']} MB")
    tb.cerrar()
    s, m = resumen["sistema"], resumen["modelo"]
    print(f"\n[perfil] {m['parametros']:,} parametros | pesos {m['tamano_pesos_mb']} MB | ONNX {m['tamano_onnx_mb']} MB | paquete {m['tamano_paquete_mb']} MB")
    print(f"[perfil] {s['segundos_por_epoca']} s/epoca | latencia {s['latencia_ms_lote1']} ms (lote 1), {s['latencia_ms_lote256']} ms (lote 256) | "
          f"VRAM pico {s['vram_pico_mb']} MB | RAM {s['ram_mb']} MB")
    print(f"[listo] version activa {m['version_activa']} | reportes en {dirs['reports']} | salidas en {dirs['salidas']}")
    if args.abrir_netron:
        abrir_servidor("netron", [sys.executable, "-c", "import netron; netron.main()", str(dirs["artefactos"] / "kharis_engine.onnx"), "--port", "8081", "--browse"],
                       "http://localhost:8081")


def modo_operativo(args, dirs, dev, panel_fn):
    """--actualizar y/o --pronosticar con la version activa."""
    registro = K.Registro(dirs["artefactos"])
    paquete = registro.cargar()
    cfg = C.config_desde_args(args, C.KharisConfig.desde_dict(paquete["cfg"]))
    if args.amp == "auto" and paquete["meta"].get("precision"):   # misma precision con la que se entreno
        dev = dev.con_precision(paquete["meta"]["precision"])
    panel, _ = panel_fn(cfg)
    if panel is None:
        sys.exit("Faltan los datos: usa --data ARCHIVO (la serie completa, con los dias nuevos al final).")
    ctx = TE.preparar_contexto(panel, cfg, dev, paquete)
    print(f"[modelo] version activa {paquete['meta'].get('version')} | datos hasta {paquete['meta'].get('datos_hasta')} | {dev.resumen()}")
    if args.actualizar:
        tb = V.RegistroTB(dirs["runs"], cfg.tensorboard, nombre="continuo-" + time.strftime("%Y%m%d-%H%M%S"))
        paquete, info = K.actualizar_con_datos_nuevos(ctx, registro, tb)
        tb.cerrar()
        if info is not None:
            V.guardar_json(K._resumen_info(info), dirs["reports"] / f"actualizacion_{info['lote_hasta']}.json")
            exportar(paquete, cfg, dirs, dev)
    elif cfg.exportar_onnx:
        exportar(paquete, cfg, dirs, dev)
    pron = TE.pronosticar(ctx, paquete)
    escribir_salidas(dirs, ctx, paquete, pron, cfg)


def main(argv=None):
    args = C.construir_cli().parse_args(argv)
    cfg = C.config_desde_args(args)
    raiz = Path(args.salida) if args.salida else (RAIZ / "demo_sintetico" if args.demo_synthetic else RAIZ)
    dirs = carpetas(raiz)
    registro = K.Registro(dirs["artefactos"])
    if args.versiones:
        d = registro.listar()
        print(f"version activa: {d['activa']}")
        for v in d["versiones"]:
            i = v.get("info", {})
            dv = i.get("deriva", {})
            print(f"  {v['version']}{' *' if v['version'] == d['activa'] else '  '} {v['creada']}  datos hasta {v.get('datos_hasta')}  {v['tamano_mb']} MB  "
                  f"{v['motivo']}{'  deriva' if dv.get('hay_deriva') else ''}{'  [depurada]' if not v.get('archivo') else ''}")
        return
    dev = seleccionar_dispositivo(cfg.dispositivo, cfg.amp)
    print(f"Kharis Engine {__version__} | {dev.resumen()}")
    if args.rollback:
        v = registro.rollback(args.rollback)
        print(f"[rollback] version activa: {v}")
        paquete = registro.cargar()
        exportar(paquete, C.KharisConfig.desde_dict(paquete["cfg"]), dirs, dev)
        return
    if args.solo_onnx:
        paquete = registro.cargar()
        print(f"[modelo] version activa {paquete['meta'].get('version')} | datos hasta {paquete['meta'].get('datos_hasta')}")
        exportar(paquete, C.KharisConfig.desde_dict(paquete["cfg"]), dirs, dev)
        if args.abrir_netron:
            abrir_servidor("netron", [sys.executable, "-c", "import netron; netron.main()", str(dirs["artefactos"] / "kharis_engine.onnx"), "--port", "8081", "--browse"],
                           "http://localhost:8081")
        return
    if args.demo_synthetic:   # ajustes para que todo el flujo corra en segundos
        for k, v in dict(epocas=6, pasos_por_epoca=60, lote=512, canales=32, bloques=4, cont_epocas=1, cont_pasos=40,
                         miembros=8, dias_pronostico=120, paciencia=6, epocas_consolidacion=1, inicio_datos="1981-01-01").items():
            if getattr(args, k, None) is None:
                setattr(cfg, k, v)
    if args.actualizar or args.pronosticar:
        modo_operativo(args, dirs, dev, lambda c: cargar_datos(args, c))
        return
    panel, rep = cargar_datos(args, cfg)
    if panel is None:
        if cfg.exportar_onnx:   # solo exportar la version activa
            paquete = registro.cargar()
            exportar(paquete, C.KharisConfig.desde_dict(paquete["cfg"]), dirs, dev)
            return
        C.construir_cli().print_help()
        sys.exit("\nFaltan los datos: usa --demo-synthetic o --data / --data-1996-2020 / --data-2020-2026.")
    modo_entrenar(args, cfg, dirs, dev, panel, rep)


def salir_limpio(codigo: int = 0) -> None:
    """PyTorch 2.14 + Python 3.15 en Windows revienta (0xC0000005) al apagar el interprete despues de usar
    autograd en CUDA, cuando ya esta todo escrito. Se vacian los buferes y se sale sin ese apagado."""
    import os
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(codigo)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code, file=sys.stderr)
        salir_limpio(0 if e.code in (None, 0) else 1)
    except Exception:
        import traceback
        traceback.print_exc()
        salir_limpio(1)
    salir_limpio(0)
