#!/usr/bin/env python3
"""Perspectiva de lluvia por zona para las dos proximas temporadas (anios analogos segun El Nino).

Solo biblioteca estandar. Uso (desde cualquier carpeta):
    python3 -I generar_perspectiva.py [--datos CARPETA_DATA] [--salida ARCHIVO.json] [--fecha AAAA-MM-DD]

Metodo resumido: se suma la lluvia de cada temporada y anio, se clasifica en tercios
(seco, normal, lluvioso) y se buscan los anios con ONI y tendencia mas parecidos a los
de hoy. La probabilidad sale del conteo de esos anios, suavizado. Una prueba dejando un
anio fuera y un corte de retencion (entrenar 1981-2009, probar 2010-2025) deciden si la
senal es lo bastante buena para publicarse (`usable`).
"""
import argparse
import csv
import json
import math
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

K = 10
MIN_COBERTURA = 0.90          # fraccion minima de dias con dato por temporada
MIN_ANIOS_PRUEBA = 30
Z_USABLE = 2.33               # p < 0.01 unilateral (absorbe las 11 zonas)
CORTE_ENTRENA_FIN = 2009      # retencion: entrena 1981-2009, prueba 2010-2025
CORTE_PRUEBA_FIN = 2025
MIN_ANIOS_RETENCION = 5
PESO_TENDENCIA = 0.5
CLASES = ("seco", "normal", "lluvioso")
TRIMESTRES = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]
UMBRAL_CANICULA_MM = 1.0
DESFASE_TENDENCIA = 3         # trimestres

# (mes inicio, dia inicio, mes fin, dia fin)
TEMPORADAS = {
    "primera": {"inicio": (5, 1), "fin": (8, 31), "nombre": "Primera", "meses": "mayo a agosto"},
    "postrera": {"inicio": (9, 1), "fin": (12, 31), "nombre": "Postrera", "meses": "septiembre a diciembre"},
}

FUENTES = {
    "lluvia": "NASA POWER, comunidad AG, PRECTOTCORR",
    "oni": "NOAA CPC, Oceanic Nino Index",
}
DESCRIPCION = (
    "Se suma la lluvia de cada temporada (primera: mayo a agosto; postrera: septiembre a "
    "diciembre) y se reparte en tres grupos iguales: seco, normal y lluvioso. Se buscan los "
    "10 años cuyo Niño (ONI del mismo trimestre y con el mismo adelanto) y su tendencia más "
    "se parecen a los de hoy; la probabilidad sale de cuántos fueron de cada tipo, más uno "
    "por clase. Se publica solo si, dejando un año fuera, acierta claramente más que el azar "
    "(p<0.01) y mejora a la climatología en puntaje de probabilidad (RPSS), y si además "
    "mejora a la climatología al entrenar con 1981-2009 y probar 2010-2025; si no, se "
    "muestran 1/3 por clase y no se publica una señal."
)


# ---------- funciones puras ----------

def _num(texto):
    """Convierte texto a float; None si esta vacio o no es numero."""
    if texto is None or str(texto).strip() == "":
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def limites_temporada(tipo, anio):
    """(inicio, fin) como date de una temporada de un anio."""
    t = TEMPORADAS[tipo]
    return date(anio, *t["inicio"]), date(anio, *t["fin"])


def total_temporada(serie, tipo, anio, minima=MIN_COBERTURA):
    """Suma de lluvia (mm) de la temporada; None si hay dato en menos de `minima` de sus dias.

    serie: dict {date: mm}. No se reescala: la suma es de los dias con dato.
    """
    ini, fin = limites_temporada(tipo, anio)
    n = (fin - ini).days + 1
    vals = [serie[ini + timedelta(days=i)] for i in range(n) if (ini + timedelta(days=i)) in serie]
    if len(vals) < minima * n:
        return None
    return sum(vals)


def totales_por_anio(serie, tipo):
    """{anio: total_mm} de los anios validos de una temporada."""
    if not serie:
        return {}
    out = {}
    for a in range(min(serie).year, max(serie).year + 1):
        t = total_temporada(serie, tipo, a)
        if t is not None:
            out[a] = t
    return out


def tercios(valores):
    """Umbrales (q1, q2) que reparten `valores` en tres grupos iguales."""
    q = statistics.quantiles(sorted(valores), n=3, method="inclusive")
    return q[0], q[1]


def clasificar(valor, umbrales):
    """'seco' si valor <= q1, 'lluvioso' si valor > q2, si no 'normal'."""
    q1, q2 = umbrales
    if valor <= q1:
        return "seco"
    if valor > q2:
        return "lluvioso"
    return "normal"


def indice_trimestre(anio, trimestre):
    """Posicion absoluta del trimestre (para restar trimestres)."""
    return anio * 12 + TRIMESTRES.index(trimestre)


