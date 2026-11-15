# Kharis Engine (Fase 1) — AgroResilience Honduras

Motor neuronal ultraligero de predicción agroclimática en PyTorch. Predice el clima diario multivariable de cada punto, lo acopla con física agronómica determinista y entrega las señales de riesgo **P1–P10**.

**Para instalarlo, operarlo y conectarlo a un sitio web, empieza por [`IMPLEMENTACION.md`](IMPLEMENTACION.md).**

**Alcance:** solo el motor. No incluye `Gemini Decision`, selección de cultivos ni puntajes finales. Las salidas quedan en un contrato limpio para esa fase.

## 1. Estructura

```text
kharis_engine/
├── kharis/
│   ├── config.py          # esquema de datos, umbrales físicos, cultivos, poda y flags del CLI
│   ├── device.py          # CUDA / MPS / CPU, precisión mixta (bf16, fp16, fp32) medida en la GPU, perfilado
│   ├── data_pipeline.py   # lectura (carpeta processed/, CSV, TSV, Parquet, JSON), -999 → NaN, features, ventanas, poda
│   ├── physics.py         # GDD, Ra, ET0, ETc, balance hídrico, rachas, estrés y señales P1–P10
│   ├── model.py           # KharisNet (TCN residual) + pérdida extreme-aware + calibrador
│   ├── train_eval.py      # entrenamiento, backtesting walk-forward, pruebas de estrés, pronóstico
│   ├── continuous.py      # lotes nuevos, deriva, ajuste fino con poda, versiones y rollback
│   └── export_viz.py      # ONNX (Netron), TensorBoard, PNG de diagnóstico, reportes
├── run_kharis.py          # CLI principal
├── IMPLEMENTACION.md      # guía práctica: instalar, operar con datos nuevos y conectar el sitio web
├── web_ejemplo/index.html # página de ejemplo que lee salidas/web/
├── buscar_config.py       # búsqueda de tamaño/regularización en GPU (solo con validación, reanudable)
├── tests/                 # 38 pruebas: datos, física, modelo, sin fuga, flujo, datos nuevos, reproducibilidad
├── datos/kharis_entrada.csv.gz   # copia unificada y limpia de lo leído (la corrida se repite sin la carpeta original)
├── artefactos/            # kharis_engine.pt (versión activa), kharis_engine.onnx, versiones/, registro.json
├── reports/               # loss_curve.png, pred_vs_real.png, residuals_extremes.png, prueba_2021_2026.png/.csv, metrics_summary.json/.csv
├── salidas/               # contrato de salida (CSV + JSON), prediccion_vs_real_2021_2026.csv.gz y web/ (JSON ligero por punto)
├── runs/                  # registros de TensorBoard
└── requirements.txt
```

## 2. Instalación

```bash
python -m venv .venv_kharis
```

```bash
.venv_kharis\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cu130
```

```bash
.venv_kharis\Scripts\python -m pip install -r requirements.txt
```

En CPU o Mac basta `pip install torch`. El motor detecta solo `cuda`, `mps` o `cpu` y nunca se detiene por falta de GPU.

Dos notas de este equipo (Python 3.15 en Windows):

- **`onnxruntime` aún no tiene instalador para Python 3.15.** La verificación del ONNX usa entonces el evaluador de referencia oficial de `onnx` y lo dice en el reporte. Cuando exista, `pip install onnxruntime` y se usa solo.
- **PyTorch 2.14 falla al apagar el intérprete** después de usar la GPU (código `0xC0000005`), ya con todo escrito. `run_kharis.py` y `tests/correr_pruebas.py` salen de forma limpia para esquivarlo.

## 3. Uso

Todo se corre desde `kharis_engine/`.

