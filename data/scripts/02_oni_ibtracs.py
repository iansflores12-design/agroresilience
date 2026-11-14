"""NOAA ONI y NOAA IBTrACS v04r01 (cuenca NA). Ninguno es de la NASA."""
from comun import RAW, bajar, logger, resumen

ONI = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
IBTRACS = ("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/"
           "v04r01/access/csv/ibtracs.NA.list.v04r01.csv")


def main():
    r = [bajar("noaa_oni", ONI, RAW / "noaa_oni" / "oni.ascii.txt", logger("noaa_oni"), nota="NOAA CPC, no NASA")]
    resumen("noaa_oni", r, RAW / "noaa_oni")
    r = [bajar("ibtracs", IBTRACS, RAW / "ibtracs" / "ibtracs.NA.list.v04r01.csv", logger("ibtracs"),
               nota="NOAA NCEI, no NASA", timeout=600)]
    resumen("ibtracs", r, RAW / "ibtracs")


if __name__ == "__main__":
    main()
