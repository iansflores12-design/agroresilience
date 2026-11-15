# Diccionario de datos de processed/

> `processed/` no se carga a la aplicación hasta que los organizadores confirmen por escrito que limpiar archivos antes del evento está permitido.

Todo sale de `raw/` con `scripts/10_procesar.py`. Solo limpieza y orden: sin percentiles, grados-día, balances ni puntajes. Los vacíos son datos faltantes en el origen; no se rellenó nada.

## power_diario_largo.csv y power/<punto>.csv

- Fuente: NASA POWER, API diaria por punto, comunidad AG
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Relleno -999 convertido a vacio; no se rellena nada. Unidades tal como las reporta POWER.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  | id del punto en config/zonas.json |
| `latitud` | grados | latitud pedida |
| `longitud` | grados | longitud pedida |
| `fecha` | AAAA-MM-DD | dia |
| `PRECTOTCORR` | mm/day | Precipitation Corrected |
| `T2M` | C | Temperature at 2 Meters |
| `T2M_MAX` | C | Temperature at 2 Meters Maximum |
| `T2M_MIN` | C | Temperature at 2 Meters Minimum |
| `RH2M` | % | Relative Humidity at 2 Meters |
| `ALLSKY_SFC_SW_DWN` | MJ/m^2/day | All Sky Surface Shortwave Downward Irradiance |
| `WS2M` | m/s | Wind Speed at 2 Meters |
| `WS2M_MAX` | m/s | Wind Speed at 2 Meters Maximum |
| `GWETROOT` | 1 | Root Zone Soil Wetness |
| `GWETTOP` | 1 | Surface Soil Wetness |
| `EVPTRNS` | MJ/m^2/day | Evapotranspiration Energy Flux |
| `EVLAND` | mm/day | Evaporation Land |
| `WS10M` | m/s | Wind Speed at 10 Meters |
| `WS10M_MAX` | m/s | Wind Speed at 10 Meters Maximum |

## calidad_power.csv

- Fuente: derivado de raw/power
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Una fila por punto y parametro.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `parametro` |  | nombre POWER |
| `filas` | dias | dias en la serie |
| `vacios` | dias | dias con relleno -999 |
| `minimo` | unidad del parametro |  |
| `maximo` | unidad del parametro |  |
| `primer_dia` | AAAA-MM-DD | primer dia de la serie |
| `ultimo_dia` | AAAA-MM-DD | ultimo dia de la serie |
| `primer_dia_con_dato` | AAAA-MM-DD |  |
| `ultimo_dia_con_dato` | AAAA-MM-DD |  |

## oni.csv

- Fuente: NOAA CPC (no NASA), oni.ascii.txt
- Fecha de descarga (hora de Honduras): 2026-11-13

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `anio` |  | columna YR |
| `trimestre` |  | trimestre movil, columna SEAS (DJF, JFM, ...) |
| `sst_total` | C | temperatura del mar Nino 3.4, columna TOTAL |
| `oni` | C | anomalia, columna ANOM |

## huracanes_caribe_honduras.csv

- Fuente: NOAA NCEI IBTrACS v04r01, cuenca NA (no NASA)
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Tormentas de temporada 1981 en adelante con al menos una posicion a 500 km o menos de la caja de Honduras (lat 12.9 a 16.6, lon -89.6 a -83.0). Distancia: haversine (radio 6371 km) de la posicion al punto mas cercano del rectangulo; 0 si esta dentro. Se conservan todas las posiciones de cada tormenta que califica. Valores vacios en el original siguen vacios.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `sid` |  | identificador IBTrACS |
| `temporada` | anio |  |
| `nombre` |  | UNNAMED si no tiene |
| `fecha_hora_utc` | AAAA-MM-DD hh:mm:ss UTC |  |
| `naturaleza` |  | TS, ET, DS, etc. |
| `latitud` | grados |  |
| `longitud` | grados |  |
| `viento_wmo_kt` | nudos | viento sostenido maximo, agencia WMO |
| `presion_wmo_mb` | mb |  |
| `viento_usa_kt` | nudos | viento sostenido maximo, agencia de EE. UU. |
| `presion_usa_mb` | mb |  |
| `categoria_sshs` |  | Saffir-Simpson; negativos = no huracan |
| `dist_tierra_km` | km | DIST2LAND de IBTrACS |
| `dist_tierra_6h_km` | km | LANDFALL de IBTrACS |
| `distancia_caja_km` | km | distancia a la caja de Honduras (calculada aqui) |
| `dentro_500km` | 0/1 | 1 si esta posicion esta a 500 km o menos |

