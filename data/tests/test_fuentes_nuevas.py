"""Pruebas de los lectores agregados el 2026-11-14 a scripts/procesar_nuevo.py
(IMERG Late, GLDAS, ERA5, GAEZ, SRTM, AppEEARS por punto).

Correr desde data/:  .venv/bin/python -I -m unittest discover -s tests -v
Todo se escribe en directorios temporales; nunca en raw/ ni en processed/.
"""
import importlib.util
import json
import math
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
RAW = RAIZ / "raw"
_spec = importlib.util.spec_from_file_location("procesar_nuevo", RAIZ / "scripts" / "procesar_nuevo.py")
pn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pn)


def lzw_codificar(datos):
    """Codificador LZW de TIFF minimo, solo para probar el decodificador."""
    tabla = {bytes([i]): i for i in range(256)}
    sig, nbits, bits, nb = 258, 9, 0, 0
    out = bytearray()

    def emitir(c):
        nonlocal bits, nb
        bits = (bits << nbits) | c
        nb += nbits
        while nb >= 8:
            out.append((bits >> (nb - 8)) & 0xFF)
            nb -= 8

    emitir(256)
    w = b""
    for b in datos:
        wc = w + bytes([b])
        if wc in tabla:
            w = wc
            continue
        emitir(tabla[w])
        tabla[wc] = sig
        sig += 1
        if sig >= (1 << nbits) and nbits < 12:  # libtiff: el decodificador va un codigo atras
            nbits += 1
        if sig >= 4094:
            emitir(256)
            tabla = {bytes([i]): i for i in range(256)}
            sig, nbits = 258, 9
        w = bytes([b])
    if w:
        emitir(tabla[w])
    emitir(257)
    if nb:
        out.append((bits << (8 - nb)) & 0xFF)
    return bytes(out)


class Lzw(unittest.TestCase):
    def test_ida_y_vuelta(self):
        rng = np.random.default_rng(1)
        for datos in (b"", b"TOBEORNOTTOBEORTOBEORNOT" * 50, bytes(rng.integers(0, 4, 20000, dtype=np.uint8)),
                      bytes(rng.integers(0, 256, 9000, dtype=np.uint8))):
            self.assertEqual(pn.lzw_tiff(lzw_codificar(datos)), datos)


class Gaez(unittest.TestCase):
    def test_lzw_igual_a_recorte_sin_compresion(self):
        """El valor leido del GeoTIFF global (LZW) coincide con el recorte sin compresion de la misma capa."""
        glob_, rec = RAW / "gaez" / "sxHr_mze.tif", RAW / "gaez_recorte" / "SQ0_idx_v9aH.tif"
        if not glob_.exists() or not rec.exists():
            self.skipTest("faltan archivos GAEZ en raw/")
        df, errs = pn.leer_gaez(glob_)
        self.assertEqual(errs, [])
        self.assertEqual(len(df), len(pn.PUNTOS))
        self.assertTrue(df["valor"].between(0, 10000).all())
        df2, errs2 = pn.leer_gaez(rec)
        self.assertEqual(errs2, [])
        # misma celda de 5 arcmin en el global y en el recorte
        self.assertTrue(np.allclose(df["celda_lat"], df2["celda_lat"]) and np.allclose(df["celda_lon"], df2["celda_lon"]))

    def test_tipo(self):
        self.assertEqual(pn.detectar_tipo(Path("x/gaez/sxHr_mze.tif")), "gaez")
        self.assertEqual(pn.detectar_tipo(Path("x/gaez_recorte/SQ1_mze_v9aL.tif")), "gaez")
        self.assertIsNone(pn.detectar_tipo(Path("x/otra/sxHr_mze.tif")))


class Srtm(unittest.TestCase):
    def hoja(self, d, z):
        ruta = Path(d) / "N13W088.SRTMGL1.hgt.zip"
        with zipfile.ZipFile(ruta, "w") as zf:
            zf.writestr("N13W088.hgt", z.astype(">i2").tobytes())
        return ruta

    def test_rampa_este(self):
        """Terreno que sube 1 m por pixel hacia el este: pendiente conocida, baja hacia el oeste (270)."""
        lado = 3601
        z = np.tile(np.arange(lado, dtype="f8"), (lado, 1)) % 30000
        with tempfile.TemporaryDirectory() as d:
            df, errs = pn.leer_srtm(self.hoja(d, z))
        self.assertEqual(errs, [])
        fila = df[df["punto"] == "choluteca"].iloc[0]
        dx = (1 / 3600) * 111320.0 * math.cos(math.radians(13.3))
        self.assertAlmostEqual(fila["pendiente_grados"], round(math.degrees(math.atan(1 / dx)), 2), places=2)
        self.assertAlmostEqual(fila["orientacion_grados"], 270.0, places=1)

    def test_vacio_y_fuera(self):
        z = np.full((3601, 3601), -32768, dtype="f8")
        with tempfile.TemporaryDirectory() as d:
            df, _ = pn.leer_srtm(self.hoja(d, z))
            self.assertTrue(df["elevacion_m"].isna().all())
            ruta = Path(d) / "N50W010.SRTMGL1.hgt.zip"
            with zipfile.ZipFile(ruta, "w") as zf:
                zf.writestr("N50W010.hgt", b"\0\0" * 4)
            df2, errs2 = pn.leer_srtm(ruta)
            self.assertEqual((len(df2), errs2), (0, []))  # ningun punto en esa hoja


