# Historico de cultivos por departamento (1981-2026)

Lo genera `scripts/historico_cultivos.py`. Responde: en este departamento y esta temporada, a que cultivo le fue mejor cada año, y como le va en años parecidos al actual (misma fase de El Niño / La Niña).

## Que es y que no es

Es una **simulacion** con el clima real de cada departamento, no la cosecha medida. No se encontro una serie publica de rendimiento por departamento y año (el INE publica el Censo Agropecuario 2024 y la Encuesta Agricola, pero no como serie descargable; el PDF del censo no se pudo bajar desde aqui).

## Fuentes

| Archivo | Fuente | Uso |
| --- | --- | --- |
| `../processed/power/*.csv`, `power_extra/*.json` | NASA POWER diario, comunidad AG, 1981-2026 | temperatura y nivel de lluvia de los 18 departamentos |
| `era5/*.json` | ERA5 via Open-Meteo (archive-api), 1981-2026 | lluvia de cada dia, ajustada mes a mes al nivel de POWER 2001-2025 |
| `../processed/oni.csv` | NOAA CPC | fase de El Niño de cada temporada |
| `faostat_honduras.csv` | FAOSTAT QCL, 1961-2024 (nacional) | validacion |
| `atlas_exportaciones_honduras.csv` | Atlas de Complejidad Economica (Harvard Growth Lab), HS92, 1995-2024 | peso de cada cultivo en las exportaciones |

Por que ERA5 para la lluvia: la lluvia de POWER antes de ~2000 sale a la mitad que despues (323 mm por ciclo en los 80 contra 672 en los 2000 en el corredor seco). Es un salto de la fuente, no del clima; con ella todos los años 80 parecian de sequia.

## Metodo

- Siembra: primera fecha con 20 mm en 3 dias dentro de la ventana (primera 1 may-30 jun, postrera 25 ago-30 sep, verano 1 dic).
- Agua: balance diario FAO-56 (ET0 de Hargreaves, curva Kc, 120 mm de agua util). WRSI = ETa / ETc.
- Rendimiento relativo: FAO-33, `1 - Ky (1 - ETa/ETc)`, menos 3 % por dia de calor en floracion y 5 % por aguacero con la tierra llena (estos dos descuentos son supuestos).
- Con riego (arroz, tomate, melon, chile) el agua no limita: se reporta cuantos mm hay que regar.
- Permanentes (cafe, palma, banano, caña, cacao): balance de todo el año con Kc fijo, sin riego.
- Buen año = 70 % o mas del potencial. Fracaso = menos de 40 %.

## Salidas

- `desempeno_departamental.csv`: 20,394 filas (departamento x año x temporada x cultivo).
- `validacion.txt`: comparacion con sequias documentadas y FAOSTAT.
- `frontend/public/historico/<departamento>.json`: resumen por fase de El Niño, ultimos 10 años y años extremos. `frontend/src/lib/decision/historico.ts` lo recorta a la consulta y lo pasa a Gemini.

## Validacion (corredor seco, primera)

Entre las 10 peores primeras simuladas de maiz estan 1997, 2014, 2015 y 2019, que son sequias documentadas (FEWS NET, DICTA, PMA). 2018 (PMA: -69 % en maiz) sale solo algo bajo: 56 % contra una mediana de 77 %. Contra FAOSTAT nacional la correlacion es debil (maiz r = 0.19, frijol r = 0.02): el dato nacional mezcla temporadas, riego y zonas.

## Limites

- Un punto de clima por departamento, en celdas de ~50 km: no ve la altura de cada finca (el cafe de altura sale con mas calor del real).
- Parametros marcados APROXIMADO en el script (Ky de arroz, cafe, palma y cacao; umbrales de calor de los cultivos de exportacion; zonas tradicionales).
- No incluye plagas, suelo, variedad ni manejo.
- La fase de El Niño que se usa es la del ultimo ONI observado, no un pronostico.