| Para qué | Comando |
|---|---|
| Probar todo en segundos con datos sintéticos | `python run_kharis.py --demo-synthetic --export-onnx --tensorboard` |
| Entrenar con la carpeta `processed/` del proyecto | `python run_kharis.py --export-onnx --tensorboard` |
| Lo mismo, viendo TensorBoard y Netron en vivo | `python run_kharis.py --abrir-tensorboard --abrir-netron` |
| Entrenar con otros archivos | `python run_kharis.py --data-1996-2020 base.csv --data-2020-2026 reciente.csv` |
| **Meter datos nuevos** (aprendizaje continuo) | `python run_kharis.py --actualizar` |
| Solo pronosticar con la versión activa | `python run_kharis.py --pronosticar` |
| Ver versiones / volver a una anterior | `python run_kharis.py --versiones` · `python run_kharis.py --rollback v003` |
| Correr las pruebas | `python tests/correr_pruebas.py` |
| Buscar la mejor configuración en la GPU | `python buscar_config.py` |

Sin `--data`, el motor lee `../processed`. Si no existe, usa `datos/kharis_entrada.csv.gz`. `python run_kharis.py --help` lista todos los ajustes.

### Flujo con información nueva

1. Actualiza `processed/` como siempre (`scripts/pipeline.py`).
2. `python run_kharis.py --actualizar`

El motor detecta qué días son nuevos, mide la deriva, actualiza calibración y pesos, guarda una versión nueva y regenera pronóstico, ONNX y salidas. Si la versión candidata empeora en los días reservados, se queda la anterior (rollback automático).

**Si llegan pocos días** (menos de unas seis semanas con 30 puntos), no alcanzan para validar una calibración nueva. El motor no crea versión y **no los pierde**: el pronóstico ya parte del último día, y esos días entran completos en la siguiente actualización que sí alcance.

## 4. Contrato de entrada

**Opción A — carpeta `processed/` (formato del proyecto, series largas `punto, fecha, ...`):**

| Archivo | Uso | Obligatorio |
|---|---|---|
| `power_diario_largo.csv` (o `power/<punto>.csv`) | NASA POWER: `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN` (+ `WS2M_MAX` si se descarga) | sí |
| `topografia_por_punto.csv` | `elevacion_m` | no |
| `imerg_series.csv` | `precipitation` (GPM IMERG) | no |
| `smap_series.csv` | `soil_moisture` (promedio am/pm) | no |
| `era5_diario.csv` | `swvl1` | no |
| `sentinel2_indices.csv`, `landsat_ndvi.csv`, `modis_ndvi.csv` | `NDVI` (Sentinel-2 → Landsat → MODIS calidad 0–1) | no |
| `oni.csv` | `oni` | no |

**Opción B — una tabla** (CSV, TSV, Parquet, JSON, con o sin `.gz`; también el CSV/JSON de punto de NASA POWER) con columnas `punto, fecha, lat, lon, elevacion` + variables. Acepta los nombres en español del proyecto (`tmax_c`, `lluvia_power_mm`, `latitud`...).

Reglas que el motor aplica siempre:

- `-999` y demás centinelas, y valores fuera de rango físico → `NaN`. **Nunca a `0`.**
- Orden cronológico estricto por punto sobre una malla diaria regular; sin duplicados.
- Lo opcional entra de forma **causal**: el ONI se usa con 2 meses de retraso (cuando se publica) y el NDVI se arrastra hacia adelante hasta 32 días. Ningún día usa información posterior.
- Cada entrada opcional lleva un canal de máscara. Si falta, la red lo sabe; no se inventa.
- Si no hay `WS2M_MAX`, se usa `WS2M` como objetivo de viento y se avisa. En cuanto `power_diario_largo.csv` traiga la columna `WS2M_MAX`, el motor la usa sola al reentrenar.

## 5. Contrato de salida (`salidas/`)