def fase_oni(valor):
    if valor >= 0.5:
        return "nino"
    if valor <= -0.5:
        return "nina"
    return "neutral"


def predictor(oni, indice):
    """(valor, tendencia) del ONI en `indice`; tendencia = valor menos el de 3 trimestres antes.

    oni: dict {indice_trimestre: valor}. None si falta alguno de los dos.
    """
    a, b = oni.get(indice), oni.get(indice - DESFASE_TENDENCIA)
    if a is None or b is None:
        return None
    return a, a - b


def analogos(objetivo, candidatos, k=K, pesos=None):
    """Los k anios de `candidatos` {anio: (oni, tendencia, ...)} mas cercanos a `objetivo`.

    distancia = |dif ONI| + 0.5 * |dif tendencia| (+ 0.5 * |dif| por cada variable extra,
    ya estandarizada); empates por anio mas reciente.
    """
    if pesos is None:
        pesos = (1.0, PESO_TENDENCIA) + (PESO_TENDENCIA,) * (len(objetivo) - 2)

    def dist(item):
        a, f = item
        return (sum(w * abs(x - o) for w, x, o in zip(pesos, f, objetivo)), -a)
    return [a for a, _ in sorted(candidatos.items(), key=dist)[:k]]


def conteo_clases(anios, clases):
    """Cuenta cuantos de `anios` caen en cada clase (clases: {anio: clase})."""
    c = {x: 0 for x in CLASES}
    for a in anios:
        c[clases[a]] += 1
    return c


def probabilidades(conteo, k=K):
    """Suavizado de Laplace: (cuenta + 1) / (k + 3)."""
    return {c: (conteo[c] + 1) / (k + len(CLASES)) for c in CLASES}


def clase_mas_probable(prob):
    """Clase de mayor probabilidad; en empate gana 'normal' y luego 'seco'."""
    orden = {"normal": 0, "seco": 1, "lluvioso": 2}
    return max(CLASES, key=lambda c: (prob[c], -orden[c]))


def _normalizar(feats, ajuste):
    """Estandariza (z) las variables extra (de la tercera en adelante) con solo los anios de ajuste."""
    n = len(next(iter(feats.values())))
    if n <= 2 or not ajuste:
        return feats
    est = []
    for i in range(2, n):
        vals = [feats[a][i] for a in ajuste]
        m = statistics.fmean(vals)
        d = statistics.pstdev(vals) or 1.0
        est.append((m, d))
    return {a: tuple(f[:2]) + tuple((f[2 + j] - est[j][0]) / est[j][1] for j in range(n - 2))
            for a, f in feats.items()}


def predecir_anios(totales, feats, ajuste, evaluar, k=K):
    """{anio: (prob, clase_real)} para los anios de `evaluar`, usando SOLO los de `ajuste`.

    Los tercios, la estandarizacion y los analogos salen unicamente de `ajuste`.
    totales: {anio: mm}; feats: {anio: (oni, tendencia, ...)}.
    """
    ajuste = [a for a in sorted(ajuste) if a in totales and a in feats]
    if len(ajuste) < 3:
        return {}
    um = tercios([totales[a] for a in ajuste])
    clases = {a: clasificar(totales[a], um) for a in ajuste}
    f = _normalizar(feats, ajuste)
    cand = {a: f[a] for a in ajuste}
    out = {}
    for y in evaluar:
        if y in cand or y not in totales or y not in feats:
            continue
        an = analogos(f[y], cand, k)
        out[y] = (probabilidades(conteo_clases(an, clases), len(an)), clasificar(totales[y], um))
    return out


def dejar_uno_fuera(totales, feats, k=K, anios=None):
    """Prediccion dejando cada anio fuera (tercios y analogos sin el anio probado)."""
    anios = sorted(a for a in (anios if anios is not None else totales) if a in totales and a in feats)
    out = {}
    for y in anios:
        out.update(predecir_anios(totales, feats, [a for a in anios if a != y], [y], k))
    return out


def retencion(totales, feats, fin_entrena=CORTE_ENTRENA_FIN, fin_prueba=CORTE_PRUEBA_FIN, k=K):
    """Entrena con los anios <= fin_entrena y predice los de fin_entrena+1 a fin_prueba."""
    ajuste = [a for a in totales if a <= fin_entrena]
    prueba = [a for a in totales if fin_entrena < a <= fin_prueba]
    return predecir_anios(totales, feats, ajuste, prueba, k)


def rps(prob, real):
    """Ranked probability score de un pronostico (clases ordenadas seco < normal < lluvioso)."""
    acum_p = acum_o = total = 0.0
    for c in CLASES[:-1]:
        acum_p += prob[c]
        acum_o += 1.0 if c == real else 0.0
        total += (acum_p - acum_o) ** 2
    return total


