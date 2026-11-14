# Procesamiento: de `raw/` a `processed/`

Este documento describe las reglas que convierten los archivos crudos en las tablas de `processed/`. Sirve de especificación para `scripts/procesar_nuevo.py`, que aplica esas mismas reglas a archivos nuevos sin modelos ni servicios de IA.

## Origen de las reglas

Las salidas de `processed/` del 2026-11-13 se generaron con `scripts/10_procesar.py`. Ese script es determinista: no llama a modelos ni a APIs de IA. Lo que hizo la IA (Claude) fue escribir el script, no transformar los datos. Por eso casi todas las reglas son **explícitas** (están en el código) y se verificaron contra las salidas.

Etiquetas usadas abajo:

- **[explícita]**: está escrita en `10_procesar.py` y se comprobó en la salida.
- **[inferida]**: no está escrita como regla; se dedujo comparando entrada y salida, o es una decisión nueva que el script original no necesitó (por ejemplo, qué hacer con un registro inválido, porque los datos originales no tenían ninguno).

## Reglas comunes

| Regla | Tipo |
| --- | --- |
| Las coordenadas de los puntos salen solo de `config/zonas.json` (id, nombre, lat, lon y, en SoilGrids, `suelo_alterno`). | explícita |
| No se rellena ningún dato faltante. El valor de relleno de cada fuente pasa a celda vacía. | explícita |
| No se calcula nada del motor (percentiles, grados-día, balances, puntajes). | explícita |
| `raw/` nunca se escribe. | explícita |
| CSV con encabezado, separador coma, sin índice, codificación UTF-8, decimales con punto. Celdas vacías para faltantes. | explícita (pandas `to_csv(index=False)`) |
| Fechas en `AAAA-MM-DD`. | explícita |
| Un registro inválido se anota (archivo, número de registro, motivo) y se omite; el resto del archivo sigue. | inferida (nueva) |

## Por fuente

### POWER (`raw/power/<punto>.json` → `processed/power/<punto>.csv` y `power_diario_largo.csv`)

- **Entrada:** JSON GeoJSON de la API diaria. Valores en `properties.parameter.<PARAM>.<AAAAMMDD>`; valor de relleno en `header.fill_value` (-999); unidades en `parameters`.
- **Registro:** un día.
- **Limpieza:** relleno → vacío **[explícita]**; filas ordenadas por fecha **[explícita]**.
- **Normalización:** `AAAAMMDD` → `AAAA-MM-DD` **[explícita]**.
- **Salida:** columnas `punto, latitud, longitud, fecha` y luego los parámetros en el orden del JSON **[explícita]**. `punto` es el nombre del archivo sin `.json`; `latitud` y `longitud` son las de `zonas.json`, no las del JSON **[explícita]**.
- **Calidad (`calidad_power.csv`):** por punto y parámetro: filas, vacíos, mínimo, máximo, primer y último día de la serie, primer y último día con dato **[explícita]**.
- **Registro inválido [inferida]:** fecha que no es `AAAAMMDD` válida (se omite ese día para ese parámetro), o valor no numérico (la celda queda vacía y el día se escribe igual si otro parámetro tiene dato). Ambos casos se anotan en `errores.csv`.

### ONI (`raw/noaa_oni/oni.ascii.txt` → `oni.csv`)

- **Entrada:** texto con encabezado `SEAS YR TOTAL ANOM` y columnas separadas por espacios.
- **Registro:** una línea después del encabezado.
- **Salida:** `anio, trimestre, sst_total, oni` **[explícita]**.
- **Registro inválido:** el original omite en silencio las líneas que no tienen 4 campos **[explícita]**. El script nuevo además las anota, y anota año o valores no numéricos y trimestres fuera de la lista DJF…NDJ **[inferida]**.

### IBTrACS (`raw/ibtracs/ibtracs.NA.list.v04r01.csv` → `huracanes_caribe_honduras.csv`)

- **Entrada:** CSV con una segunda fila de unidades, que se descarta **[explícita]**.
- **Registro:** una posición de una tormenta (una fila).
- **Limpieza:** se recortan espacios; los textos vacíos siguen vacíos **[explícita]**.
- **Filtro:** temporada ≥ 1981 **[explícita]**; se conservan **todas** las posiciones de las tormentas (`SID`) con al menos una posición a 500 km o menos de la caja de Honduras **[explícita]**.
- **Distancia:** haversine con radio 6371 km desde la posición hasta el punto más cercano del rectángulo (lat 12.9 a 16.6, lon -89.6 a -83.0); 0 si está dentro; redondeada a 0.1 km **[explícita]**.
- **Salida:** columnas renombradas a español (`sid, temporada, nombre, fecha_hora_utc, naturaleza, latitud, longitud, viento_wmo_kt, presion_wmo_mb, viento_usa_kt, presion_usa_mb, categoria_sshs, dist_tierra_km, dist_tierra_6h_km, distancia_caja_km, dentro_500km`) en el orden del archivo original **[explícita]**.
- **Registro inválido [inferida]:** temporada, latitud o longitud no numéricas, o latitud/longitud fuera de rango.

### SoilGrids (`raw/soilgrids/<punto>.json` y `<punto>_cercano.json` → `suelo_por_punto.csv`)