| Archivo | Una fila por | Contenido |
|---|---|---|
| `clima_diario.csv` | punto, fecha | pronóstico: cada variable con media, `_p10`, `_p50`, `_p90`; `dia_adelanto` |
| `fisica_diaria.csv` | punto, fecha | `t_media`, `gdd`, `gdd_acum`, `ra`, `et0`, `metodo_et0`, `kc`, `etc`, `etc_real`, `reserva`, `deficit`, `exceso`, `ks`, `estres_etapa`, `dias_secos_consec`, `etapa`, y probabilidades `prob_lluvia_intensa`, `prob_dia_seco`, `prob_dia_calor`, `prob_dia_calor_floracion` |
| `senales_p1_p10.csv` | punto, temporada | por cada P1..P10: `_valor` (mediana), `_valor_p10`, `_valor_p90`, `_percentil` histórico, `_prob` de activación, `_activo`; más detalle (inicio de lluvias, lluvia máxima, viento, ONI...) |
| `senales_historicas.csv` | punto, temporada | las mismas señales sobre todo el clima observado |
| `fisica_diaria_observada.csv.gz` | punto, fecha | física diaria observada desde el inicio del backtesting |
| `prediccion_vs_real_2021_2026.csv.gz` | punto, fecha | la prueba congelada día por día: por variable `_real`, `_pred_1d`, `_pred_7d`, `_libre`, `_libre_p10`, `_libre_p90` |
| `kharis_salida.json` | — | todo lo anterior anidado por punto, con metadatos (`contrato: kharis.salida.v1`) |
| `web/indice.json` + `web/<punto>.json` | punto | salida ligera para un sitio web (`contrato: kharis.web.v1`), ver sección 6 |

Señales:

| | Señal | Valor |
|---|---|---|
| P1 | inicio tardío de lluvias | días de retraso respecto a la mediana del punto |
| P2 | canícula | racha seca máxima julio–agosto (días) |
| P3 | déficit acumulado | ET0 − lluvia, mayo–octubre (mm) |
| P4 | rachas secas críticas | racha seca máxima en temporada (días) |
| P5 | calor en floración | días sobre el límite térmico del cultivo |
| P6 | estrés por etapa | máximo de (1 − ks) medio por etapa |
| P7 | extremos de lluvia/viento | índice de severidad (≥ 1 = severo) |
| P8 | similitud con El Niño | coseno contra el compuesto histórico (−1..1) |
| P9 | fuera de rango | % de días fuera de la envolvente histórica |
| P10 | sin patrón | 1 si ninguna de P1..P9 está activa |

Los percentiles se calculan contra la historia del punto **solo en el periodo base**. Cultivo y ciclo se eligen con `--cultivo` y `--ciclo`; ET0 es Hargreaves-Samani por defecto y `--metodo-et0 penman` usa FAO-56 donde hay datos, con Hargreaves de respaldo.

## 6. Uso desde un sitio web

El sitio **no corre la red**: lee archivos pequeños que el motor deja listos. Así la página carga rápido y pesa poco.

- `salidas/web/indice.json`: lista de puntos (nombre, lat, lon, archivo), fecha base, variables, unidades y versión del modelo.
- `salidas/web/<punto>.json`: unos 60 KB por punto (cerca de 15 KB con gzip del servidor). Trae:
  - `historia`: los últimos 90 días observados de cada variable.
  - `pronostico`: 365 días, cada variable con `media`, `p10` y `p90`.
  - `fisica`: `et0`, `etc`, `reserva` (con `p10` y `p90`), `deficit`, `ks`, `gdd_acum`, `dias_secos_consec` y probabilidades diarias.
  - `senales`: P1–P10 de cada temporada con `valor`, `percentil`, `probabilidad` y `activo`.

Las series son arreglos diarios: el valor `k` corresponde a `inicio` + `k` días. La página pide `indice.json`, y al elegir un punto pide su archivo.

**Los índices siguen su cálculo, no se reinician.** El balance hídrico, los grados-día acumulados y las rachas secas del pronóstico arrancan del último valor calculado con datos observados y continúan con el clima previsto. Las señales de temporada mezclan lo ya observado con lo previsto e indican qué parte es pronóstico (`fraccion_pronosticada`).

**Flujo:** cuando hay datos nuevos se corre `python run_kharis.py --actualizar` (en el servidor o en este equipo) y se publican de nuevo `salidas/web/`. Sin datos nuevos, `--pronosticar` regenera lo mismo.

