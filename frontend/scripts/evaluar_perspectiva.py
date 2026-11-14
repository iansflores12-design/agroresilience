#!/usr/bin/env python3
"""Evaluacion honesta de la perspectiva de lluvia: se quita una parte de los datos y se predice.

Solo biblioteca estandar. Uso:
    python3 -I evaluar_perspectiva.py [--datos CARPETA_DATA]

1. Retencion: tercios y analogos salen SOLO del entrenamiento; se predice el resto.
   Dos cortes: 1981-2009 vs 2010-2025 y 1981-2000 vs 2001-2025.
2. Predictores A (ONI actual), B (ONI de los 3 trimestres previos al inicio de la temporada)
   y C (B mas lluvia de los 90 dias previos). Se elige con validacion cruzada dentro del
   entrenamiento y despues se prueba en el resto.
3. Simulacion de ruido puro para medir falsos positivos de `usable`.
4. Otro horizonte: lluvia de los ultimos 30 dias vs los siguientes 30 dias.
"""
import argparse
import random
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # necesario con python3 -I

import generar_perspectiva as g  # noqa: E402

SEMILLA = 20261114
REMUESTREOS = 1000
TRIM_REF_A = "ASO"                       # igual que el metodo publicado
TRIM_PREVIOS = {"primera": ("DJF", "JFM", "FMA"), "postrera": ("AMJ", "MJJ", "JJA")}
DIAS_LLUVIA_PREVIA = 90
PREDICTORES = ("A", "B", "C")
ANIO_INICIO = 1981
# (inicio entrenamiento, fin entrenamiento, fin prueba). El tercero es un diagnostico extra:
# entrena solo con el periodo posterior al salto de nivel de la lluvia de POWER (~1998).
CORTES = ((1981, 2009, 2025), (1981, 2000, 2025), (1998, 2012, 2025))
Z_ANTIGUO = 1.28                         # regla de `usable` antes del endurecimiento


# ---------- predictores ----------

def feats_a(oni, y):
    """A: ONI y tendencia del trimestre de referencia del anio anterior (como el metodo publicado)."""
    return g.predictor(oni, g.indice_trimestre(y - 1, TRIM_REF_A))


def feats_b(oni, tipo, y):
    """B: (promedio ONI de los 3 trimestres previos al inicio, ese promedio menos el de 3 trimestres antes)."""
    idx = [g.indice_trimestre(y, t) for t in TRIM_PREVIOS[tipo]]
    act = [oni.get(i) for i in idx]
    ant = [oni.get(i - g.DESFASE_TENDENCIA) for i in idx]
    if None in act or None in ant:
        return None
    m = statistics.fmean(act)
    return m, m - statistics.fmean(ant)


def lluvia_previa(serie, tipo, y):
    """Total de lluvia (mm) de los 90 dias anteriores al inicio de la temporada; None si falta dato."""
    ini, _ = g.limites_temporada(tipo, y)
    vals = [serie[ini - timedelta(days=i)] for i in range(1, DIAS_LLUVIA_PREVIA + 1)
            if ini - timedelta(days=i) in serie]
    if len(vals) < g.MIN_COBERTURA * DIAS_LLUVIA_PREVIA:
        return None
    return sum(vals)


def preparar(series, oni):
    """{(zona, tipo): {"totales": {...}, "feats": {"A": {...}, "B": {...}, "C": {...}}}}."""
    prep = {}
    for zona, serie in series.items():
        for tipo in g.TEMPORADAS:
            tot = g.totales_por_anio(serie, tipo)
            fa, fb, fc = {}, {}, {}
            for y in tot:
                a, b, ll = feats_a(oni, y), feats_b(oni, tipo, y), lluvia_previa(serie, tipo, y)
                if a is not None:
                    fa[y] = a
                if b is not None:
                    fb[y] = b
                    if ll is not None:
                        fc[y] = b + (ll,)
            prep[(zona, tipo)] = {"totales": tot, "feats": {"A": fa, "B": fb, "C": fc}}
    return prep


# ---------- evaluacion de un corte ----------

