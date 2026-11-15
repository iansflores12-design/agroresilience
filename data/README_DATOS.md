# Datos AgroResilience (NASA Space Apps 2026, Field Shift, equipo Honduras)

> **ADVERTENCIA:** «`processed/` no se carga a la aplicación hasta que los organizadores confirmen por escrito que limpiar archivos antes del evento está permitido».

## Reglas de esta carpeta

- `raw/` es la copia cruda, tal como se descargó. Nunca se modifica.
- `processed/` sale solo de `raw/`.
- Cada archivo crudo queda registrado en `manifest/raw_manifest.csv` (dataset, url, fecha de descarga en hora de Honduras, bytes, sha256).
- Credenciales de Earthdata: solo por variables de entorno `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` o `~/.netrc`. Nunca en código ni logs.
- Coordenadas: solo desde `config/zonas.json`.

## Recursos oficiales del reto

Leídos el 2026-11-13 en https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources

### NASA

| Recurso | Enlace oficial | ¿En el plan? | ¿Útil para Honduras? |
| --- | --- | --- | --- |
| SMAP (humedad del suelo) | https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap | Sí (paso 7) | Sí |
| GPM e IMERG (lluvia) | https://gpm.nasa.gov/data | Sí (paso 6) | Sí |
| Landsat | https://earthexplorer.usgs.gov/ | Parcial (HLS, paso 8) | Sí |
| MODIS | https://lpdaac.usgs.gov/products/ | **No** | Sí (NDVI 250 m, global) |
| VIIRS | https://search.earthdata.nasa.gov/search?q=VIIRS | **No** | Sí (NDVI, global) |
| NASA POWER | https://power.larc.nasa.gov/ | Sí (paso 1) | Sí |
| SRTM (elevación) | https://www.earthdata.nasa.gov/data/instruments/srtm | **No** | Sí (pendiente, escorrentía) |
| ECOSTRESS | https://ecostress.jpl.nasa.gov/data | Sí (paso 8, opcional) | Sí |
| NLDAS / GLDAS | https://www.earthdata.nasa.gov/ | **No** | Solo GLDAS (NLDAS cubre EE. UU.) |
| GEDI | https://gedi.umd.edu/data | **No** | Poco (estructura de bosque) |

### Otras agencias (no NASA)

| Recurso | Enlace | ¿Útil para Honduras? |
| --- | --- | --- |
| USDA Ag Data Commons | https://www.nal.usda.gov/services/agdatacommons | Poco (mayormente EE. UU.) |
| Web Soil Survey (NRCS) | https://websoilsurvey.nrcs.usda.gov/app/ | No (solo EE. UU.) |
| Cropland Data Layer (CropScape) | https://nassgeodata.gmu.edu/CropScape/ | No (solo EE. UU.) |
| PRISM (Oregon State) | https://prism.oregonstate.edu/ | No (solo EE. UU.) |
| SSURGO / STATSGO2 | https://www.nrcs.usda.gov/resources/data-and-reports/soils | No (solo EE. UU.) |
| NAIP | https://naip-usdaonline.hub.arcgis.com/ | No (solo EE. UU.) |
| USGS NLCD | https://www.usgs.gov/centers/eros/science/national-land-cover-database | No (solo EE. UU.) |
| FAO GAEZ | https://gaez.fao.org/ | **Sí** (aptitud de cultivos global) |
| CoCoRaHS | https://www.cocorahs.org/Maps | No (Norteamérica) |
| USGS NWIS | https://waterdata.usgs.gov/nwis | No (solo EE. UU.) |
| USDA AMS Market News | https://www.ams.usda.gov/market-news | Poco |
| USDA NASS QuickStats | https://quickstats.nass.usda.gov/ | No (solo EE. UU.) |
| OpenET | https://openetdata.org/ | No (oeste de EE. UU.) |
| USFS LANDFIRE | https://www.landfire.gov/ | No (solo EE. UU.) |
| ESA Copernicus Sentinel-2 | https://dataspace.copernicus.eu/ | Sí (10 m, requiere cuenta Copernicus) |
| ERA5 (ECMWF) | https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview | Sí (requiere cuenta CDS) |

Recursos del plan que **no** aparecen en la página oficial: NOAA ONI, NOAA IBTrACS, SoilGrids (ISRIC), GRACE/GRACE-FO.

