# AgroResilience

Crop rotation decisions from NASA climate data, for small farmers in Honduras.

- Live app: https://agroresilience-nine.vercel.app
- Android app: native build with Capacitor (download from the latest GitHub Release)
- Team: Honduras Terra Lab, NASA Space Apps Challenge 2026

A farmer picks a place, terrain type, current crop, season and goals. The app compares crop rotations, scores each from 0 to 100 and explains why in plain language (Spanish, English, Portuguese).

## How it works

Two engines run in a chain. A language model only explains the result; it never changes the scores.

| Piece | What it does | Where |
| --- | --- | --- |
| Kharis | Lightweight neural network (residual TCN in PyTorch). Forecasts 365 days of daily weather for 30 points with uncertainty bands (mean, p10, p90) and turns it into ten agronomic risk signals (P1 to P10), such as mid-summer drought and heat at flowering | `kharis_engine/` |
| Gemini Decision | Deterministic scoring engine. Same data, same scores | `frontend/src/lib/decision/motor.ts` |
| Historical module | Simulates every crop by department from 1981 to 2026 (WRSI and FAO-33 yield response), grouped by El Niño phase | `scripts/historico_cultivos.py` |
| Gemini (language model) | Explains the numbers and looks up regional market prices | `frontend/api/` |

### Scoring

For each crop in each rotation, the engine computes:

1. Crop water demand: ETc = ET0 x Kc, with FAO-56 stages (20, 30, 30 and 20 % of the cycle).
2. Heat at flowering: days above the crop's limit between 40 and 65 % of the cycle. Heat = 100 - 4 x days.
3. Water: effective rain (rain x terrain retention) against ETc and the crop's need, minus waterlogging, mid-summer drought (P2) and dry spells (P4).
4. Eight factors, each 0 to 100, with these base weights:

| Factor | Base weight |
| --- | --- |
| Rain water | 0.25 |
| Heat | 0.15 |
| Sale (market index, adjusted by regional price and water) | 0.15 |
| Soil health | 0.12 |
| Erosion control | 0.10 |
| Pest break | 0.08 |
| Natural nitrogen (legumes) | 0.08 |
| Forage | 0.07 |

Each goal the farmer picks triples the weight of its factor, then weights are normalized to sum 1. If a harvest's water score falls below 30, the total is capped at 58. Ratings: 80+ high, 65-79 good, 50-64 intermediate, below 50 low.

With GPS, the forecast for the nearest point is adjusted to the plot's real altitude (`frontend/public/kharis/escala_fina.json`).

The output is a `gemini-decision.v1` object: rotations ranked best to worst, each with score, difference against the current plan, confidence, factors, reasons, risks, what is still unknown and the evidence with its source.

## Repository layout

Folder and file names are in Spanish; this table maps them.

| Path | Contents |
| --- | --- |
| `frontend/` | Web app (React, TypeScript, Vite, Leaflet) and Android app (Capacitor, `frontend/android/`) |
| `frontend/api/` | Serverless functions on Vercel (Gemini explanations and prices) |
| `frontend/public/kharis/` | Forecast per point, contract `kharis.web.v1` |
| `frontend/public/historico/` | Historical results per department |
| `kharis_engine/` | Kharis forecasting model and tests |
| `kharis_documentacion/` | Kharis documentation and network viewer |
| `scripts/` | Data pipeline: download, process, build dataset, upload |
| `config/zonas.json` | Country bounding box and the 30 points (zones) |
| `processed/` | Clean daily series per point, long format |
| `data/` | Classified data (climate, soil and water, vegetation, context) and historical ERA5 and POWER series |
| `supabase/` | Supabase database setup |
| `brag-output/` | Demo video |

## Data pipeline

One resumable command downloads and processes only what is new:

```bash
python scripts/pipeline.py            # download, process, build dataset, upload to Supabase
python scripts/pipeline.py --kharis   # also retrain Kharis and regenerate the forecast
```

Options: `--sin-supabase` (skip upload), `--conservar-crudos` (keep raw files).