def evaluar_corte(prep, pid, fin_ent, fin_prueba, ini_ent=ANIO_INICIO):
    """Por serie: aciertos, linea base, RPSS y detalle por anio, entrenando solo hasta fin_ent."""
    out = {}
    for clave, d in prep.items():
        tot, f = d["totales"], d["feats"][pid]
        ajuste = [a for a in tot if ini_ent <= a <= fin_ent and a in f]
        prueba = [a for a in sorted(tot) if fin_ent < a <= fin_prueba and a in f]
        res = g.predecir_anios(tot, f, ajuste, prueba)
        um = g.tercios([tot[a] for a in ajuste])
        cuenta = {c: 0 for c in g.CLASES}
        for a in ajuste:
            cuenta[g.clasificar(tot[a], um)] += 1
        clase_clim = g.clase_mas_probable(cuenta)
        clim = {c: 1 / 3 for c in g.CLASES}
        hits = {y: int(g.clase_mas_probable(p) == r) for y, (p, r) in res.items()}
        out[clave] = {
            "n": len(res), "nEntrena": len(ajuste),
            "acc": statistics.fmean(hits.values()) if hits else None,
            "normal": statistics.fmean(int(r == "normal") for _, r in res.values()) if res else None,
            "clim": statistics.fmean(int(r == clase_clim) for _, r in res.values()) if res else None,
            "persist": statistics.fmean(
                int(g.clasificar(tot[y - 1], um) == r) for y, (_, r) in res.items() if y - 1 in tot
            ) if any(y - 1 in tot for y in res) else None,
            "rpss": g.rpss(res),
            "hits": hits,
            "hn": {y: int(r == "normal") for y, (_, r) in res.items()},
            "hc": {y: int(r == clase_clim) for y, (_, r) in res.items()},
            "rps": {y: g.rps(p, r) for y, (p, r) in res.items()},
            "rps0": {y: g.rps(clim, r) for y, (_, r) in res.items()},
        }
    return out


def _media(vals):
    vals = [v for v in vals if v is not None]
    return statistics.fmean(vals) if vals else None


def bootstrap(out, claves, remuestreos=REMUESTREOS, semilla=SEMILLA):
    """Bootstrap de anios (los mismos anios remuestreados para todas las series).

    Devuelve {estadistico: (estimado, p5, p95)} para: dif. de aciertos contra 1/3, contra la
    climatologia de entrenamiento y RPSS agregado.
    """
    anios = sorted({y for c in claves for y in out[c]["hits"]})
    if not anios:
        return {}

    def estad(muestra):
        d_azar, d_clim, num, den = [], [], [], []
        for c in claves:
            o = out[c]
            ys = [y for y in muestra if y in o["hits"]]
            if not ys:
                continue
            acc = statistics.fmean(o["hits"][y] for y in ys)
            d_azar.append(acc - 1 / 3)
            d_clim.append(acc - statistics.fmean(o["hc"][y] for y in ys))
            num.append(statistics.fmean(o["rps"][y] for y in ys))
            den.append(statistics.fmean(o["rps0"][y] for y in ys))
        return (statistics.fmean(d_azar), statistics.fmean(d_clim),
                1 - statistics.fmean(num) / statistics.fmean(den))

    rnd = random.Random(semilla)
    muestras = [estad([rnd.choice(anios) for _ in anios]) for _ in range(remuestreos)]
    res = {}
    for i, nombre in enumerate(("acc_vs_azar", "acc_vs_clim", "rpss")):
        v = sorted(m[i] for m in muestras)
        res[nombre] = (estad(anios)[i], v[round(0.05 * remuestreos)], v[round(0.95 * remuestreos) - 1])
    return res


def series_identicas(series):
    """Grupos de zonas con la serie de lluvia exactamente igual."""
    grupos = {}
    for z, s in series.items():
        grupos.setdefault(tuple(sorted(s.items())), []).append(z)
    return [sorted(v) for v in grupos.values()]