## suelo_por_punto.csv

- Fuente: ISRIC SoilGrids v2.0 (no NASA)
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Valores sin convertir (unidades mapeadas de SoilGrids). Los puntos alternos no estan verificados como agricolas.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `latitud_punto` | grados | coordenada de zonas.json |
| `longitud_punto` | grados |  |
| `origen` |  | original = coordenada del punto; alterno = punto cercano con datos (el original vino nulo) |
| `latitud_consulta` | grados | coordenada realmente consultada |
| `longitud_consulta` | grados |  |
| `distancia_km` | km | distancia entre el punto y la coordenada consultada |
| `bdod_<profundidad>` | cg/cm³ | densidad aparente, valor mean tal como lo entrega SoilGrids; dividir entre 100 para obtener kg/dm³. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `cec_<profundidad>` | mmol(c)/kg | capacidad de intercambio cationico, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener cmol(c)/kg. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `clay_<profundidad>` | g/kg | arcilla, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener %. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `phh2o_<profundidad>` | pH*10 | pH en agua, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener -. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `sand_<profundidad>` | g/kg | arena, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener %. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `silt_<profundidad>` | g/kg | limo, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener %. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |
| `soc_<profundidad>` | dg/kg | carbono organico del suelo, valor mean tal como lo entrega SoilGrids; dividir entre 10 para obtener g/kg. Profundidades: 0_5cm, 5_15cm, 15_30cm, 30_60cm, 60_100cm |

## grace_series.csv y grace_honduras.nc

- Fuente: NASA PO.DAAC, TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Recorte: caja de Honduras mas 0.5 grados; longitudes pasadas de 0-360 a -180-180. Serie: celda de 0.5 grados mas cercana a cada punto. La resolucion real es de mascons de 3 grados, asi que puntos vecinos comparten valores. scale_factor se entrega aparte y NO se aplico. Meses sin dato en el original (vacio entre GRACE y GRACE-FO, 2017-2018) no aparecen.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `fecha` | AAAA-MM-DD | fecha central del mes segun el archivo |
| `celda_lat` | grados | centro de la celda usada |
| `celda_lon` | grados |  |
| `lwe_thickness` | cm | anomalia de espesor equivalente de agua |
| `uncertainty` | cm | incertidumbre 1-sigma |
| `scale_factor` | adimensional | factor de ganancia CRI, no aplicado |
| `land_mask` | 0/1 | 1 = tierra |

## imerg_series.csv y imerg_honduras.nc

- Fuente: NASA GES DISC, GPM_3IMERGDF V07 (Final, diario)
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Los archivos crudos ya son un recorte de Honduras; aqui solo se unen en un NetCDF (time, lat, lon) y se convierte el relleno -9999.9 a vacio. Serie: celda de 0.1 grados mas cercana a cada punto. El dia es UTC. Final llega hasta 2025-09-30.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `fecha` | AAAA-MM-DD (UTC) |  |
| `celda_lat` | grados | centro de la celda usada |
| `celda_lon` | grados |  |
| `precipitation` | mm/day | lluvia diaria, estimacion combinada |
| `randomError` | mm/day | error aleatorio de la estimacion |
| `precipitation_cnt_cond` | conteo | numero de medias horas con lluvia en el dia |
| `MWprecipitation` | mm/day | lluvia solo de sensores de microondas |

## smap_series.csv y smap_honduras.nc