**Si el sitio necesita inferir en vivo:** `artefactos/kharis_engine.onnx` pesa 1.5 MB y corre en el navegador con `onnxruntime-web` o en el servidor con `onnxruntime`. Entra una ventana de 64 días y sale la predicción de 7 días con sus cuantiles.

## 7. Cómo funciona

**Red (`KharisNet`).** TCN residual causal dilatada. Recibe una ventana de días y la climatología de los días objetivo, y predice la **anomalía** respecto a lo normal de esa fecha. Así, en el peor caso predice la climatología, y en pronósticos largos vuelve sola a ella. Dos cabezales: media y cuantiles (5, 25, 50, 75, 90, 95, 99%), monótonos por construcción.

**Entradas por día.** Variables objetivo, entradas complementarias con máscara, estacionalidad cíclica, medias móviles, anomalías frente a la línea base, rezagos de un año, tendencia térmica a 1 y 3 años, señales regionales (promedio de todos los puntos) y posición del punto.

**Pérdida extreme-aware.** Huber ponderado por colas (más peso donde lo real supera p80 y p95) + pinball para los cuantiles + un término explícito de cola.

**Calibración.** Mapa monótono por tramos para la media y desplazamiento conformal para los cuantiles, por horizonte y variable. Son unos cientos de números y se actualizan por lotes sin reentrenar.

**Pronóstico largo sin deriva.** Más allá de los 7 días la red se alimenta de sus propias salidas. Dos cuidados evitan que se desvíe:

1. *Muestreo que conserva la media.* Sortear valores uniendo los cuantiles con rectas inflaba la lluvia un 45%, y ese exceso se realimentaba. Ahora la forma sale de los cuantiles y el nivel de la media calibrada.
2. *Ancla a la climatología.* La media del conjunto vuelve a lo normal del punto para cada fecha: enseguida en lluvia y viento (la red no aporta más allá de la primera semana) y de forma gradual hasta el día 49 en temperatura, humedad y radiación (ahí sí aporta unas semanas). Cada miembro conserva sus rachas secas y sus extremos alrededor de lo normal.

A largo plazo la media es, por construcción, la climatología del punto: no puede ser peor que ella ni derivar. Se controla con `--ancla-rampa-dias` y `--ancla-peso` (0 la apaga).

**Sin fuga temporal.** Línea base, escalado, umbrales de extremos y referencia de señales se ajustan solo con el periodo de entrenamiento. Hay pruebas que lo verifican.

## 8. Protocolo experimental

1. **Entrenamiento base 1996–2020.** Los últimos 2 años validan (parada temprana y primera calibración). Elegida la mejor época, un repaso corto recorre todo 1996–2020.
2. **Backtesting 2021–2026, walk-forward.** Cada año se predice con lo aprendido hasta el día anterior. Luego ese año entra como lote nuevo, se versiona y se sigue. Se reportan "antes" (modelo base sin calibrar) y "después" (calibrado y ajustado), ambos fuera de muestra: MAE, RMSE, sesgo, correlación, desempeño en ≥ p80 y ≥ p95, cobertura de picos y de cuantiles, y skill frente a climatología y persistencia.
3. **Prueba congelada 2021–2026.** La pregunta directa: entrenado solo hasta 2020, ¿qué tan cerca queda de lo que pasó? Pesos, calibración y línea base se congelan el 31-12-2020 y nada posterior los ajusta. Se mide de tres formas: a 1 día y a 7 días (cada día se predice usando solo observaciones anteriores) y en **proyección libre** (arranca el 31-12-2020 y proyecta todo el periodo sin ver ninguna observación; se compara el promedio mensual). Sale en `reports/prueba_2021_2026.png` y `.csv`, y día por día en `salidas/prediccion_vs_real_2021_2026.csv.gz`. La prueba incluye un **control de deriva**: la media proyectada de cada año y variable se compara con la climatología del punto, con una tolerancia de media desviación típica de la variabilidad natural entre años. El **índice de deriva** es la fracción de casos fuera de tolerancia y debe ser 0 (`reports/deriva_2021_2026.csv`).
4. **Pruebas de estrés.** Mitch 1998, Eta e Iota 2020, El Niño 1997, 2015 y 2023. Cada evento dice si es dentro o fuera de muestra. 1982 queda "sin datos" porque la serie empieza en 1996.

