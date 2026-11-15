# Scripts de datos de AgroResilience

Todos se corren desde la raíz del proyecto con `.venv/Scripts/python -I scripts/<script>`. Todos son reanudables: si se repiten, bajan o procesan solo lo nuevo.

## Carpetas

```
raw/          crudos tal como llegan de cada fuente (se pueden borrar una vez procesados: limpiar_crudos.py)
processed/    series limpias en formato largo (punto, fecha, ...)
  modelo/     dataset para entrenar (construir_dataset.py)
config/       zonas.json (30 puntos), smap_malla.json, tokens (fuera de git)
```

## Un comando para todo

| Para qué | Comando |
|---|---|
| Actualizar todo (bajar lo nuevo, procesar y armar el dataset) | `scripts/pipeline.py` |
| Lo mismo y además borrar los crudos ya procesados | `scripts/pipeline.py --limpiar` |
| Solo reprocesar, sin descargar | `scripts/pipeline.py --sin-descargas` |
| Revisar qué falta o está atrasado | `scripts/auditar.py` |

## Script por fuente

| Fuente | Descarga (raw/) | Procesa (processed/) | Archivo final | Credencial |
|---|---|---|---|---|
| NASA POWER | `descargar.py` (histórico), `actualizar_reciente.py` (últimos 90 días) | `procesar_nuevo.py` | `power_diario_largo.csv`, `power/<punto>.csv` | — |
| GPM IMERG | `descargar_earthdata.py imerg` (Final, hasta 2025-09) y `imerg_late` (reciente) | `procesar_nuevo.py` | `imerg_series.csv` | Token Earthdata |
| SMAP | `descargar_earthdata.py smap` | `generar_malla_smap.py` + `procesar_nuevo.py` | `smap_series.csv` | Token Earthdata |
| GLDAS | `descargar_earthdata.py gldas` | `adaptar_gldas.py` | `gldas_diario.csv` | Token Earthdata |
| GRACE | `descargar_earthdata.py grace` | `procesar_nuevo.py` | `grace_series.csv` | Token Earthdata |
| ECOSTRESS LST | `ecostress_directo.py` (descarga y procesa) | — | `ecostress_lst.csv` | Token Earthdata |
| GEDI biomasa | `gedi.py` (descarga y procesa) | — | `gedi_biomasa_por_punto.csv` | Token Earthdata |
| ERA5 | `fuentes_extra.py era5` (Open-Meteo), `era5_cds.py` (Copernicus, respaldo) | ellos mismos | `era5_diario.csv` | Clave Copernicus (solo `era5_cds.py`) |
| MODIS NDVI/EVI | `fuentes_extra.py modis` | él mismo | `modis_ndvi.csv` | — |
| Sentinel-2 | `fuentes_extra.py sentinel2` | él mismo | `sentinel2_indices.csv` | — |
| Landsat | `fuentes_extra.py landsat` | él mismo | `landsat_ndvi.csv` | — |
| SRTM (topografía) | `fuentes_extra.py dem` | él mismo | `topografia_por_punto.csv` | — |
| Meteomatics | `meteomatics.py` (puntos originales) y `meteomatics.py --nuevos` | `procesar_nuevo.py` (lo llama solo) | `meteomatics_diario_largo.csv`, `_pronostico.csv`, `_estaticos.csv` | Usuario y contraseña (por teclado o variables de entorno) |
| SoilGrids | `descargar.py` + `suelo_alterno.py` (puntos urbanos) | `procesar_nuevo.py` | `suelo_por_punto.csv` | — |
| FAO GAEZ | `gaez.py` (descarga y procesa) | — | `gaez_aptitud_por_punto.csv`, `gaez_recursos_por_punto.csv` | — |
| ONI (NOAA) | `descargar.py`, `actualizar_reciente.py` | `procesar_nuevo.py` | `oni.csv` | — |
| IBTrACS | `descargar.py` | `procesar_nuevo.py` | `huracanes_caribe_honduras.csv` | — |

Tras procesar: `construir_dataset.py` arma `processed/modelo/` (`diario.csv.gz`, `mensual.csv`, `climatologia.csv`, `estatico.csv` y `diccionario.md`). `limpiar_crudos.py` borra de `raw/` lo ya procesado, pero solo si se pide (`--limpiar`). Por defecto los crudos se conservan.

## Credenciales (nunca en git)

| Archivo o variable | Para | Cómo se obtiene |
|---|---|---|
| `config/earthdata_token.txt` | IMERG, SMAP, GLDAS, GRACE, ECOSTRESS, GEDI | urs.earthdata.nasa.gov, en Generate Token. Dura 60 días |
| `config/cds_token.txt` | `era5_cds.py` | cds.climate.copernicus.eu/profile, en API key. Aceptar antes la licencia del dataset |
| `METEOMATICS_USER`, `METEOMATICS_PASSWORD` | `meteomatics.py` automático | Cuenta de Meteomatics. Sin ellas, el script las pide por teclado |

## Utilidades

| Script | Para qué |
|---|---|
| `unir_sufijos.py` | Une los CSV parciales `_n1`, `_n2`, ... cuando una fuente se bajó en varios procesos a la vez (`--sufijo`) |
| `monitor.py` | Avance en vivo en la terminal |
| `panel_web.py` | Avance en el navegador, en http://localhost:8765, con botón Refrescar |
| `ecostress.py` | ECOSTRESS por AppEEARS (ET y ESI). Lento por la cola de la NASA, reemplazado por `ecostress_directo.py` |