Steps: download to `raw/`, `procesar_nuevo.py` (process new files), `construir_dataset.py` (build dataset), `cargar_supabase.py` (upload to Supabase), `run_kharis.py --actualizar` (update the model; keeps the previous version if the new one is worse), `limpiar_crudos.py` (clean raw files).

Data format: daily series per point in long format (one row per point and date), dates as `YYYY-MM-DD`, rain in mm/day, temperature in °C, NASA POWER variable names (`PRECTOTCORR`, `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, ...). `-999` means missing.

Credentials are never committed: Earthdata token in `config/earthdata_token.txt`, Copernicus key in `config/cds_token.txt`.

## Running locally

```bash
cd frontend
npm install
npm run dev        # web app
npm test           # tests
npm run apk        # Android debug build
```

The Gemini functions need `GEMINI_API_KEY` in the environment.

Kharis:

```bash
cd kharis_engine
pip install -r requirements.txt
python run_kharis.py --export-onnx    # train and write web outputs to salidas/web/
python -m pytest tests
```

## Using it in another country

Almost all sources are global, so the scripts fetch the same data at other coordinates.

1. Put the country's bounding box and one point per farming zone in `config/zonas.json`.
2. Run `scripts/pipeline.py`. POWER, IMERG, SMAP, GLDAS, GRACE, ERA5, MODIS, SoilGrids, GAEZ and ONI need no code changes.
3. Add national data (stations, prices) in the same long format, or pass it to Kharis with `--data-1996-2020` and `--data-2020-2026`.
4. Train Kharis and copy `salidas/web/` to `frontend/public/kharis/`.
5. Adjust regions and calendar in `historico_cultivos.py` and run it.
6. Adjust crops, seasons and market in `frontend/src/lib/decision/parametros.ts`.

Places still tied to Honduras: `config/zonas.json`, `scripts/historico_cultivos.py`, `parametros.ts`, `historico.ts`, `escala.ts` (`dentroDeHonduras`), `frontend/api/_precios.ts` and `precios.ts` (SIMPAH prices in lempiras), and `frontend/src/datos/departamentos.geo.json`.

## Limits

- Not yet tested with another country's data.
- Historical validation matches reported loss years in the Dry Corridor, but correlation with FAOSTAT yields is low (r = 0.19 maize, 0.02 beans, 1981-2013).
- Some heat thresholds and Kc values are approximate (velvet bean, tobacco, oil palm); forage value and drought tolerance are pending validation.
- The market index uses Honduran 2026 references.

## Data sources

NASA: [POWER](https://power.larc.nasa.gov/), [GPM IMERG](https://gpm.nasa.gov/data/imerg), [SMAP](https://smap.jpl.nasa.gov/), [GLDAS](https://ldas.gsfc.nasa.gov/gldas), [GRACE and GRACE-FO](https://grace.jpl.nasa.gov/), [ECOSTRESS](https://ecostress.jpl.nasa.gov/), [GEDI](https://gedi.umd.edu/), [MODIS](https://www.earthdata.nasa.gov/data/instruments/modis), [Landsat](https://landsat.gsfc.nasa.gov/), [SRTM](https://www.earthdata.nasa.gov/data/instruments/srtm), [Earthdata](https://www.earthdata.nasa.gov/).

Other: [Copernicus ERA5](https://cds.climate.copernicus.eu/), [Copernicus Sentinel-2](https://dataspace.copernicus.eu/), [NOAA ONI](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php), [NOAA IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive), CHIRPS, [ISRIC SoilGrids](https://soilgrids.org/), [FAO GAEZ](https://gaez.fao.org/), [FAOSTAT](https://www.fao.org/faostat/), [Atlas of Economic Complexity](https://atlas.hks.harvard.edu/), [Open-Meteo](https://open-meteo.com/), [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/), [Meteomatics](https://www.meteomatics.com/).

Method: [FAO-56 Crop Evapotranspiration](https://www.fao.org/4/x0490e/x0490e00.htm); FAO-33 Yield Response to Water (Doorenbos and Kassam, 1979).

Demo music: "Lucky Acoustic" by Jesse Keller, CC BY 3.0, via Openverse.

## Use of AI

Google Gemini runs inside the app to explain decisions and look up market prices. AI coding assistants were used during development.
