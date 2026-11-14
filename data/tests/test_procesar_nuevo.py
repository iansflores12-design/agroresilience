"""Pruebas de scripts/procesar_nuevo.py.

Correr desde data/:  .venv/bin/python -I -m unittest discover -s tests -v
(a) procesa los raw originales y compara con processed/ (IMERG y SMAP con una muestra fija);
(b) registros nuevos sinteticos: formato, -999, errores.csv, y deteccion de nuevos por sha256.
Todo se escribe en directorios temporales; nunca en raw/ ni en processed/.
"""
import contextlib
import csv
import hashlib
import importlib.util
import io
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

import pandas as pd
from pandas.testing import assert_frame_equal

RAIZ = Path(__file__).resolve().parent.parent
RAW, PRO = RAIZ / "raw", RAIZ / "processed"
_spec = importlib.util.spec_from_file_location("procesar_nuevo", RAIZ / "scripts" / "procesar_nuevo.py")
pn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pn)


def silencio(*a, **k):
    pass


def csv_(ruta):
    return pd.read_csv(ruta)


def igual(test, esperado, obtenido, nombre=""):
    try:
        assert_frame_equal(esperado.reset_index(drop=True), obtenido.reset_index(drop=True),
                           check_dtype=False, rtol=1e-6, atol=1e-9)
    except AssertionError as e:
        test.fail(f"{nombre}: {e}")


def muestra_imerg():
    todos = sorted((RAW / "imerg").glob("*_HND.nc4"))
    paso = (len(todos) - 1) / 29
    return [todos[round(i * paso)] for i in range(30)]


def muestra_smap():
    todos = sorted((RAW / "smap").glob("*_HND.nc4"))
    por_dia = {}
    for f in todos:
        por_dia.setdefault(re.search(r"_E_(\d{8})_", f.name).group(1), []).append(f)
    dup = [v for v in por_dia.values() if len(v) > 1]
    elegidos = list(dup[0])  # una fecha duplicada: debe ganar el ultimo en orden alfabetico
    resto = [f for f in todos if f not in elegidos]
    paso = (len(resto) - 1) / 27
    elegidos += [resto[round(i * paso)] for i in range(28)]
    return elegidos


def fechas_de(archivos, patron):
    return {pd.Timestamp(re.search(patron, f.name).group(1)).strftime("%Y-%m-%d") for f in archivos}


