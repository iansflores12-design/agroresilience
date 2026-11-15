# 06 · Refuerzo del motor (15-11-2026, tarde)

Qué se cambió para cerrar los puntos débiles de Kharis, cómo se validó sin hacer trampa y qué quedó igual. Gemini no predice clima: Kharis pronostica y Gemini solo explica los números.

## Regla de oro

Nada de 2021–2026 se usó para elegir nada. Cada decisión se tomó con datos de 1996–2020. El periodo 2021–2026 se midió **una sola vez** al final, como examen.

## 1. Lluvia: medirla como se mide la lluvia

El MAE castiga mal a la lluvia: premia predecir poco. La meteorología mide los pronósticos de lluvia con probabilidades. `evaluar_probabilistico.py` calcula:

- **Brier skill score (BSS)** para "llueve ≥ 1, 10, 20 y 50 mm". Más de 0 es mejor que la climatología.
- **AUC:** qué tan bien separa los días que llueven de los que no. 0.5 es azar y 1 es perfecto.
- **Puntaje de cuantiles:** la pérdida pinball promedio, que aproxima el CRPS.

La referencia es la climatología del punto y la fecha (±15 días), calculada solo con 1996–2020.

**Lo que encontró:** a 1 día, Kharis separa mucho mejor los días de lluvia (AUC 0.87 contra 0.80). Pero de 2 a 7 días sus probabilidades eran demasiado seguras y salían peor que la climatología.

## 2. Mezcla con la climatología por horizonte

Es la corrección estándar para un pronóstico probabilístico que pierde habilidad con el horizonte:

```
pronóstico final = w[h, v] · red + (1 − w[h, v]) · climatología
```

Se aplica por separado a la media y a los cuantiles, que siguen ordenados. Los pesos `w` se eligieron sin tocar 2021–2026:

1. Se entrenó una copia del motor solo hasta 2016 (`respaldos/exp_hasta_2016`).
2. Con sus predicciones de 2017–2020, que no vio, se buscó el peso que minimiza el error (`ajustar_mezcla.py`, 43,650 orígenes).
3. A más horizonte, la red nunca pesa más que a menos.

Los pesos están en `kharis/config.py` (`mezcla_media`, `mezcla_cuantiles`) y el detalle en `reports/mezcla_ajuste.json`. En lluvia, la media de la red se queda entera, pero sus cuantiles bajan a 25 % de peso desde el día 4. En viento y radiación, la climatología manda casi del todo desde el día 3.

## 3. El Niño en el pronóstico de temporada

Antes, a más de dos meses el pronóstico era la climatología pura. Ahora el ancla es climatología más la anomalía que se espera por el ONI del día de emisión (`kharis/enso.py`).

- **Modelo:** anomalía mensual = g[punto, variable, mes, adelanto] × ONI, ajustado solo con 1996–2020 y encogido según su estadístico t.
- **Prueba previa:** validación cruzada dejando un año fuera, solo en 1996–2020 (`analizar_enso.py`, `reports/enso_validacion.json`).
- **Regla fijada antes de mirar 2021–2026:** usar El Niño solo donde la validación cruzada mejora. Eso es temperaturas (máxima, mínima y media) y de 1 a 6 meses. En lluvia, viento, humedad y radiación no ayudó, y ahí no se usa.

## 4. Parámetros de cultivo con fuentes

En Gemini Decision (`frontend/src/lib/decision/parametros.ts`):

- **Kc:** de la Tabla 12 de FAO-56. El arroz al final del ciclo pasó de 0.90 a 0.75 (FAO da 0.90–0.60).
- **Límites de calor** con su referencia.
- **Índice de venta** anclado a precios de SIMPAH y prensa de 2026.

Lo que sigue aproximado está marcado así: el forraje y el frijol terciopelo.

## Resultados (corrida final, modelo v007, todo fuera de muestra 2021–2026)

**Lluvia, mejora del puntaje de Brier frente a la climatología** (antes = la red sola; ahora = con la mezcla):