def rpss(resultados):
    """RPSS contra la climatologia (1/3 por clase); None sin datos. >0 mejora a la climatologia."""
    if not resultados:
        return None
    clim = {c: 1 / 3 for c in CLASES}
    num = statistics.fmean(rps(p, r) for p, r in resultados.values())
    den = statistics.fmean(rps(clim, r) for _, r in resultados.values())
    return 1 - num / den


def tasa_aciertos(resultados):
    """Fraccion de anios donde la clase mas probable coincide con la real; None sin datos."""
    if not resultados:
        return None
    return sum(clase_mas_probable(p) == r for p, r in resultados.values()) / len(resultados)


def prueba_hacia_atras(totales, preds, k=K):
    """Dejando un anio fuera: (aciertos, anios_probados)."""
    anios = [a for a in totales if a in preds]
    if len(anios) < 3:
        return 0.0, 0
    res = dejar_uno_fuera(totales, preds, k)
    return tasa_aciertos(res), len(res)


def evaluar_serie(totales, preds, k=K):
    """Todas las pruebas de una serie anual: dejar uno fuera y retencion 1981-2009 / 2010-2025."""
    anios = [a for a in totales if a in preds]
    if len(anios) < 3:
        return {"aciertos": 0.0, "n": 0, "rpss": None, "aciertosRetencion": None,
                "rpssRetencion": None, "nRetencion": 0, "usable": False}
    loo = dejar_uno_fuera(totales, preds, k)
    ret = retencion(totales, preds, k=k)
    ev = {"aciertos": tasa_aciertos(loo), "n": len(loo), "rpss": rpss(loo),
          "aciertosRetencion": tasa_aciertos(ret), "rpssRetencion": rpss(ret),
          "nRetencion": len(ret)}
    ev["usable"] = es_usable(ev["aciertos"], ev["n"], ev["rpss"], ev["rpssRetencion"],
                             ev["nRetencion"])
    return ev


def es_usable(aciertos, n, rpss_loo=None, rpss_retencion=None, n_retencion=MIN_ANIOS_RETENCION):
    """Publicar solo si pasan las tres pruebas:

    (a) aciertos - 1/3 >= 2.33 * sqrt((1/3 * 2/3) / n) y n >= 30,
    (b) RPSS > 0 dejando uno fuera,
    (c) RPSS > 0 en la retencion 1981-2009 vs 2010-2025.
    """
    if n < MIN_ANIOS_PRUEBA or n_retencion < MIN_ANIOS_RETENCION:
        return False
    if rpss_loo is None or rpss_retencion is None:
        return False
    if not aciertos - 1 / 3 >= Z_USABLE * math.sqrt((1 / 3 * 2 / 3) / n):
        return False
    return rpss_loo > 0 and rpss_retencion > 0


def racha_canicula(serie, anio):
    """Racha mas larga de dias seguidos con lluvia < 1 mm entre el 1 de julio y el 31 de agosto.

    None si el anio tiene dato en menos del 90 % de esos dias. Un dia sin dato corta la racha.
    """
    ini, fin = date(anio, 7, 1), date(anio, 8, 31)
    n = (fin - ini).days + 1
    mejor = actual = con_dato = 0
    for i in range(n):
        v = serie.get(ini + timedelta(days=i))
        if v is None:
            actual = 0
            continue
        con_dato += 1
        if v < UMBRAL_CANICULA_MM:
            actual += 1
            mejor = max(mejor, actual)
        else:
            actual = 0
    if con_dato < MIN_COBERTURA * n:
        return None
    return mejor


def proximas_temporadas(fecha, cantidad=2):
    """Las `cantidad` temporadas que EMPIEZAN despues de `fecha`: [(tipo, anio), ...]."""
    out = []
    for a in range(fecha.year, fecha.year + 3):
        for tipo in ("primera", "postrera"):
            if limites_temporada(tipo, a)[0] > fecha:
                out.append((tipo, a))
    return out[:cantidad]


def _mediana_entera(valores):
    return round(statistics.median(valores)) if valores else None


