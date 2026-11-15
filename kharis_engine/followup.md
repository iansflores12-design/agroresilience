# Seguimiento de Kharis Engine

Estado al 15 de noviembre de 2026, 04:30. Carpeta: `agroresilience/kharis_engine/`. Entorno: `agroresilience/.venv_kharis`. Paquete: `agroresilience/kharis_engine.zip`.

Para usarlo: `IMPLEMENTACION.md`. Para el detalle técnico y los resultados: `README.md` (sección 14).

## 1. Estado

**Terminado y probado.** El motor está entrenado con los datos reales, probado contra 2021–2026, listo para recibir datos nuevos y con salida ligera para el sitio web.

| Pieza | Estado |
|---|---|
| Motor (datos, física, red, entrenamiento, continuo, ONNX, CLI) | hecho |
| Corrida final con datos reales | hecha: versión activa v007, datos hasta 2026-11-10 |
| 38 pruebas | pasan (33 s, 04:14, con el código final) |
| Prueba congelada 2021–2026 | hecha: índice de deriva 0.00 |
| `--versiones`, `--pronosticar`, `--actualizar`, `--rollback` con datos reales | probados |
| Salida web (`salidas/web/`) y página de ejemplo | hechas y vistas en el navegador |
| ONNX en Netron | abre (169 nodos) |
| Zip con documentación | hecho |

## 2. Qué se corrigió en la segunda sesión

1. **Margen mínimo para aceptar pesos nuevos (0.2%).** Un empate ya no cambia el modelo.
2. **Lotes cortos.** Antes, si llegaban pocos días, el motor los marcaba como vistos sin aprender de ellos. Ahora se acumulan para la siguiente actualización y el pronóstico igual parte del último día.
3. **Deriva del pronóstico largo.** La proyección libre 2021–2026 daba +5.7 mm/día de lluvia de más y −1.2 °C. Dos causas y dos arreglos:
   - *Muestreo.* Sortear de los cuantiles inflaba la lluvia 45%. Ahora la muestra conserva la media calibrada.
   - *Ancla.* El modelo corriendo solo se asentaba en un clima propio. Ahora la media del conjunto vuelve a la climatología del punto: enseguida en lluvia y viento, en 7 semanas en el resto.
4. **Media del conjunto con menos ruido** (promedia las medias calibradas de los miembros, no sus sorteos).
5. **Bandas p10–p90 entre miembros** con posiciones de Weibull: con 12–24 miembros la interpolación normal cubría 70% en vez de 80%.
6. **Control de deriva** dentro de la prueba congelada (`reports/deriva_2021_2026.csv`).
7. **Salida web** (`salidas/web/`, 69 KB por punto) y `web_ejemplo/index.html`.
8. **Dispersión del conjunto anclada (P9 en falso).** Pasados 6 meses los miembros se separaban 2.2 veces más que el clima real y la señal P9 "fuera de rango" se activaba sola (12% de días fuera de rango contra 1.5% observado). Ahora la distancia de cada miembro a la media se reescala a la desviación climatológica del punto, salvo la lluvia. Queda 1% de días fuera de rango y P9 en 2027 bajó de probabilidad 0.70 a 0.14. La corrida final se repitió con este código (04:05).

Lo que se probó y se descartó:

- **Corregir la deriva con un hindcast** (medirla en 2016–2020 y restarla): empeoró 2021–2026, porque los dos periodos tienen regímenes distintos.
- **Anclar a la anomalía de los últimos 1–5 años:** peor que la climatología fija.

## 3. Resultados clave (fuera de muestra, 2021–2026)

| Variable | Error a 1 día | Climatología | Mejora |
|---|---|---|---|
| T2M_MAX (°C) | 0.92 | 1.63 | +43% |
| T2M_MIN (°C) | 0.59 | 0.98 | +39% |
| T2M (°C) | 0.56 | 1.06 | +47% |
| RH2M (%) | 2.97 | 5.76 | +49% |
| Radiación (MJ/m²/día) | 2.47 | 2.76 | +11% |
| Viento (m/s) | 0.40 | 0.43 | +8% |
| Lluvia (mm/día) | 4.76 | 4.87 | +2% |

