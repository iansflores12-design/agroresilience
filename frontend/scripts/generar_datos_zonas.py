#!/usr/bin/env python3
"""Resume los datos procesados de AgroResilience en un JSON pequeno para el frontend.

Solo biblioteca estandar. Uso (desde cualquier carpeta):
    python3 -I generar_datos_zonas.py [--datos CARPETA_DATA] [--salida ARCHIVO.json]
"""
import argparse
import csv
import json
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

VENTANA_SERIE_DIAS = 120
VENTANA_ANUAL_DIAS = 15
MIN_MUESTRAS = 20
DIAS_LLUVIA = 30
DIAS_TEMP = 7
MIN_DIAS_VENTANA_LLUVIA = 27   # dias con dato exigidos en una ventana de 30 dias
MIN_ANIOS_LLUVIA_NORMAL = 5

FUENTES = {
    "humedad": "NASA SMAP SPL3SMP_E v006, 9 km",
    "lluvia": "NASA POWER, comunidad AG, PRECTOTCORR (precipitación corregida)",
    "temperatura": "NASA POWER, comunidad AG, T2M (temperatura a 2 m)",
    "suelo": "ISRIC SoilGrids v2.0, capa 0-5 cm",
}


# ---------- funciones puras ----------

def _num(texto):
    """Convierte texto a float; devuelve None si esta vacio o no es numero."""
    if texto is None or str(texto).strip() == "":
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def promedio_am_pm(am, pm):
    """Promedio de los valores disponibles entre AM y PM (None = vacio)."""
    vals = [v for v in (am, pm) if v is not None]
    return sum(vals) / len(vals) if vals else None


def distancia_dia_anio(a, b):
    """Distancia circular en dias del ano entre dos fechas (cruza fin de ano)."""
    d = abs(a.timetuple().tm_yday - b.timetuple().tm_yday)
    return min(d, 365 - d)


def valores_historicos(serie, ultima, ventana=VENTANA_ANUAL_DIAS):
    """Valores de anos anteriores al de `ultima` cuyo dia del ano esta a +-ventana.

    serie: dict {date: valor}. Si el dia de referencia es de inicio de ano, los
    dias de diciembre se consideran del ano previo a efectos de 'anos anteriores'
    solo por su ano calendario: se usan fechas con year < ultima.year.
    """
    return [v for f, v in serie.items()
            if f.year < ultima.year and distancia_dia_anio(f, ultima) <= ventana]


def percentil(valor, historicos):
    """Porcentaje entero (0-100) de historicos menores o iguales a valor."""
    if not historicos:
        return None
    return round(100 * sum(1 for h in historicos if h <= valor) / len(historicos))


def resumen_humedad(serie):
    """Arma el bloque `humedad` a partir de {date: valor}. None si no hay datos."""
    if not serie:
        return None
    ultima = max(serie)
    valor = serie[ultima]
    desde = ultima - timedelta(days=VENTANA_SERIE_DIAS)
    lista = [[f.isoformat(), round(v, 3)] for f, v in sorted(serie.items())
             if desde <= f <= ultima]
    hist = valores_historicos(serie, ultima)
    if len(hist) >= MIN_MUESTRAS:
        normal = round(statistics.fmean(hist), 3)
        anomalia = round(valor - statistics.fmean(hist), 3)
        pct = percentil(valor, hist)
    else:
        normal = anomalia = pct = None
    return {
        "valor": round(valor, 3), "fecha": ultima.isoformat(), "unidad": "m3/m3",
        "serie": lista, "normal": normal, "anomalia": anomalia,
        "percentil": pct, "muestras": len(hist),
    }


def _desplazar_anio(d, anios):
    try:
        return d.replace(year=d.year - anios)
    except ValueError:  # 29 de febrero
        return d.replace(year=d.year - anios, day=28)


def _suma_ventana(serie, fin, dias):
    """Suma de la ventana de `dias` terminada en `fin`; None si faltan muchos dias."""
    vals = [serie[fin - timedelta(days=i)] for i in range(dias)
            if (fin - timedelta(days=i)) in serie]
    if len(vals) < MIN_DIAS_VENTANA_LLUVIA:
        return None
    return sum(vals) * dias / len(vals)  # reescala si falta algun dia


def resumen_lluvia(serie):
    """Bloque `lluvia30d` a partir de {date: mm}. None si no hay datos."""
    if not serie:
        return None
    fin = max(serie)
    actual = _suma_ventana(serie, fin, DIAS_LLUVIA)
    if actual is None:
        return None
    previas = []
    for k in range(1, fin.year - min(serie).year + 1):
        s = _suma_ventana(serie, _desplazar_anio(fin, k), DIAS_LLUVIA)
        if s is not None:
            previas.append(s)
    normal = round(statistics.fmean(previas), 1) if len(previas) >= MIN_ANIOS_LLUVIA_NORMAL else None
    return {"valor_mm": round(actual, 1), "hasta": fin.isoformat(), "normal_mm": normal}