- **Registro:** un punto (un archivo).
- **Selección:** si el punto tiene `suelo_alterno` en `zonas.json`, se usa `<punto>_cercano.json`; si no, `<punto>.json` **[explícita]**.
- **Salida:** una fila con `punto, latitud_punto, longitud_punto, origen, latitud_consulta, longitud_consulta, distancia_km` y una columna `<propiedad>_<profundidad>` por capa y profundidad (por ejemplo `clay_0_5cm`), con el valor `mean` sin convertir **[explícita]**.
- **Registro inválido [inferida]:** JSON sin `properties.layers`, o archivo de un punto que no está en `zonas.json`.

### GRACE (`raw/grace/*.nc` → `grace_honduras.nc` y `grace_series.csv`)

- **Normalización:** longitudes de 0-360 a -180-180 y reordenadas **[explícita]**.
- **Recorte:** caja de Honduras ± 0.5 grados, variables `lwe_thickness, uncertainty, land_mask, scale_factor` **[explícita]**.
- **Serie:** celda más cercana a cada punto; columnas `punto, fecha, celda_lat, celda_lon, lwe_thickness, uncertainty, scale_factor, land_mask`; `scale_factor` no se aplica **[explícita]**.
- **Registro:** un mes por punto. **Inválido [inferida]:** fecha no decodificable.

### IMERG (`raw/imerg/*_HND.nc4` → `imerg_honduras.nc` e `imerg_series.csv`)

- **Entrada:** un archivo por día, ya recortado; variables en orden `(time, lon, lat)`.
- **Normalización:** se transponen a `(lat, lon)`; relleno -9999.9 (cualquier valor < -9000) → vacío en las variables decimales **[explícita]**.
- **Fecha:** se toma del nombre del archivo (`3IMERG.AAAAMMDD`) **[explícita]**.
- **Serie:** celda de 0.1 grados más cercana a cada punto; `celda_lat` y `celda_lon` redondeadas a 2 decimales; columnas `punto, fecha, celda_lat, celda_lon, precipitation, randomError, precipitation_cnt_cond, MWprecipitation` **[explícita]**.
- **Orden de salida:** por punto (orden de `zonas.json`) y luego por fecha **[explícita]**.
- **Registro inválido [inferida]:** nombre sin fecha válida o variable faltante.

### SMAP (`raw/smap/*_HND.nc4` → `smap_honduras.nc` y `smap_series.csv`)

- **Entrada:** un archivo por día con grupos AM y PM (variables PM con sufijo `_pm`).
- **Limpieza:** relleno -9999 → vacío; banderas `retrieval_qual_flag` con 65534 → vacío **[explícita]**. No se filtra por calidad **[explícita]**.
- **Duplicados:** si hay dos archivos del mismo día, se usa el último en orden alfabético **[explícita]**.
- **Malla:** la latitud de cada fila y la longitud de cada columna se toman de las celdas con dato en todos los días **[explícita]**. Para procesar un archivo suelto, el script nuevo usa esa misma malla guardada en `config/smap_malla.json` (generada una vez desde los originales) **[inferida]**: un solo día no tiene celdas con dato suficientes para reconstruirla.
- **Serie:** celda más cercana a cada punto; `celda_lat` y `celda_lon` redondeadas a 4 decimales; columnas `punto, fecha, celda_lat, celda_lon` y, por variable, `_am` y `_pm` en el orden `soil_moisture, retrieval_qual_flag, soil_moisture_error, surface_temperature, vegetation_water_content` intercalado AM/PM; `surface_flag` solo en el NetCDF **[explícita]**.

### Meteomatics (`raw/meteomatics/*.json` → `meteomatics_diario_largo.csv`, `meteomatics_pronostico.csv`, `meteomatics_estaticos.csv`)

- **Entrada:** JSON de la API con `data[].parameter` y `data[].coordinates[].dates[]`. Las coordenadas vienen en el orden de `zonas.json` y se verifica que coincidan **[explícita]**.
- **Registro:** un punto en una marca de tiempo; se unen los parámetros de los tres grupos (clima, energía, suelo) en una sola fila **[explícita]**.
- **Normalización:** `dia_local` = fecha de `marca_utc` menos un día, porque 06:00Z es medianoche de Honduras **[explícita]**.
- **Salida:** `punto, latitud, longitud, dia_local, marca_utc` y los parámetros en el orden en que aparecen; filas por punto (orden de `zonas.json`) y por `marca_utc` **[explícita]**. `hist_*` → diario largo; `pronostico_*` → pronóstico; `estaticos.json` → una fila por punto **[explícita]**.
- **Registro inválido [inferida]:** marca de tiempo que no es ISO `AAAA-MM-DDThh:mm:ssZ`, valor no numérico, o coordenadas que no coinciden con ningún punto.

## Fuera de alcance

- ECOSTRESS y HLS no tienen versión procesada.
- El diccionario `processed/DICCIONARIO.md` lo sigue generando `10_procesar.py`.
- `procesar_nuevo.py` no genera los NetCDF recortados de GRACE, IMERG y SMAP; solo las series CSV.

## Decisiones del script nuevo [inferidas]

- Una fila nueva con la misma clave (por ejemplo punto y fecha) reemplaza a la anterior y se anota en `salida/avisos.csv`. En Meteomatics solo reemplaza las celdas con dato, porque clima, energía y suelo llegan en archivos distintos.
- IMERG y SMAP anotan error si un punto queda a más de 0.5 grados de la celda más cercana.
- En Meteomatics las coordenadas se emparejan con `zonas.json` por valor, no por posición.
- Con archivos pequeños, pandas puede escribir un entero como `1` donde la tabla original dice `1.0`. No ocurre al procesar los originales completos.