def correlacion_maxima(prep):
    """Pares de zonas no identicas con mayor correlacion de totales anuales (primera)."""
    zonas = sorted({z for z, _ in prep})
    pares = []
    for i, a in enumerate(zonas):
        for b in zonas[i + 1:]:
            ta, tb = prep[(a, "primera")]["totales"], prep[(b, "primera")]["totales"]
            ys = sorted(set(ta) & set(tb))
            va, vb = [ta[y] for y in ys], [tb[y] for y in ys]
            ma, mb = statistics.fmean(va), statistics.fmean(vb)
            sa = sum((x - ma) ** 2 for x in va) ** 0.5
            sb = sum((x - mb) ** 2 for x in vb) ** 0.5
            if sa and sb:
                pares.append((sum((x - ma) * (y - mb) for x, y in zip(va, vb)) / (sa * sb), a, b))
    return sorted(pares, reverse=True)


# ---------- seleccion por validacion cruzada dentro del entrenamiento ----------

def validacion_cruzada(prep, fin_ent, ini_ent=ANIO_INICIO):
    """{predictor: (RPSS medio, aciertos medios)} dejando un anio fuera, SOLO con anios de entrenamiento."""
    res = {}
    for pid in PREDICTORES:
        rp, ac = [], []
        for d in prep.values():
            loo = g.dejar_uno_fuera(d["totales"], d["feats"][pid], anios=[a for a in d["totales"] if ini_ent <= a <= fin_ent])
            rp.append(g.rpss(loo))
            ac.append(g.tasa_aciertos(loo))
        res[pid] = (_media(rp), _media(ac))
    return res


# ---------- simulacion de ruido y senal (para `usable`) ----------

def regla_antigua(aciertos, n):
    """`usable` antes del endurecimiento: solo aciertos con z = 1.28."""
    return n >= g.MIN_ANIOS_PRUEBA and aciertos - 1 / 3 >= Z_ANTIGUO * (1 / 3 * 2 / 3 / n) ** 0.5


def simular(feats, anios, senal, n_series=200, semilla=SEMILLA):
    """Genera `n_series` series anuales y mide cuantas pasan la regla antigua y la nueva.

    totales = -senal * (primera variable estandarizada) + ruido N(0,1). senal=0 es ruido puro.
    Devuelve (pasan_antigua, pasan_nueva, n_series).
    """
    rnd = random.Random(semilla)
    o = [feats[a][0] for a in anios]
    m, d = statistics.fmean(o), statistics.pstdev(o) or 1.0
    antigua = nueva = 0
    for _ in range(n_series):
        tot = {a: -senal * (feats[a][0] - m) / d + rnd.gauss(0, 1) for a in anios}
        ev = g.evaluar_serie(tot, feats)
        antigua += regla_antigua(ev["aciertos"], ev["n"])
        nueva += ev["usable"]
    return antigua, nueva, n_series


def feats_sinteticos(oni_real, anios):
    """feats del predictor A con el ONI real (para la simulacion del informe)."""
    return {a: f for a in anios if (f := feats_a(oni_real, a)) is not None}


# ---------- otro horizonte: lluvia de 30 dias pasados vs 30 dias siguientes ----------