| Lluvia | 1 día | 1 a 7 días | 7 días |
|---|---|---|---|
| ≥ 1 mm | +10.9 % → **+12.8 %** | −4.7 % → **+3.8 %** | −10.1 % → **+1.4 %** |
| ≥ 10 mm | +6.1 % → **+10.6 %** | −14.1 % → **+1.9 %** | −17.3 % → **+0.4 %** |
| ≥ 20 mm | −1.6 % → **+6.2 %** | −21.8 % → **+0.9 %** | −23.7 % → **+0.2 %** |
| ≥ 50 mm | −0.6 % → **+4.3 %** | −7.9 % → **+1.1 %** | −7.8 % → **+0.5 %** |
| Cuantiles (CRPS) | +11.7 % → **+14.3 %** | −6.0 % → **+3.6 %** | −9.0 % → **+1.6 %** |

A 1 día distingue los días con lluvia mejor que la climatología: AUC 0.873 contra 0.799.

**Puntaje de cuantiles de 1 a 7 días, todas las variables:**
- Lluvia: −6.0 % → +3.6 %
- Viento: −9.0 % → +0.5 %
- Radiación: −2.1 % → +1.1 %
- Temperatura máxima: 28.8 % → 28.2 %
- Temperatura mínima: 20.9 % → 19.7 %
- Humedad: 32.7 % → 30.4 %

Ahora ninguna variable queda bajo la climatología en ningún horizonte. El costo es medio punto a un punto en temperatura y humedad.

**Backtesting walk-forward, viento:** mejora del RMSE frente a la climatología, de −19.8 % a +2.1 %.

**El Niño, mejora del promedio mensual** (validación cruzada 1996–2020 · prueba congelada 2021–2026):

| Variable | 1–3 meses | 4–6 meses |
|---|---|---|
| Temperatura máxima | +6.7 % · +4.2 % | +2.5 % · +3.3 % |
| Temperatura mínima | +8.1 % · +7.5 % | +6.8 % · +3.1 % |
| Temperatura media | +8.7 % · +9.1 % | +4.4 % · +5.1 % |
| Lluvia (no se usa) | −0.7 % · −1.0 % | −0.8 % · −1.2 % |

**Pronóstico largo:**
- Índice de deriva 0.00: 0 de 42 casos fuera de tolerancia. El peor es la temperatura máxima en 2021, −0.25 °C con una tolerancia de 0.32. Fue un año de La Niña y ahora el motor lo anticipa.
- Banda p10–p90 entre 76 % y 85 % (lo nominal es 80 %).

**Lo que no cambió:**
- El día exacto de la lluvia sigue sin poder anticiparse.
- 2021–2026 fue más lluvioso que 1996–2020 en todos los años (+1 a +3 mm/día en el promedio de Honduras). Es cambio de clima, no deriva.
- Las pruebas de estrés salen iguales.

**Pruebas:** 42 de 42 pasan. Hay cuatro nuevas:
- la mezcla en sus extremos, w = 0 y w = 1;
- los cuantiles siguen ordenados;
- los cuantiles de la climatología coinciden con numpy;
- El Niño se aplica solo a las temperaturas y hasta 6 meses.

Además, la prueba de "sin fuga" ahora cubre la mezcla y El Niño.

**Página interactiva:** [`html/kharis_2021_2026_reforzado.html`](html/kharis_2021_2026_reforzado.html). La genera `kharis_engine/exportar_html_2021_2026.py`. Muestra cada uno de los 30 lugares o el promedio de Honduras, por variable:
- mes a mes;
- de 1 a 7 días, antes y después de la mezcla;
- año por año, con la tolerancia de deriva;
- lluvia por umbral y El Niño.

## Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `kharis/enso.py` | Respuesta mensual al ONI y anomalía diaria esperada |
| `evaluar_probabilistico.py` | Brier, AUC y puntaje de cuantiles de la lluvia; skill de todas las variables |
| `ajustar_mezcla.py` | Ajusta los pesos de la mezcla con un motor entrenado hasta 2016 |
| `analizar_enso.py` | Validación cruzada de El Niño y prueba congelada |
| `exportar_html_2021_2026.py` + `plantilla_2021_2026.html` | Página interactiva de la prueba |

El respaldo del motor anterior está en `agroresilience/respaldos/kharis_engine_2026-11-15_antes_refuerzo/`.