Recursos oficiales útiles que **no** estaban en el plan (propuestos, pendientes de aprobación): SRTM, MODIS/VIIRS NDVI, GLDAS, FAO GAEZ, ERA5, Sentinel-2.

## Estado por conjunto de datos

| Conjunto | Fuente | Estado (2026-11-13) | Tamaño | Cobertura | Notas |
| --- | --- | --- | --- | --- | --- |
| POWER diario | NASA | Bajado, 11 puntos | 41.9 MB | 1981-01-01 a 2026-11-08, 16,748 días por punto | 14 parámetros. `ALLSKY_SFC_SW_DWN` trae relleno -999 en 1981-1983 (1,095 días) y en 2026-09-07. |
| ONI | NOAA CPC (no NASA) | Bajado | 23 KB | Hasta el trimestre ASO 2026 | |
| IBTrACS v04r01 NA | NOAA NCEI (no NASA) | Bajado | 57.6 MB | Archivo modificado en origen el 2026-11-12 | URL: https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NA.list.v04r01.csv |
| SoilGrids v2.0 | ISRIC (no NASA) | Bajado: 11 puntos originales (8 sin datos) y 8 puntos alternos con datos | 0.09 MB | 7 propiedades x 5 profundidades | Ver notas. |
| GRACE / GRACE-FO mascon RL06.3 V4 | NASA PO.DAAC | Bajado, 1 archivo global | 46.4 MB | 2002-04 a 2026-09, mensual | `GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc`, sin recortar. |
| SMAP SPL3SMP_E v006 | NASA NSIDC | Bajado, **recorte** de Honduras, 4,167 archivos, 0 fallos | 413 MB (global: 2,583 GB) | 2015-03-31 a 2026-11-12 | Recorte por OPeNDAP; ver notas. 7 fechas tienen dos archivos (dos versiones de proceso); se guardaron ambas. |
| IMERG Final diario V07 | NASA GES DISC | Bajado, **recorte** de Honduras, 10,135 archivos, 0 fallos | 606 MB (global: 291 GB) | 1998-01-01 a 2025-09-30, sin días faltantes | Recorte por OPeNDAP; ver notas. Final tiene retraso de meses: 2025 llega solo a septiembre y 2026 no existe. |
| Meteomatics | Comercial (no NASA) | Bajado, 142 archivos, 0 fallos | 183 MB | 1981-01-01 a 2026-11-13 diario (16,753 días), 23 parámetros, 11 puntos; pronóstico de 14 días emitido el 2026-11-13 | Sin nulos. Términos de uso pendientes de revisar. |
| ECOSTRESS ECO_L3T_JET v003 | NASA LP DAAC | Bajado, 75 gránulos, 1,050 archivos, 0 fallos | 2.75 GB | 2025-12-21 a 2026-10-21; teselas 16PDA y 16PDB (Comayagua), 16PDV (Choluteca) | Teselas completas, sin recortar. 14 capas GeoTIFF por gránulo (ETdaily, ETuncertainty, cloud, water y modelos PT-JPL, STIC, BESS, PM). Sin versión procesada. |
| HLSL30 v2.0 | NASA LP DAAC | Solo consultado, no bajado (24.6 GB); ver Pendientes | | | |

Agregados el 2026-11-14 (scripts 13 a 18). Los de 13 a 17 los bajó otra sesión; aquí se documentan.

