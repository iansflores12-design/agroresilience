import random
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # necesario con python3 -I

import generar_perspectiva as g  # noqa: E402


def serie_con_totales(totales, tipo="primera", por_dia=None):
    """Serie diaria sintetica: cada anio reparte su total por igual en los dias de la temporada."""
    s = {}
    for a, t in totales.items():
        ini, fin = g.limites_temporada(tipo, a)
        n = (fin - ini).days + 1
        for i in range(n):
            s[ini + timedelta(days=i)] = t / n
    return s


class PruebasPerspectiva(unittest.TestCase):
    def test_tercios_y_clases(self):
        um = g.tercios([1, 2, 3, 4, 5, 6, 7, 8, 9])
        clases = [g.clasificar(v, um) for v in range(1, 10)]
        self.assertEqual(clases.count("seco"), 3)
        self.assertEqual(clases.count("normal"), 3)
        self.assertEqual(clases.count("lluvioso"), 3)
        self.assertEqual(clases[0], "seco")
        self.assertEqual(clases[-1], "lluvioso")

    def test_regla_90_por_ciento(self):
        ini, fin = g.limites_temporada("primera", 2000)
        n = (fin - ini).days + 1  # 123 dias
        completo = {ini + timedelta(days=i): 1.0 for i in range(n)}
        self.assertEqual(g.total_temporada(completo, "primera", 2000), n)
        casi = {d: v for i, (d, v) in enumerate(completo.items()) if i >= 12}   # 111 dias = 90.2 %
        self.assertEqual(g.total_temporada(casi, "primera", 2000), n - 12)
        poco = {d: v for i, (d, v) in enumerate(completo.items()) if i >= 13}   # 110 dias = 89.4 %
        self.assertIsNone(g.total_temporada(poco, "primera", 2000))

    def test_temporadas_postrera(self):
        ini, fin = g.limites_temporada("postrera", 2001)
        self.assertEqual((ini, fin), (date(2001, 9, 1), date(2001, 12, 31)))

    def test_proximas_temporadas(self):
        self.assertEqual(g.proximas_temporadas(date(2026, 11, 8)), [("primera", 2027), ("postrera", 2027)])
        self.assertEqual(g.proximas_temporadas(date(2027, 5, 1)), [("postrera", 2027), ("primera", 2028)])

    def test_analogos_orden_y_k(self):
        cand = {1990: (0.0, 0.0), 1991: (2.0, 0.0), 1992: (2.4, 0.0), 1993: (2.4, 2.0)}
        self.assertEqual(g.analogos((2.5, 0.0), cand, k=2), [1992, 1991])
        # la tendencia pesa la mitad
        self.assertEqual(g.analogos((2.4, 0.0), {1: (2.4, 0.6), 2: (2.0, 0.0)}, k=1), [1])

    def test_suavizado(self):
        p = g.probabilidades({"seco": 6, "normal": 3, "lluvioso": 1}, 10)
        self.assertAlmostEqual(p["seco"], 7 / 13)
        self.assertAlmostEqual(sum(p.values()), 1.0)
        self.assertEqual(g.clase_mas_probable(p), "seco")

    def test_usable(self):
        self.assertFalse(g.es_usable(0.9, 20, 0.5, 0.5))           # pocos anios
        self.assertTrue(g.es_usable(0.9, 40, 0.5, 0.5))
        self.assertFalse(g.es_usable(0.40, 44, 0.1, 0.1))          # cerca del azar
        # limite (a): 1/3 + 2.33*sqrt(2/9/44)
        lim = 1 / 3 + 2.33 * (2 / 9 / 44) ** 0.5
        self.assertTrue(g.es_usable(lim + 1e-9, 44, 0.1, 0.1))
        self.assertFalse(g.es_usable(lim - 1e-6, 44, 0.1, 0.1))

    def test_usable_exige_rpss_positivo_en_las_dos_pruebas(self):
        self.assertFalse(g.es_usable(0.9, 44, -0.01, 0.2))         # (b) falla
        self.assertFalse(g.es_usable(0.9, 44, 0.2, -0.01))         # (c) falla
        self.assertFalse(g.es_usable(0.9, 44, 0.2, 0.0))           # RPSS igual a 0 no basta
        self.assertFalse(g.es_usable(0.9, 44, 0.2, None))          # sin retencion no se publica
        self.assertFalse(g.es_usable(0.9, 44, 0.2, 0.2, n_retencion=3))

    def test_rps_y_rpss(self):
        clim = {c: 1 / 3 for c in g.CLASES}
        # acertar con certeza da RPS 0; la climatologia da (1/3)^2 + (2/3)^2 si llueve mucho
        self.assertAlmostEqual(g.rps({"seco": 1.0, "normal": 0.0, "lluvioso": 0.0}, "seco"), 0.0)
        self.assertAlmostEqual(g.rps(clim, "lluvioso"), (1 / 3) ** 2 + (2 / 3) ** 2)
        # un error de dos clases cuesta mas que uno de una clase (clases ordenadas)
        seco = {"seco": 1.0, "normal": 0.0, "lluvioso": 0.0}
        self.assertGreater(g.rps(seco, "lluvioso"), g.rps(seco, "normal"))
        self.assertAlmostEqual(g.rpss({1: (clim, "seco"), 2: (clim, "normal")}), 0.0)
        self.assertAlmostEqual(g.rpss({1: (seco, "seco")}), 1.0)
        self.assertLess(g.rpss({1: (seco, "lluvioso")}), 0)
        self.assertIsNone(g.rpss({}))

    def test_retencion_solo_usa_entrenamiento(self):
        # Entrenamiento: totales 1..29; prueba: un anio de 10000 mm. Con tercios del
        # entrenamiento es 'lluvioso'; si los tercios incluyeran la prueba tambien lo seria,
        # asi que se revisa con un anio bajo: debe ser 'seco' por el umbral del entrenamiento.
        totales = {a: float(a) for a in range(1981, 2010)}
        totales.update({2010: 0.0, 2011: 10000.0})
        feats = {a: (float(a % 5), 0.0) for a in totales}
        res = g.retencion(totales, feats, fin_entrena=2009, fin_prueba=2025, k=5)
        self.assertEqual(sorted(res), [2010, 2011])
        self.assertEqual(res[2010][1], "seco")
        self.assertEqual(res[2011][1], "lluvioso")
        # los analogos solo salen de 1981-2009: el conteo suma k
        self.assertAlmostEqual(sum(res[2010][0].values()), 1.0)

    def test_dejar_uno_fuera_no_incluye_el_anio_probado(self):
        totales = {a: 100.0 + a for a in range(1, 41)}
        feats = {a: (float(a), 0.0) for a in range(1, 41)}
        res = g.dejar_uno_fuera(totales, feats, k=5)
        self.assertEqual(len(res), 40)
        # sin el anio probado, el extremo 40 queda fuera de los tercios: sigue siendo 'lluvioso'
        self.assertEqual(res[40][1], "lluvioso")
        self.assertEqual(res[1][1], "seco")

    def test_canicula(self):
        s = {date(2000, 7, 1) + timedelta(days=i): 5.0 for i in range(62)}
        for i in range(10, 25):       # racha de 15 dias secos
            s[date(2000, 7, 1) + timedelta(days=i)] = 0.5
        for i in range(30, 35):       # racha de 5
            s[date(2000, 7, 1) + timedelta(days=i)] = 0.0
        self.assertEqual(g.racha_canicula(s, 2000), 15)
        # sin dato en mas del 10 %: None
        poco = {d: v for d, v in s.items() if d.day % 2 == 0}
        self.assertIsNone(g.racha_canicula(poco, 2000))

    def test_fase(self):
        self.assertEqual(g.fase_oni(0.5), "nino")
        self.assertEqual(g.fase_oni(-0.5), "nina")
        self.assertEqual(g.fase_oni(0.49), "neutral")

    def test_prueba_no_usa_anio_probado(self):
        # Un anio extremo solo se predice bien si NO esta en sus propios analogos ni tercios.
        totales = {a: 100.0 + a for a in range(1, 41)}
        preds = {a: (float(a), 0.0) for a in range(1, 41)}
        acc, n = g.prueba_hacia_atras(totales, preds, k=5)
        self.assertEqual(n, 40)
        # El ONI ordena la lluvia: casi todo acierta, pero el anio 1 y el 40 siguen acertando
        # sin ver su propio dato.
        self.assertGreater(acc, 0.8)

    def test_oni_determina_clase_es_usable(self):
        rnd = random.Random(1)
        oni, totales = {}, {}
        for a in range(1980, 2027):
            v = rnd.uniform(-2, 2)
            oni[g.indice_trimestre(a, "ASO")] = v
            oni[g.indice_trimestre(a, "ASO") - 3] = v - 0.1
            totales[a + 1] = 600 - 100 * v + rnd.uniform(-5, 5)   # mas Nino, menos lluvia
        serie = serie_con_totales(totales)
        oni[g.indice_trimestre(2027, "ASO")] = 1.8
        oni[g.indice_trimestre(2027, "ASO") - 3] = 1.7
        z = g.perspectiva_zona(serie, oni, (2026, "ASO"), "primera", 2027)
        self.assertTrue(z["usable"])
        self.assertGreater(z["aciertos"], 0.6)
        self.assertEqual(max(z["conteo"], key=z["conteo"].get), "seco")
        self.assertAlmostEqual(sum(z["prob"].values()), 1, delta=0.02)

    def _zona_ruido(self, semilla):
        rnd = random.Random(semilla)
        oni, totales = {}, {}
        for a in range(1980, 2027):
            v = rnd.uniform(-2, 2)
            oni[g.indice_trimestre(a, "ASO")] = v
            oni[g.indice_trimestre(a, "ASO") - 3] = v - 0.1
            totales[a + 1] = rnd.uniform(300, 700)   # sin relacion con el ONI
        serie = serie_con_totales(totales)
        oni[g.indice_trimestre(2027, "ASO")] = 1.8
        oni[g.indice_trimestre(2027, "ASO") - 3] = 1.7
        return g.perspectiva_zona(serie, oni, (2026, "ASO"), "primera", 2027)

    def test_ruido_no_usable(self):
        z = self._zona_ruido(1)
        self.assertFalse(z["usable"])
        self.assertEqual(z["prob"], {"seco": 0.33, "normal": 0.33, "lluvioso": 0.33})
        self.assertEqual(sum(z["conteo"].values()), 10)   # los conteos reales se conservan

    def test_ruido_acierta_como_el_azar(self):
        # Con ruido puro el acierto medio debe rondar 1/3 (el umbral deja pasar algo de
        # ruido porque las predicciones vecinas comparten analogos).
        medias = [self._zona_ruido(s)["aciertos"] for s in range(1, 21)]
        self.assertAlmostEqual(sum(medias) / len(medias), 1 / 3, delta=0.06)


if __name__ == "__main__":
    unittest.main()