## 9. Aprendizaje continuo y poda de datos

| Parámetro | Por defecto | Qué hace |
|---|---|---|
| `--ventana-anios` | 10 | ventana deslizante: lo más viejo se poda |
| `--vida-media-dias` | 1460 | decaimiento temporal del peso de cada ventana (se acorta a la mitad si hay deriva) |
| `--peso-extremos` | 0.25 | peso que conservan los extremos críticos antiguos (lluvia, viento o calor ≥ p99; frío ≤ p01). `0` los poda |
| `--umbral-psi` | 0.25 | PSI a partir del cual se declara deriva de distribución |
| `--cont-epocas` | 3 | épocas de ajuste fino por lote |

Cada lote reserva bloques de 30 días repartidos por todo el periodo. La calibración candidata se acepta si no empeora ahí. Los pesos candidatos deben además **mejorar al menos 0.2%** (`mejora_minima_pesos`): un empate no cambia el modelo, así la decisión no depende del redondeo. Cada versión queda en `artefactos/versiones/` con su deriva, poda y puntajes en `registro.json`.

## 10. GPU (RTX)

- **Precisión mixta medida, no supuesta.** Al empezar, el motor mide pasos de entrenamiento por segundo en fp32 (TF32), fp16 y bf16 con la red real y elige la más rápida; si empatan a menos de 10% prefiere bf16 (mismo rango que fp32: no se desborda ni necesita `GradScaler`). Se fuerza con `--amp bf16 | fp16 | off`.
- TF32 activado en convoluciones y multiplicación de matrices (Tensor Cores).
- Los datos viven en la GPU y las ventanas se arman ahí, sin `DataLoader`.
- cuDNN en modo determinista: misma semilla, mismos datos y mismo equipo dan los mismos resultados. Para repetir una corrida exacta, fija `--amp` con la precisión que quedó en el reporte.

## 11. Observabilidad

**Netron.** `artefactos/kharis_engine.onnx` se exporta siempre al terminar de entrenar (y con `--export-onnx` en los otros modos). Entradas `clima_ventana [batch_size, seq_len, n_features]` y `climatologia_futura [batch_size, horizonte, n_objetivos]`; salidas `prediccion` y `cuantiles`. Se verifica contra PyTorch con varios tamaños de lote y de ventana.

```bash
netron artefactos/kharis_engine.onnx
```

**TensorBoard.** Con `--tensorboard`: `Loss/train`, `Loss/val`, `Loss/extreme_tail`, `LearningRate`, `MAE`/`RMSE`/`Bias` por variable, histogramas `weights/` y `gradients/`, grafo del modelo, VRAM/RAM y tiempo por época.

```bash
tensorboard --logdir runs/
```

**Reportes (`reports/`).** `loss_curve.png`, `pred_vs_real.png`, `residuals_extremes.png`, `prueba_2021_2026.png` y `.csv`, `deriva_2021_2026.csv`, `metrics_summary.json` y `.csv`.

## 12. Pruebas

```bash
python tests/correr_pruebas.py
```

38 pruebas en unos 35 segundos: limpieza (`-999` → NaN), orden cronológico, formatos, lectura de `processed/`, causalidad de ONI y NDVI, poda, fórmulas FAO-56 (Ra, Hargreaves, Penman), conservación de masa del balance hídrico, señales, formas y cuantiles de la red, pérdida, calibrador, ONNX igual a PyTorch, ausencia de fuga temporal, backtesting, prueba congelada (no ve el futuro, índice de deriva 0), muestreo que conserva la media, pronóstico largo sin deriva y con la dispersión de la climatología, pronóstico, llegada de datos nuevos, lote corto que se acumula, rollback manual y automático, y reproducibilidad en CPU y GPU.

