"""Configuracion de Kharis Engine: esquema AgroResilience Honduras, umbrales fisicos, poda y flags del CLI.

Todo lo ajustable vive aqui. El resto de modulos no tiene numeros magicos.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field, fields

# --------------------------------------------------------------------------- esquema de datos
# Variables objetivo (clima diario que predice la red), en el orden de salida del modelo.
OBJETIVOS = ["T2M_MAX", "T2M_MIN", "T2M", "PRECTOTCORR", "WS2M_MAX", "RH2M", "ALLSKY_SFC_SW_DWN"]
# Si un objetivo no viene en los datos se usa su sustituto (y se avisa).
SUSTITUTOS = {"WS2M_MAX": "WS2M"}
# Entradas complementarias (opcionales). Cada una lleva un canal de mascara: si falta, no se inventa.
EXOGENAS = ["WS2M", "precipitation", "soil_moisture", "swvl1", "NDVI", "oni"]
# Columnas que se conservan en la limpieza pero no entran a la red (contexto para fases futuras).
CONTEXTO = ["T2MDEW", "TOA_SW_DWN", "GWETROOT", "GWETTOP", "sm_rootzone", "EVI", "B04", "B08", "B11",
            "t2m", "tp", "swvl2", "swvl3", "swvl4", "lluvia_chirps", "gldas_suelo_0_10", "gldas_suelo_10_40",
            "gldas_suelo_40_100", "gldas_evap", "gldas_escorrentia", "estado_enso"]
CLAVES = ["punto", "fecha", "lat", "lon", "elevacion"]

# Nombres alternos -> nombre canonico. Permite leer directo processed/modelo/diario.csv.gz y exportes crudos.
ALIAS = {
    "date": "fecha", "DATE": "fecha", "time": "fecha", "dia_local": "fecha",
    "latitud": "lat", "latitude": "lat", "LAT": "lat",
    "longitud": "lon", "longitude": "lon", "LON": "lon",
    "elevacion_m": "elevacion", "elevation": "elevacion", "ELEV": "elevacion", "altitud": "elevacion",
    "id": "punto", "zona": "punto", "estacion": "punto",
    "tmed_c": "T2M", "tmax_c": "T2M_MAX", "tmin_c": "T2M_MIN", "lluvia_power_mm": "PRECTOTCORR",
    "humedad_rel_pct": "RH2M", "viento_2m_ms": "WS2M", "viento_max_2m_ms": "WS2M_MAX",
    "radiacion_mj_m2": "ALLSKY_SFC_SW_DWN",
    "lluvia_imerg_mm": "precipitation", "smap_humedad_m3m3": "soil_moisture", "sm_surface": "soil_moisture",
    "ndvi": "NDVI", "evi": "EVI", "ONI": "oni",
    "gldas_suelo_0_10_kgm2": "gldas_suelo_0_10", "gldas_suelo_10_40_kgm2": "gldas_suelo_10_40",
    "gldas_suelo_40_100_kgm2": "gldas_suelo_40_100", "gldas_evap_real_mm": "gldas_evap",
    "gldas_escorrentia_mm": "gldas_escorrentia",
}

# Centinelas de dato faltante: se convierten a NaN, NUNCA a 0.
CENTINELAS = (-999.0, -9999.0, -99.0, -999.9, -666.0)
# Rango fisico valido por variable; fuera de el el dato es invalido -> NaN.
LIMITES = {
    "T2M": (-25.0, 55.0), "T2M_MAX": (-25.0, 60.0), "T2M_MIN": (-30.0, 50.0), "T2MDEW": (-40.0, 40.0),
    "PRECTOTCORR": (0.0, 2000.0), "precipitation": (0.0, 2000.0), "tp": (0.0, 2000.0), "lluvia_chirps": (0.0, 2000.0),
    "RH2M": (0.0, 100.0), "WS2M": (0.0, 90.0), "WS2M_MAX": (0.0, 90.0),
    "ALLSKY_SFC_SW_DWN": (0.0, 45.0), "TOA_SW_DWN": (0.0, 50.0),
    "soil_moisture": (0.0, 1.0), "sm_rootzone": (0.0, 1.0), "swvl1": (0.0, 1.0),
    "GWETROOT": (0.0, 1.0), "GWETTOP": (0.0, 1.0), "NDVI": (-1.0, 1.0), "EVI": (-1.0, 1.0), "oni": (-5.0, 5.0),
}
# Variables con cola pesada: se modelan en log1p (transformacion invertible).
LOG1P = {"PRECTOTCORR", "precipitation", "WS2M", "WS2M_MAX"}
# Que colas pesa la perdida extreme-aware: "alta" (>= p80/p95) o "ambas" (ademas <= p20/p05).
COLAS = {"T2M_MIN": "ambas", "RH2M": "ambas"}
# Extremos criticos que la poda de datos nunca descarta: dia con valor >= p99 ("alta") o <= p01 ("baja") del punto.
CRITICAS = {"PRECTOTCORR": "alta", "WS2M_MAX": "alta", "WS2M": "alta", "T2M_MAX": "alta", "T2M_MIN": "baja"}
# Muestreo conjunto del pronostico largo: (grupo latente, signo). Mismo grupo = variables correlacionadas.
GRUPOS_MUESTREO = {"T2M_MAX": ("temp", 1), "T2M_MIN": ("temp", 1), "T2M": ("temp", 1),
                   "PRECTOTCORR": ("agua", 1), "RH2M": ("agua", 1), "ALLSKY_SFC_SW_DWN": ("agua", -1),
                   "WS2M_MAX": ("viento", 1), "WS2M": ("viento", 1)}

# --------------------------------------------------------------------------- umbrales fisicos
LLUVIA_SECA_MM = 1.0        # dia seco: lluvia < 1 mm
LLUVIA_INTENSA_MM = 50.0    # lluvia intensa: > 50 mm/dia
T_ESTRES_C = 35.0           # estres termico general
VIENTO_FUERTE_MS = 8.0      # viento maximo diario a 2 m considerado dano potencial
CAPACIDAD_SUELO_MM_M = 140.0  # agua disponible total por metro de raiz (franco medio)

# Parametros de cultivo (FAO-56). etapas = dias de inicial, desarrollo, media, final.
CULTIVOS = {
    "maiz":   dict(gdd=(10, 30), kc=(0.30, 1.20, 0.60), etapas=(20, 35, 40, 30), p=0.55, zr=1.0, t_calor=35.0, floracion=(50, 75)),
    "frijol": dict(gdd=(10, 30), kc=(0.40, 1.15, 0.35), etapas=(20, 30, 40, 20), p=0.45, zr=0.6, t_calor=30.0, floracion=(35, 55)),
    "sorgo":  dict(gdd=(10, 35), kc=(0.30, 1.00, 0.55), etapas=(20, 35, 40, 30), p=0.55, zr=1.0, t_calor=38.0, floracion=(55, 80)),
    "cafe":   dict(gdd=(10, 30), kc=(0.90, 0.95, 0.95), etapas=(30, 60, 180, 95), p=0.40, zr=0.9, t_calor=30.0, floracion=(0, 60)),
    "yuca":   dict(gdd=(12, 35), kc=(0.30, 0.80, 0.30), etapas=(20, 40, 90, 60), p=0.35, zr=0.5, t_calor=38.0, floracion=(60, 150)),
}
SIEMBRA = {"primera": (5, 15), "postrera": (9, 1)}   # (mes, dia)
TEMPORADA_LLUVIAS = (5, 10)                          # mayo a octubre
CANICULA = ((7, 1), (8, 31))                         # ventana de busqueda de la canicula
INICIO_LLUVIAS = dict(desde=(4, 15), mm_3d=25.0, max_seco_30d=8, tope=(7, 31))
ANIOS_NINO = [1982, 1987, 1991, 1997, 2002, 2009, 2015, 2023]  # respaldo si no hay columna oni

# Eventos de estres historico: (nombre, inicio, fin, tipo)
EVENTOS_ESTRES = [
    ("Super El Nino 1982", "1982-05-01", "1983-04-30", "sequia_calor"),
    ("Super El Nino 1997", "1997-05-01", "1998-04-30", "sequia_calor"),
    ("Huracan Mitch 1998", "1998-10-22", "1998-11-08", "ciclon"),
    ("Super El Nino 2015", "2015-05-01", "2016-04-30", "sequia_calor"),
    ("Eta e Iota 2020", "2020-11-01", "2020-11-22", "ciclon"),
    ("El Nino 2023", "2023-05-01", "2024-04-30", "sequia_calor"),
]

# Definicion de las senales P1..P10 (para el contrato de salida).
PATRONES = {
    "P1": "inicio tardio de lluvias (dias de retraso del inicio de la temporada)",
    "P2": "canicula (racha seca maxima julio-agosto, dias)",
    "P3": "deficit hidrico acumulado mayo-octubre (ET0 - lluvia, mm)",
    "P4": "rachas secas criticas (racha seca maxima en temporada, dias)",
    "P5": "calor en floracion (dias sobre el limite termico del cultivo)",
    "P6": "estres hidrico por etapa (maximo de 1-ks medio por etapa, 0..1)",
    "P7": "eventos extremos de lluvia/viento (indice de severidad)",
    "P8": "similitud con El Nino (coseno contra el compuesto historico, -1..1)",
    "P9": "fuera de rango (% de dias fuera de la envolvente historica)",
    "P10": "sin patron (1 si ninguna senal P1..P9 esta activa)",
}


# --------------------------------------------------------------------------- configuracion
@dataclass
class KharisConfig:
    # ventanas
    seq_len: int = 64                 # dias de entrada
    horizonte: int = 7                # dias que predice la red de un golpe
    cuantiles: tuple = (0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)
    # periodos del protocolo experimental
    inicio_datos: str = "1996-01-01"        # 30 anios de historia (admite desde 1981 con --inicio-datos)
    fin_entrenamiento: str = "2020-12-31"   # base 1996-2020 completo
    anios_validacion: int = 2               # ultimos anios del bloque base: early stopping y 1a calibracion
    epocas_consolidacion: int = 2           # tras elegir la mejor epoca, repasa todo 1996-2020 (incluida la validacion)
    inicio_backtest: str = "2021-01-01"     # el backtesting empieza el dia siguiente al entrenamiento
    fin_backtest: str = "2026-12-31"
    # red y entrenamiento: valores elegidos con buscar_config.py en la RTX 3070 (mejor perdida de validacion 2019-2020).
    # La red se sobreajusta a partir de la epoca 3: por eso lleva regularizacion fuerte y parada temprana corta.
    canales: int = 96
    bloques: int = 5
    kernel: int = 3
    dropout: float = 0.35
    epocas: int = 8
    lote: int = 1024
    pasos_por_epoca: int = 300
    lr: float = 7e-4
    weight_decay: float = 1e-2
    paciencia: int = 3
    p_ocultar_exogenas: float = 0.25
    ruido_entrada: float = 0.10         # desviacion del ruido gaussiano sobre las entradas (escala del modelo)
    semilla: int = 1134
    # perdida extreme-aware
    huber_beta: float = 1.0
    peso_p80: float = 1.0
    peso_p95: float = 3.0
    lambda_cuantil: float = 1.0
    lambda_cola: float = 0.25
    # calibracion
    calib_bins: int = 24
    calib_min_muestras: int = 400
    calib_olvido: float = 0.5           # mezcla de la calibracion nueva con la anterior en cada lote
    # aprendizaje continuo y poda de datos
    cont_epocas: int = 3
    cont_pasos: int = 120
    cont_lr: float = 1e-4
    ventana_anios: float = 10.0         # ventana deslizante: mas viejo que esto se poda (salvo extremos)
    vida_media_dias: float = 1460.0     # decaimiento temporal del peso de cada muestra
    peso_extremos: float = 0.25         # peso minimo que conservan los extremos fuera de la ventana
    dias_holdout: int = 120             # dias del lote (en bloques de 30 repartidos) que validan la version candidata
    umbral_psi: float = 0.25            # PSI por variable a partir del cual hay deriva
    umbral_error: float = 1.25          # MAE lote / MAE referencia a partir del cual hay deriva
    tolerancia_rollback: float = 1.0    # la candidata se acepta si val_cand <= val_actual * tolerancia
    mejora_minima_pesos: float = 0.002  # los pesos nuevos deben mejorar al menos 0.2%: un empate no cambia el modelo
    # pronostico operativo
    dias_pronostico: int = 365          # un anio: cubre la proxima temporada de lluvias completa
    miembros: int = 24
    rho_muestreo: float = 0.6
    # ancla del pronostico largo: la media del conjunto vuelve a la climatologia del punto (no puede derivar)
    ancla_inicio_dias: int = 7          # hasta aqui manda solo la red (su primer bloque)
    ancla_rampa_dias: int = 42          # dias en que el ancla pasa de nada a completa
    ancla_peso: float = 1.0             # 1 = a largo plazo la media es la climatologia; 0 = sin ancla
    # mezcla con la climatologia por dia de horizonte y variable ([H][V], orden de OBJETIVOS). Vacio = sin mezcla.
    # Ajustada con ajustar_mezcla.py sobre un motor entrenado hasta 2016 y validado en 2017-2020 (sin 2021+).
    # Columnas: T2M_MAX, T2M_MIN, T2M, PRECTOTCORR, WS2M(_MAX), RH2M, ALLSKY_SFC_SW_DWN. Filas: dia 1 a 7.
    # Ajuste del 15-11-2026: reports/mezcla_ajuste.json (43,650 origenes de 2017-2020).
    mezcla_media: list = field(default_factory=lambda: [
        [1.00, 0.90, 0.95, 1.00, 0.85, 1.00, 1.00], [0.95, 0.65, 0.85, 1.00, 0.35, 1.00, 0.90],
        [0.90, 0.55, 0.80, 1.00, 0.20, 1.00, 0.55], [0.90, 0.50, 0.75, 1.00, 0.20, 1.00, 0.40],
        [0.90, 0.50, 0.75, 1.00, 0.10, 0.95, 0.30], [0.90, 0.45, 0.75, 1.00, 0.10, 0.95, 0.25],
        [0.90, 0.45, 0.75, 1.00, 0.10, 0.95, 0.25]])
    mezcla_cuantiles: list = field(default_factory=lambda: [
        [0.95, 0.85, 0.95, 0.75, 0.45, 0.90, 0.85], [0.90, 0.70, 0.85, 0.40, 0.15, 0.80, 0.40],
        [0.85, 0.55, 0.80, 0.30, 0.05, 0.75, 0.20], [0.85, 0.50, 0.75, 0.25, 0.05, 0.75, 0.15],
        [0.85, 0.50, 0.75, 0.25, 0.00, 0.75, 0.15], [0.85, 0.50, 0.75, 0.25, 0.00, 0.70, 0.10],
        [0.85, 0.45, 0.75, 0.25, 0.00, 0.70, 0.10]])
    # El Nino en el ancla del pronostico largo (kharis/enso.py). Solo donde la validacion cruzada 1996-2020 mostro
    # mejora (reports/enso_validacion.json): temperaturas, de 1 a 6 meses. 0 meses = sin El Nino.
    enso_variables: list = field(default_factory=lambda: ["T2M_MAX", "T2M_MIN", "T2M"])
    enso_meses_max: int = 6
    # fisica
    cultivo: str = "maiz"
    ciclo: str = "primera"
    metodo_et0: str = "hargreaves"      # "hargreaves" (por defecto) o "penman" (FAO-56) como respaldo
    # ejecucion
    dispositivo: str = "auto"
    amp: str = "auto"                   # auto (mide y elige; bf16 en RTX 30+) | bf16 | fp16 | off
    salida: str = "."
    tensorboard: bool = False
    exportar_onnx: bool = False
    tol_onnx: float = 1e-4
    punto_reporte: str = ""
    # resuelto al preparar los datos
    objetivos: list = field(default_factory=lambda: list(OBJETIVOS))
    exogenas: list = field(default_factory=list)

    def a_dict(self) -> dict:
        d = asdict(self)
        d["cuantiles"] = list(self.cuantiles)
        return d

    @classmethod
    def desde_dict(cls, d: dict) -> "KharisConfig":
        nombres = {f.name for f in fields(cls)}
        d = {k: v for k, v in d.items() if k in nombres}
        if "cuantiles" in d:
            d["cuantiles"] = tuple(d["cuantiles"])
        return cls(**d)


def construir_cli() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_kharis.py",
        description="Kharis Engine (Fase 1): motor neuronal ultraligero de prediccion agroclimatica, AgroResilience Honduras.")
    g = p.add_argument_group("datos")
    g.add_argument("--demo-synthetic", action="store_true", help="flujo completo en segundos con datos sinteticos (huracanes y El Nino simulados)")
    g.add_argument("--data-1996-2020", nargs="+", metavar="ARCHIVO", help="historico base (CSV/TSV/Parquet/JSON; admite datos desde 1981)")
    g.add_argument("--data-2020-2026", nargs="+", metavar="ARCHIVO", help="periodo de backtesting y ajuste fino")
    g.add_argument("--data", nargs="+", metavar="RUTA", help="carpeta processed/ de AgroResilience, o uno o mas archivos con toda la serie (se parte por fecha). "
                                                             "Sin esta opcion se usa ../processed si existe")
    g.add_argument("--inicio-datos", metavar="AAAA-MM-DD", help="primer dia que se usa (por defecto 1996-01-01)")
    g.add_argument("--fin-entrenamiento", metavar="AAAA-MM-DD", help="ultimo dia del entrenamiento base (por defecto 2020-12-31)")
    m = p.add_argument_group("modo (por defecto: entrenar + backtesting + estres + reportes + pronostico)")
    m.add_argument("--actualizar", action="store_true", help="aprendizaje continuo: incorpora los dias nuevos a la version activa")
    m.add_argument("--pronosticar", action="store_true", help="solo genera el pronostico con la version activa")
    m.add_argument("--rollback", metavar="VERSION", help="vuelve a activar una version anterior (ej. v003)")
    m.add_argument("--versiones", action="store_true", help="lista las versiones guardadas y sale")
    m.add_argument("--export-onnx", action="store_true", help="exporta kharis_engine.onnx (Netron) y lo verifica con onnxruntime")
    m.add_argument("--tensorboard", action="store_true", help="registra el entrenamiento en runs/ (tensorboard --logdir runs/)")
    m.add_argument("--solo-onnx", action="store_true", help="re-exporta y verifica el ONNX de la version activa, sin entrenar, y sale")
    m.add_argument("--sin-backtest", action="store_true", help="omite backtesting, pruebas de estres y graficas")
    m.add_argument("--abrir-tensorboard", action="store_true", help="levanta TensorBoard en http://localhost:6006 mientras entrena (implica --tensorboard)")
    m.add_argument("--abrir-netron", action="store_true", help="al terminar abre kharis_engine.onnx en Netron (http://localhost:8081)")
    h = p.add_argument_group("ajustes")
    h.add_argument("--salida", default=None, help="carpeta donde van artefactos/, reports/, runs/ y salidas/ (por defecto: junto a run_kharis.py)")
    h.add_argument("--dispositivo", default="auto", choices=["auto", "cuda", "mps", "cpu"])
    h.add_argument("--amp", default="auto", choices=["auto", "fp16", "bf16", "off"])
    h.add_argument("--epocas", type=int)
    h.add_argument("--lote", type=int)
    h.add_argument("--seq-len", type=int)
    h.add_argument("--horizonte", type=int)
    h.add_argument("--canales", type=int)
    h.add_argument("--bloques", type=int)
    h.add_argument("--lr", type=float)
    h.add_argument("--dropout", type=float)
    h.add_argument("--weight-decay", type=float)
    h.add_argument("--ruido-entrada", type=float, help="ruido gaussiano en las entradas durante el entrenamiento (regularizacion)")
    h.add_argument("--semilla", type=int)
    h.add_argument("--dias-pronostico", type=int)
    h.add_argument("--miembros", type=int)
    h.add_argument("--ancla-rampa-dias", type=int, help="dias en que la media del pronostico largo vuelve a la climatologia (por defecto 42)")
    h.add_argument("--ancla-peso", type=float, help="1 = a largo plazo la media es la climatologia del punto (por defecto); 0 = sin ancla")
    h.add_argument("--cultivo", choices=sorted(CULTIVOS))
    h.add_argument("--ciclo", choices=sorted(SIEMBRA))
    h.add_argument("--metodo-et0", choices=["hargreaves", "penman"])
    h.add_argument("--punto-reporte", help="punto que se dibuja en pred_vs_real.png")
    d = p.add_argument_group("poda de datos y aprendizaje continuo")
    d.add_argument("--ventana-anios", type=float, help="ventana deslizante de retencion (anios)")
    d.add_argument("--vida-media-dias", type=float, help="vida media del decaimiento temporal")
    d.add_argument("--peso-extremos", type=float, help="peso que conservan los extremos antiguos (0 = se podan)")
    d.add_argument("--umbral-psi", type=float, help="PSI a partir del cual se declara deriva")
    d.add_argument("--cont-epocas", type=int, help="epocas de ajuste fino por lote nuevo")
    return p


def config_desde_args(args: argparse.Namespace, base: KharisConfig | None = None) -> KharisConfig:
    cfg = base or KharisConfig()
    mapa = {"epocas": "epocas", "lote": "lote", "seq_len": "seq_len", "horizonte": "horizonte", "canales": "canales",
            "bloques": "bloques", "lr": "lr", "dropout": "dropout", "weight_decay": "weight_decay", "ruido_entrada": "ruido_entrada",
            "semilla": "semilla", "dias_pronostico": "dias_pronostico", "ancla_rampa_dias": "ancla_rampa_dias", "ancla_peso": "ancla_peso",
            "miembros": "miembros", "cultivo": "cultivo", "ciclo": "ciclo", "metodo_et0": "metodo_et0",
            "punto_reporte": "punto_reporte", "ventana_anios": "ventana_anios", "vida_media_dias": "vida_media_dias",
            "peso_extremos": "peso_extremos", "umbral_psi": "umbral_psi", "cont_epocas": "cont_epocas"}
    for a, c in mapa.items():
        v = getattr(args, a, None)
        if v is not None:
            setattr(cfg, c, v)
    if getattr(args, "inicio_datos", None):
        cfg.inicio_datos = args.inicio_datos
    if getattr(args, "fin_entrenamiento", None):
        import pandas as pd
        cfg.fin_entrenamiento = args.fin_entrenamiento
        cfg.inicio_backtest = str((pd.Timestamp(args.fin_entrenamiento) + pd.Timedelta(days=1)).date())
    cfg.dispositivo, cfg.amp = args.dispositivo, args.amp
    cfg.tensorboard = bool(args.tensorboard or getattr(args, "abrir_tensorboard", False))
    cfg.exportar_onnx = bool(args.export_onnx)
    if args.salida:
        cfg.salida = args.salida
    return cfg
