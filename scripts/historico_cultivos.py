"""Historico de desempeno de cultivos por departamento de Honduras, 1981-2026.

Para cada departamento, temporada (primera, postrera) y ano simula cada cultivo con su clima
diario real (NASA POWER) y calcula que tan bien le fue:

- WRSI (indice de satisfaccion de agua, FEWS NET / FAO): ETa / ETc * 100. Menos de 50 = fracaso.
- Rendimiento relativo: FAO-33 (Doorenbos y Kassam, 1979): 1 - Ya/Ym = Ky (1 - ETa/ETc),
  por estres de calor en floracion y por encharcamiento.
- Fase ENSO de la temporada con el ONI de NOAA.

Luego "recorta": para cada departamento deja solo lo que sirve para decidir (anos parecidos por
ENSO, ultimos 10 anos y extremos) en un JSON corto que lee Gemini Decision.

Entradas:
  data/processed/power/<punto>.csv     (11 puntos, ya en el repo de datos)
  data/historico/power_extra/<punto>.json (8 puntos, API diaria de POWER, comunidad AG)
  data/processed/oni.csv
  data/historico/faostat_honduras.csv  (solo para validar)
Salidas:
  data/historico/desempeno_departamental.csv  (todo: depto x temporada x ano x cultivo)
  data/historico/validacion.txt
  frontend/public/historico/<depto>.json + indice.json (recorte para Gemini)

Uso: python3 scripts/historico_cultivos.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics as st
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DATOS = RAIZ / 'data'
SALIDA = DATOS / 'historico'
WEB = RAIZ / 'frontend' / 'public' / 'historico'

# Punto climatico de cada departamento (uno por departamento; Olancho usa Juticalpa).
DEPARTAMENTOS = {
    'atlantida': ('Atlántida', 'la_ceiba', 'extra'),
    'choluteca': ('Choluteca', 'choluteca', 'local'),
    'colon': ('Colón', 'trujillo', 'extra'),
    'comayagua': ('Comayagua', 'comayagua', 'local'),
    'copan': ('Copán', 'santa_rosa_copan', 'local'),
    'cortes': ('Cortés', 'san_pedro_sula', 'local'),
    'el_paraiso': ('El Paraíso', 'danli', 'local'),
    'francisco_morazan': ('Francisco Morazán', 'tegucigalpa', 'local'),
    'gracias_a_dios': ('Gracias a Dios', 'puerto_lempira', 'extra'),
    'intibuca': ('Intibucá', 'la_esperanza', 'local'),
    'islas_de_la_bahia': ('Islas de la Bahía', 'roatan', 'extra'),
    'la_paz': ('La Paz', 'la_paz', 'extra'),
    'lempira': ('Lempira', 'gracias', 'extra'),
    'ocotepeque': ('Ocotepeque', 'ocotepeque', 'extra'),
    'olancho': ('Olancho', 'juticalpa', 'local'),
    'santa_barbara': ('Santa Bárbara', 'santa_barbara', 'extra'),
    'valle': ('Valle', 'nacaome', 'local'),
    'yoro': ('Yoro', 'yoro', 'local'),
}

# Mismos parametros que frontend/src/lib/decision/parametros.ts, mas Ky de FAO-33 (Tabla 24).
# Ky: maiz 1.25, frijol 1.15, sorgo 0.9, tomate 1.05; arroz no esta en FAO-33 para secano: 1.1 APROXIMADO.
GRANOS = ('primera', 'postrera')
HORTA = ('primera', 'postrera', 'verano')
CULTIVOS = {
    'maiz': dict(nombre='Maíz', semanas=17, kc=(0.3, 1.2, 0.6), tcalor=35, ky=1.25, encharca=True, riego=False, temporadas=GRANOS),
    'frijol': dict(nombre='Frijol', semanas=12, kc=(0.4, 1.15, 0.35), tcalor=30, ky=1.15, encharca=True, riego=False, temporadas=GRANOS),
    'sorgo': dict(nombre='Sorgo', semanas=16, kc=(0.3, 1.0, 0.55), tcalor=38, ky=0.9, encharca=False, riego=False, temporadas=GRANOS),
    'arroz': dict(nombre='Arroz', semanas=18, kc=(1.05, 1.2, 0.75), tcalor=35, ky=1.1, encharca=False, riego=True, temporadas=GRANOS),
    'tomate': dict(nombre='Tomate', semanas=16, kc=(0.6, 1.15, 0.8), tcalor=32, ky=1.05, encharca=True, riego=True, temporadas=HORTA),
    # Cultivos de exportacion (Atlas de Complejidad Economica, Harvard, 2024). Ky de FAO-33: sandia/melon 1.1,
    # pimiento 1.1, tabaco 0.9. Umbrales de calor: criterio agronomico general, APROXIMADO.
    'melon': dict(nombre='Melón', semanas=11, kc=(0.5, 1.05, 0.75), tcalor=38, ky=1.1, encharca=True, riego=True, temporadas=HORTA),
    'chile': dict(nombre='Chile dulce', semanas=16, kc=(0.6, 1.05, 0.9), tcalor=32, ky=1.1, encharca=True, riego=True, temporadas=HORTA),
    'tabaco': dict(nombre='Tabaco', semanas=14, kc=(0.5, 1.15, 0.8), tcalor=35, ky=0.9, encharca=True, riego=False, temporadas=HORTA),
}

# Permanentes: balance de agua de todo el ano con Kc fijo (FAO-56, Tabla 12: cafe 0.95-1.1, banano 1.1,
# cana ~1.0 promedio del ano, cacao 1.05, palma 1.0 APROXIMADO). Ky: banano 1.25 y cana 1.2 (FAO-33);
# cafe, palma y cacao no estan en FAO-33: 1.0 APROXIMADO. El efecto en cafe suele verse en la cosecha siguiente.
PERMANENTES = {
    'cafe': dict(nombre='Café', kc=1.0, tcalor=32, ky=1.0, mes_seco_mm=50),
    'palma': dict(nombre='Palma aceitera', kc=1.0, tcalor=36, ky=1.0, mes_seco_mm=100),
    'banano': dict(nombre='Banano', kc=1.1, tcalor=36, ky=1.25, mes_seco_mm=60),
    'cana': dict(nombre='Caña de azúcar', kc=1.0, tcalor=38, ky=1.2, mes_seco_mm=40),
    'cacao': dict(nombre='Cacao', kc=1.05, tcalor=34, ky=1.0, mes_seco_mm=100),
}

# Zonas donde cada cultivo de exportacion ya se siembra (IHCAFE, SAG y config/zonas.json). APROXIMADO.
ZONA_TRADICIONAL = {
    'cafe': {'copan', 'ocotepeque', 'lempira', 'intibuca', 'la_paz', 'comayagua', 'santa_barbara', 'el_paraiso', 'olancho', 'francisco_morazan', 'yoro'},
    'palma': {'atlantida', 'colon', 'cortes', 'yoro'},
    'banano': {'cortes', 'yoro', 'atlantida', 'colon'},
    'cana': {'cortes', 'yoro', 'choluteca', 'valle', 'comayagua', 'olancho', 'santa_barbara'},
    'cacao': {'cortes', 'atlantida', 'santa_barbara', 'gracias_a_dios', 'colon', 'yoro'},
    'melon': {'choluteca', 'valle'},
    'chile': {'comayagua', 'intibuca', 'ocotepeque', 'francisco_morazan', 'el_paraiso', 'la_paz'},
    'tabaco': {'el_paraiso', 'copan'},
}

# Ventanas de siembra: desde el inicio, la primera fecha con 20 mm en 3 dias; si no llueve, el ultimo dia.
# Verano: casi no llueve; se siembra con riego hacia el final de la ventana.
TEMPORADAS = {
    'primera': ((5, 1), (6, 30)),
    'postrera': ((8, 25), (9, 30)),
    'verano': ((12, 1), (12, 1)),
}
# Trimestres ONI que cubren cada temporada.
ONI_TRIM = {'primera': ('MJJ', 'JJA'), 'postrera': ('ASO', 'SON'), 'verano': ('NDJ', 'DJF'), 'anual': ('MJJ', 'JJA', 'ASO')}

AGUA_UTIL_MM = 120.0  # agua aprovechable en la raiz (franco, ~0.9 m). Supuesto general.
P_FACIL = 0.5  # fraccion de agua que el cultivo saca sin estres (FAO-56, granos).


# ---------------------------------------------------------------- lectura

def leer_local(punto: str) -> dict[date, dict]:
    filas = {}
    with open(DATOS / 'processed' / 'power' / f'{punto}.csv') as f:
        for r in csv.DictReader(f):
            try:
                filas[date.fromisoformat(r['fecha'])] = dict(
                    lluvia=float(r['PRECTOTCORR']), tmax=float(r['T2M_MAX']), tmin=float(r['T2M_MIN']), lat=float(r['latitud'])
                )
            except (ValueError, KeyError):
                continue
    return filas


def leer_extra(punto: str) -> dict[date, dict]:
    d = json.load(open(SALIDA / 'power_extra' / f'{punto}.json'))
    lat = d['geometry']['coordinates'][1]
    p = d['properties']['parameter']
    filas = {}
    for k, ll in p['PRECTOTCORR'].items():
        tx, tn = p['T2M_MAX'][k], p['T2M_MIN'][k]
        if ll < -900 or tx < -900 or tn < -900:
            continue
        filas[date(int(k[:4]), int(k[4:6]), int(k[6:]))] = dict(lluvia=ll, tmax=tx, tmin=tn, lat=lat)
    return filas


def corregir_lluvia(clima: dict[date, dict], punto: str) -> str:
    """Cambia la lluvia de POWER por la de ERA5 (Open-Meteo), ajustada mes a mes al nivel de POWER 2001-2025.

    La lluvia de POWER antes de ~2000 sale a la mitad que despues (salto de la fuente, no del clima): con ella
    los anos 80 parecen todos de sequia. ERA5 es homogeneo de 1981 a hoy pero exagera la llovizna, asi que se
    quitan los dias de menos de 1 mm y se escala cada mes a la lluvia media de POWER en su periodo bueno.
    """
    ruta = SALIDA / 'era5' / f'{punto}.json'
    if not ruta.exists():
        return 'power'
    d = json.load(open(ruta))['daily']
    era = {}
    for t, p in zip(d['time'], d['precipitation_sum']):
        if p is not None:
            era[date.fromisoformat(t)] = p if p >= 1 else 0.0
    suma_p, suma_e = [0.0] * 13, [0.0] * 13
    for dia, x in clima.items():
        if 2001 <= dia.year <= 2025 and dia in era:
            suma_p[dia.month] += x['lluvia']
            suma_e[dia.month] += era[dia]
    factor = [min(1.5, max(0.3, suma_p[m] / suma_e[m])) if suma_e[m] > 0 else 1.0 for m in range(13)]
    for dia, x in clima.items():
        if dia in era:
            x['lluvia'] = era[dia] * factor[dia.month]
    return 'era5_ajustado'


def leer_oni() -> dict[tuple[int, str], float]:
    with open(DATOS / 'processed' / 'oni.csv') as f:
        return {(int(r['anio']), r['trimestre']): float(r['oni']) for r in csv.DictReader(f) if r['oni']}


# ---------------------------------------------------------------- fisica

def ra_mm(lat: float, dia: date) -> float:
    """Radiacion extraterrestre en mm/dia equivalentes (FAO-56, ec. 21 x 0.408)."""
    j = dia.timetuple().tm_yday
    phi = math.radians(lat)
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    dec = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    ws = math.acos(-math.tan(phi) * math.tan(dec))
    ra = 24 * 60 / math.pi * 0.082 * dr * (ws * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(ws))
    return 0.408 * ra


def et0_hargreaves(tx: float, tn: float, ra: float) -> float:
    return max(0.0, 0.0023 * ((tx + tn) / 2 + 17.8) * math.sqrt(max(tx - tn, 0.0)) * ra)


def kc_dia(kc: tuple[float, float, float], f: float) -> float:
    """Curva FAO-56 con fases 20/30/30/20 % del ciclo."""
    ini, med, fin = kc
    if f < 0.2:
        return ini
    if f < 0.5:
        return ini + (med - ini) * (f - 0.2) / 0.3
    if f < 0.8:
        return med
    return med + (fin - med) * (f - 0.8) / 0.2


def fecha_siembra(clima: dict[date, dict], anio: int, temporada: str) -> date | None:
    (m0, d0), (m1, d1) = TEMPORADAS[temporada]
    ini, fin = date(anio, m0, d0), date(anio, m1, d1)
    dia = ini
    while dia <= fin:
        tres = [clima.get(dia - timedelta(days=i)) for i in range(3)]
        if all(tres) and sum(t['lluvia'] for t in tres) >= 20:
            return dia
        dia += timedelta(days=1)
    return fin if fin in clima else None


def simular(clima: dict[date, dict], siembra: date, c: dict) -> dict | None:
    dias = c['semanas'] * 7
    agua = AGUA_UTIL_MM * 0.5  # empieza a media capacidad: acaba de llover
    eta_t = etc_t = 0.0
    calor_flor = 0
    encharcado = 0
    dias_secos_max = racha = 0
    lluvia_t = 0.0
    for i in range(dias):
        dia = siembra + timedelta(days=i)
        x = clima.get(dia)
        if x is None:
            return None
        f = i / dias
        etc = kc_dia(c['kc'], f) * et0_hargreaves(x['tmax'], x['tmin'], ra_mm(x['lat'], dia))
        agua = min(AGUA_UTIL_MM, agua + x['lluvia'])
        sobra = agua + x['lluvia'] - AGUA_UTIL_MM  # lluvia que no cabe: escurre o encharca
        facil = AGUA_UTIL_MM * P_FACIL
        ks = 1.0 if agua >= AGUA_UTIL_MM - facil else max(0.0, agua / (AGUA_UTIL_MM - facil))
        eta = min(etc * ks, agua)
        agua -= eta
        eta_t += eta
        etc_t += etc
        lluvia_t += x['lluvia']
        if 0.45 <= f < 0.65 and x['tmax'] > c['tcalor']:  # floracion aproximada
            calor_flor += 1
        if x['lluvia'] >= 50 and sobra > 0:
            encharcado += 1
        racha = racha + 1 if x['lluvia'] < 1 else 0
        if f < 0.8:
            dias_secos_max = max(dias_secos_max, racha)
    wrsi = 100 * eta_t / etc_t if etc_t else 0
    if c['riego']:  # con riego el agua no falta: queda cuanto hay que regar, y pesan el calor y el exceso
        rel = 1.0
    else:
        rel = 1 - c['ky'] * (1 - eta_t / etc_t)
    rel *= max(0.5, 1 - 0.03 * calor_flor)  # cada dia de calor en floracion resta 3 % (supuesto)
    if c['encharca']:
        rel *= max(0.6, 1 - 0.05 * encharcado)  # dias de aguacero de 50 mm con la tierra llena
    return dict(
        wrsi=round(wrsi, 1),
        rel=round(max(0.0, min(1.0, rel)) * 100, 1),
        lluvia=round(lluvia_t),
        etc=round(etc_t),
        calor_flor=calor_flor,
        encharcado=encharcado,
        racha_seca=dias_secos_max,
        riego_mm=round(etc_t - eta_t),
    )


def simular_anual(clima: dict[date, dict], anio: int, c: dict) -> dict | None:
    """Balance de agua de enero a diciembre para un cultivo permanente."""
    agua = AGUA_UTIL_MM * 0.6
    eta_t = etc_t = lluvia_t = 0.0
    calor = 0
    por_mes = [0.0] * 12
    dia = date(anio, 1, 1)
    while dia.year == anio:
        x = clima.get(dia)
        if x is None:
            return None
        etc = c['kc'] * et0_hargreaves(x['tmax'], x['tmin'], ra_mm(x['lat'], dia))
        agua = min(AGUA_UTIL_MM, agua + x['lluvia'])
        facil = AGUA_UTIL_MM * P_FACIL
        ks = 1.0 if agua >= AGUA_UTIL_MM - facil else max(0.0, agua / (AGUA_UTIL_MM - facil))
        eta = min(etc * ks, agua)
        agua -= eta
        eta_t += eta
        etc_t += etc
        lluvia_t += x['lluvia']
        por_mes[dia.month - 1] += x['lluvia']
        calor += x['tmax'] > c['tcalor']
        dia += timedelta(days=1)
    secos = sum(m < c['mes_seco_mm'] for m in por_mes)
    rel = (1 - c['ky'] * (1 - eta_t / etc_t)) * max(0.6, 1 - 0.005 * calor)
    return dict(
        wrsi=round(100 * eta_t / etc_t, 1), rel=round(max(0.0, min(1.0, rel)) * 100, 1), lluvia=round(lluvia_t),
        etc=round(etc_t), calor_flor=calor, encharcado=0, racha_seca=secos, riego_mm=round(etc_t - eta_t),
    )


def fase_enso(oni: dict, anio: int, temporada: str) -> tuple[str, float | None]:
    v = [oni.get((anio, t)) for t in ONI_TRIM[temporada]]
    v = [x for x in v if x is not None]
    if not v:
        return 'desconocido', None
    m = sum(v) / len(v)
    return ('nino' if m >= 0.5 else 'nina' if m <= -0.5 else 'neutro'), round(m, 2)


# ---------------------------------------------------------------- todo el historico

FUENTE_LLUVIA: dict[str, str] = {}


def construir() -> list[dict]:
    oni = leer_oni()
    filas = []
    for depto, (nombre, punto, origen) in DEPARTAMENTOS.items():
        clima = leer_local(punto) if origen == 'local' else leer_extra(punto)
        FUENTE_LLUVIA[depto] = corregir_lluvia(clima, punto)
        anios = sorted({d.year for d in clima})
        for anio in anios:
            for temporada in TEMPORADAS:
                siembra = fecha_siembra(clima, anio, temporada)
                if not siembra:
                    continue
                fase, oni_v = fase_enso(oni, anio, temporada)
                for cid, c in CULTIVOS.items():
                    if temporada not in c['temporadas']:
                        continue
                    r = simular(clima, siembra, c)
                    if r is None:  # el ciclo no termina dentro de los datos (temporada en curso)
                        continue
                    filas.append(dict(
                        departamento=depto, punto=punto, anio=anio, temporada=temporada, siembra=siembra.isoformat(),
                        enso=fase, oni=oni_v, cultivo=cid, **r,
                    ))
            fase, oni_v = fase_enso(oni, anio, 'anual')
            for cid, c in PERMANENTES.items():
                r = simular_anual(clima, anio, c)
                if r is not None:
                    filas.append(dict(departamento=depto, punto=punto, anio=anio, temporada='anual', siembra='',
                                      enso=fase, oni=oni_v, cultivo=cid, **r))
    return filas


# ---------------------------------------------------------------- validacion

def corr(a: list[float], b: list[float]) -> float:
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return num / den if den else float('nan')


def validar(filas: list[dict]) -> str:
    lineas = ['Validacion del historico simulado', '']
    # 1) Sequias documentadas (PMA mVAM 2018-2019, DICTA 2015, FEWS NET): primera en el corredor seco.
    seco = ('choluteca', 'valle', 'el_paraiso', 'francisco_morazan')
    def media(dep, anio, temp, cul):
        v = [f['rel'] for f in filas if f['departamento'] in dep and f['anio'] == anio and f['temporada'] == temp and f['cultivo'] == cul]
        return round(st.mean(v), 1) if v else None
    normal = {}
    for cul in ('maiz', 'frijol'):
        todos = [f['rel'] for f in filas if f['departamento'] in seco and f['temporada'] == 'primera' and f['cultivo'] == cul]
        normal[cul] = round(st.median(todos), 1)
    lineas.append(f"Corredor seco, primera, mediana 1981-2025: maiz {normal['maiz']} %, frijol {normal['frijol']} %")
    for anio, fuente in ((1997, 'El Nino fuerte'), (2014, 'FEWS NET: canicula prolongada'), (2015, 'DICTA: perdida de primera'),
                         (2018, 'PMA: maiz -69 %, frijol -73 %'), (2019, 'PMA: maiz -75 %, frijol -51 %'), (2023, 'FEWS NET: El Nino')):
        lineas.append(f"  {anio} ({fuente}): maiz {media(seco, anio, 'primera', 'maiz')} %, frijol {media(seco, anio, 'primera', 'frijol')} %")
    # 2) Ranking de anos: los documentados deben estar entre los peores.
    por_anio = {}
    for f in filas:
        if f['departamento'] in seco and f['temporada'] == 'primera' and f['cultivo'] == 'maiz' and f['anio'] <= 2025:
            por_anio.setdefault(f['anio'], []).append(f['rel'])
    orden = sorted(por_anio, key=lambda a: st.mean(por_anio[a]))
    lineas.append('  10 peores primeras simuladas (maiz): ' + ', '.join(map(str, orden[:10])))
    # 3) FAOSTAT nacional (solo 1981-2013: despues la serie es casi plana, estimada).
    fao = {}
    with open(SALIDA / 'faostat_honduras.csv') as f:
        for r in csv.DictReader(f):
            if r['cultivo'] in ('maiz', 'frijol') and r['rendimiento_kg_ha']:
                fao[(r['cultivo'], int(r['anio']))] = float(r['rendimiento_kg_ha'])
    for cul in ('maiz', 'frijol'):
        anios = [a for a in range(1981, 2014) if (cul, a) in fao]
        # sin tendencia: residuo contra la recta de los anos
        ys = [fao[(cul, a)] for a in anios]
        n = len(anios); ma = st.mean(anios); my = st.mean(ys)
        b = sum((a - ma) * (y - my) for a, y in zip(anios, ys)) / sum((a - ma) ** 2 for a in anios)
        res = [y - (my + b * (a - ma)) for a, y in zip(anios, ys)]
        sim = []
        for a in anios:
            v = [f['rel'] for f in filas if f['cultivo'] == cul and f['anio'] == a and f['temporada'] == 'primera' and f['departamento'] != 'islas_de_la_bahia']
            sim.append(st.mean(v))
        lineas.append(f"FAOSTAT {cul} 1981-2013 sin tendencia vs simulado nacional (primera): r = {corr(res, sim):.2f} (n={n})")
    lineas += ['', 'Notas:', '- FAOSTAT despues de 2013 casi no cambia de ano a ano (imputado); no sirve para validar anos recientes.',
               '- El ano agricola nacional mezcla primera y postrera y riego; la correlacion esperada es moderada.']
    return '\n'.join(lineas)


# ---------------------------------------------------------------- recorte para Gemini

def resumen(v: list[dict]) -> dict:
    rel = [x['rel'] for x in v]
    return dict(
        n=len(v),
        mediana=round(st.median(rel)),
        buenos=sum(r >= 70 for r in rel),  # buen ano: 70 % o mas del potencial
        fracasos=sum(x['rel'] < 40 for x in v),  # fracaso: menos de 40 % (con secano, WRSI < 50 cae aqui)
        peor=min(v, key=lambda x: x['rel'])['anio'],
        peor_rel=round(min(rel)),
    )


def mercado_exportacion() -> dict:
    """Peso de cada cultivo en las exportaciones (Atlas de Harvard): 2024 y promedio 2015-2024."""
    serie = {}
    with open(SALIDA / 'atlas_exportaciones_honduras.csv') as f:
        for r in csv.DictReader(f):
            serie.setdefault(r['producto'], {})[int(r['anio'])] = (float(r['exportacion_usd']), float(r['porcentaje_exportaciones']))
    union = {'tabaco': ('tabaco_puros', 'tabaco_hoja'), 'cana': ('cana_azucar',), 'chile': ('hortalizas_chile',)}
    out = {}
    for cid in list(CULTIVOS) + list(PERMANENTES):
        claves = union.get(cid, (cid,))
        if not all(k in serie for k in claves):
            continue
        usd = lambda a: sum(serie[k].get(a, (0, 0))[0] for k in claves)
        pct = lambda a: sum(serie[k].get(a, (0, 0))[1] for k in claves)
        out[cid] = dict(
            usd_2024_millones=round(usd(2024) / 1e6, 1),
            pct_exportaciones_2024=round(pct(2024), 2),
            usd_prom_2015_2024_millones=round(st.mean(usd(a) for a in range(2015, 2025)) / 1e6, 1),
            usd_prom_2005_2014_millones=round(st.mean(usd(a) for a in range(2005, 2015)) / 1e6, 1),
        )
    return out


def enso_actual() -> dict:
    oni = leer_oni()
    orden = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ']
    (anio, trim) = max(oni, key=lambda k: (k[0], orden.index(k[1])))
    v = oni[(anio, trim)]
    return dict(trimestre=f'{anio}-{trim}', oni=v, fase='nino' if v >= 0.5 else 'nina' if v <= -0.5 else 'neutro')


def recortar(filas: list[dict]) -> dict:
    ultimo = max(f['anio'] for f in filas)
    mercado = mercado_exportacion()
    enso = enso_actual()
    salida = {}
    todos = {**CULTIVOS, **PERMANENTES}
    for depto, (nombre, punto, _) in DEPARTAMENTOS.items():
        d = dict(departamento=nombre, punto_clima=punto, periodo=f'1981-{ultimo}', fuente_lluvia=FUENTE_LLUVIA.get(depto), temporadas={})
        for temporada in list(TEMPORADAS) + ['anual']:
            ft = [f for f in filas if f['departamento'] == depto and f['temporada'] == temporada]
            if not ft:
                continue
            t = dict(siembra_mediana=None, lluvia_mediana_mm=None, cultivos={}, anios_extremos={})
            ref = 'maiz' if temporada in GRANOS else 'tomate' if temporada == 'verano' else 'cafe'
            if temporada != 'anual':
                sm = sorted(date.fromisoformat(f['siembra']).timetuple().tm_yday for f in ft if f['cultivo'] == ref)
                t['siembra_mediana'] = (date(2001, 1, 1) + timedelta(days=sm[len(sm) // 2] - 1)).strftime('%m-%d')
            t['lluvia_mediana_mm'] = round(st.median(f['lluvia'] for f in ft if f['cultivo'] == ref))
            for cid, c in todos.items():
                fc = [f for f in ft if f['cultivo'] == cid]
                if not fc:
                    continue
                t['cultivos'][cid] = dict(
                    todo=resumen(fc),
                    **{fase: resumen(v) for fase in ('nino', 'neutro', 'nina') if (v := [f for f in fc if f['enso'] == fase])},
                    ultimos10=resumen([f for f in fc if f['anio'] > ultimo - 10]),
                    calor_mediana=st.median(f['calor_flor'] for f in fc),
                    riego_mediana_mm=round(st.median(f['riego_mm'] for f in fc)),
                    solo_con_riego=c.get('riego', False),
                    zona_tradicional=(depto in ZONA_TRADICIONAL[cid]) if cid in ZONA_TRADICIONAL else None,
                )
            if temporada not in GRANOS:
                d['temporadas'][temporada] = t
                continue
            # Mejor cultivo por ano (secano) y los anos mas malos y mas buenos.
            secano = [c for c in CULTIVOS if not CULTIVOS[c]['riego'] and CULTIVOS[c]['temporadas'] == GRANOS]
            ganadores = {}
            for anio in sorted({f['anio'] for f in ft}):
                fa = {f['cultivo']: f for f in ft if f['anio'] == anio and f['cultivo'] in secano}
                if len(fa) == len(secano):
                    g = max(fa.values(), key=lambda x: x['rel'])
                    ganadores[anio] = (g['cultivo'], fa['maiz']['rel'], fa['maiz']['enso'])
            conteo = {c: sum(1 for g in ganadores.values() if g[0] == c) for c in secano}
            t['mejor_cultivo_secano_veces'] = conteo
            orden = sorted(ganadores, key=lambda a: ganadores[a][1])
            t['anios_extremos'] = dict(
                peores=[dict(anio=a, enso=ganadores[a][2], maiz_rel=round(ganadores[a][1]), mejor=ganadores[a][0]) for a in orden[:4]],
                mejores=[dict(anio=a, enso=ganadores[a][2], maiz_rel=round(ganadores[a][1]), mejor=ganadores[a][0]) for a in orden[-3:]],
            )
            d['temporadas'][temporada] = t
        d['mercado_exportacion'] = mercado
        d['enso_actual'] = enso
        salida[depto] = d
    return salida


def principal() -> None:
    filas = construir()
    SALIDA.mkdir(parents=True, exist_ok=True)
    with open(SALIDA / 'desempeno_departamental.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    texto = validar(filas)
    (SALIDA / 'validacion.txt').write_text(texto + '\n')
    print(texto)
    WEB.mkdir(parents=True, exist_ok=True)
    rec = recortar(filas)
    for depto, d in rec.items():
        (WEB / f'{depto}.json').write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    print(f'\n{len(filas)} filas; recortes en {WEB}')


if __name__ == '__main__':
    principal()