def horizonte_30dias(series, fin_ent=2009, fin_prueba=2025, remuestreos=REMUESTREOS, semilla=SEMILLA,
                     ini_ent=ANIO_INICIO):
    """Tabla 2x2 por zona y mes de origen (dia 1): pasado seco/humedo -> siguiente seco/humedo.

    Clases por la mediana de entrenamiento de cada zona y mes. Se compara con la climatologia
    de entrenamiento (probabilidad de 'humedo'). Devuelve dict con BSS y aciertos agregados.
    """
    casos = []   # (anio, p_modelo, p_clim, real, pred_clase, clase_clim)
    for serie in series.values():
        for mes in range(1, 13):
            filas = {}
            for y in range(min(serie).year + 1, max(serie).year + 1):
                t = date(y, mes, 1)
                pas = [serie[t - timedelta(days=i)] for i in range(1, 31) if t - timedelta(days=i) in serie]
                sig = [serie[t + timedelta(days=i)] for i in range(30) if t + timedelta(days=i) in serie]
                if len(pas) >= 27 and len(sig) >= 27:
                    filas[y] = (sum(pas), sum(sig))
            ent = {y: v for y, v in filas.items() if ini_ent <= y <= fin_ent}
            if len(ent) < 12:
                continue
            mp = statistics.median(v[0] for v in ent.values())
            ms = statistics.median(v[1] for v in ent.values())
            if mp <= 0 or ms <= 0:     # mediana 0: las clases quedan degeneradas
                continue
            tabla = {0: [1, 1], 1: [1, 1]}     # [seco, humedo] con suavizado de Laplace
            for p, s in ent.values():
                tabla[int(p > mp)][int(s > ms)] += 1
            p_clim = (sum(int(s > ms) for _, s in ent.values()) + 1) / (len(ent) + 2)
            for y, (p, s) in filas.items():
                if fin_ent < y <= fin_prueba:
                    c = tabla[int(p > mp)]
                    p_mod = c[1] / (c[0] + c[1])
                    casos.append((y, p_mod, p_clim, int(s > ms)))

    def estad(muestra):
        por = {}
        for k in muestra:
            por[k] = por.get(k, 0) + 1
        bm = bc = am = ac = n = 0.0
        for y, cnt in por.items():
            for (yy, pm, pc, r) in por_anio.get(y, ()):
                bm += cnt * (pm - r) ** 2
                bc += cnt * (pc - r) ** 2
                am += cnt * ((pm > 0.5) == bool(r))
                ac += cnt * ((pc > 0.5) == bool(r))
                n += cnt
        return 1 - bm / bc, (am - ac) / n, am / n, ac / n

    por_anio = {}
    for c in casos:
        por_anio.setdefault(c[0], []).append(c)
    anios = sorted(por_anio)
    rnd = random.Random(semilla)
    muestras = [estad([rnd.choice(anios) for _ in anios]) for _ in range(remuestreos)]
    pto = estad(anios)
    out = {"casos": len(casos), "aciertos_modelo": pto[2], "aciertos_clim": pto[3]}
    for i, nombre in ((0, "bss"), (1, "dif_aciertos")):
        v = sorted(m[i] for m in muestras)
        out[nombre] = (pto[i], v[round(0.05 * remuestreos)], v[round(0.95 * remuestreos) - 1])
    return out


# ---------- informe ----------

def _f(x, d=2):
    return "-" if x is None else f"{x:.{d}f}"


def tabla_corte(out):
    lineas = ["| zona | temporada | n prueba | aciertos | siempre normal | clim. entren. | persistencia | RPSS |",
              "|---|---|---|---|---|---|---|---|"]
    for (z, t), o in sorted(out.items()):
        lineas.append(f"| {z} | {t} | {o['n']} | {_f(o['acc'])} | {_f(o['normal'])} | {_f(o['clim'])} | {_f(o['persist'])} | {_f(o['rpss'], 3)} |")
    return lineas


def resumen_corte(out, claves, etiqueta):
    cl = [c for c in claves if out[c]["n"]]
    bs = bootstrap(out, cl)
    n_rp = sum(out[c]["rpss"] > 0 for c in cl)
    n_ac = sum(out[c]["acc"] > out[c]["clim"] for c in cl)
    n_az = sum(out[c]["acc"] > 1 / 3 for c in cl)
    a, b, r = bs["acc_vs_azar"], bs["acc_vs_clim"], bs["rpss"]
    return (f"{etiqueta}: series={len(cl)}, aciertos medios={_f(_media(out[c]['acc'] for c in cl))}, "
            f"siempre normal={_f(_media(out[c]['normal'] for c in cl))}, clim. entren.={_f(_media(out[c]['clim'] for c in cl))}, "
            f"persistencia={_f(_media(out[c]['persist'] for c in cl))}, "
            f"RPSS medio={_f(_media(out[c]['rpss'] for c in cl), 3)}; "
            f"series con RPSS>0: {n_rp}/{len(cl)}, aciertos>clim. entren.: {n_ac}/{len(cl)}, aciertos>1/3: {n_az}/{len(cl)}; "
            f"bootstrap 90 %: dif. aciertos vs azar {a[0]:+.3f} [{a[1]:+.3f}, {a[2]:+.3f}], "
            f"vs clim. entren. {b[0]:+.3f} [{b[1]:+.3f}, {b[2]:+.3f}], RPSS agregado {r[0]:+.3f} [{r[1]:+.3f}, {r[2]:+.3f}]")