def perspectiva_zona(serie, oni, ref, tipo, anio_obj, k=K):
    """Bloque de una zona para una temporada.

    ref: (anio, trimestre) del ultimo ONI disponible. El predictor de cada anio pasado y es
    el ONI de ese mismo trimestre en el anio y - (anio_obj - ref_anio).
    """
    anio_ref, trim_ref = ref
    totales = totales_por_anio(serie, tipo)
    idx_ref = indice_trimestre(anio_ref, trim_ref)
    objetivo = predictor(oni, idx_ref)
    preds = {}
    for y in totales:
        p = predictor(oni, idx_ref + 12 * (y - anio_obj))
        if p is not None:
            preds[y] = p
    umbrales = tercios(list(totales.values()))
    clases = {a: clasificar(totales[a], umbrales) for a in preds}
    parecidos = analogos(objetivo, preds, k)
    conteo = conteo_clases(parecidos, clases)
    ev = evaluar_serie(totales, preds, k)
    aciertos, n, usable = ev["aciertos"], ev["n"], ev["usable"]
    if usable:
        prob = {c: round(p, 2) for c, p in probabilidades(conteo, len(parecidos)).items()}
    else:
        prob = {c: round(1 / 3, 2) for c in CLASES}
    canicula = None
    if tipo == "primera":
        rachas = {a: racha_canicula(serie, a) for a in range(min(serie).year, max(serie).year + 1)}
        rachas = {a: r for a, r in rachas.items() if r is not None}
        canicula = {
            "normalDias": _mediana_entera(list(rachas.values())),
            "parecidosDias": _mediana_entera([rachas[a] for a in parecidos if a in rachas]),
        }
    return {
        "prob": prob, "conteo": conteo, "aniosParecidos": sorted(parecidos),
        "usable": usable, "aciertos": round(aciertos, 2), "aniosProbados": n,
        "lluviaNormalMm": round(statistics.fmean(totales.values()), 1),
        "canicula": canicula,
        # campos opcionales de la prueba de retencion (el frontend no los necesita)
        "rpss": None if ev["rpss"] is None else round(ev["rpss"], 3),
        "aciertosRetencion": None if ev["aciertosRetencion"] is None else round(ev["aciertosRetencion"], 2),
        "rpssRetencion": None if ev["rpssRetencion"] is None else round(ev["rpssRetencion"], 3),
    }


# ---------- lectura ----------

def leer_oni(ruta):
    """{indice_trimestre: valor} y (anio, trimestre) del ultimo dato."""
    oni, ultimo = {}, None
    with open(ruta, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            v = _num(fila.get("oni"))
            if v is None or fila["trimestre"] not in TRIMESTRES:
                continue
            idx = indice_trimestre(int(fila["anio"]), fila["trimestre"])
            oni[idx] = v
            if ultimo is None or idx > ultimo[0]:
                ultimo = (idx, int(fila["anio"]), fila["trimestre"])
    return oni, ultimo


def leer_lluvia(ruta):
    """{punto: {date: mm}} desde power_diario_largo.csv (solo punto, fecha, PRECTOTCORR)."""
    series = {}
    with open(ruta, newline="", encoding="utf-8") as f:
        lector = csv.DictReader(f)
        for fila in lector:
            v = _num(fila.get("PRECTOTCORR"))
            if v is None:
                continue
            series.setdefault(fila["punto"], {})[date.fromisoformat(fila["fecha"])] = v
    return series


def construir(series, oni, ultimo, fecha_ref, hoy):
    """Arma el diccionario final de salida."""
    idx, anio_oni, trim = ultimo
    valor = oni[idx]
    pred = predictor(oni, idx)
    temporadas = []
    for tipo, anio in proximas_temporadas(fecha_ref):
        info = TEMPORADAS[tipo]
        zonas = []
        for zid, serie in series.items():
            z = perspectiva_zona(serie, oni, (anio_oni, trim), tipo, anio)
            zonas.append({"id": zid, **z})
        temporadas.append({
            "id": f"{tipo}-{anio}", "tipo": tipo, "anio": anio,
            "nombre": f"{info['nombre']} {anio}", "meses": info["meses"], "zonas": zonas,
        })
    return {
        "generado": hoy.isoformat(), "fuentes": FUENTES,
        "metodo": {"k": K, "descripcion": DESCRIPCION},
        "oni": {"anio": anio_oni, "trimestre": trim, "valor": round(valor, 2),
                "tendencia": round(pred[1], 2) if pred else 0.0, "fase": fase_oni(valor)},
        "temporadas": temporadas,
    }


def main(argv=None):
    aqui = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--datos", default=str(aqui.parent.parent / "data"))
    p.add_argument("--salida", default=str(aqui.parent / "src" / "datos" / "perspectiva.generado.json"))
    p.add_argument("--fecha", default=None, help="fecha de referencia AAAA-MM-DD (por defecto, ultimo dia con dato de POWER)")
    a = p.parse_args(argv)
    datos = Path(a.datos) / "processed"
    series = leer_lluvia(datos / "power_diario_largo.csv")
    oni, ultimo = leer_oni(datos / "oni.csv")
    if not series or ultimo is None:
        print("Faltan datos de lluvia u ONI", file=sys.stderr)
        return 1
    fecha_ref = date.fromisoformat(a.fecha) if a.fecha else max(max(s) for s in series.values())
    salida = construir(series, oni, ultimo, fecha_ref, date.today())
    Path(a.salida).write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Escrito {a.salida} ({len(salida['temporadas'])} temporadas, fecha de referencia {fecha_ref})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
