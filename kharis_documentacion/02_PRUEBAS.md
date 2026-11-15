# 02 · Pruebas

Las 38 pruebas de `kharis_engine/tests/test_kharis.py`, una por una.

**Última corrida:** 15-11-2026 04:14, con el código final. **38 de 38 pasan** en 33 s.
Equipo: Python 3.15.2, torch 2.14.1+cu130, numpy 2.5.4, pandas 3.1.1, RTX 3070.

- Resultado por prueba, con su tiempo: [`pruebas/pruebas.json`](pruebas/pruebas.json)
- Salida completa de la corrida: [`pruebas/salida_pruebas.txt`](pruebas/salida_pruebas.txt)

Para correrlas, desde `kharis_engine/`:

```bash
..\.venv_kharis\Scripts\python.exe tests\correr_pruebas.py
```

Usan datos sintéticos y un modelo pequeño. No tocan `processed/`, `artefactos/` ni `salidas/`: escriben en carpetas temporales y las borran.

Los tiempos son de cada prueba sola. Las clases `PruebasFlujo`, `PruebasSenales` y `PruebasSinFuga` entrenan o preparan datos una vez al empezar, y ese tiempo no aparece en la fila.

## Datos (5)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_centinelas_a_nan_nunca_cero` | `-999`, `-9999` y valores imposibles (200 °C, lluvia negativa) pasan a NaN, nunca a cero. Un cero real de lluvia se conserva. | 0.01 s |
| `test_orden_cronologico_y_duplicados` | Con filas desordenadas y 20 duplicadas, quita las 20 y deja cada punto en orden de fecha y sin repetidos. | 0.03 s |
| `test_alias_y_formatos` | CSV, TSV, JSON y CSV.gz dan lo mismo. Nombres como `tmax_c`, `lluvia_power_mm` o `latitud` se traducen solos. | 0.19 s |
| `test_carpeta_processed_y_causalidad` | Lee una carpeta con el formato de `processed/`. ONI entra solo cuando ya se habría publicado (JFM desde abril). NDVI vale desde la pasada del satélite y dura 32 días. | 0.09 s |
| `test_poda_de_datos` | Los datos viejos pesan menos, los extremos viejos se conservan, lo viejo y normal se poda, y con deriva lo viejo pesa todavía menos. | 0.00 s |

## Física (8)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_radiacion_extraterrestre_fao56` | Radiación extraterrestre igual al ejemplo 8 de FAO-56 (32.2 MJ/m²/día). | 0.00 s |
| `test_et0_hargreaves_fao56` | ET0 de Hargreaves igual al ejemplo 20 de FAO-56 (5.0 mm/día). | 0.00 s |
| `test_et0_penman_fao56` | ET0 de Penman-Monteith cerca del ejemplo 18 de FAO-56 (3.9 mm/día). | 0.00 s |
| `test_racha_seca` | Cuenta bien los días secos seguidos y se reinicia con lluvia o sin dato. | 0.00 s |
| `test_balance_hidrico_conserva_masa` | El agua del suelo nunca baja de 0 ni pasa de la capacidad, y lluvia − evaporación − exceso = cambio de reserva. | 0.01 s |
| `test_gdd_y_calendario` | Grados-día con tope 30 y base 10, reinicio el día de siembra, etapas del maíz y Kc de la etapa media (1.20). | 0.01 s |
| `test_acople_fisico` | Corrige combinaciones imposibles: Tmín ≤ Tmedia ≤ Tmáx, lluvia ≥ 0, humedad ≤ 100%. | 0.00 s |
| `test_balance_un_dia_coincide_con_el_paso_determinista` | El balance de un día con incertidumbre da el valor exacto cuando no hay incertidumbre, y en suelo seco evapora menos. | 0.00 s |

## Señales P1–P10 (3)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_referencia_solo_periodo_base` | Los percentiles de las señales se calculan solo con años del periodo de entrenamiento. | 0.00 s |
| `test_senales_p1_a_p10` | Las 10 señales salen con la forma correcta, los percentiles quedan entre 0 y 100, P10 se activa solo si ninguna otra lo está, y un huracán simulado en 1998 activa P7. | 0.47 s |
| `test_inicio_de_lluvias_construido` | Con 30 mm en 3 días y lluvias después, el inicio de lluvias cae justo el 20 de mayo. | 0.00 s |