| Conjunto | Fuente | Estado (2026-11-14) | Tamaño | Cobertura | Notas |
| --- | --- | --- | --- | --- | --- |
| POWER en malla 0.5 grados | NASA | Bajado, 641 archivos, 3 fallos | 100 MB | 1981 a 2026, 14 parámetros por año | `13_power_malla.py`. Los 3 fallos son `ALLSKY_SFC_SW_DWN` de 1981 a 1983, que no existe en origen. Para mapas; sin tabla por punto. |
| MOD13A3 v061 (NDVI/EVI 1 km mensual) | NASA LP DAAC | Bajado, 642 archivos HDF4 | 4.5 GB | 2000 a 2026-10, teselas h09v07 y h10v07 | `14_ndvi_srtm.py`. Para mapas; sin procesar (HDF4 necesita librerías nativas). |
| VNP13A3 v002 (VIIRS) | NASA LP DAAC | Bajado, 356 archivos, 2 fallos | 3.5 GB | 2012 a 2026 | `14_ndvi_srtm.py`. No está en la lista de variables del equipo. |
| SRTMGL1 v003 | NASA LP DAAC | Bajado, 34 hojas | 281 MB | Toda la caja | `14_ndvi_srtm.py`. Procesado a `srtm_por_punto.csv`. |
| GLDAS Noah 0.25 mensual v2.1 | NASA GES DISC | Bajado, **recorte**, 319 archivos | 90 MB | 2000-01 a 2026-07 | `15_gldas_imerg_late.py`. Procesado a `gldas_series.csv`. |
| IMERG Late diario V07 | NASA GES DISC | Bajado, **recorte**, 409 archivos | 23 MB | 2025-10-01 a 2026-11-13 | `15_gldas_imerg_late.py`. Provisional. Procesado a `imerg_late_series.csv`. |
| SoilGrids v2.0 raster | ISRIC (no NASA) | Bajado, 61 GeoTIFF | 161 MB | Toda la caja, 250 m | `16_soilgrids_raster.py`. Para mapas; los puntos ya están en `suelo_por_punto.csv`. |
| MOD13Q1 v061 NDVI 250 m (área) | NASA LP DAAC (AppEEARS) | Bajado, 1,844 archivos, 15 fallos por DNS (reintentados) | 8.3 GB | 2000-02 a 2026-11 | `17_appeears_ndvi.py`. NDVI y confiabilidad, sin EVI. Para mapas. |
| FAO GAEZ v4 | FAO (no NASA) | Bajado, 58 GeoTIFF globales y 19 recortes | 255 MB | Clima de referencia 1981-2010; LGP anual 2006-2010 | `18_faltantes.py gaez` y `gaez_recorte`. Aptitud, clase y rendimiento alcanzable de maíz, frijol, sorgo, café y yuca (secano, insumos alto y bajo); LGP; limitaciones del suelo SQ0-SQ7; AEZ. Ver PROCESAMIENTO.md. |
| ERA5 diario (vía Open-Meteo) | ECMWF (no NASA) | Bajado, 11 puntos | 4.8 MB | 2006-01-01 a 2026-11-07 | `18_faltantes.py era5`. Temperatura, lluvia y humedad del suelo en 4 capas (equivale a swvl1-4). **No es la descarga oficial del CDS**: esa requiere cuenta. |
| AppEEARS por punto | NASA LP DAAC / NSIDC | Ver abajo | | | `18_faltantes.py enviar` y `bajar`. SMAP L4 (sm_rootzone), MOD13Q1 NDVI+EVI, HLS S30 (Sentinel-2) y HLS L30 (Landsat). Solo los 11 puntos, para no llenar el disco. |

## Cambios respecto al plan y fallos