def resumen_temperatura(serie):
    """Bloque `temperatura`: media de los ultimos 7 dias con dato."""
    if not serie:
        return None
    fechas = sorted(serie)[-DIAS_TEMP:]
    return {"valor_c": round(statistics.fmean(serie[f] for f in fechas), 1),
            "hasta": fechas[-1].isoformat()}


def resumen_suelo(fila):
    """Bloque `suelo` (capa 0-5 cm) desde una fila de SoilGrids. g/kg y pH*10 -> % y pH."""
    if not fila:
        return None
    arena, limo, arcilla, ph = (_num(fila.get(c)) for c in
                                ("sand_0_5cm", "silt_0_5cm", "clay_0_5cm", "phh2o_0_5cm"))
    if None in (arena, limo, arcilla, ph):
        return None
    return {"arena_pct": round(arena / 10, 1), "limo_pct": round(limo / 10, 1),
            "arcilla_pct": round(arcilla / 10, 1), "ph": round(ph / 10, 1)}


# ---------- lectura en streaming ----------

def leer_humedad(ruta):
    """{punto: {date: humedad media AM/PM}} sin cargar el archivo completo."""
    out = {}
    with open(ruta, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            v = promedio_am_pm(_num(r.get("soil_moisture_am")), _num(r.get("soil_moisture_pm")))
            if v is not None:
                out.setdefault(r["punto"], {})[date.fromisoformat(r["fecha"])] = v
    return out


def leer_columna(ruta, columna):
    """{punto: {date: valor}} para una columna numerica, ignorando vacios."""
    out = {}
    with open(ruta, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            v = _num(r.get(columna))
            if v is not None:
                out.setdefault(r["punto"], {})[date.fromisoformat(r["fecha"])] = v
    return out


def leer_power(ruta):
    """Lee POWER una sola vez: ({punto: {fecha: PRECTOTCORR}}, {punto: {fecha: T2M}}).

    Los faltantes vienen vacios (el relleno -999 ya se convirtio a vacio); por
    seguridad tambien se ignora cualquier valor <= -999.
    """
    lluvia, temp = {}, {}
    with open(ruta, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            fecha = date.fromisoformat(r["fecha"])
            for col, destino in (("PRECTOTCORR", lluvia), ("T2M", temp)):
                v = _num(r.get(col))
                if v is not None and v > -999:
                    destino.setdefault(r["punto"], {})[fecha] = v
    return lluvia, temp


def leer_suelo(ruta):
    with open(ruta, newline="", encoding="utf-8") as f:
        return {r["punto"]: r for r in csv.DictReader(f)}


def _opcional(ruta, lector, nombre):
    if not ruta.is_file():
        print(f"AVISO: falta {ruta.name}; {nombre} queda en null", file=sys.stderr)
        return {}
    return lector(ruta)


def construir(datos):
    cfg_ruta = datos / "config" / "zonas.json"
    smap_ruta = datos / "processed" / "smap_series.csv"
    for r in (cfg_ruta, smap_ruta):
        if not r.is_file():
            sys.exit(f"ERROR: falta el archivo obligatorio {r}")
    cfg = json.loads(cfg_ruta.read_text(encoding="utf-8"))
    proc = datos / "processed"
    hum = leer_humedad(smap_ruta)
    lluvia, temp = _opcional(proc / "power_diario_largo.csv", leer_power, "lluvia30d y temperatura") or ({}, {})
    suelo = _opcional(proc / "suelo_por_punto.csv", leer_suelo, "suelo")
    zonas = []
    for p in cfg["puntos"]:
        i = p["id"]
        zonas.append({
            "id": i, "nombre": p["nombre"], "lat": p["lat"], "lon": p["lon"],
            "humedad": resumen_humedad(hum.get(i, {})),
            "lluvia30d": resumen_lluvia(lluvia.get(i, {})),
            "temperatura": resumen_temperatura(temp.get(i, {})),
            "suelo": resumen_suelo(suelo.get(i)),
        })
    c = cfg["caja_honduras"]
    return {
        "generado": date.today().isoformat(),
        "fuentes": FUENTES,
        "caja": {k: c[k] for k in ("lat_min", "lat_max", "lon_min", "lon_max")},
        "zonas": zonas,
    }


def main():
    aqui = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--datos", type=Path, default=aqui.parent.parent / "data",
                    help="carpeta data (por defecto: <raiz del repo>/data)")
    ap.add_argument("--salida", type=Path, default=aqui.parent / "src" / "datos" / "zonas.generado.json",
                    help="archivo JSON de salida")
    a = ap.parse_args()
    res = construir(a.datos)
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for z in res["zonas"]:
        h = z["humedad"]
        if h:
            print(f"{z['id']}: humedad {h['valor']} el {h['fecha']}, percentil {h['percentil']}")
        else:
            print(f"{z['id']}: sin datos de humedad")
    print(f"Escrito {a.salida} ({a.salida.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