- Fuente: NASA NSIDC, SPL3SMP_E v006 (9 km, diario)
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Los archivos crudos ya son un recorte de Honduras; aqui se unen en un NetCDF (time, y, x) con pasada AM (6 am, descendente) y PM (6 pm, ascendente). Relleno -9999 (y 65534 en banderas) convertido a vacio. La latitud de cada fila y la longitud de cada columna se tomaron de las celdas con dato (malla EASE-Grid 2.0). Serie: celda mas cercana a cada punto; SMAP no observa cada celda todos los dias, asi que hay muchos vacios. Fechas con dos archivos: se uso el ultimo en orden alfabetico y se dejaron fuera 7: SMAP_L3_SM_P_E_20261012_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261015_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261020_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261021_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261023_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261025_R19240_001_1MMe51bJ_HND.nc4, SMAP_L3_SM_P_E_20261108_R19240_001_1MMe51bJ_HND.nc4. No se filtro por bandera de calidad.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `fecha` | AAAA-MM-DD | dia del archivo |
| `celda_lat` | grados | centro de la celda usada |
| `celda_lon` | grados |  |
| `soil_moisture_am / _pm` | cm3/cm3 | humedad del suelo superficial (0-5 cm) |
| `retrieval_qual_flag_am / _pm` | bits | bandera de calidad; 0 = recuperacion recomendada |
| `soil_moisture_error_am / _pm` | cm3/cm3 | error estimado |
| `surface_temperature_am / _pm` | K | temperatura efectiva del suelo usada en la recuperacion |
| `vegetation_water_content_am / _pm` | kg/m2 | contenido de agua de la vegetacion |
| `surface_flag_am / _pm (solo en el .nc)` | bits | bandera de superficie |

## meteomatics_diario_largo.csv y meteomatics_pronostico.csv

- Fuente: Meteomatics API (comercial, no NASA), cuenta del hackathon
- Fecha de descarga (hora de Honduras): 2026-11-13
- Notas: Valores de modelo/reanalisis, no de estacion. Los parametros *_24h cubren las 24 h que terminan en marca_utc. meteomatics_pronostico.csv es PRONOSTICO emitido el dia de la descarga, no observacion. Descripciones redactadas a partir del nombre del parametro; confirmar en la documentacion de Meteomatics.

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `latitud` | grados |  |
| `longitud` | grados |  |
| `dia_local` | AAAA-MM-DD | dia de Honduras que resume el valor (marca_utc menos un dia) |
| `marca_utc` | ISO 8601 | marca de tiempo pedida, 06:00Z = medianoche de Honduras |
| `t_max_2m_24h:C` | C | temperatura maxima a 2 m en las 24 h previas |
| `t_min_2m_24h:C` | C | temperatura minima a 2 m en las 24 h previas |
| `t_mean_2m_24h:C` | C | temperatura media a 2 m en las 24 h previas |
| `precip_24h:mm` | mm | lluvia acumulada en las 24 h previas |
| `relative_humidity_mean_2m_24h:p` | % | humedad relativa media 24 h |
| `relative_humidity_max_2m_24h:p` | % | humedad relativa maxima 24 h |
| `relative_humidity_min_2m_24h:p` | % | humedad relativa minima 24 h |
| `wind_speed_mean_10m_24h:ms` | m/s | viento medio a 10 m en 24 h |
| `wind_gusts_10m_24h:ms` | m/s | racha maxima a 10 m en 24 h |
| `global_rad_24h:J` | J/m2 | radiacion global acumulada en 24 h |
| `evapotranspiration_24h:mm` | mm | evapotranspiracion acumulada en 24 h |
| `sunshine_duration_24h:h` | h | horas de sol en 24 h |
| `dew_point_2m:C` | C | punto de rocio a 2 m, valor instantaneo a las 06:00Z |
| `t_0m:C` | C | temperatura en superficie, instantanea a las 06:00Z |
| `t_-15cm:C` | C | temperatura del suelo a 15 cm, instantanea a las 06:00Z |
| `leaf_wetness:idx` | indice | humedad de hoja, instantanea a las 06:00Z |
| `frost_days:d` | dias | dias de helada segun Meteomatics |
| `soil_moisture_index_-15cm:idx` | indice | indice de humedad del suelo a 15 cm |
| `soil_moisture_index_-50cm:idx` | indice | indice de humedad del suelo a 50 cm |
| `soil_moisture_index_-150cm:idx` | indice | indice de humedad del suelo a 150 cm |
| `soil_moisture_deficit:mm` | mm | deficit de humedad del suelo |
| `volumetric_soil_water_-15cm:m3m3` | m3/m3 | agua volumetrica del suelo a 15 cm |
| `drought_index:idx` | indice | indice de sequia de Meteomatics |

## meteomatics_estaticos.csv

- Fuente: Meteomatics API (comercial, no NASA)
- Fecha de descarga (hora de Honduras): 2026-11-13

| Columna | Unidad | Descripción |
| --- | --- | --- |
| `punto` |  |  |
| `latitud` | grados |  |
| `longitud` | grados |  |
| `soil_type:idx` | indice | tipo de suelo segun Meteomatics |
| `elevation:m` | m | elevacion del modelo |
