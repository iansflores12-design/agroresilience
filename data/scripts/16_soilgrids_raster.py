"""SoilGrids v2.0 (ISRIC, no NASA): raster de TODA la caja de Honduras por WCS, valor 'mean',
GeoTIFF en EPSG:4326 (reproyectado por el servicio desde Goode Homolosine). 250 m nominal.
10 propiedades x 6 profundidades + ocs (solo 0-30cm). Cada archivo ~3 MB.
Correr: python3 16_soilgrids_raster.py
"""
import urllib.parse

from comun import RAW, bajar, logger, resumen, zonas

PROPS = ["bdod", "cec", "cfvo", "clay", "nitrogen", "ocd", "phh2o", "sand", "silt", "soc"]
PROFS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]
BASE = "https://maps.isric.org/mapserv"


def url(prop, cov, c):
    q = [("map", f"/map/{prop}.map"), ("SERVICE", "WCS"), ("VERSION", "2.0.1"), ("REQUEST", "GetCoverage"),
         ("COVERAGEID", cov), ("FORMAT", "image/tiff"),
         ("SUBSET", f"long({c['lon_min']},{c['lon_max']})"), ("SUBSET", f"lat({c['lat_min']},{c['lat_max']})"),
         ("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
         ("OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326")]
    return BASE + "?" + urllib.parse.urlencode(q)


def main():
    log = logger("soilgrids_raster")
    c = zonas()["caja_honduras"]
    cov = [(p, f"{p}_{d}_mean") for p in PROPS for d in PROFS] + [("ocs", "ocs_0-30cm_mean")]
    res = []
    for prop, id_ in cov:
        res.append(bajar("soilgrids_raster", url(prop, id_, c), RAW / "soilgrids_raster" / f"{id_}.tif", log,
                         nota="raster caja Honduras, WCS ISRIC, EPSG:4326", timeout=280))
    resumen("soilgrids_raster", res, RAW / "soilgrids_raster")


if __name__ == "__main__":
    main()