- Proyección libre de 6 años sin ver datos: su promedio mensual nunca es peor que la climatología, y la deriva es cero.
- Modelo de 1.5 MB; 5 ms por inferencia en GPU y 6 ms en CPU.
- Pronóstico a 365 días para los 30 puntos: 56 s en GPU (69 s en CPU, medido antes del ancla de dispersión).

## 4. Límites que hay que decir tal cual

- **El error diario no puede ser cero.** Lo que quedó en cero es la deriva.
- **La lluvia diaria** a 1 día empata con la climatología; a 7 días es peor en MAE. Sirve por sus bandas y por las probabilidades de temporada.
- **A más de dos meses** la media del pronóstico es la climatología del punto.
- **2021–2026 fue más lluvioso y húmedo** que 1996–2020 (+1.6 mm/día, +2.9%). El pronóstico largo hereda esa diferencia.
- Mitch 1998 y Eta/Iota 2020 son "dentro de muestra". El único evento de estrés fuera de muestra es El Niño 2023.
- No hay `WS2M_MAX` en `processed/`: se usa `WS2M`. Si la columna aparece, el motor la toma al reentrenar.
- `onnxruntime` no tiene instalador para Python 3.15; el ONNX se verifica con el evaluador de referencia de `onnx`.
- El ajuste de pesos se revirtió solo en 5 de 6 años del backtesting; la calibración se aceptó siempre.

## 5. Lo que queda como mejora (no bloquea)

1. **Climatología móvil de 10 años como ancla.** En una prueba rápida bajó el error mensual 5–13% en 2021–2026, pero no dentro de 1996–2020. Falta validarlo bien antes de activarlo.
2. **Descargar `WS2M_MAX`** de NASA POWER para tener ráfagas.
3. **Programar la actualización automática** (Programador de tareas de Windows). Está descrito en `IMPLEMENTACION.md`, sin probar.
4. **Cobertura de bandas.** Con la dispersión anclada, la banda p10–p90 a largo plazo cubre 77–85% (nominal 80%). T2M_MIN (77%) es la más justa.
5. **Fase siguiente:** `Gemini Decision` leyendo `salidas/web/<punto>.json` o `salidas/senales_p1_p10.csv`, con las propuestas calculadas una vez por punto y guardadas, no en cada visita.

## 6. Comandos útiles

Desde `agroresilience/kharis_engine/`, con `..\.venv_kharis\Scripts\python.exe`:

| Para qué | Comando |
|---|---|
| Meter datos nuevos | `python run_kharis.py --actualizar` |
| Solo pronosticar y rehacer la salida web | `python run_kharis.py --pronosticar` |
| Ver versiones / volver a una | `python run_kharis.py --versiones` · `python run_kharis.py --rollback v006` |
| Pruebas | `python tests/correr_pruebas.py` |
| Reentrenar todo | `python run_kharis.py --export-onnx --tensorboard` |
| Probar todo en segundos | `python run_kharis.py --demo-synthetic --export-onnx --tensorboard` |
| Ver la página de ejemplo | `python -m http.server 8090 --bind 127.0.0.1` y abrir `http://localhost:8090/web_ejemplo/index.html` |
| TensorBoard / Netron | `tensorboard --logdir runs/` · `netron artefactos/kharis_engine.onnx` |

## 7. Cuidados con este equipo

- Windows se reinició una vez (Kernel-Power 41) con dos tareas pesadas a la vez. Correr **una sola tarea pesada** a la vez.
- PyTorch 2.14 con Python 3.15 falla al cerrar el proceso tras usar la GPU; los scripts salen con `os._exit`.