def informe(datos):
    series = g.leer_lluvia(Path(datos) / "processed" / "power_diario_largo.csv")
    oni, _ = g.leer_oni(Path(datos) / "processed" / "oni.csv")
    prep = preparar(series, oni)
    grupos = series_identicas(series)
    duplicadas = [gr for gr in grupos if len(gr) > 1]
    sobrantes = {z for gr in duplicadas for z in gr[1:]}
    todas = sorted(prep)
    indep = [c for c in todas if c[0] not in sobrantes]
    print("## Series de lluvia")
    print(f"zonas: {len(series)}; grupos de series identicas: {duplicadas or 'ninguno'}; "
          f"zonas independientes: {len(series) - len(sobrantes)}")
    cm = correlacion_maxima(prep)[:3]
    print("correlacion mas alta entre zonas distintas (totales primera): "
          + ", ".join(f"{a}-{b} {r:.3f}" for r, a, b in cm))
    for ini, fin_ent, fin_pr in CORTES:
        print(f"\n## Corte entrenamiento {ini}-{fin_ent}, prueba {fin_ent + 1}-{fin_pr}")
        cv = validacion_cruzada(prep, fin_ent, ini)
        elegido = max(PREDICTORES, key=lambda p: cv[p][0])
        print("Validacion cruzada (dejar uno fuera, solo entrenamiento), RPSS medio / aciertos medios:")
        for p in PREDICTORES:
            print(f"  {p}: {_f(cv[p][0], 3)} / {_f(cv[p][1])}")
        print(f"Elegido por validacion cruzada (mayor RPSS medio): {elegido}")
        res = {p: evaluar_corte(prep, p, fin_ent, fin_pr, ini) for p in PREDICTORES}
        for p in sorted({"A", elegido}):
            print(f"\nTabla por zona, predictor {p}:")
            print("\n".join(tabla_corte(res[p])))
        print("\nAgregado (todas las series, y solo zonas independientes):")
        for p in PREDICTORES:
            marca = " (elegido)" if p == elegido else ""
            print(resumen_corte(res[p], todas, f"  {p}{marca} todas"))
            print(resumen_corte(res[p], indep, f"  {p}{marca} independientes"))
            for t in g.TEMPORADAS:
                print(resumen_corte(res[p], [c for c in indep if c[1] == t], f"    {p} {t} independientes"))
    print("\n## Falsos positivos de `usable` con ruido puro (200 series, semilla fija)")
    anios = list(range(1981, 2026))
    feats = feats_sinteticos(oni, anios)
    for senal in (0.0, 0.25, 0.5, 1.0, 2.0):
        ant, nue, n = simular(feats, anios, senal)
        etiqueta = "ruido puro" if senal == 0 else f"senal {senal}"
        print(f"  {etiqueta}: regla antigua {ant}/{n} ({100 * ant / n:.1f} %), regla nueva {nue}/{n} ({100 * nue / n:.1f} %)")
    print("\n## Otro horizonte: lluvia 30 dias pasados vs 30 dias siguientes (POWER, entrena hasta 2009, prueba 2010-2025)")
    for etiqueta, kw in (("entrena 1981-2009, prueba 2010-2025", {}),
                         ("entrena 1998-2012, prueba 2013-2025 (diagnostico)", {"ini_ent": 1998, "fin_ent": 2012})):
        h = horizonte_30dias(series, **kw)
        print(f"  [{etiqueta}] casos={h['casos']}, aciertos modelo={h['aciertos_modelo']:.3f}, aciertos climatologia={h['aciertos_clim']:.3f}, "
              f"dif. aciertos {h['dif_aciertos'][0]:+.3f} [{h['dif_aciertos'][1]:+.3f}, {h['dif_aciertos'][2]:+.3f}], "
              f"BSS vs climatologia {h['bss'][0]:+.4f} [{h['bss'][1]:+.4f}, {h['bss'][2]:+.4f}] (bootstrap 90 %)")
    return 0


def main(argv=None):
    aqui = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--datos", default=str(aqui.parent.parent / "data"))
    return informe(p.parse_args(argv).datos)


if __name__ == "__main__":
    sys.exit(main())
