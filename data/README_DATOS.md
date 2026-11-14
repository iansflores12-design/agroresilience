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

## Pendientes

- HLS: **solo consultado, no bajado**. ECOSTRESS se bajó después con `scripts/12_ecostress.py` (ver tabla de estado); no tiene versión procesada. Consulta original de ambos (`scripts/11_consulta_ecostress_hls.py`, 2025-11-14 a 2026-11-14). En espera de decisión.

  | Producto | Punto | Gránulos | Tamaño | Fechas | Teselas |
  | --- | --- | --- | --- | --- | --- |
  | ECO_L3T_JET v003 | Comayagua | 41 | 1.59 GB | 2026-01-10 a 2026-10-06 | 16PDA (20), 16PDB (21) |
  | ECO_L3T_JET v003 | Choluteca | 34 | 1.09 GB | 2025-12-21 a 2026-10-21 | 16PDV |
  | HLSL30 v2.0 | Comayagua | 86 | 15.58 GB | 2025-11-21 a 2026-10-31 | T16PDA (43), T16PDB (43) |
  | HLSL30 v2.0 | Choluteca | 86 | 9.02 GB | 2025-11-14 a 2026-11-01 | T16PDV |

  Cada gránulo trae 14 archivos (ECOSTRESS) o 15 (HLS, una banda por archivo). Nubosidad HLS: mediana 54% en Comayagua (17 gránulos con menos de 30%) y 17% en Choluteca (57 con menos de 30%). Comayagua cae en el traslape de dos teselas, por eso sus gránulos vienen en pares de la misma fecha.
- Recursos oficiales no bajados, a decidir: SRTM, MODIS/VIIRS NDVI, GLDAS, FAO GAEZ, ERA5, Sentinel-2.
- Términos de uso de Meteomatics sin revisar.
- Puntos alternos de SoilGrids sin verificar como agrícolas.
- PDF locales por guardar a mano.

## Archivos locales que se guardan a mano

`raw/pdf_locales/`: boletines de CENAOS/COPECO, reportes semanales de la SAG, boletín de El Niño de la UNAH, tablas de INE o INA.
