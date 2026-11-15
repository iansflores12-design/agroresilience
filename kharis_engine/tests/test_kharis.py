"""Pruebas de Kharis Engine. Corren en CPU con datos sinteticos pequenos (y una de reproducibilidad en GPU si hay).

  python tests/correr_pruebas.py            (recomendado: sale limpio tambien con CUDA)
  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kharis import config as C            # noqa: E402
from kharis import continuous as K        # noqa: E402
from kharis import data_pipeline as D     # noqa: E402
from kharis import export_viz as V        # noqa: E402
from kharis import physics as F           # noqa: E402
from kharis import train_eval as TE       # noqa: E402
from kharis.device import seleccionar_dispositivo  # noqa: E402
from kharis.model import Calibrador, KharisNet, PerdidaExtremos  # noqa: E402


def cfg_chica(**kw) -> C.KharisConfig:
    base = dict(seq_len=32, horizonte=5, canales=16, bloques=3, epocas=2, pasos_por_epoca=25, lote=256, paciencia=5,
                cont_epocas=1, cont_pasos=15, miembros=4, dias_pronostico=40, calib_min_muestras=200, epocas_consolidacion=1,
                lr=2e-3, dropout=0.1, weight_decay=1e-4, ruido_entrada=0.0, cont_lr=3e-4, dispositivo="cpu")
    base.update(kw)
    return C.KharisConfig(**base)


def datos_sinteticos(n_puntos=3, fin="2026-06-30") -> pd.DataFrame:
    return D.generar_sintetico(inicio="1996-01-01", fin=fin, n_puntos=n_puntos, semilla=7)


# =========================================================================== datos
class PruebasDatos(unittest.TestCase):
    def test_centinelas_a_nan_nunca_cero(self):
        df = pd.DataFrame({"punto": "a", "fecha": pd.date_range("2000-01-01", periods=6), "lat": 14.0, "lon": -87.0, "elevacion": 500.0,
                           "T2M_MAX": [30.0, -999.0, 31.0, -9999.0, 200.0, 29.0], "PRECTOTCORR": [0.0, 5.0, -999.0, 1.0, -3.0, 0.0]})
        limpio, rep = D.limpiar(df)
        self.assertTrue(np.isnan(limpio["T2M_MAX"].iloc[[1, 3, 4]]).all())      # centinelas y fuera de rango
        self.assertTrue(np.isnan(limpio["PRECTOTCORR"].iloc[[2, 4]]).all())
        self.assertEqual(limpio["PRECTOTCORR"].iloc[0], 0.0)                    # un cero real se conserva
        self.assertFalse((limpio["T2M_MAX"] == 0).any())
        self.assertEqual(rep["centinelas_a_nan"], 3)
        self.assertEqual(rep["fuera_de_rango_a_nan"], 2)

    def test_orden_cronologico_y_duplicados(self):
        df = datos_sinteticos(2, "1996-03-31").sample(frac=1.0, random_state=1)
        df = pd.concat([df, df.iloc[:20]], ignore_index=True)
        limpio, rep = D.limpiar(df)
        self.assertEqual(rep["duplicados_quitados"], 20)
        for _, g in limpio.groupby("punto"):
            self.assertTrue(g["fecha"].is_monotonic_increasing and g["fecha"].is_unique)

    def test_alias_y_formatos(self):
        base = datos_sinteticos(1, "1996-02-29")
        tmp = Path(tempfile.mkdtemp())
        try:
            base.to_csv(tmp / "a.csv", index=False)
            base.to_csv(tmp / "a.tsv", index=False, sep="\t")
            base.assign(fecha=base["fecha"].dt.strftime("%Y-%m-%d")).to_json(tmp / "a.json", orient="records")
            base.to_csv(tmp / "a.csv.gz", index=False)
            ref, _ = D.limpiar(D.leer_tabla(tmp / "a.csv"))
            for nombre in ("a.tsv", "a.json", "a.csv.gz"):
                otro, _ = D.limpiar(D.leer_tabla(tmp / nombre))
                np.testing.assert_allclose(otro["T2M_MAX"].to_numpy(), ref["T2M_MAX"].to_numpy(), equal_nan=True)
            esp = base.rename(columns={"T2M_MAX": "tmax_c", "T2M_MIN": "tmin_c", "PRECTOTCORR": "lluvia_power_mm", "lat": "latitud",
                                       "lon": "longitud", "elevacion": "elevacion_m"})
            limpio, _ = D.limpiar(esp)
            self.assertTrue({"T2M_MAX", "T2M_MIN", "PRECTOTCORR", "lat", "lon", "elevacion"} <= set(limpio.columns))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_carpeta_processed_y_causalidad(self):
        """Lee una carpeta con el formato processed/ del proyecto. ONI y NDVI entran sin mirar al futuro."""
        tmp = Path(tempfile.mkdtemp())
        try:
            f = pd.date_range("2001-01-01", "2001-12-31")
            pw = pd.DataFrame({"punto": "p1", "latitud": 14.0, "longitud": -87.0, "fecha": f.strftime("%Y-%m-%d"), "T2M": 24.0, "T2M_MAX": 30.0,
                               "T2M_MIN": 18.0, "PRECTOTCORR": 1.0, "RH2M": 70.0, "WS2M": 2.0, "ALLSKY_SFC_SW_DWN": 18.0})
            pw.to_csv(tmp / "power_diario_largo.csv", index=False)
            pd.DataFrame({"punto": ["p1"], "latitud": [14.0], "longitud": [-87.0], "elevacion_m": [612.0]}).to_csv(tmp / "topografia_por_punto.csv", index=False)
            pd.DataFrame({"punto": "p1", "fecha": f.strftime("%Y-%m-%d"), "precipitation": 2.5}).to_csv(tmp / "imerg_series.csv", index=False)
            pd.DataFrame({"anio": [2001, 2001], "trimestre": ["JFM", "FMA"], "sst_total": [26, 26], "oni": [1.5, -0.5]}).to_csv(tmp / "oni.csv", index=False)
            pd.DataFrame({"punto": ["p1"], "latitud": [14.0], "longitud": [-87.0], "fecha": ["2001-06-10"], "ndvi": [0.6], "evi": [0.4],
                          "calidad_pixel": [0]}).to_csv(tmp / "modis_ndvi.csv", index=False)
            df, _ = D.limpiar(D.leer_carpeta(tmp))
            df = df.set_index("fecha")
            self.assertEqual(df["elevacion"].iloc[0], 612.0)
            self.assertEqual(df["precipitation"].iloc[0], 2.5)
            # ONI JFM (centro febrero) solo se conoce desde abril; FMA (centro marzo) desde mayo
            self.assertTrue(np.isnan(df.loc["2001-03-31", "oni"]))
            self.assertEqual(df.loc["2001-04-15", "oni"], 1.5)
            self.assertEqual(df.loc["2001-05-15", "oni"], -0.5)
            # NDVI: nada antes de la pasada del satelite, vigente 32 dias despues
            self.assertTrue(np.isnan(df.loc["2001-06-09", "NDVI"]))
            self.assertEqual(df.loc["2001-07-12", "NDVI"], 0.6)
            self.assertTrue(np.isnan(df.loc["2001-07-13", "NDVI"]))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_poda_de_datos(self):
        cfg = cfg_chica(ventana_anios=5, vida_media_dias=365, peso_extremos=0.3)
        t = np.array([0, 3000, 3600, 3650])
        ext = np.array([True, False, False, False])
        w, info = D.pesos_retencion(t, ext, 3650, cfg)
        self.assertEqual(w[0], 0.3)                      # extremo antiguo: se conserva
        self.assertAlmostEqual(w[3], 1.0)                # hoy: peso completo
        self.assertTrue(w[1] < w[2] < w[3])              # decaimiento temporal
        w2, _ = D.pesos_retencion(np.array([0]), np.array([False]), 3650, cfg)
        self.assertEqual(w2[0], 0.0)                     # viejo y normal: se poda
        self.assertEqual(info["extremos_conservados"], 1)
        w3, _ = D.pesos_retencion(t, ext, 3650, cfg, deriva=True)
        self.assertLess(w3[1], w[1])                     # con deriva lo viejo pesa menos


# =========================================================================== fisica
class PruebasFisica(unittest.TestCase):
    def test_radiacion_extraterrestre_fao56(self):
        # FAO-56 ejemplo 8: 20 S, 3 de septiembre (dia 246) -> 32.2 MJ/m2/dia
        ra = F.radiacion_extraterrestre(np.array([-20.0]), np.array([246]))
        self.assertAlmostEqual(float(ra[0, 0]), 32.2, delta=0.15)

    def test_et0_hargreaves_fao56(self):
        # FAO-56 ejemplo 20: Tmax 26.6, Tmin 14.8, Ra 40.55 -> 5.0 mm/dia
        et0 = F.et0_hargreaves(np.array([[26.6]]), np.array([[14.8]]), np.array([[40.55]]))
        self.assertAlmostEqual(float(et0[0, 0]), 5.0, delta=0.1)

    def test_et0_penman_fao56(self):
        # FAO-56 ejemplo 18 (Bruselas, 6 de julio): ~3.9 mm/dia. Aqui se usa humedad media, de ahi la tolerancia.
        ra = F.radiacion_extraterrestre(np.array([50.8]), np.array([187]))
        et0 = F.et0_penman(np.array([[21.5]]), np.array([[12.3]]), np.array([[73.5]]), np.array([[2.078]]), np.array([[22.07]]), ra, np.array([100.0]))
        self.assertAlmostEqual(float(et0[0, 0]), 3.9, delta=0.4)

    def test_racha_seca(self):
        r = F.racha_seca(np.array([[0.0, 0.5, 3.0, 0.0, 0.0, 0.2, 10.0, np.nan, 0.0]]))
        np.testing.assert_array_equal(r[0], [1, 2, 0, 1, 2, 3, 0, 0, 1])

    def test_balance_hidrico_conserva_masa(self):
        rng = np.random.default_rng(0)
        lluvia = rng.gamma(0.5, 12, (3, 400)) * (rng.random((3, 400)) < 0.3)
        etc = rng.uniform(2, 6, (3, 400))
        taw, p = 140.0, 0.55
        reserva, ks, real, deficit, exceso = F.balance_hidrico(lluvia, etc, taw, p)
        self.assertTrue((reserva >= -1e-9).all() and (reserva <= taw + 1e-9).all())
        self.assertTrue((ks >= 0).all() and (ks <= 1).all() and (deficit >= -1e-9).all())
        delta = reserva[:, -1] - taw * 0.5
        np.testing.assert_allclose(delta, lluvia.sum(1) - real.sum(1) - exceso.sum(1), atol=1e-6)

    def test_gdd_y_calendario(self):
        f = pd.date_range("2001-01-01", "2001-12-31")
        clima = {"T2M_MAX": np.full((1, len(f)), 32.0), "T2M_MIN": np.full((1, len(f)), 18.0), "PRECTOTCORR": np.full((1, len(f)), 5.0)}
        fis = F.fisica_arreglos(f, np.array([14.0]), np.array([500.0]), clima, "maiz", "primera")
        self.assertAlmostEqual(float(fis["gdd"][0, 0]), (30 + 18) / 2 - 10)       # tope 30, base 10
        i = f.get_loc("2001-05-15")
        self.assertAlmostEqual(float(fis["gdd_acum"][0, i]), 14.0)                # se reinicia el dia de siembra
        self.assertAlmostEqual(float(fis["gdd_acum"][0, i + 9]), 140.0)
        self.assertEqual(int(fis["etapa"][0, i]), 1)
        self.assertEqual(int(fis["etapa"][0, i - 1]), 0)                          # antes de sembrar: fuera de ciclo
        self.assertAlmostEqual(float(fis["kc"][0, i + 60]), 1.20)                 # etapa media del maiz

    def test_acople_fisico(self):
        obj = C.OBJETIVOS
        v = np.array([[20.0, 25.0, 40.0, -3.0, -1.0, 130.0, -5.0]])              # tmax < tmin, lluvia < 0, HR > 100...
        a = F.acoplar_fisica(v, obj)[0]
        d = dict(zip(obj, a))
        self.assertTrue(d["T2M_MIN"] <= d["T2M"] <= d["T2M_MAX"])
        self.assertEqual(d["PRECTOTCORR"], 0.0)
        self.assertEqual(d["RH2M"], 100.0)
        self.assertTrue(d["WS2M_MAX"] >= 0 and d["ALLSKY_SFC_SW_DWN"] >= 0)

    def test_balance_un_dia_coincide_con_el_paso_determinista(self):
        q = (0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)
        w = F.pesos_cuantiles(q)
        self.assertAlmostEqual(float(w.sum()), 1.0)
        ll = np.full((4, len(q)), 7.0)                    # sin incertidumbre: debe dar el paso exacto
        res, de = F.balance_un_dia(np.array([100.0, 100.0, 10.0, 139.0]), ll, w, np.full(4, 5.0), 140.0, 0.55)
        np.testing.assert_allclose(res[:2], 102.0)        # suelo humedo (ks = 1): 100 + 7 de lluvia - 5 de ETc
        np.testing.assert_allclose(de[:2], 0.0, atol=1e-12)
        self.assertLess(res[2], 17.0)                     # suelo seco: ks < 1, evapora menos
        self.assertGreater(de[2], 0.0)
        self.assertLessEqual(res[3], 140.0)               # no pasa de la capacidad


class PruebasSenales(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        df, _ = D.limpiar(datos_sinteticos(2))
        cls.cfg = cfg_chica()
        cls.panel = D.panel_desde_df(df, inicio=cls.cfg.inicio_datos)
        cls.ctx = TE.preparar_contexto(cls.panel, cls.cfg, seleccionar_dispositivo("cpu"))
        cls.ref = TE.referencia_senales(cls.ctx)

    def test_referencia_solo_periodo_base(self):
        self.assertLessEqual(max(self.ref.anios), pd.Timestamp(self.cfg.fin_entrenamiento).year)

    def test_senales_p1_a_p10(self):
        clima = TE._clima_dict(self.panel.valores, self.panel.variables)
        fis = F.fisica_arreglos(self.panel.fechas, self.panel.estatico[:, 0], self.panel.estatico[:, 2], clima)
        anios, s = F.calcular_senales(self.panel.fechas, clima, fis, self.ref, clima.get("oni"))
        for k in C.PATRONES:
            self.assertEqual(s[f"{k}_valor"].shape, (2, len(anios)))
        pct = s["P3_percentil"][np.isfinite(s["P3_percentil"])]
        self.assertTrue((pct >= 0).all() and (pct <= 100).all())
        alguna = np.any([s[f"P{i}_activo"] for i in range(1, 10)], axis=0)
        np.testing.assert_array_equal(s["P10_activo"], ~alguna)                  # P10 = ninguna otra activa
        j = anios.index(1998)                                                     # huracan simulado: lluvia extrema
        self.assertTrue(s["P7_activo"][:, j].all())
        self.assertGreater(float(s["lluvia_max_1d"][:, j].min()), C.LLUVIA_INTENSA_MM)

    def test_inicio_de_lluvias_construido(self):
        f = pd.date_range("2003-01-01", "2003-12-31")
        ll = np.zeros((1, len(f)))
        i = f.get_loc("2003-05-20")
        ll[0, i:i + 3] = [12.0, 10.0, 8.0]              # 30 mm en 3 dias
        ll[0, i + 3: i + 60: 4] = 6.0                   # lluvias cada 4 dias: sin racha seca larga
        racha = F.racha_seca(ll)
        doy, ok = F._inicio_lluvias(ll, racha, f, 2003)
        self.assertTrue(ok[0])
        self.assertEqual(int(doy[0]), pd.Timestamp("2003-05-20").dayofyear)


# =========================================================================== modelo
class PruebasModelo(unittest.TestCase):
    def test_formas_cuantiles_y_anomalia(self):
        torch.manual_seed(0)
        m = KharisNet(n_features=12, n_objetivos=4, horizonte=5, n_cuantiles=7, canales=16, bloques=3).eval()
        for L in (16, 32, 75):                                                    # seq_len dinamico
            x, base = torch.randn(3, L, 12), torch.randn(3, 5, 4)
            p, q = m(x, base)
            self.assertEqual(tuple(p.shape), (3, 5, 4))
            self.assertEqual(tuple(q.shape), (3, 5, 4, 7))
            self.assertTrue((q[..., 1:] >= q[..., :-1]).all())                    # cuantiles nunca se cruzan
        for cabeza in (m.cabeza_media, m.cabeza_cuantiles):
            torch.nn.init.zeros_(cabeza.weight); torch.nn.init.zeros_(cabeza.bias)
        p, _ = m(x, base)
        torch.testing.assert_close(p, base)                                       # sin senal -> climatologia

    def test_convolucion_causal(self):
        """Rellenar a ambos lados y recortar la cola equivale a rellenar solo a la izquierda (causal)."""
        from kharis.model import BloqueTemporal
        torch.manual_seed(0)
        b = BloqueTemporal(4, 3, 2, 0.0).eval()
        x = torch.randn(2, 4, 20)
        izquierda = torch.nn.functional.conv1d(torch.nn.functional.pad(x, (b.relleno, 0)), b.conv1.weight, b.conv1.bias, dilation=2)
        torch.testing.assert_close(b.conv1(x)[:, :, :-b.relleno], izquierda, atol=1e-6, rtol=1e-5)
        x2 = x.clone()
        x2[:, :, 12:] += 5.0                                                      # cambia el "futuro" dentro de la ventana
        torch.testing.assert_close(b.conv1(x2)[:, :, :-b.relleno][:, :, :12], izquierda[:, :, :12], atol=1e-6, rtol=1e-5)
        m = KharisNet(6, 2, 3, 3, canales=8, bloques=2).eval()
        self.assertEqual(m.campo_receptivo, 1 + 2 * 2 * 3)

    def test_perdida_ignora_nan_y_pesa_extremos(self):
        per = PerdidaExtremos((0.1, 0.5, 0.9))
        pred = torch.zeros(4, 2, 3, requires_grad=True)
        cuant = torch.zeros(4, 2, 3, 3, requires_grad=True)
        y = torch.ones(4, 2, 3)
        y[0, 0, 0] = float("nan")
        cero = torch.zeros_like(y)
        a = per(pred, cuant, y, cero, cero)
        a["total"].backward()
        self.assertTrue(torch.isfinite(a["total"]) and torch.isfinite(pred.grad).all())
        self.assertEqual(float(pred.grad[0, 0, 0]), 0.0)                          # el NaN no aporta gradiente
        y2 = torch.ones(4, 2, 3); y2[0] = 3.0                                     # una muestra con error grande...
        e95 = torch.zeros_like(y2); e95[0] = 1.0                                  # ...marcada como extremo
        sin = per(torch.zeros(4, 2, 3), torch.zeros(4, 2, 3, 3), y2, cero, cero)["total"]
        con = per(torch.zeros(4, 2, 3), torch.zeros(4, 2, 3, 3), y2, e95, e95)["total"]
        self.assertGreater(float(con), float(sin))

    def test_calibrador(self):
        rng = np.random.default_rng(0)
        n, q = 6000, (0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99)
        verdad = rng.gamma(2.0, 5.0, (n, 1, 1))
        pred = 0.5 * verdad + 3.0 + rng.normal(0, 1.0, (n, 1, 1))                 # sesgo condicional
        obs = verdad + rng.normal(0, 1.0, (n, 1, 1))
        cuant = pred[..., None] + np.array([-1, -0.5, 0, 0.5, 1, 1.2, 1.5])       # bandas demasiado estrechas
        cal = Calibrador(q, 24, 400).ajustar(pred, cuant, obs)
        p2, c2 = cal.aplicar(pred, cuant)
        self.assertLess(abs(float((p2 - obs).mean())), 0.15)
        self.assertLess(float(np.abs(p2 - obs).mean()), float(np.abs(pred - obs).mean()) * 0.7)
        self.assertTrue((np.diff(cal.nudos_y[0, 0]) >= -1e-9).all())             # mapa monotono
        self.assertAlmostEqual(float((obs[:, 0, 0] <= c2[:, 0, 0, 5]).mean()), 0.95, delta=0.01)
        self.assertTrue((np.diff(c2, axis=-1) >= -1e-6).all())
        antes = cal.nudos_y.copy()                                                # actualizacion incremental
        cal.ajustar(pred, cuant, obs + 4.0, olvido=0.5)
        medio = float(np.mean(cal.nudos_y - antes))
        self.assertTrue(1.0 < medio < 3.0)                                        # se mueve a medio camino del lote nuevo
        cal2 = Calibrador.desde_dict(cal.a_dict())
        np.testing.assert_allclose(cal2.aplicar(pred, cuant)[0], cal.aplicar(pred, cuant)[0])

    def test_onnx_igual_a_pytorch(self):
        torch.manual_seed(0)
        m = KharisNet(10, 3, 4, 7, canales=16, bloques=3).eval()
        tmp = Path(tempfile.mkdtemp())
        try:
            info = V.exportar_onnx(m, 10, 24, tmp / "k.onnx", tol=1e-4, meta={"prueba": "si"})
            self.assertTrue(info["verificacion_ok"], info)
            self.assertEqual(info["entradas"], ["clima_ventana", "climatologia_futura"])
            self.assertEqual(info["salidas"], ["prediccion", "cuantiles"])
            self.assertEqual({c["seq_len"] for c in info["casos"]}, {24, 43, 12})   # eje seq_len dinamico
            self.assertEqual({c["batch_size"] for c in info["casos"]}, {1, 2, 3, 4})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_muestreo_conserva_la_media(self):
        """Sortear de los cuantiles no debe inflar la media: la lluvia muestreada promedia lo que dice la media calibrada."""
        obj = ["T2M_MAX", "T2M_MIN", "T2M", "PRECTOTCORR", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN"]
        niv = np.array([0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99])
        q = np.array([[28, 29, 30, 31, 32, 32.5, 33.5], [18, 19, 20, 21, 21.8, 22.2, 23], [23.4, 24.3, 25, 25.7, 26.3, 26.7, 27.4],
                      [0, 0, 1.5, 7, 18, 28, 65], [0.8, 1.3, 1.8, 2.4, 3.1, 3.6, 4.8], [62, 70, 76, 81, 85, 87, 90],
                      [9, 14, 18, 21, 23, 24, 25.5]], dtype=np.float32)
        n = 40000
        cuant = np.broadcast_to(q, (n, 1, 7, 7)).copy()
        pred = np.broadcast_to(np.array([30.2, 19.9, 25.1, 6.0, 1.9, 75.5, 17.6], dtype=np.float32), (n, 1, 7)).copy()
        u = np.random.default_rng(3).uniform(size=(n, 1, 7))
        cruda = F.acoplar_fisica(TE._muestrear(cuant, niv, u), obj).mean(axis=(0, 1))
        buena = TE._muestrear_sin_sesgo(pred, cuant, niv, u, obj).mean(axis=(0, 1))
        self.assertGreater(cruda[3], 1.10 * 6.0)                                  # el defecto: la lluvia cruda sale inflada
        np.testing.assert_allclose(buena, pred[0, 0], rtol=0.02, atol=0.03)       # corregido: coincide con la media
        np.testing.assert_allclose(TE._media_muestreo(cuant, niv, obj)[0, 0], cruda, rtol=0.02, atol=0.03)   # formula exacta


# =========================================================================== sin fuga temporal
class PruebasMezcla(unittest.TestCase):
    """Mezcla con la climatologia por horizonte (train_eval.mezclar)."""

    @classmethod
    def setUpClass(cls):
        df, _ = D.limpiar(datos_sinteticos(2))
        cfg = cfg_chica()
        cls.ctx = TE.preparar_contexto(D.panel_desde_df(df, inicio=cfg.inicio_datos), cfg, seleccionar_dispositivo("cpu"))
        P, H, V, Q = len(cls.ctx.panel.puntos), cfg.horizonte, len(cfg.objetivos), len(cfg.cuantiles)
        rng = np.random.default_rng(0)
        cls.pred = rng.normal(size=(5, H, V)).astype(np.float32)
        cls.cuant = np.sort(rng.normal(size=(5, H, V, Q)), axis=-1).astype(np.float32)
        cls.p = np.arange(5) % P
        cls.doy = np.tile(np.arange(100, 100 + H), (5, 1))

    def _con_pesos(self, w):
        H, V = self.pred.shape[1:]
        self.ctx.cfg.mezcla_media = [[w] * V for _ in range(H)]
        self.ctx.cfg.mezcla_cuantiles = [[w] * V for _ in range(H)]
        return TE.mezclar(self.ctx, self.pred, self.cuant, self.p, self.doy)

    def test_extremos_de_la_mezcla(self):
        pr, cu = self._con_pesos(1.0)                                              # w = 1: la red sola
        np.testing.assert_allclose(pr, self.pred, atol=1e-6)
        np.testing.assert_allclose(cu, self.cuant, atol=1e-6)
        pr, cu = self._con_pesos(0.0)                                              # w = 0: la climatologia
        np.testing.assert_allclose(pr, self.ctx.lb.media[self.p[:, None], self.doy], atol=1e-5)
        np.testing.assert_allclose(cu, self.ctx.clim_q[self.p[:, None], self.doy], atol=1e-5)

    def test_cuantiles_siguen_ordenados(self):
        _, cu = self._con_pesos(0.4)
        self.assertTrue((np.diff(cu, axis=-1) >= -1e-6).all())

    def test_enso_solo_temperaturas_y_hasta_seis_meses(self):
        from kharis import enso as ENSO
        g = self.ctx.enso_g
        self.assertEqual(g.shape[-1], self.ctx.cfg.enso_meses_max)
        for j, v in enumerate(self.ctx.cfg.objetivos):
            if v not in self.ctx.cfg.enso_variables:
                self.assertTrue((g[:, j] == 0).all(), v)
        fechas = pd.date_range("2021-01-01", "2022-03-31")
        a = ENSO.anomalia_diaria(g, 1.5, pd.Timestamp("2020-12-31"), fechas)
        self.assertTrue((a[:, fechas >= "2021-07-01"] == 0).all())               # mas alla de 6 meses: nada
        self.assertTrue((ENSO.anomalia_diaria(g, float("nan"), pd.Timestamp("2020-12-31"), fechas) == 0).all())

    def test_cuantiles_climatologicos_coinciden_con_numpy(self):
        ctx = self.ctx
        j = ctx.cfg.objetivos.index("PRECTOTCORR")
        val = ctx.panel.valores[0, : ctx.t_train_fin + 1, ctx.panel.idx("PRECTOTCORR")].astype(np.float64)
        doy = ctx.panel.fechas[: ctx.t_train_fin + 1].dayofyear.to_numpy() - 1
        dist = np.minimum(np.abs(doy - 200), 366 - np.abs(doy - 200))
        esperado = np.nanquantile(val[dist <= 15], ctx.cfg.cuantiles)
        np.testing.assert_allclose(ctx.clim_q[0, 200, j], esperado, rtol=1e-5, atol=1e-5)


class PruebasSinFuga(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dev = seleccionar_dispositivo("cpu")
        cls.df, _ = D.limpiar(datos_sinteticos(2))

    def _ctx(self, df):
        cfg = cfg_chica()
        return TE.preparar_contexto(D.panel_desde_df(df, inicio=cfg.inicio_datos), cfg, self.dev)

    def test_escalado_y_linea_base_no_ven_el_futuro(self):
        a = self._ctx(self.df)
        df2 = self.df.copy()
        fut = df2["fecha"] > pd.Timestamp(a.cfg.fin_entrenamiento)
        df2.loc[fut, "T2M_MAX"] += 15.0                                           # se altera SOLO el periodo de backtesting
        df2.loc[fut, "PRECTOTCORR"] *= 4.0
        b = self._ctx(df2)
        np.testing.assert_array_equal(a.esc.media_x, b.esc.media_x)
        np.testing.assert_array_equal(a.esc.std_x, b.esc.std_x)
        np.testing.assert_array_equal(a.lb.media, b.lb.media)
        np.testing.assert_array_equal(a.lb.media_esc, b.lb.media_esc)
        np.testing.assert_array_equal(a.clim_q, b.clim_q)                       # cuantiles de la mezcla: solo periodo base
        self.assertIsNotNone(a.enso_g)
        np.testing.assert_array_equal(a.enso_g, b.enso_g)                       # respuesta a El Nino: solo periodo base
        for k in a.lb.pct:
            np.testing.assert_array_equal(a.lb.pct[k], b.lb.pct[k])

    def test_features_causales(self):
        a = self._ctx(self.df)
        t = a.t_train_fin + 300        # despues del entrenamiento: linea base y escalado no cambian
        df2 = self.df.copy()
        df2.loc[df2["fecha"] > a.panel.fechas[t], ["T2M_MAX", "T2M_MIN", "T2M", "PRECTOTCORR", "RH2M", "WS2M", "WS2M_MAX"]] = 1.0
        b = self._ctx(df2)
        xa, xb = a.vent.X[:, : t + 1].numpy(), b.vent.X[:, : t + 1].numpy()
        np.testing.assert_allclose(xa, xb, atol=1e-5)                             # lo de antes de t no cambia

    def test_ventanas_alineadas(self):
        a = self._ctx(self.df)
        p, t = a.vent.origenes(a.t_bt_ini, a.t_bt_fin)
        self.assertTrue((t + 1 >= a.t_bt_ini).all() and (t + a.cfg.horizonte <= a.t_bt_fin).all())
        pt, tt = TE.a_tensor(a, p[:5], t[:5])
        x, y, base = a.vent.lote(pt, tt)
        self.assertEqual(tuple(x.shape), (5, a.cfg.seq_len, a.n_features))
        torch.testing.assert_close(x[0, -1], a.vent.X[p[0], t[0]])                # la entrada termina en t
        torch.testing.assert_close(y[0, 0], a.vent.Y[p[0], t[0] + 1], equal_nan=True)   # el objetivo empieza en t+1
        doy = a.panel.fechas[t[0] + 1].dayofyear - 1
        np.testing.assert_allclose(base[0, 0].numpy(), a.lb.media_esc[p[0], doy])
        sin_reservados = np.zeros(len(a.panel.fechas), dtype=bool)
        sin_reservados[a.t_bt_ini: a.t_bt_ini + 30] = True
        p2, t2 = a.vent.origenes(0, a.t_bt_fin, sin_reservados)
        self.assertFalse(((t2 + a.cfg.horizonte >= a.t_bt_ini) & (t2 + 1 < a.t_bt_ini + 30)).any())

    def test_escalador_invertible(self):
        a = self._ctx(self.df)
        fis = a.panel.valores[:, 100:400][:, :, a.ix_obj]
        np.testing.assert_allclose(a.esc.y_inv(a.esc.y(fis)), fis, rtol=1e-3, atol=1e-3, equal_nan=True)


# =========================================================================== flujo completo, datos nuevos y rollback
class PruebasFlujo(unittest.TestCase):
    """Entrena una vez con datos hasta 2025 y luego simula la llegada de datos nuevos (2026)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.dev = seleccionar_dispositivo("cpu")
        cls.df, _ = D.limpiar(datos_sinteticos(3))
        cls.cfg = cfg_chica()
        viejo = cls.df[cls.df["fecha"] <= "2025-12-31"]
        cls.ctx = TE.preparar_contexto(D.panel_desde_df(viejo, inicio=cls.cfg.inicio_datos), cls.cfg, cls.dev)
        cls.modelo, cls.historial = TE.entrenar(cls.ctx)
        p, t = cls.ctx.vent.origenes(cls.ctx.t_val_ini, cls.ctx.t_train_fin)
        r = TE.predecir(cls.modelo, cls.ctx, p, t)
        met = TE.calcular_metricas(*TE.calibrar(r, None, cls.cfg.objetivos), r, cls.ctx)
        cal = Calibrador(cls.cfg.cuantiles, cls.cfg.calib_bins, cls.cfg.calib_min_muestras).ajustar(r["pred"], r["cuant"], r["obs"])
        meta = {"mae_ref": {v: m["MAE"] for v, m in met.items()}, "rmse_ref": {v: m["RMSE"] for v, m in met.items()},
                "datos_hasta": str(cls.ctx.panel.fechas[cls.ctx.t_train_fin].date())}
        cls.base = TE.crear_paquete(cls.modelo, cls.ctx, cal, TE.referencia_senales(cls.ctx), meta)
        cls.registro = K.Registro(cls.tmp / "artefactos")
        cls.registro.guardar(cls.base, {}, motivo="base")
        cls.bt = TE.backtesting(cls.ctx, cls.base, cls.registro)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_entrenamiento_aprende(self):
        self.assertLess(self.historial[-1]["train_loss"], self.historial[0]["train_loss"])
        self.assertTrue(all(np.isfinite(h["val_loss"]) for h in self.historial))

    def test_backtest_walk_forward_sin_fuga(self):
        pasos = self.bt["pasos"]
        self.assertEqual([p["lote_desde"][:4] for p in pasos], ["2021", "2022", "2023", "2024", "2025"])
        d = self.registro.listar()
        self.assertEqual(len(d["versiones"]), 6)                                  # base + un paso por anio
        hasta = [v["datos_hasta"] for v in d["versiones"]]
        self.assertEqual(hasta, sorted(hasta))                                    # cada version solo sabe hasta su fecha
        for v in self.cfg.objetivos:
            m = self.bt["metricas_despues"][v]
            self.assertTrue(np.isfinite(m["MAE"]) and m["n"] > 1000)
        # las temperaturas deben ganarle a la climatologia fuera de muestra, aun con un modelo diminuto
        self.assertGreater(self.bt["metricas_despues"]["T2M"]["skill_vs_climatologia"], 0.0)

    def test_estres_marca_muestra_y_sin_datos(self):
        ev = {e["evento"]: e for e in TE.pruebas_estres(self.ctx, self.base, self.bt)}
        self.assertEqual(ev["Super El Nino 1982"]["estado"], "sin_datos")         # los datos empiezan en 1996
        self.assertTrue(ev["Huracan Mitch 1998"]["en_muestra"])
        self.assertFalse(ev["El Nino 2023"]["en_muestra"])
        self.assertIn("tasa_fallo_banda", ev["El Nino 2023"]["metricas"]["PRECTOTCORR"])

    def test_pronostico_y_contrato_de_salida(self):
        pron = TE.pronosticar(self.ctx, self.bt["paquete_final"])
        cd, fd, sn = pron["clima_diario"], pron["fisica_diaria"], pron["senales"]
        self.assertEqual(cd["fecha"].min(), self.ctx.panel.fechas[-1] + pd.Timedelta(days=1))   # empieza al dia siguiente
        self.assertEqual(len(cd), 3 * self.cfg.dias_pronostico)
        for v in self.cfg.objetivos:
            self.assertTrue((cd[f"{v}_p10"] <= cd[f"{v}_p50"] + 1e-6).all() and (cd[f"{v}_p50"] <= cd[f"{v}_p90"] + 1e-6).all())
        self.assertTrue((cd["PRECTOTCORR"] >= 0).all() and (cd["RH2M"] <= 100).all())
        self.assertTrue((cd["T2M_MIN"] <= cd["T2M_MAX"] + 1e-6).all())
        self.assertTrue({"t_media", "gdd", "gdd_acum", "ra", "et0", "etc", "reserva", "deficit", "exceso", "ks",
                         "dias_secos_consec", "prob_lluvia_intensa", "prob_dia_calor_floracion"} <= set(fd.columns))
        for k in C.PATRONES:
            self.assertTrue({f"{k}_valor", f"{k}_activo", f"{k}_prob"} <= set(sn.columns), k)
        self.assertTrue(((sn["P1_prob"] >= 0) & (sn["P1_prob"] <= 1)).all())

    def test_prueba_congelada_no_ve_el_futuro(self):
        """La proyeccion libre desde el fin del entrenamiento no cambia aunque se altere todo lo posterior."""
        cols = ["T2M_MAX", "T2M_MIN", "T2M", "PRECTOTCORR", "RH2M", "WS2M", "WS2M_MAX", "ALLSKY_SFC_SW_DWN", "oni", "precipitation", "NDVI"]
        a = TE.pronosticar(self.ctx, self.base, dias=45, miembros=3, t_base=self.ctx.t_train_fin, con_fisica=False)["arr_media"]
        df2 = self.df[self.df["fecha"] <= "2025-12-31"].copy()
        df2.loc[df2["fecha"] > self.ctx.panel.fechas[self.ctx.t_train_fin], cols] = 5.0
        ctx2 = TE.preparar_contexto(D.panel_desde_df(df2, inicio=self.cfg.inicio_datos), C.KharisConfig.desde_dict(self.base["cfg"]),
                                    self.dev, self.base)
        b = TE.pronosticar(ctx2, self.base, dias=45, miembros=3, t_base=ctx2.t_train_fin, con_fisica=False)["arr_media"]
        np.testing.assert_allclose(a, b, rtol=1e-5, atol=1e-5)
        pr = TE.prueba_congelada(self.ctx, self.base, self.bt, miembros=2)
        self.assertEqual(pr["entrenado_hasta"], "2020-12-31")
        self.assertEqual(pr["desde"], "2021-01-01")
        self.assertTrue({"a_1_dia", pr["modo_largo"], "libre_mensual", "libre_diario"} <= {f["modo"] for f in pr["filas"]})
        self.assertEqual(len(pr["tabla"]), 3 * (self.ctx.t_bt_fin - self.ctx.t_bt_ini + 1))
        uno = next(f for f in pr["filas"] if f["modo"] == "a_1_dia" and f["variable"] == "T2M" and f["periodo"] == pr["periodo"])
        self.assertGreater(uno["skill_vs_climatologia"], 0.0)                    # a 1 dia le gana a la climatologia
        self.assertEqual(pr["indice_deriva"], 0.0, [d for d in pr["deriva"] if d["fuera"]])   # la proyeccion libre no deriva
        self.assertEqual(set(pr["cobertura_banda"]), set(self.cfg.objetivos))

    def test_pronostico_largo_no_deriva(self):
        """Pasada la rampa, la media del conjunto es la climatologia del punto mas la anomalia esperada por El Nino (solo
        temperaturas, hasta 6 meses) y la dispersion es la climatologica; sin ancla se apartan."""
        from kharis import enso as ENSO
        ctx, n = self.ctx, 240
        tb = ctx.t_train_fin
        fechas = ctx.panel.fechas[tb + 1: tb + 1 + n]
        clim = ctx.lb.media[:, fechas.dayofyear.to_numpy() - 1]
        oni = ctx.panel.valores[:, : tb + 1, ctx.panel.idx("oni")]
        oni_ult = np.nanmean([s[np.isfinite(s)][-1] for s in oni if np.isfinite(s).any()])
        anom = ENSO.anomalia_diaria(ctx.enso_g, float(oni_ult), ctx.panel.fechas[tb], fechas)
        self.assertTrue((anom[:, fechas >= ctx.panel.fechas[tb] + pd.DateOffset(months=7)] == 0).all())   # despues, pura climatologia
        clim = clim + anom
        r_con = TE.pronosticar(ctx, self.base, dias=n, miembros=6, t_base=tb, con_fisica=False)
        r_sin = TE.pronosticar(ctx, self.base, dias=n, miembros=6, t_base=tb, con_fisica=False, anclar=False)
        con, sin = r_con["arr_media"], r_sin["arr_media"]
        d0 = self.cfg.ancla_inicio_dias + self.cfg.ancla_rampa_dias + self.cfg.horizonte
        for v in ("T2M_MAX", "T2M_MIN", "T2M", "RH2M", "PRECTOTCORR"):
            j = self.cfg.objetivos.index(v)
            e_con = np.abs((con[:, d0:, j] - clim[:, d0:, j]).mean(axis=1)).max()
            e_sin = np.abs((sin[:, d0:, j] - clim[:, d0:, j]).mean(axis=1)).max()
            self.assertLess(e_con, 0.05 * max(1.0, float(clim[:, d0:, j].mean())) if v == "PRECTOTCORR" else 0.05, (v, e_con))
            self.assertLessEqual(e_con, e_sin + 1e-6, v)
        np.testing.assert_allclose(con[:, : self.cfg.horizonte], sin[:, : self.cfg.horizonte])   # el primer bloque no se toca
        # dispersion: los miembros no se separan mas (ni menos) de lo que varia el clima real de ese punto
        doy = ctx.panel.fechas[tb + 1: tb + 1 + n].dayofyear.to_numpy() - 1
        for v in ("T2M_MAX", "T2M_MIN", "RH2M"):
            j = self.cfg.objetivos.index(v)
            m = r_con["arr_miembros"][:, :, d0:, j].astype(np.float64)            # [P, M, dias]
            s_conj = np.sqrt(((m - m.mean(axis=1, keepdims=True)) ** 2).sum(axis=1).mean() / (m.shape[1] - 1))
            s_clim = float(ctx.lb.std[:, doy[d0:], j].mean())
            self.assertTrue(0.85 < s_conj / s_clim < 1.15, (v, s_conj, s_clim))

    def test_pronostico_reproducible(self):
        a = TE.pronosticar(self.ctx, self.base)["clima_diario"]
        b = TE.pronosticar(self.ctx, self.base)["clima_diario"]
        pd.testing.assert_frame_equal(a, b)

    def test_datos_nuevos_actualizan_y_rollback(self):
        reg = K.Registro(self.tmp / "operativo")
        reg.guardar(self.bt["paquete_final"], {}, motivo="estado al 2025")
        paquete = reg.cargar()
        ctx2 = TE.preparar_contexto(D.panel_desde_df(self.df, inicio=self.cfg.inicio_datos), C.KharisConfig.desde_dict(paquete["cfg"]),
                                    self.dev, paquete)
        nuevo, info = K.actualizar_con_datos_nuevos(ctx2, reg)                    # llegan los dias de 2026
        self.assertEqual(info["lote_desde"], "2026-01-01")
        self.assertEqual(nuevo["meta"]["datos_hasta"], "2026-06-30")
        self.assertEqual(reg.listar()["activa"], "v002")
        self.assertIn("psi", info["deriva"])
        self.assertIn("podadas", info["poda"])
        _, info2 = K.actualizar_con_datos_nuevos(ctx2, reg)                       # sin dias nuevos: no hace nada
        self.assertIsNone(info2)
        self.assertEqual(len(reg.listar()["versiones"]), 2)
        reg.rollback("v001")                                                      # rollback manual
        self.assertEqual(reg.listar()["activa"], "v001")
        self.assertEqual(reg.cargar()["meta"]["datos_hasta"], "2025-12-31")
        pron = TE.pronosticar(ctx2, nuevo, dias=10, miembros=2)                   # la version nueva pronostica desde julio 2026
        self.assertEqual(str(pron["clima_diario"]["fecha"].min().date()), "2026-07-01")

    def test_lote_corto_se_acumula(self):
        """Pocos dias nuevos: no se crea version ni se pierden. El pronostico parte de ellos y entran en el lote siguiente."""
        reg = K.Registro(self.tmp / "corto")
        reg.guardar(self.bt["paquete_final"], {}, motivo="estado al 2025")
        paquete = reg.cargar()
        cfg = C.KharisConfig.desde_dict(paquete["cfg"])
        poco = self.df[self.df["fecha"] <= "2026-01-20"]
        ctx_a = TE.preparar_contexto(D.panel_desde_df(poco, inicio=self.cfg.inicio_datos), cfg, self.dev, paquete)
        igual, info = K.actualizar_con_datos_nuevos(ctx_a, reg)                   # llegan 20 dias
        self.assertIsNone(info)
        self.assertEqual(len(reg.listar()["versiones"]), 1)
        self.assertEqual(igual["meta"]["datos_hasta"], "2025-12-31")
        pron = TE.pronosticar(ctx_a, igual, dias=10, miembros=2)                  # pero el pronostico ya usa esos 20 dias
        self.assertEqual(str(pron["clima_diario"]["fecha"].min().date()), "2026-01-21")
        ctx_b = TE.preparar_contexto(D.panel_desde_df(self.df, inicio=self.cfg.inicio_datos), cfg, self.dev, paquete)
        _, info = K.actualizar_con_datos_nuevos(ctx_b, reg)                       # llega el resto: el lote incluye los 20 dias
        self.assertEqual(info["lote_desde"], "2026-01-01")
        self.assertEqual(reg.listar()["activa"], "v002")

    def test_rollback_automatico_si_empeora(self):
        """Con una tolerancia imposible, la candidata siempre pierde y los pesos se quedan como estaban."""
        cfg = C.KharisConfig.desde_dict({**self.base["cfg"], "tolerancia_rollback": 0.0})
        ctx = TE.preparar_contexto(self.ctx.panel, cfg, self.dev, self.base)
        nuevo, info = K.actualizar_incremental(ctx, self.base, ctx.t_bt_ini, ctx.panel.t("2021-12-31"))
        self.assertFalse(info["pesos_aceptados"] or info["calibracion_aceptada"])
        self.assertTrue(info["rollback_automatico"])
        for k, v in self.base["estado"].items():
            torch.testing.assert_close(nuevo["estado"][k], v)


