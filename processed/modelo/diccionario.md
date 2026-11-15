# Diccionario del dataset (modelo/)

Generado por scripts/construir_dataset.py. Ver el encabezado del script para las reglas de fusion.

## estatico.csv

30 filas, 29 columnas.

| columna | no vacios | ejemplo |
|---|---|---|
| punto | 100% | comayagua |
| nombre | 100% | Valle de Comayagua |
| departamento | 100% | Comayagua |
| tipo | 100% | departamento |
| cultivos_zona | 67% | cafe,hortalizas,maiz |
| latitud | 100% | 14.45 |
| longitud | 100% | -87.64 |
| elevacion_m | 100% | 581.0 |
| pendiente_pct | 100% | 5.73 |
| orientacion_grados | 100% | 257.4 |
| suelo_clay_0_30 | 100% | 31.817 |
| suelo_sand_0_30 | 100% | 32.783 |
| suelo_silt_0_30 | 100% | 35.35 |
| suelo_soc_0_30 | 67% | 23.617 |
| suelo_phh2o_0_30 | 100% | 6.8 |
| suelo_nitrogen_0_30 | 100% | 1.967 |
| suelo_cec_0_30 | 100% | 23.533 |
| gaez_aptitud_cassava | 100% | 4470.0 |
| gaez_aptitud_coffee | 100% | 4099.0 |
| gaez_aptitud_maize | 100% | 4425.0 |
| gaez_aptitud_phaseolus_bean | 100% | 4026.0 |
| gaez_aptitud_sorghum | 100% | 3806.0 |
| gaez_rend_kg_ha_cassava | 100% | 3125.0 |
| gaez_rend_kg_ha_coffee | 100% | 435.0 |
| gaez_rend_kg_ha_maize | 100% | 1941.0 |
| gaez_rend_kg_ha_phaseolus_bean | 100% | 668.0 |
| gaez_rend_kg_ha_sorghum | 100% | 1246.0 |
| gedi_biomasa_mg_ha | 87% | 2.63 |
| meteomatics_tipo_suelo | 100% | 2 |

## diario.csv.gz

338,160 filas, 33 columnas.

| columna | no vacios | ejemplo |
|---|---|---|
| punto | 100% | brus_laguna |
| fecha | 100% | 1996-01-01 |
| tmed_c | 100% | 26.97 |
| tmax_c | 100% | 28.56 |
| tmin_c | 100% | 25.54 |
| lluvia_power_mm | 100% | 0.76 |
| humedad_rel_pct | 100% | 78.44 |
| viento_2m_ms | 100% | 5.49 |
| radiacion_mj_m2 | 100% | 17.98 |
| lluvia_imerg_mm | 86% | 22.279999 |
| lluvia_mm | 100% | 0.76 |
| fuente_lluvia | 100% | power |
| et0_mm | 100% | 4.36 |
| balance_mm | 100% | -3.6 |
| gldas_suelo_0_10_kgm2 | 86% | 30.166 |
| gldas_suelo_10_40_kgm2 | 86% | 91.4615 |
| gldas_suelo_40_100_kgm2 | 86% | 186.5624 |
| gldas_evap_real_mm | 86% | 2.1743 |
| gldas_escorrentia_mm | 86% | 0.002 |
| smap_humedad_m3m3 | 27% | 0.29922175 |
| mm_humedad_idx_5cm | 100% | -666.0 |
| mm_humedad_idx_50cm | 100% | -666.0 |
| s2_ndmi | 3% | 0.0432 |
| ndvi_obs | 15% | 0.4411 |
| fuente_ndvi | 15% | landsat |
| ndvi | 95% | 0.4411 |
| ecostress_lst_c | 1% | 30.27 |
| gdd_maiz | 100% | 17.05 |
| gdd_frijol | 100% | 17.05 |
| gdd_sorgo | 100% | 17.05 |
| gdd_cafe | 100% | 17.05 |
| gdd_yuca | 100% | 15.05 |
| racha_seca_dias | 100% | 1 |

## mensual.csv

11,130 filas, 38 columnas.

| columna | no vacios | ejemplo |
|---|---|---|
| punto | 100% | brus_laguna |
| anio | 100% | 1996 |
| mes | 100% | 1 |
| lluvia_mm | 100% | 47.73 |
| et0_mm | 100% | 124.37 |
| balance_mm | 100% | -76.64 |
| max_dias_secos_consec | 100% | 7 |
| tmax_c | 100% | 26.595 |
| tmin_c | 100% | 24.997 |
| gdd_maiz | 100% | 489.68 |
| gdd_frijol | 100% | 489.68 |
| gdd_sorgo | 100% | 489.68 |
| gdd_cafe | 100% | 489.68 |
| gdd_yuca | 100% | 427.68 |
| gldas_suelo_0_10_kgm2 | 86% | 27.653 |
| gldas_suelo_10_40_kgm2 | 86% | 84.179 |
| gldas_suelo_40_100_kgm2 | 86% | 173.039 |
| smap_humedad_m3m3 | 36% | 0.302 |
| mm_humedad_idx_50cm | 100% | -666.0 |
| ndvi | 98% | 0.418 |
| s2_ndmi | 32% | 0.043 |
| ecostress_lst_c | 17% | 30.27 |
| gldas_escorrentia_mm | 100% | 0.0 |
| dias_lluvia_intensa | 100% | 0 |
| dias_estres_termico | 100% | 0 |
| dias_suelo_descubierto | 100% | 0 |
| dias | 100% | 31 |
| anom_lluvia_mm | 100% | -0.853 |
| anom_balance_mm | 100% | -0.948 |
| anom_tmax_c | 100% | 0.194 |
| anom_gldas_suelo_10_40_kgm2 | 86% | -0.494 |
| anom_smap_humedad_m3m3 | 36% | 0.669 |
| anom_ndvi | 98% | -2.238 |
| riesgo_erosion | 100% | 0.0 |
| oni | 99% | -0.88 |
| tormentas_300km | 100% | 0 |
| viento_max_kt | 7% | 55.0 |
| grace_agua_cm | 70% | -18.894 |

## climatologia.csv

360 filas, 14 columnas.

| columna | no vacios | ejemplo |
|---|---|---|
| punto | 100% | brus_laguna |
| mes | 100% | 1 |
| lluvia_mm_mean | 100% | 106.373 |
| lluvia_mm_std | 100% | 68.725 |
| balance_mm_mean | 100% | -8.21 |
| balance_mm_std | 100% | 72.183 |
| tmax_c_mean | 100% | 26.5 |
| tmax_c_std | 100% | 0.491 |
| gldas_suelo_10_40_kgm2_mean | 100% | 85.876 |
| gldas_suelo_10_40_kgm2_std | 100% | 3.434 |
| smap_humedad_m3m3_mean | 97% | 0.408 |
| smap_humedad_m3m3_std | 97% | 0.031 |
| ndvi_mean | 100% | 0.601 |
| ndvi_std | 100% | 0.065 |