class OriginalesTest(unittest.TestCase):
    """(a) Los raw originales deben reproducir processed/."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        cls.imerg, cls.smap = muestra_imerg(), muestra_smap()
        archivos = (sorted((RAW / "power").glob("*.json")) + [RAW / "noaa_oni" / "oni.ascii.txt"]
                    + sorted((RAW / "ibtracs").glob("*.csv")) + sorted((RAW / "soilgrids").glob("*.json"))
                    + sorted((RAW / "grace").glob("*.nc")) + sorted((RAW / "meteomatics").glob("*.json"))
                    + cls.imerg + cls.smap)
        cls.res = pn.ejecutar(archivos, cls.out, log=silencio)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def comparar(self, nombre, fechas=None):
        esperado = csv_(PRO / nombre)
        if fechas is not None:
            esperado = esperado[esperado["fecha"].isin(fechas)]
        igual(self, esperado, csv_(self.out / nombre), nombre)

    def test_sin_errores_en_originales(self):
        self.assertEqual(self.res["errores"], 0)
        self.assertEqual(self.res["desconocidos"], 0)
        self.assertFalse((self.out / "errores.csv").exists())

    def test_power_por_punto(self):
        for p in pn.PUNTOS:
            with self.subTest(punto=p["id"]):
                self.comparar(f"power/{p['id']}.csv")

    def test_power_largo(self):
        self.comparar("power_diario_largo.csv")

    def test_calidad_power(self):
        self.comparar("calidad_power.csv")

    def test_oni(self):
        self.comparar("oni.csv")

    def test_ibtracs(self):
        self.comparar("huracanes_caribe_honduras.csv")

    def test_suelo(self):
        self.comparar("suelo_por_punto.csv")

    def test_grace(self):
        self.comparar("grace_series.csv")

    def test_meteomatics(self):
        for n in ("meteomatics_diario_largo.csv", "meteomatics_pronostico.csv", "meteomatics_estaticos.csv"):
            with self.subTest(tabla=n):
                self.comparar(n)

    def test_imerg_muestra(self):
        fechas = fechas_de(self.imerg, r"3IMERG\.(\d{8})")
        self.assertEqual(len(fechas), 30)
        self.comparar("imerg_series.csv", fechas)

    def test_smap_muestra_con_fecha_duplicada(self):
        fechas = fechas_de(self.smap, r"_E_(\d{8})_")
        self.assertEqual(len(self.smap), 30)
        self.assertEqual(len(fechas), 29)  # una fecha tiene dos archivos
        self.comparar("smap_series.csv", fechas)

    def test_raw_y_processed_intactos(self):
        # la salida de la prueba no esta dentro de raw/ ni de processed/
        self.assertFalse(pn.es_subruta(self.out, RAW) or pn.es_subruta(self.out, PRO))


class SalidaProtegidaTest(unittest.TestCase):
    def test_rechaza_raw_y_processed_como_salida(self):
        for destino in (RAW, PRO, PRO / "power", RAW / "power"):
            with self.subTest(destino=str(destino)):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
                    pn.main(["--salida", str(destino), str(RAW / "noaa_oni" / "oni.ascii.txt")])
                self.assertEqual(cm.exception.code, 2)

    def test_ruta_inexistente_es_argumento_invalido(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            pn.main(["--salida", tempfile.gettempdir() + "/zz_no_se_usa", "/no/existe/archivo.json"])
        self.assertEqual(cm.exception.code, 2)


def leer_filas(ruta):
    with open(ruta, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sha(ruta):
    return hashlib.sha256(Path(ruta).read_bytes()).hexdigest()


class NuevosTest(unittest.TestCase):
    """(b) Archivos sinteticos nuevos, modo sin argumentos sobre una carpeta de entrada."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        base = Path(cls.tmp.name)
        cls.ent, cls.sal = base / "entrada", base / "salida"
        (cls.ent / "power").mkdir(parents=True)
        # POWER: yoro, noviembre 2026
        cab = json.loads((RAW / "power" / "yoro.json").read_text())["header"]
        power = {"type": "Feature", "header": cab, "properties": {"parameter": {
            "PRECTOTCORR": {"20261101": 1.5, "20261102": -999.0, "20261103": 2.0, "20261340": 1.0,
                            "20261105": 4.0, "20261106": 3.5},
            "T2M": {"20261101": 20.0, "20261102": 21.0, "20261103": 22.0, "20261340": 23.0,
                    "20261105": "abc", "20261106": 25.0}}}}
        (cls.ent / "power" / "yoro.json").write_text(json.dumps(power))
        # ONI: encabezado, una linea valida, una rota, otra valida
        (cls.ent / "oni.ascii.txt").write_text(
            " SEAS  YR   TOTAL   ANOM\n  NDJ 2026  25.50  -0.30\n  XYZ 2026  25.50\n  DJF 2027  25.00  -0.10\n")
        # IBTrACS: encabezado real + unidades reales; fila 2 con latitud invalida
        with open(next((RAW / "ibtracs").glob("*.csv")), newline="", encoding="utf-8") as f:
            lector = csv.reader(f)
            cab_i, unidades = next(lector), next(lector)

        def fila(sid, hora, lat, lon):
            r = [""] * len(cab_i)
            for k, v in {"SID": sid, "SEASON": "2026", "NAME": "PRUEBA", "ISO_TIME": hora, "NATURE": "TS",
                         "LAT": lat, "LON": lon, "WMO_WIND": "40", "DIST2LAND": "10", "LANDFALL": "10",
                         "USA_SSHS": "0"}.items():
                r[cab_i.index(k)] = v
            return r
        with open(cls.ent / "ibtracs_nuevo.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerows([cab_i, unidades, fila("2026300N15275", "2026-10-27 00:00:00", "15.0", "-85.0"),
                         fila("2026300N15275", "2026-10-27 03:00:00", "abc", "-85.2"),
                         fila("2026300N15275", "2026-10-27 06:00:00", "15.5", "-85.5")])
        cls.salida1 = io.StringIO()
        with contextlib.redirect_stdout(cls.salida1):
            cls.codigo = pn.main(["--entrada", str(cls.ent), "--salida", str(cls.sal)])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_codigo_de_salida_cero_con_errores(self):
        self.assertEqual(self.codigo, 0)

    def test_power_formato_y_menos_999(self):
        txt = (self.sal / "power" / "yoro.csv").read_text().splitlines()
        self.assertEqual(txt[0], "punto,latitud,longitud,fecha,PRECTOTCORR,T2M")
        lat, lon = pn.PUNTO["yoro"]["lat"], pn.PUNTO["yoro"]["lon"]
        self.assertEqual(txt[1:], [f"yoro,{lat},{lon},2026-11-01,1.5,20.0",
                                   f"yoro,{lat},{lon},2026-11-02,,21.0",       # -999 -> vacio
                                   f"yoro,{lat},{lon},2026-11-03,2.0,22.0",
                                   f"yoro,{lat},{lon},2026-11-05,4.0,",        # T2M no numerico omitido
                                   f"yoro,{lat},{lon},2026-11-06,3.5,25.0"])
        largo = csv_(self.sal / "power_diario_largo.csv")
        self.assertEqual(len(largo), 5)
        self.assertTrue(pd.isna(largo.loc[largo["fecha"] == "2026-11-02", "PRECTOTCORR"]).all())

    def test_calidad_power(self):
        c = csv_(self.sal / "calidad_power.csv")
        fila = c[(c["punto"] == "yoro") & (c["parametro"] == "PRECTOTCORR")].iloc[0]
        self.assertEqual((fila["filas"], fila["vacios"], fila["minimo"], fila["maximo"]), (5, 1, 1.5, 4.0))
        self.assertEqual((fila["primer_dia"], fila["ultimo_dia"]), ("2026-11-01", "2026-11-06"))
        self.assertEqual((fila["primer_dia_con_dato"], fila["ultimo_dia_con_dato"]), ("2026-11-01", "2026-11-06"))
        t2m = c[(c["punto"] == "yoro") & (c["parametro"] == "T2M")].iloc[0]
        self.assertEqual((t2m["filas"], t2m["vacios"]), (5, 1))

    def test_oni(self):
        self.assertEqual((self.sal / "oni.csv").read_text().splitlines(),
                         ["anio,trimestre,sst_total,oni", "2026,NDJ,25.5,-0.3", "2027,DJF,25.0,-0.1"])

    def test_ibtracs(self):
        df = csv_(self.sal / "huracanes_caribe_honduras.csv")
        self.assertEqual(list(df.columns), ["sid", "temporada", "nombre", "fecha_hora_utc", "naturaleza", "latitud",
                                            "longitud", "viento_wmo_kt", "presion_wmo_mb", "dist_tierra_km",
                                            "dist_tierra_6h_km", "viento_usa_kt", "presion_usa_mb",
                                            "categoria_sshs", "distancia_caja_km", "dentro_500km"])
        self.assertEqual(list(df["fecha_hora_utc"]), ["2026-10-27 00:00:00", "2026-10-27 06:00:00"])
        self.assertEqual(list(df["distancia_caja_km"]), [0.0, 0.0])
        self.assertEqual(list(df["dentro_500km"]), [1, 1])

    def test_errores_con_numero_de_registro_y_motivo(self):
        filas = leer_filas(self.sal / "errores.csv")
        self.assertEqual(list(filas[0].keys()), ["fecha_hora", "archivo", "tipo", "registro", "motivo"])
        por = {(f["tipo"], f["registro"]): f for f in filas}
        self.assertEqual(len(filas), 5)
        # POWER: indice del dia en el orden del JSON y parametro en el motivo
        motivos_power = sorted((f["registro"], f["motivo"]) for f in filas if f["tipo"] == "power")
        self.assertEqual([r for r, _ in motivos_power], ["4", "4", "5"])
        self.assertTrue(any(m.startswith("PRECTOTCORR") and "fecha invalida" in m for _, m in motivos_power))
        self.assertTrue(any(m.startswith("T2M") and "fecha invalida" in m for _, m in motivos_power))
        self.assertTrue(any(m.startswith("T2M") and "valor no numerico" in m for _, m in motivos_power))
        # ONI: numero de linea del archivo
        self.assertEqual(por[("oni", "3")]["archivo"], "oni.ascii.txt")
        self.assertIn("4 campos", por[("oni", "3")]["motivo"])
        # IBTrACS: numero de fila de datos
        self.assertIn("latitud", por[("ibtracs", "2")]["motivo"])
        self.assertIn("ERROR [ibtracs]", self.salida1.getvalue())

    def test_resumen_en_consola(self):
        s = self.salida1.getvalue()
        self.assertIn("Archivos procesados: 3", s)
        self.assertIn("Registros con error: 5", s)
        self.assertIn("Registros ok:", s)
        self.assertIn("calidad_power.csv", s)

    def test_registro_de_procesados(self):
        filas = leer_filas(self.sal / ".procesados.csv")
        self.assertEqual(list(filas[0].keys()), ["archivo", "sha256", "fecha", "tipo", "registros_ok", "registros_error"])
        self.assertEqual(sorted(f["tipo"] for f in filas), ["ibtracs", "oni", "power"])
        ok = {f["tipo"]: (f["registros_ok"], f["registros_error"]) for f in filas}
        self.assertEqual(ok["oni"], ("2", "1"))
        self.assertEqual(ok["ibtracs"], ("2", "1"))
        self.assertEqual(ok["power"], ("5", "3"))

    def test_segunda_corrida_no_reprocesa_y_archivo_nuevo_si(self):
        antes = {p.name: sha(p) for p in self.sal.rglob("*") if p.is_file()}
        s = io.StringIO()
        with contextlib.redirect_stdout(s):
            self.assertEqual(pn.main(["--entrada", str(self.ent), "--salida", str(self.sal)]), 0)
        self.assertIn("No hay archivos nuevos", s.getvalue())
        self.assertIn("Archivos procesados: 0", s.getvalue())
        despues = {p.name: sha(p) for p in self.sal.rglob("*") if p.is_file()}
        self.assertEqual(antes, despues)
        # un archivo nuevo con una clave ya existente: reemplaza, avisa y solo se procesa ese
        nuevo = json.loads((self.ent / "power" / "yoro.json").read_text())
        nuevo["properties"]["parameter"] = {"PRECTOTCORR": {"20261101": 9.9, "20261107": 0.5}}
        (self.ent / "power" / "yoro_b.json").write_text(json.dumps(nuevo))
        # nombre distinto de un punto: se rechaza con registro 0 y no detiene
        s = io.StringIO()
        with contextlib.redirect_stdout(s):
            pn.main(["--entrada", str(self.ent), "--salida", str(self.sal)])
        self.assertIn("Archivos procesados: 1", s.getvalue())
        self.assertIn("yoro_b", leer_filas(self.sal / "errores.csv")[-1]["archivo"])
        self.assertIn("no esta en config/zonas.json", leer_filas(self.sal / "errores.csv")[-1]["motivo"])
        # mismo contenido bajo el nombre del punto, en carpeta aparte, con ruta explicita
        d = Path(self.tmp.name) / "extra"
        d.mkdir()
        (d / "yoro.json").write_text(json.dumps(nuevo))
        with contextlib.redirect_stdout(io.StringIO()):
            pn.main([str(d / "yoro.json"), "--salida", str(self.sal)])
        filas = {f["fecha"]: f for f in leer_filas(self.sal / "power" / "yoro.csv")}
        self.assertEqual(filas["2026-11-01"]["PRECTOTCORR"], "9.9")     # reemplazada
        self.assertEqual(filas["2026-11-01"]["T2M"], "")                 # fila reemplazada completa
        self.assertEqual(filas["2026-11-07"]["PRECTOTCORR"], "0.5")
        self.assertEqual(len(filas), 6)
        self.assertEqual(len(csv_(self.sal / "power_diario_largo.csv")), 6)
        self.assertTrue(any("ya existian" in f["motivo"] for f in leer_filas(self.sal / "avisos.csv")))
        c = csv_(self.sal / "calidad_power.csv")
        self.assertEqual(int(c[(c.punto == "yoro") & (c.parametro == "PRECTOTCORR")]["filas"].iloc[0]), 6)


class TiposTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_tipo_desconocido_y_json_roto_no_detienen(self):
        ent, sal = self.dir / "e", self.dir / "s"
        ent.mkdir()
        (ent / "a_raro.txt").write_text("nada que ver\n")
        (ent / "yoro.json").write_text("{esto no es json")  # sin carpeta power: tipo ambiguo
        (ent / "z_oni.ascii.txt").write_text(" SEAS  YR   TOTAL   ANOM\n  NDJ 2026  25.50  -0.30\n")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(pn.main(["--entrada", str(ent), "--salida", str(sal)]), 0)
        filas = leer_filas(sal / "errores.csv")
        self.assertEqual(sorted((f["tipo"], f["registro"]) for f in filas), [("desconocido", "0"), ("desconocido", "0")])
        self.assertEqual(len(csv_(sal / "oni.csv")), 1)

    def test_power_json_roto_en_carpeta_power(self):
        (self.dir / "power").mkdir()
        f = self.dir / "power" / "yoro.json"
        f.write_text("{roto")
        df, errs = pn.leer_power(f)
        self.assertTrue(df.empty)
        self.assertEqual(errs[0][0], 0)
        self.assertIn("JSON ilegible", errs[0][1])
        self.assertEqual(pn.detectar_tipo(f), "power")

    def test_netcdf_corrupto(self):
        f = self.dir / "3B-DAY.MS.MRG.3IMERG.20200101-S000000-E235959.V07B_HND.nc4"
        f.write_bytes(b"no es netcdf")
        df, errs = pn.leer_imerg(f)
        self.assertTrue(df.empty)
        self.assertEqual(errs[0][0], 0)

    def test_deteccion_de_tipos_originales(self):
        esperado = {RAW / "power" / "yoro.json": "power", RAW / "noaa_oni" / "oni.ascii.txt": "oni",
                    next((RAW / "ibtracs").glob("*.csv")): "ibtracs", RAW / "soilgrids" / "yoro_cercano.json": "soilgrids",
                    RAW / "meteomatics" / "hist_clima_1981.json": "meteo_hist",
                    RAW / "meteomatics" / "pronostico_clima_emitido_2026-11-13.json": "meteo_pron",
                    RAW / "meteomatics" / "estaticos.json": "meteo_est",
                    next((RAW / "imerg").glob("*_HND.nc4")): "imerg", next((RAW / "smap").glob("*_HND.nc4")): "smap",
                    next((RAW / "grace").glob("*.nc")): "grace"}
        for f, t in esperado.items():
            with self.subTest(archivo=f.name):
                self.assertEqual(pn.detectar_tipo(f), t)


if __name__ == "__main__":
    unittest.main()