## 13. Límites que conviene tener claros

- La red predice **7 días** de un golpe. Más allá, el pronóstico es por conjuntos y su media vuelve a la climatología del punto: sirve para probabilidades de temporada, no para decir qué día lloverá.
- **El error nunca es cero.** El clima diario tiene una parte que nadie puede anticipar. Lo que sí queda en cero es la deriva: el pronóstico largo no se aparta de lo normal del punto.
- La climatología es la de 1996–2020. Si el clima cambia de régimen (2021–2026 fue más lluvioso y húmedo), el pronóstico largo hereda esa diferencia hasta que se reentrene la línea base.
- La lluvia diaria de un punto es poco predecible solo con su historia. Por eso la media se calibra sin sesgo y los picos van en los cuantiles altos y en los miembros del conjunto.
- Un huracán no se ve venir desde una serie local: en las pruebas de estrés el primer día falla y los siguientes se corrigen.
- Un punto nuevo que no estuvo en el entrenamiento usa como línea base el promedio de los conocidos (el motor lo avisa).

## 14. Resultados de la corrida final (15-11-2026, datos reales)

30 puntos de Honduras, 338,160 filas, 1996-01-01 a 2026-11-10. Entrenado con 1996–2020. Todo lo de esta sección es **fuera de muestra** (2021–2026), salvo donde se indica.

### Backtesting 2021–2026 (walk-forward, calibrado)

Error medio absoluto (MAE). "Mejora" es frente a predecir la climatología del punto.

| Variable | Kharis a 1 día | Kharis promedio 1–7 días | Climatología | Mejora a 1 día | Sesgo | Correlación a 1 día |
|---|---|---|---|---|---|---|
| T2M_MAX (°C) | 0.92 | 1.15 | 1.63 | +43% | −0.02 | 0.91 |
| T2M_MIN (°C) | 0.59 | 0.77 | 0.98 | +39% | +0.01 | 0.98 |
| T2M (°C) | 0.56 | 0.76 | 1.06 | +47% | −0.02 | 0.97 |
| RH2M (%) | 2.97 | 3.62 | 5.76 | +49% | −0.09 | 0.91 |
| ALLSKY_SFC_SW_DWN (MJ/m²/día) | 2.47 | 2.71 | 2.76 | +11% | +0.19 | 0.67 |
| WS2M (m/s) | 0.40 | 0.43 | 0.43 | +8% | −0.03 | 0.89 |
| PRECTOTCORR (mm/día) | 4.76 | 5.46 | 4.87 | +2% | +0.12 | 0.41 |

El cuantil 95% cubre entre 94% y 96% de los casos en todas las variables.

### Prueba congelada 2021–2026 (nada posterior a 2020 ajusta nada)

| Variable | A 1 día | A 7 días | Climatología | Proyección libre, promedio mensual | Climatología, promedio mensual |
|---|---|---|---|---|---|
| T2M_MAX (°C) | 0.94 | 1.26 | 1.63 | 1.19 | 1.21 |
| T2M_MIN (°C) | 0.59 | 0.83 | 0.98 | 0.66 | 0.66 |
| T2M (°C) | 0.57 | 0.84 | 1.07 | 0.79 | 0.79 |
| RH2M (%) | 3.00 | 3.98 | 5.76 | 4.54 | 4.62 |
| ALLSKY_SFC_SW_DWN (MJ/m²/día) | 2.46 | 2.75 | 2.76 | 0.96 | 0.96 |
| WS2M (m/s) | 0.40 | 0.44 | 0.43 | 0.20 | 0.20 |
| PRECTOTCORR (mm/día) | 4.92 | 5.55 | 4.87 | 2.57 | 2.58 |