- **POWER, prueba de parámetros (2026-11-13):** solicitud de prueba en Comayagua, 2024-01-01 a 2024-01-03, comunidad AG. Los 10 parámetros pedidos son válidos sin cambios. Se suman 4 que también existen en AG: `EVPTRNS` (flujo de energía de evapotranspiración, MJ/m^2/día), `EVLAND` (evaporación del suelo, mm/día), `WS10M` y `WS10M_MAX` (viento a 10 m, m/s). Total 14 parámetros, bajo el límite de 20.
- **SoilGrids, puntos sin datos (2026-11-13):** el servicio respondió 200 pero con los 35 valores `mean` en nulo para 8 de 11 puntos: Choluteca, Nacaome, Tegucigalpa, Comayagua, Danlí, Santa Rosa de Copán, Yoro y San Pedro Sula. Solo Juticalpa, Catacamas y La Esperanza traen valores. Causa probable, no confirmada: las coordenadas caen en el casco urbano, que SoilGrids enmascara. No se rellenó nada. Alternativa pendiente de decisión: consultar un punto agrícola cercano a cada ciudad.
- **SoilGrids, errores de red:** el servicio fue lento (hasta 2 minutos por llamada). Tegucigalpa necesitó 2 intentos y Comayagua falló 3 veces en la primera corrida; se bajó al volver a correr el script. Detalle en `logs/soilgrids.log`.
- **Sintaxis de SoilGrids verificada:** `property` y `depth` se repiten como parámetros de consulta; profundidades con sufijo `cm` (por ejemplo `0-5cm`); `value=mean`.
- **SoilGrids, punto alterno:** para los 8 puntos sin datos, `scripts/04_soilgrids_cercano.py` prueba a 0.05 grados (unos 5.5 km) y luego a 0.10 grados en 8 direcciones (N, NE, E, SE, S, SO, O, NO) y baja el primero con datos a `raw/soilgrids/<punto>_cercano.json`. El punto elegido queda en `config/zonas.json` (`suelo_alterno`). No se verificó que sea agrícola. Los archivos originales nulos se conservan.
- **SMAP, recorte (2026-11-13):** no se baja el archivo global. Se pide por OPeNDAP (`opendap.earthdata.nasa.gov`, DAP4) solo las filas 576-633 y columnas 966-1041 de la malla EASE-Grid 2.0 de 9 km (latitud 12.7 a 16.9, longitud -89.8 a -82.8, algo más que la caja de Honduras), grupos AM y PM, 8 variables por grupo: `soil_moisture`, `retrieval_qual_flag`, `surface_flag`, `latitude`, `longitude`, `soil_moisture_error`, `surface_temperature`, `vegetation_water_content`. Archivos `*_HND.nc4`; el manifiesto los marca como recorte. Orden: mayo a noviembre de 2015, 2020, 2023 y 2025, después el resto.
- **IMERG, recorte (2026-11-13):** no se baja el archivo global. Se pide por OPeNDAP en la nube (`opendap.earthdata.nasa.gov`, DAP4) solo los índices de longitud 902-970 y latitud 1027-1067 de la malla de 0.1 grados (longitud -89.75 a -82.95, latitud 12.75 a 16.75), variables `precipitation`, `randomError`, `precipitation_cnt_cond` y `MWprecipitation`. Archivos `*_HND.nc4`; el manifiesto los marca como recorte. Orden: 2020, 2023, 2015, 2024 en adelante, el resto desde 2000 y al final 1998-1999. El servicio OPeNDAP clásico (`gpm1.gesdisc.eosdis.nasa.gov/opendap`) respondió 400 y no se usa. Una primera prueba en la nube respondió 403; la cuenta sí tenía acceso (la descarga directa respondió bien) y la prueba siguiente funcionó sin aprobar ninguna aplicación; causa del 403 no determinada. Las fechas del catálogo empiezan en 1998, no en 2000.
- **earthaccess:** en la versión instalada `granule.size` es una propiedad, no un método.
- **Meteomatics (sumado el 2026-11-13 a pedido del equipo):** servicio comercial, **no es de la NASA** y no aparece en la pestaña de recursos oficiales del reto. Cuenta del hackathon, vence el 2026-11-22; límite de 1,000 solicitudes por día; histórico disponible desde 1900. **Pendiente: revisar los términos de uso de los datos.** Se baja a `raw/meteomatics/` una solicitud por año (1981 a hoy) y por grupo de parámetros con los 11 puntos juntos, más un pronóstico de 14 días (archivos `pronostico_*`, que no son observaciones). Los valores diarios se piden a las 06:00Z para que la ventana de 24 h coincida con el día local de Honduras; la fecha `AAAA-MM-DDT06:00Z` resume el día local anterior. Parámetros que no existen (404): `land_usage:idx`, `heat_wave:idx`; se quitaron. Un bloque de 5 años con 10 parámetros agotó el tiempo de espera, por eso se pide por año. Las respuestas crudas incluyen el nombre de usuario de la cuenta en el campo `user` (no la clave).

## Cómo volver a correr

```
cd scripts
python3 01_power.py
python3 02_oni_ibtracs.py
python3 03_soilgrids.py
python3 04_soilgrids_cercano.py
../.venv/bin/python 05_grace.py      # requiere Earthdata
../.venv/bin/python 06_tamanos.py    # solo calcula tamaños
../.venv/bin/python 07_smap.py       # requiere Earthdata
../.venv/bin/python 08_imerg.py      # requiere Earthdata
python3 09_meteomatics.py            # requiere cuenta Meteomatics en ~/.netrc
../.venv/bin/python 12_ecostress.py  # requiere Earthdata
```

Entorno: `python3 -m venv .venv && .venv/bin/pip install earthaccess xarray netCDF4 h5netcdf`.

Las descargas son reanudables: lo que ya está en el manifiesto y en disco se omite. Para repetir desde cero hay que vaciar `raw/` y `manifest/raw_manifest.csv` a mano.

## Versión procesada

