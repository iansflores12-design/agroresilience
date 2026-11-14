import random
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # necesario con python3 -I

import evaluar_perspectiva as e  # noqa: E402
import generar_perspectiva as g  # noqa: E402


def oni_sintetico(semilla=7, desde=1950, hasta=2026):
    """ONI inventado con memoria entre anios (AR(1)) para los 12 trimestres."""
    rnd = random.Random(semilla)
    oni, v = {}, 0.0
    for a in range(desde, hasta + 1):
        v = 0.6 * v + rnd.gauss(0, 0.8)
        for t in g.TRIMESTRES:
            oni[g.indice_trimestre(a, t)] = v + rnd.gauss(0, 0.1)
    return oni


class PruebasEvaluar(unittest.TestCase):
    def test_features_b_usan_trimestres_previos_al_inicio(self):
        oni = {g.indice_trimestre(2000, t): v for t, v in (("DJF", 1.0), ("JFM", 2.0), ("FMA", 3.0))}
        for t, v in (("DJF", 0.0), ("JFM", 0.0), ("FMA", 0.0)):
            oni[g.indice_trimestre(2000, t) - 3] = v
        m, tend = e.feats_b(oni, "primera", 2000)
        self.assertAlmostEqual(m, 2.0)
        self.assertAlmostEqual(tend, 2.0)
        self.assertIsNone(e.feats_b(oni, "postrera", 2000))     # faltan AMJ, MJJ, JJA

    def test_lluvia_previa_excluye_el_inicio_y_exige_cobertura(self):
        ini, _ = g.limites_temporada("primera", 2001)
        s = {ini - timedelta(days=i): 1.0 for i in range(1, 91)}
        s[ini] = 500.0                                            # el primer dia ya es de la temporada
        self.assertEqual(e.lluvia_previa(s, "primera", 2001), 90.0)
        poca = {d: v for d, v in s.items() if (ini - d).days > 15 or d == ini}
        self.assertIsNone(e.lluvia_previa(poca, "primera", 2001))

    def test_corte_no_usa_datos_de_prueba(self):
        # Entrenamiento 1981-2009 todo bajo; prueba muy alta: con tercios del entrenamiento
        # las clases de prueba son 'lluvioso' (el corte no recalcula umbrales con la prueba).
        tot = {a: 100.0 + a for a in range(1981, 2010)}
        tot.update({a: 5000.0 + a for a in range(2010, 2026)})
        feats = {a: (float(a % 4), 0.0) for a in tot}
        prep = {("z", "primera"): {"totales": tot, "feats": {"A": feats, "B": feats, "C": feats}}}
        out = e.evaluar_corte(prep, "A", 2009, 2025)[("z", "primera")]
        self.assertEqual(out["n"], 16)
        self.assertAlmostEqual(out["normal"], 0.0)
        self.assertAlmostEqual(out["clim"], 0.0)       # la clase mayoritaria de entrenamiento nunca ocurre

    def test_series_identicas(self):
        d = {date(2000, 1, 1): 1.0}
        grupos = e.series_identicas({"a": d, "b": dict(d), "c": {date(2000, 1, 1): 2.0}})
        self.assertEqual(sorted(map(tuple, grupos)), [("a", "b"), ("c",)])

    def test_bootstrap_es_reproducible_y_ordenado(self):
        hits = {2010 + i: i % 2 for i in range(16)}
        o = {("z", "primera"): {"hits": hits, "hc": hits, "rps": {y: 0.5 for y in hits}, "rps0": {y: 0.6 for y in hits}}}
        b1 = e.bootstrap(o, list(o), remuestreos=200)
        b2 = e.bootstrap(o, list(o), remuestreos=200)
        self.assertEqual(b1, b2)
        est, lo, hi = b1["acc_vs_azar"]
        self.assertLessEqual(lo, est + 1e-9)
        self.assertLessEqual(est - 1e-9, hi)
        self.assertAlmostEqual(b1["rpss"][0], 1 - 0.5 / 0.6)

    def test_ruido_puro_falsos_positivos_5_por_ciento_o_menos(self):
        anios = list(range(1981, 2026))
        feats = e.feats_sinteticos(oni_sintetico(), anios)
        antigua, nueva, n = e.simular(feats, anios, senal=0.0, n_series=200)
        self.assertEqual(n, 200)
        self.assertLessEqual(nueva / n, 0.05)
        self.assertLessEqual(nueva, antigua)                      # la regla nueva nunca es mas laxa

    def test_senal_real_sigue_pasando(self):
        anios = list(range(1981, 2026))
        feats = e.feats_sinteticos(oni_sintetico(), anios)
        _, nueva, n = e.simular(feats, anios, senal=2.0, n_series=50)
        self.assertGreaterEqual(nueva / n, 0.85)


if __name__ == "__main__":
    unittest.main()