- **Índice de deriva: 0.00** (0 de 42 casos fuera de tolerancia; el peor fue RH2M en 2021, +0.46 con tolerancia 1.10).
- La banda p10–p90 de la proyección libre cubre entre 77% y 85% de los días (lo nominal es 80%): T2M_MAX 82%, T2M_MIN 77%, T2M 80%, lluvia 80%, viento 85%, humedad 79%, radiación 85%.
- **Dispersión del conjunto anclada.** A largo plazo los miembros se separaban entre sí (desviación de 2.2 veces la climatológica pasados 6 meses) y la señal P9 "fuera de rango" salía activa sin motivo: 12% de los días-miembro quedaban fuera de rango, contra 1.5% en lo observado. Ahora la distancia de cada miembro a la media se reescala hacia la desviación climatológica del punto (salvo la lluvia). Resultado: 1% de días fuera de rango, y en la temporada 2027 (toda pronosticada) P9 pasó de probabilidad 0.70 a 0.14.
- Antes de corregir el pronóstico largo, la proyección libre de lluvia tenía un sesgo de +5.7 mm/día y un error mensual de 7.38 mm/día. Ahora es 2.57.

### Lectura honesta

- **Temperatura y humedad:** Kharis le gana claro a la climatología a 1 y a 7 días.
- **Radiación y viento:** gana poco.
- **Lluvia diaria:** a 1 día empata con la climatología y a 7 días es peor en MAE. La media calibrada no tiene sesgo y los cuantiles cubren lo que deben, pero el día exacto de la lluvia no se puede anticipar solo con la historia del punto. El valor de Kharis en lluvia está en las bandas y en las probabilidades de temporada.
- **A más de dos meses,** la media del pronóstico es la climatología del punto. Kharis aporta ahí la forma: rachas secas, extremos y probabilidades.
- **2021–2026 fue más lluvioso (+1.6 mm/día) y más húmedo (+2.9%)** que 1996–2020. Esa diferencia no es deriva del modelo: es el clima, y la hereda cualquier pronóstico largo basado en la climatología. Una posible mejora, no implementada: anclar a la media de los últimos 10 años (en una prueba rápida redujo el error mensual 5–13% en 2021–2026, pero no dentro de 1996–2020).

### Pruebas de estrés

| Evento | Muestra | Lluvia MAE (mm) | Fallo de banda en lluvia | T2M_MAX MAE (°C) | Fallo severo en T2M_MAX |
|---|---|---|---|---|---|
| El Niño 2023 | fuera | 4.94 | 8% | 1.27 | 3.9% |
| Súper El Niño 2015 | dentro | 3.81 | 10% | 1.28 | 4.0% |
| Súper El Niño 1997 | dentro | 2.80 | 13% | 1.55 | 7.6% |
| Huracán Mitch 1998 | dentro | 18.03 | 17% | 1.02 | 0.0% |
| Eta e Iota 2020 | dentro | 14.61 | 24% | 0.99 | 0.2% |

"Fallo de banda" es la fracción de días fuera de la banda 5%–95% (lo esperado es 10%). "Fallo severo" es un error mayor que 3 veces el normal. En los huracanes el fallo sube porque la lluvia extrema de esos días no se ve venir desde una serie local. Súper El Niño 1982 queda sin datos (la serie empieza en 1996).

### Tamaño y velocidad

| Qué | Valor |
|---|---|
| Parámetros | 396,392 |
| Pesos / ONNX | 1.51 MB / 1.55 MB (diferencia con PyTorch 1.2e-06) |
| Entrenamiento base | 90 s en RTX 3070 con bf16 (corrida completa: unos 8 minutos) |
| Inferencia | 5.0 ms en GPU, 5.9 ms en CPU (10.5 ms para los 30 puntos juntos) |
| VRAM pico | 868 MB |
| Pronóstico a 365 días, 24 miembros, 30 puntos | 56 s en GPU (antes del ancla de dispersión: 49 s; CPU: 69 s medido antes) |
| Salida web por punto | 69 KB (21 KB con gzip), carga en 5–10 ms en local |