Hecha el 2026-11-13 con `scripts/10_procesar.py`, solo a partir de `raw/` (359 MB). Detalle de cada tabla, columna y unidad en `processed/DICCIONARIO.md`. Después de procesar se verificó que los 14,477 archivos de `raw/` siguen coincidiendo con su sha256 del manifiesto.

```
.venv/bin/python -I scripts/10_procesar.py            # todo
.venv/bin/python -I scripts/10_procesar.py power oni  # solo algunos
```

- **POWER:** `power/<punto>.csv`, `power_diario_largo.csv` (184,228 filas) y `calidad_power.csv`. El relleno -999 quedó vacío; solo `ALLSKY_SFC_SW_DWN` tiene vacíos (1,096 días por punto).
- **ONI:** `oni.csv`, 921 trimestres, hasta ASO 2026.
- **IBTrACS:** `huracanes_caribe_honduras.csv`, 131 tormentas (7,307 posiciones) de 1981 a 2025. Distancia: haversine desde cada posición al punto más cercano de la caja de Honduras (0 si está dentro); califica la tormenta que tuvo al menos una posición a 500 km o menos. La caja es un rectángulo, no la frontera real del país.
- **SoilGrids:** `suelo_por_punto.csv`, 11 filas; 8 usan el punto alterno (columna `origen`). Valores sin convertir.
- **GRACE:** `grace_honduras.nc` y `grace_series.csv`, 261 meses. No se aplicó `scale_factor`.
- **IMERG:** `imerg_honduras.nc` y `imerg_series.csv`, 10,135 días, sin vacíos.
- **SMAP:** `smap_honduras.nc` y `smap_series.csv`, 4,160 días (se dejó fuera el archivo más viejo de las 7 fechas duplicadas). Cada punto tiene dato en unos 1,500 a 1,950 días por pasada; el resto son vacíos reales del satélite. No se filtró por bandera de calidad.
- **Meteomatics:** `meteomatics_diario_largo.csv` (184,283 filas), `meteomatics_pronostico.csv` y `meteomatics_estaticos.csv`. La columna `dia_local` es la marca de tiempo menos un día, por eso empieza en 1980-12-31.

## Procesar archivos nuevos (sin IA)

`scripts/procesar_nuevo.py` aplica a archivos nuevos las mismas reglas que generaron `processed/`. No usa modelos, APIs de IA ni red. Las reglas están en `PROCESAMIENTO.md`.

**Cómo ejecutarlo** (desde esta carpeta):

```
.venv/bin/python -I scripts/procesar_nuevo.py                      # procesa lo nuevo que haya en entrada/
.venv/bin/python -I scripts/procesar_nuevo.py ruta/al/archivo.json # procesa archivos concretos
.venv/bin/python -I scripts/procesar_nuevo.py --entrada OTRA --salida OTRA
```

Las carpetas también se pueden fijar con las variables `AGRO_ENTRADA` y `AGRO_SALIDA`. El script se niega a escribir en `raw/` o `processed/`.

**Cómo añadir datos nuevos:**

1. Copia el archivo crudo en `entrada/` con el mismo nombre que usa su fuente en `raw/` (el tipo se detecta por nombre y contenido): `power/<punto>.json`, `oni*.txt`, `ibtracs*.csv`, `<punto>.json` o `<punto>_cercano.json` de SoilGrids, `hist_*.json` / `pronostico_*.json` / `estaticos.json` de Meteomatics, `*3IMERG*_HND.nc4`, `SMAP_L3_SM_P_E_*_HND.nc4`, `GRCTellus*.nc`.
2. El punto debe existir en `config/zonas.json`. Para un punto nuevo, agrégalo ahí primero.
3. Corre el script sin argumentos. Solo procesa archivos cuyo sha256 no esté en `salida/.procesados.csv`.
4. Revisa `salida/`: las tablas tienen el mismo formato que `processed/`. Los registros inválidos están en `salida/errores.csv` (columnas: fecha_hora, archivo, tipo, registro, motivo) y los reemplazos de filas repetidas en `salida/avisos.csv`. Un registro inválido no detiene la corrida.

`salida/` no se mezcla sola con `processed/`; ese paso es manual.

**Pruebas** (27, tardan unos 3 minutos):

```
.venv/bin/python -I -m unittest discover -s tests -v
```