## Modelo (6)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_formas_cuantiles_y_anomalia` | La red acepta ventanas de cualquier largo, los cuantiles nunca se cruzan y, sin señal, devuelve la climatología. | 0.02 s |
| `test_convolucion_causal` | La convolución no mira el futuro: cambiar días posteriores no altera la salida de los anteriores. | 0.01 s |
| `test_perdida_ignora_nan_y_pesa_extremos` | Un NaN no aporta gradiente, y un error grande marcado como extremo pesa más. | 0.00 s |
| `test_calibrador` | La calibración quita el sesgo, baja el error al menos 30%, deja el cuantil 95% cubriendo 95%, se actualiza a medio camino con un lote nuevo y se guarda y carga igual. | 0.01 s |
| `test_onnx_igual_a_pytorch` | El ONNX exportado da lo mismo que PyTorch (tolerancia 1e-4) con distintos tamaños de lote y de ventana. | 0.72 s |
| `test_muestreo_conserva_la_media` | Sortear de los cuantiles ya no infla la lluvia: la muestra promedia lo que dice la media calibrada. Comprueba también que el defecto viejo existía (>10% de más). | 0.29 s |

## Sin fuga temporal (4)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_escalado_y_linea_base_no_ven_el_futuro` | Si se alteran solo los datos de 2021 en adelante, el escalado y la climatología no cambian. | 0.21 s |
| `test_features_causales` | Las entradas de un día no cambian si se alteran los días siguientes. | 0.22 s |
| `test_ventanas_alineadas` | La entrada termina en el día t, el objetivo empieza en t+1 y la climatología corresponde a esa fecha. Las ventanas reservadas no se usan. | 0.11 s |
| `test_escalador_invertible` | Escalar y desescalar devuelve el valor original. | 0.10 s |

## Flujo completo, datos nuevos y rollback (10)

Entrenan una vez con datos sintéticos hasta 2025 y simulan que llega 2026.

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_entrenamiento_aprende` | La pérdida baja durante el entrenamiento y la validación nunca da NaN. | 0.00 s |
| `test_backtest_walk_forward_sin_fuga` | Un paso por año (2021–2025), una versión por paso, cada versión solo sabe hasta su fecha, y la temperatura le gana a la climatología. | 0.01 s |
| `test_estres_marca_muestra_y_sin_datos` | Súper El Niño 1982 sale "sin datos", Mitch 1998 "dentro de muestra" y El Niño 2023 "fuera de muestra". | 0.17 s |
| `test_pronostico_y_contrato_de_salida` | El pronóstico empieza al día siguiente del último dato, p10 ≤ p50 ≤ p90, lluvia ≥ 0, humedad ≤ 100%, y trae todas las columnas de física y señales. | 0.31 s |
| `test_prueba_congelada_no_ve_el_futuro` | La proyección libre no cambia aunque se altere todo lo posterior al entrenamiento, a 1 día le gana a la climatología, y el índice de deriva es 0. | 5.18 s |
| `test_pronostico_largo_no_deriva` | Pasada la rampa, la media del conjunto es la climatología del punto. **Nueva parte:** la dispersión entre miembros queda entre 0.85 y 1.15 veces la climatológica en T2M_MAX, T2M_MIN y RH2M. | 2.06 s |
| `test_pronostico_reproducible` | Dos pronósticos iguales dan exactamente lo mismo. | 0.62 s |
| `test_datos_nuevos_actualizan_y_rollback` | Llegan 6 meses: crea v002 con deriva y poda medidas. Sin días nuevos no hace nada. El rollback a v001 funciona y la versión nueva pronostica desde julio. | 1.15 s |
| `test_lote_corto_se_acumula` | Llegan 20 días: no crea versión, pero el pronóstico ya parte de ellos. Cuando llega el resto, el lote incluye esos 20 días. | 1.22 s |
| `test_rollback_automatico_si_empeora` | Si la versión candidata es peor, se descarta sola y los pesos quedan exactamente como estaban. | 1.07 s |

## Reproducibilidad (2)

| Prueba | Qué comprueba | Tiempo |
|---|---|---|
| `test_misma_semilla_mismo_resultado_cpu` | Dos entrenamientos con la misma semilla en CPU dan resultados idénticos. | 3.89 s |
| `test_misma_semilla_mismo_resultado_gpu` | En GPU dan lo mismo dentro de una tolerancia pequeña (bf16 no es bit a bit). | 2.41 s |

## Lo que las pruebas no cubren

- **Datos reales.** Con los datos reales se verificó aparte: la corrida final completa, la prueba congelada 2021–2026 y `--actualizar`, `--pronosticar`, `--versiones` y `--rollback` (ver [01_CAMBIOS.md](01_CAMBIOS.md)).
- **La tarea programada de Windows** para actualizar solo: está descrita en [05_IMPLEMENTACION.md](05_IMPLEMENTACION.md), sin probar.
- **La carga del sitio por internet:** solo se midió en local.
