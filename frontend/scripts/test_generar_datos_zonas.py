import unittest
from datetime import date

import generar_datos_zonas as g


class PruebasZonas(unittest.TestCase):
    def test_promedio_am_pm(self):
        self.assertAlmostEqual(g.promedio_am_pm(0.2, 0.3), 0.25)
        self.assertEqual(g.promedio_am_pm(0.2, None), 0.2)
        self.assertEqual(g.promedio_am_pm(None, 0.4), 0.4)
        self.assertIsNone(g.promedio_am_pm(None, None))

    def test_num_vacio(self):
        self.assertIsNone(g._num(""))
        self.assertEqual(g._num("0.5"), 0.5)

    def test_distancia_cruce_fin_de_anio(self):
        self.assertEqual(g.distancia_dia_anio(date(2019, 12, 28), date(2020, 1, 5)), 8)
        self.assertEqual(g.distancia_dia_anio(date(2019, 6, 1), date(2021, 6, 1)), 0)

    def test_ventana_dia_del_anio_con_cruce(self):
        serie = {date(2019, 12, 25): 1, date(2019, 1, 10): 2, date(2019, 6, 1): 3,
                 date(2019, 1, 25): 4, date(2021, 1, 3): 9}
        h = g.valores_historicos(serie, date(2021, 1, 3))
        self.assertEqual(sorted(h), [1, 2])  # 25-ene fuera de +-15, 2021 excluido

    def test_percentil(self):
        self.assertEqual(g.percentil(0.3, [0.1, 0.2, 0.3, 0.4]), 75)
        self.assertEqual(g.percentil(0.0, [0.1, 0.2]), 0)
        self.assertEqual(g.percentil(1.0, [0.1, 0.2]), 100)
        self.assertIsNone(g.percentil(1.0, []))

    def test_pocas_muestras(self):
        serie = {date(2018, 6, d): 0.2 for d in range(1, 11)}
        serie[date(2020, 6, 5)] = 0.3
        r = g.resumen_humedad(serie)
        self.assertEqual(r["muestras"], 10)
        self.assertIsNone(r["normal"])
        self.assertIsNone(r["anomalia"])
        self.assertIsNone(r["percentil"])
        self.assertEqual(r["valor"], 0.3)

    def test_suficientes_muestras(self):
        serie = {date(2018, 6, d): 0.2 for d in range(1, 26)}
        serie[date(2020, 6, 5)] = 0.3
        r = g.resumen_humedad(serie)
        self.assertEqual(r["muestras"], 21)
        self.assertEqual(r["normal"], 0.2)
        self.assertEqual(r["anomalia"], 0.1)
        self.assertEqual(r["percentil"], 100)
        self.assertEqual(r["serie"][-1], ["2020-06-05", 0.3])

    def test_sin_datos(self):
        self.assertIsNone(g.resumen_humedad({}))
        self.assertIsNone(g.resumen_lluvia({}))
        self.assertIsNone(g.resumen_temperatura({}))

    def test_serie_120_dias(self):
        serie = {date(2020, 6, 1): 0.1, date(2020, 1, 1): 0.5, date(2020, 2, 10): 0.4}
        fechas = [p[0] for p in g.resumen_humedad(serie)["serie"]]
        self.assertEqual(fechas, ["2020-02-10", "2020-06-01"])

    def test_suelo_conversion(self):
        f = {"sand_0_5cm": "232", "silt_0_5cm": "373", "clay_0_5cm": "395", "phh2o_0_5cm": "65"}
        self.assertEqual(g.resumen_suelo(f), {"arena_pct": 23.2, "limo_pct": 37.3,
                                              "arcilla_pct": 39.5, "ph": 6.5})
        self.assertIsNone(g.resumen_suelo(None))

    def test_temperatura_ultimos_7(self):
        serie = {date(2020, 1, d): float(d) for d in range(1, 11)}
        self.assertEqual(g.resumen_temperatura(serie), {"valor_c": 7.0, "hasta": "2020-01-10"})

    def test_leer_power(self):
        import os, tempfile
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "p.csv")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write("punto,fecha,PRECTOTCORR,T2M\n"
                        "a,2020-01-01,2.5,20\na,2020-01-02,,21\na,2020-01-03,-999,\n")
            ll, t = g.leer_power(ruta)
        self.assertEqual(ll, {"a": {date(2020, 1, 1): 2.5}})
        self.assertEqual(t, {"a": {date(2020, 1, 1): 20.0, date(2020, 1, 2): 21.0}})

    def test_lluvia(self):
        serie = {}
        d = date(2015, 1, 1)
        while d <= date(2020, 6, 30):
            serie[d] = 1.0
            d = date.fromordinal(d.toordinal() + 1)
        r = g.resumen_lluvia(serie)
        self.assertEqual(r, {"valor_mm": 30.0, "hasta": "2020-06-30", "normal_mm": 30.0})


if __name__ == "__main__":
    unittest.main()