# =========================================================================== reproducibilidad
class PruebasReproducibilidad(unittest.TestCase):
    def _entrenar(self, dispositivo):
        df, _ = D.limpiar(datos_sinteticos(2, "2022-12-31"))
        cfg = cfg_chica(dispositivo=dispositivo, epocas=2, pasos_por_epoca=15)
        dev = seleccionar_dispositivo(dispositivo)
        ctx = TE.preparar_contexto(D.panel_desde_df(df, inicio=cfg.inicio_datos), cfg, dev)
        modelo, hist = TE.entrenar(ctx)
        p, t = ctx.vent.origenes(ctx.t_val_ini, ctx.t_train_fin)
        return [h["val_loss"] for h in hist], TE.predecir(modelo, ctx, p[:200], t[:200])["pred"]

    def test_misma_semilla_mismo_resultado_cpu(self):
        (a, pa), (b, pb) = self._entrenar("cpu"), self._entrenar("cpu")
        self.assertEqual(a, b)
        np.testing.assert_array_equal(pa, pb)

    @unittest.skipUnless(torch.cuda.is_available(), "sin GPU CUDA")
    def test_misma_semilla_mismo_resultado_gpu(self):
        (a, pa), (b, pb) = self._entrenar("cuda"), self._entrenar("cuda")
        np.testing.assert_allclose(a, b, rtol=2e-3)
        np.testing.assert_allclose(pa, pb, rtol=0.02, atol=0.05)


if __name__ == "__main__":
    unittest.main(verbosity=2)