Cubren (a) los datos originales, verificando que la salida coincide con `processed/` (POWER, ONI, IBTrACS, SoilGrids, GRACE y Meteomatics completos; IMERG y SMAP con una muestra de 30 archivos cada uno), y (b) archivos sintéticos con registros nuevos e inválidos.

SMAP usa la malla guardada en `config/smap_malla.json`; se regenera con `.venv/bin/python -I scripts/generar_malla_smap.py`.

## Pendientes

- HLS: **solo consultado, no bajado**. ECOSTRESS se bajó después con `scripts/12_ecostress.py` (ver tabla de estado); no tiene versión procesada. Consulta original de ambos (`scripts/11_consulta_ecostress_hls.py`, 2025-11-14 a 2026-11-14). En espera de decisión.

  | Producto | Punto | Gránulos | Tamaño | Fechas | Teselas |
  | --- | --- | --- | --- | --- | --- |
  | ECO_L3T_JET v003 | Comayagua | 41 | 1.59 GB | 2026-01-10 a 2026-10-06 | 16PDA (20), 16PDB (21) |
  | ECO_L3T_JET v003 | Choluteca | 34 | 1.09 GB | 2025-12-21 a 2026-10-21 | 16PDV |
  | HLSL30 v2.0 | Comayagua | 86 | 15.58 GB | 2025-11-21 a 2026-10-31 | T16PDA (43), T16PDB (43) |
  | HLSL30 v2.0 | Choluteca | 86 | 9.02 GB | 2025-11-14 a 2026-11-01 | T16PDV |

  Cada gránulo trae 14 archivos (ECOSTRESS) o 15 (HLS, una banda por archivo). Nubosidad HLS: mediana 54% en Comayagua (17 gránulos con menos de 30%) y 17% en Choluteca (57 con menos de 30%). Comayagua cae en el traslape de dos teselas, por eso sus gránulos vienen en pares de la misma fecha.
- Ya bajados (2026-11-14): SRTM, MODIS/VIIRS NDVI, GLDAS, FAO GAEZ, ERA5 (vía Open-Meteo) y Sentinel-2/Landsat como series HLS por punto. Siguen faltando:
  - **ERA5 oficial del CDS** y **Sentinel-2 L2A de 10 m** de Copernicus: necesitan cuenta (CDS y Copernicus Data Space). Mientras tanto se usan ERA5 vía Open-Meteo y HLS S30 (30 m).
  - **Landsat antes de 2013**: HLS empieza en 2013. Para 2006-2012 se usa MOD13Q1; Landsat 5/7 requiere cuenta USGS.
  - **Mosaicos HLS y Sentinel-2 por parcela**: no caben en disco (quedan unos 14 GB). Hoy solo hay series en los 11 puntos.

## Clasificación (últimos 20 y 10 años)

`scripts/19_clasificar.py` toma las tablas de `processed/` y `salida/`, las ordena según la lista de variables del equipo y las deja en `clasificado/`. No calcula indicadores; solo filtra y etiqueta.

```
.venv/bin/python -I scripts/19_clasificar.py
```

- **Categorías:** `clasificado/clima/`, `suelo_agua/`, `vegetacion/` y `contexto/` (fuentes útiles que no están en la lista: ONI, IBTrACS, GRACE).
- **Ventanas:** se descarta todo lo anterior a 2006. La columna `ventana` vale `2006-2015`, `2016-2025` o `2026`. La línea base de 20 años es `2006-2015` más `2016-2025`. La de 10 años es solo `2016-2025`. `2026` es el año que se compara contra ellas.
- **Tablas sin fecha** (GAEZ, SRTM, SoilGrids): se copian enteras. GAEZ se parte en `suelo_agua/gaez_suelo.csv` (limitaciones del suelo, LGP, AEZ) y `vegetacion/gaez_cultivos.csv` (aptitud y rendimiento por cultivo).
- **`clasificado/CATALOGO.csv`:** una fila por fuente con categoría, estado, variables, indicadores que alimenta (1 a 9), resolución, frecuencia, rango de fechas y filas por ventana. También lista lo que falta.
- Términos de uso de Meteomatics sin revisar.
- Puntos alternos de SoilGrids sin verificar como agrícolas.
- PDF locales por guardar a mano.

## Archivos locales que se guardan a mano

`raw/pdf_locales/`: boletines de CENAOS/COPECO, reportes semanales de la SAG, boletín de El Niño de la UNAH, tablas de INE o INA.