class Era5(unittest.TestCase):
    def test_registros(self):
        with tempfile.TemporaryDirectory() as d:
            carpeta = Path(d) / "era5"
            carpeta.mkdir()
            ruta = carpeta / "choluteca.json"
            ruta.write_text(json.dumps({"latitude": 13.25, "longitude": -87.25, "daily": {
                "time": ["2026-01-01", "malo", "2026-01-03"], "precipitation_sum": [1.5, 2, "x"]}}))
            self.assertEqual(pn.detectar_tipo(ruta), "era5")
            df, errs = pn.leer_era5(ruta)
            self.assertEqual(list(df["fecha"]), ["2026-01-01", "2026-01-03"])
            self.assertTrue(pd.isna(df["precipitation_sum"].iloc[1]))
            self.assertEqual([n for n, _ in errs], [2, 3])
            otro = carpeta / "no_existe.json"
            otro.write_text("{}")
            self.assertEqual(len(pn.leer_era5(otro)[1]), 1)


class Appeears(unittest.TestCase):
    def test_mod13q1(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "honduras-puntos-MOD13Q1-061-results.csv"
            ruta.write_text(
                "ID,Category,Latitude,Longitude,Date,MODIS_Tile,MOD13Q1_061__250m_16_days_NDVI,"
                "MOD13Q1_061__250m_16_days_EVI,MOD13Q1_061__250m_16_days_pixel_reliability,"
                "MOD13Q1_061__250m_16_days_pixel_reliability_MODLAND_Description\n"
                "choluteca,choluteca,13.3,-87.19,2016-01-01,h10v07,0.6123,0.3,0,Good data\n"
                "choluteca,choluteca,13.3,-87.19,2016-01-17,h10v07,-0.3,-0.3,-1,Fill\n"
                "marte,marte,0,0,2016-01-17,h10v07,0.5,0.4,0,Good data\n"
                "choluteca,choluteca,13.3,-87.19,2016-13-99x,h10v07,0.5,0.4,0,Good data\n")
            self.assertEqual(pn.detectar_tipo(ruta), "mod13q1_pt")
            df, errs = pn.leer_appeears(ruta, "mod13q1_pt")
        self.assertEqual(list(df.columns), ["punto", "fecha", "NDVI", "EVI", "pixel_reliability"])
        self.assertEqual(len(df), 2)
        self.assertAlmostEqual(df["NDVI"].iloc[0], 0.6123)
        self.assertTrue(df.iloc[1][["NDVI", "EVI", "pixel_reliability"]].isna().all())
        self.assertEqual([n for n, _ in errs], [3, 4])


class Netcdf(unittest.TestCase):
    def test_gldas_y_late(self):
        g = sorted((RAW / "gldas").glob("*.nc4"))
        late = sorted((RAW / "imerg_late").glob("*.nc4"))
        if not g or not late:
            self.skipTest("faltan GLDAS o IMERG Late en raw/")
        self.assertEqual(pn.detectar_tipo(g[0]), "gldas")
        self.assertEqual(pn.detectar_tipo(late[0]), "imerg_late")
        self.assertEqual(pn.detectar_tipo(sorted((RAW / "imerg").glob("*.nc4"))[0]), "imerg")
        df, errs = pn.leer_gldas(g[0])
        self.assertEqual((len(df), errs), (len(pn.PUNTOS), []))
        self.assertEqual(df["fecha"].iloc[0][-3:], "-01")
        self.assertFalse((df.select_dtypes("number") < -9000).any().any())
        df2, errs2 = pn.leer_imerg(late[0], pn.IMERG_LATE_VARS)
        self.assertEqual((len(df2), errs2), (len(pn.PUNTOS), []))
        self.assertNotIn("precipitation_cnt_cond", df2.columns)


if __name__ == "__main__":
    unittest.main()
