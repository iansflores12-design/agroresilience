"""Sube processed/*.csv a las tablas de Supabase. Solo viaja lo nuevo o lo que cambio.

En la base solo viven los datos procesados: los crudos nunca se suben. Cada CSV entra por una tabla
temporal que desaparece al terminar su transaccion, y de ahi pasa a su tabla con un solo INSERT ... ON
CONFLICT que no reescribe las filas que ya estaban iguales.

Como decide que subir:
  - Tablas con fecha (series diarias): solo las filas desde la ultima fecha cargada menos una ventana
    (120 dias por defecto, porque NASA POWER corrige sus ultimos 90 dias). La ultima fecha de cada tabla
    se guarda en la tabla `cargas`, asi que no hay que recorrer la serie para saber por donde va.
  - Tablas chicas sin fecha (suelo, topografia, pronostico, ONI...): se comparan completas y se borra de
    la base lo que ya no esta en el CSV.
  - Con --modificados-desde EPOCH se saltan los CSV que no cambiaron en esta corrida (lo usa pipeline.py).

Si la base se llena: al terminar mide su tamano y, si pasa de --limite-mb (450 por defecto; el plan gratuito
de Supabase da 500), borra el ano mas viejo de todas las series con fecha, compacta esas tablas y vuelve a medir,
hasta quedar debajo. Nunca deja menos de --minimo-anios (10). Lo recortado se anota en cargas.recortado_hasta
para no volver a subirlo; los CSV de processed/ quedan completos (el motor Kharis entrena con ellos).

Conexion: variable SUPABASE_DB_URL o archivo config/supabase_db_token.txt (una linea con la cadena de
conexion de Postgres del proyecto; NO se sube a git). En Supabase: Connect -> Session pooler.

Uso (desde la raiz del proyecto):
    .venv/Scripts/python -I scripts/cargar_supabase.py                 carga incremental de todo
    .venv/Scripts/python -I scripts/cargar_supabase.py --todo          primera carga o recarga completa
    .venv/Scripts/python -I scripts/cargar_supabase.py --tablas oni,power_diario_largo
    .venv/Scripts/python -I scripts/cargar_supabase.py --simulacro     cuenta lo que subiria, sin conectarse
    .venv/Scripts/python -I scripts/cargar_supabase.py --estado        ultima fecha cargada de cada tabla
    .venv/Scripts/python -I scripts/cargar_supabase.py --esquema       imprime el SQL de las tablas
    .venv/Scripts/python -I scripts/cargar_supabase.py --carpeta DIR   lee los CSV de otra carpeta
    .venv/Scripts/python -I scripts/cargar_supabase.py --limite-mb 300 recorta antes, con otro tope
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

R = Path(__file__).resolve().parent.parent
PRO = R / "processed"
VENTANA_DIAS = 120
LIMITE_MB = 450
MINIMO_ANIOS = 10

# (archivo CSV y tabla, columnas de la llave, columna de fecha para la carga incremental o None).
# Las llaves son las mismas con las que los scripts fusionan cada CSV.
TABLAS = [
    ("power_diario_largo", ["punto", "fecha"], "fecha"),
    ("era5_diario", ["punto", "fecha"], "fecha"),
    ("imerg_series", ["punto", "fecha"], "fecha"),
    ("smap_series", ["punto", "fecha"], "fecha"),
    ("gldas_diario", ["punto", "fecha"], "fecha"),
    ("grace_series", ["punto", "fecha"], "fecha"),
    ("meteomatics_diario_largo", ["punto", "marca_utc"], "dia_local"),
    ("modis_ndvi", ["punto", "fecha"], "fecha"),
    ("sentinel2_indices", ["punto", "fecha"], "fecha"),
    ("landsat_ndvi", ["punto", "fecha"], "fecha"),
    ("ecostress_lst", ["punto", "granulo"], "fecha"),
    ("meteomatics_pronostico", ["punto", "marca_utc"], None),
    ("meteomatics_estaticos", ["punto"], None),
    ("oni", ["anio", "trimestre"], None),
    ("huracanes_caribe_honduras", ["sid", "fecha_hora_utc"], None),
    ("suelo_por_punto", ["punto"], None),
    ("topografia_por_punto", ["punto"], None),
    ("gedi_biomasa_por_punto", ["punto"], None),
    ("gaez_aptitud_por_punto", ["punto", "cultivo", "agua", "nivel_insumos", "co2", "periodo"], None),
    ("gaez_recursos_por_punto", ["punto", "capa", "tema"], None),
    ("calidad_power", ["punto", "parametro"], None),
]
# La latitud y la longitud del punto se repiten en cada fila del CSV: en la base viven una vez, en `puntos`.
REPETIDAS = {"latitud", "longitud"}
# Columnas que hoy vienen vacias en todo el CSV: el tipo no se puede deducir de los datos, asi que se fija aqui.
TIPOS_FIJOS = {("smap_series", "soil_moisture_error_am"): "real", ("smap_series", "soil_moisture_error_pm"): "real"}


def columna(nombre):
    """Nombre del CSV -> nombre de columna en Postgres: 't_2m:C' -> 't_2m_c', 'T2M_MAX' -> 't2m_max'."""
    return re.sub(r"[^a-z0-9]+", "_", nombre.lower()).strip("_")


def columnas_de(encabezado, con_punto):
    """Columnas del CSV que van a la tabla: [(indice, nombre en la base)], sin las repetidas."""
    cols = [(i, columna(c)) for i, c in enumerate(encabezado) if not (con_punto and columna(c) in REPETIDAS)]
    nombres = [c for _, c in cols]
    if len(set(nombres)) != len(nombres):
        raise ValueError(f"columnas que chocan al normalizar: {nombres}")
    return cols


# ---------- Esquema ----------

ENTERO = re.compile(r"-?\d+$")
DECIMAL = re.compile(r"-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|nan$|-?inf$", re.I)
FORMAS = [("date", re.compile(r"\d{4}-\d{2}-\d{2}$")), ("timestamptz", re.compile(r"\d{4}-\d{2}-\d{2}T[\d:.]+Z$")),
          ("timestamp", re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")), ("time", re.compile(r"\d{2}:\d{2}$"))]


def tipo_de(valores):
    """Tipo de Postgres mas chico que guarda todos los valores. Los decimales van en real (4 bytes, 6 a 7
    cifras: de sobra para mediciones) y los enteros en integer; asi la serie pesa cerca de la mitad."""
    vistos = [v for v in valores if v != ""]
    if not vistos:
        return "text"
    if all(ENTERO.match(v) for v in vistos):
        return "integer" if all(abs(int(v)) < 2**31 for v in vistos) else "bigint"
    if all(DECIMAL.match(v) for v in vistos):
        return "real"
    for tipo, forma in FORMAS:
        if all(forma.match(v) for v in vistos):
            return tipo
    return "text"


def leer_csv(ruta):
    with open(ruta, newline="", encoding="utf-8") as f:
        lector = csv.reader(f)
        encabezado = next(lector)
        return encabezado, list(lector)


def esquema():
    """SQL de todas las tablas, con los tipos deducidos de los CSV que hay hoy en processed/."""
    sql = ["""-- Tablas de datos procesados de AgroResilience. Generado con: scripts/cargar_supabase.py --esquema
-- Los crudos no viven en la base: cada carga entra por una tabla temporal y solo queda lo procesado.

create table if not exists public.puntos (
  id smallint generated by default as identity primary key,
  codigo text not null unique,
  nombre text,
  latitud double precision not null,
  longitud double precision not null,
  departamento text,
  tipo text,
  cultivos_zona text
);

-- Por donde va cada tabla: la carga diaria lee de aqui la ultima fecha, sin recorrer las series.
create table if not exists public.cargas (
  tabla text primary key,
  ultima_fecha date,
  filas bigint not null default 0,
  enviadas integer not null default 0,
  cambiadas integer not null default 0,
  actualizado timestamptz not null default now(),
  -- Si la base se lleno, desde que fecha quedan datos (lo anterior se borro y no se vuelve a subir).
  recortado_hasta date
);"""]
    nombres = ["puntos", "cargas"]
    for tabla, claves, _ in TABLAS:
        ruta = PRO / f"{tabla}.csv"
        if not ruta.exists():
            print(f"-- falta {ruta.name}: tabla omitida", file=sys.stderr)
            continue
        encabezado, filas = leer_csv(ruta)
        con_punto = "punto" in encabezado
        llave = [columna(c) for c in claves]
        vistas = set()
        for fila in filas:
            k = tuple(fila[encabezado.index(c)] for c in claves)
            if k in vistas:
                raise ValueError(f"{tabla}: la llave {claves} se repite en {k}")
            vistas.add(k)
        lineas = []
        for i, nombre in columnas_de(encabezado, con_punto):
            if nombre == "punto":
                lineas.append("  punto_id smallint not null references public.puntos (id)")
                continue
            tipo = TIPOS_FIJOS.get((tabla, nombre))
            if not tipo:
                if all(fila[i] == "" for fila in filas):
                    print(f"-- {tabla}.{nombre}: columna vacia, queda como text; fije su tipo en TIPOS_FIJOS", file=sys.stderr)
                tipo = tipo_de(fila[i] for fila in filas)
            lineas.append(f"  {nombre} {tipo}" + (" not null" if nombre in llave else ""))
        pk = ", ".join("punto_id" if c == "punto" else c for c in llave)
        lineas.append(f"  primary key ({pk})")
        sql.append(f"create table if not exists public.{tabla} (\n" + ",\n".join(lineas) + "\n);")
        nombres.append(tabla)
    sql.append("-- Datos publicos de solo lectura: cualquiera puede leer; solo la carga (rol postgres) escribe.")
    for n in nombres:
        sql.append(f"alter table public.{n} enable row level security;\n"
                   f"drop policy if exists lectura_publica on public.{n};\n"
                   f"create policy lectura_publica on public.{n} for select to anon, authenticated using (true);")
    return "\n\n".join(sql) + "\n"


# ---------- Carga ----------

def cadena_conexion():
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    f = R / "config" / "supabase_db_token.txt"
    if not url and f.exists():
        url = f.read_text(encoding="utf-8").strip()
    if not url:
        sys.exit("Falta la conexion a Supabase: variable SUPABASE_DB_URL o config/supabase_db_token.txt (ver el encabezado).")
    return url


def conectar():
    import psycopg  # solo hace falta para hablar con la base
    # prepare_threshold=None: el pooler de Supabase no admite sentencias preparadas.
    return psycopg.connect(cadena_conexion(), prepare_threshold=None, connect_timeout=30)


def filas_a_subir(ruta, col_fecha, corte, piso=None):
    """Encabezado y filas del CSV desde `corte` (todas si no hay corte), y la ultima fecha del archivo.
    `piso`: lo anterior se recorto de la base porque se lleno, asi que no se sube nunca."""
    encabezado, filas = leer_csv(ruta)
    ultima = None
    if col_fecha:
        i = encabezado.index(col_fecha)
        fechas = [f[i] for f in filas if f[i]]
        ultima = max(fechas) if fechas else None
        desde = max(c for c in (corte, piso) if c) if (corte or piso) else None
        if desde:
            filas = [f for f in filas if f[i] >= desde]
    return encabezado, filas, ultima


def subir_puntos(cur):
    puntos = json.loads((R / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"]
    cur.executemany(
        """insert into public.puntos as d (codigo, nombre, latitud, longitud, departamento, tipo, cultivos_zona)
           values (%s, %s, %s, %s, %s, %s, %s)
           on conflict (codigo) do update set nombre = excluded.nombre, latitud = excluded.latitud, longitud = excluded.longitud,
             departamento = excluded.departamento, tipo = excluded.tipo, cultivos_zona = excluded.cultivos_zona
           where (d.nombre, d.latitud, d.longitud, d.departamento, d.tipo, d.cultivos_zona)
             is distinct from (excluded.nombre, excluded.latitud, excluded.longitud, excluded.departamento, excluded.tipo, excluded.cultivos_zona)""",
        [(p["id"], p.get("nombre"), p["lat"], p["lon"], p.get("departamento"), p.get("tipo"), p.get("cultivos_zona")) for p in puntos])


def sql_de_carga(tabla, claves, cols, tipos, completa):
    """El INSERT ... ON CONFLICT de una tabla y, si se sincroniza completa, el DELETE de lo que sobra."""
    con_punto = any(c == "punto" for c in cols)
    destino = ["punto_id" if c == "punto" else c for c in cols]

    def valor(c):
        # pandas escribe 7.0 cuando a una columna entera le aparece un vacio: pasa por numeric para no fallar.
        t = tipos[c]
        return f"s.{c}::numeric::{t}" if t in ("integer", "bigint", "smallint") else f"s.{c}::{t}"

    origen = ["p.id" if c == "punto" else valor(c) for c in cols]
    llave = ["punto_id" if c == "punto" else c for c in claves]
    datos = [c for c in destino if c not in llave]
    cruce = " join public.puntos p on p.codigo = s.punto" if con_punto else ""
    orden = ", ".join("p.id" if c == "punto" else valor(c) for c in claves)
    insertar = (f"insert into public.{tabla} as d ({', '.join(destino)})\n"
                f"select distinct on ({orden}) {', '.join(origen)}\nfrom _carga s{cruce}\norder by {orden}\n"
                f"on conflict ({', '.join(llave)}) ")
    if datos:
        # Solo se reescribe la fila que de verdad cambio: menos escritura y menos basura en la tabla.
        insertar += ("do update set " + ", ".join(f"{c} = excluded.{c}" for c in datos) +
                     "\nwhere (" + ", ".join(f"d.{c}" for c in datos) + ") is distinct from (" +
                     ", ".join(f"excluded.{c}" for c in datos) + ")")
    else:
        insertar += "do nothing"
    borrar = None
    if completa:
        iguales = " and ".join(f"d.{k} = " + ("p.id" if c == "punto" else valor(c)) for k, c in zip(llave, claves))
        borrar = f"delete from public.{tabla} d where not exists (select 1 from _carga s{cruce} where {iguales})"
    return insertar, borrar


def cargar_tabla(con, tabla, claves, col_fecha, tipos_base, todo, ventana, log):
    ruta = PRO / f"{tabla}.csv"
    with con.transaction(), con.cursor() as cur:
        corte = piso = None
        if col_fecha:
            con_recorte = "recortado_hasta" in tipos_base.get("cargas", {})
            cur.execute("select ultima_fecha" + (", recortado_hasta" if con_recorte else ", null") +
                        " from public.cargas where tabla = %s", (tabla,))
            fila = cur.fetchone()
            if fila and fila[0] and not todo:
                corte = (fila[0] - timedelta(days=ventana)).isoformat()
            if fila and fila[1]:
                piso = fila[1].isoformat()
        encabezado, filas, ultima = filas_a_subir(ruta, col_fecha, corte, piso)
        con_punto = "punto" in encabezado
        pares = columnas_de(encabezado, con_punto)
        tipos = tipos_base.get(tabla, {})
        faltan = [c for _, c in pares if c != "punto" and c not in tipos]
        if faltan:
            # Una columna nueva en el CSV no se pierde en silencio: se avisa y la tabla se salta.
            log(f"{tabla:<28} SALTADA: la tabla no tiene las columnas {faltan}; actualice el esquema (--esquema)")
            return False
        cols = [c for _, c in pares]
        cur.execute("create temp table _carga (" + ", ".join(f"{c} text" for c in cols) + ") on commit drop")
        with cur.copy(f"copy _carga ({', '.join(cols)}) from stdin (format csv)") as copia:
            bloque = io.StringIO()
            escritor = csv.writer(bloque, lineterminator="\n")
            for n, fila in enumerate(filas, 1):
                escritor.writerow([fila[i] for i, _ in pares])
                if n % 20000 == 0:
                    copia.write(bloque.getvalue()); bloque.seek(0); bloque.truncate()
            copia.write(bloque.getvalue())
        insertar, borrar = sql_de_carga(tabla, [columna(c) for c in claves], cols, tipos, completa=col_fecha is None)
        cur.execute(insertar)
        cambiadas = cur.rowcount
        borradas = 0
        if borrar:
            cur.execute(borrar)
            borradas = cur.rowcount
        cur.execute("select count(*) from public." + tabla)
        total = cur.fetchone()[0]
        cur.execute(
            """insert into public.cargas (tabla, ultima_fecha, filas, enviadas, cambiadas, actualizado)
               values (%s, %s, %s, %s, %s, now())
               on conflict (tabla) do update set ultima_fecha = greatest(excluded.ultima_fecha, cargas.ultima_fecha),
                 filas = excluded.filas, enviadas = excluded.enviadas, cambiadas = excluded.cambiadas, actualizado = now()""",
            (tabla, ultima, total, len(filas), cambiadas + borradas))
    log(f"{tabla:<28} enviadas {len(filas):>7}  nuevas o cambiadas {cambiadas:>7}"
        + (f"  borradas {borradas}" if borradas else "") + f"  total {total:>7}" + (f"  desde {corte}" if corte else ""))
    return True


def tamano_mb(cur):
    cur.execute("select pg_database_size(current_database())")
    return cur.fetchone()[0] / 1048576


def recortar(con, limite_mb, minimo_anios, log):
    """Si la base pasa de `limite_mb`, borra el ano mas viejo de las series con fecha hasta quedar debajo."""
    con.autocommit = True  # VACUUM FULL no corre dentro de una transaccion
    try:
        with con.cursor() as cur:
            mb = tamano_mb(cur)
            log(f"base: {mb:.0f} MB de {limite_mb} MB permitidos")
            cur.execute("select table_name from information_schema.columns where table_schema = 'public' "
                        "and table_name = 'cargas' and column_name = 'recortado_hasta'")
            if mb > limite_mb and not cur.fetchone():
                log("RECORTE SALTADO: falta cargas.recortado_hasta; aplique supabase/migrations"); return
            cur.execute("select table_name from information_schema.tables where table_schema = 'public'")
            existen = {r[0] for r in cur.fetchall()}
            series = [(t, columna(c)) for t, _, c in TABLAS if c and t in existen]
            while mb > limite_mb:
                rangos = {}
                for t, c in series:
                    cur.execute(f"select extract(year from min({c}::date))::int, extract(year from max({c}::date))::int from public.{t}")
                    a, b = cur.fetchone()
                    if a is not None:
                        rangos[t] = (a, b)
                if not rangos:
                    break
                viejo = min(a for a, _ in rangos.values())
                nuevo = max(b for _, b in rangos.values())
                if nuevo - viejo + 1 <= minimo_anios:
                    log(f"AVISO: la base sigue en {mb:.0f} MB pero ya solo guarda {nuevo - viejo + 1} anos (minimo {minimo_anios}); "
                        "suba --limite-mb, baje --minimo-anios o amplie el plan"); break
                hasta = date(viejo + 1, 1, 1)
                borradas = 0
                for t, c in series:
                    if rangos.get(t, (9999,))[0] > viejo:
                        continue
                    cur.execute(f"delete from public.{t} where {c}::date < %s", (hasta,))
                    borradas += cur.rowcount
                    cur.execute("""insert into public.cargas (tabla, recortado_hasta) values (%s, %s)
                                   on conflict (tabla) do update set recortado_hasta = greatest(cargas.recortado_hasta, excluded.recortado_hasta)""",
                                (t, hasta))
                    cur.execute(f"vacuum full public.{t}")  # devuelve el espacio: sin esto el tamano no baja
                    cur.execute("update public.cargas set filas = (select count(*) from public." + t + ") where tabla = %s", (t,))
                mb = tamano_mb(cur)
                log(f"recorte: borrado {viejo} ({borradas} filas); la base queda en {mb:.0f} MB")
    finally:
        con.autocommit = False


def simulacro(seleccion, ventana, modificados_desde):
    for tabla, _, col_fecha in seleccion:
        ruta = PRO / f"{tabla}.csv"
        if not ruta.exists():
            print(f"{tabla:<28} falta el CSV"); continue
        if modificados_desde and ruta.stat().st_mtime < modificados_desde:
            print(f"{tabla:<28} sin cambios en esta corrida"); continue
        encabezado, filas, ultima = filas_a_subir(ruta, col_fecha, None)
        recientes = len(filas)
        if col_fecha and ultima:
            corte = (date.fromisoformat(ultima[:10]) - timedelta(days=ventana)).isoformat()
            recientes = len(filas_a_subir(ruta, col_fecha, corte)[1])
        print(f"{tabla:<28} filas {len(filas):>7}  columnas {len(columnas_de(encabezado, 'punto' in encabezado)):>3}"
              f"  en una carga diaria {recientes:>6}" + (f"  ultima fecha {ultima}" if ultima else ""))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--tablas", help="nombres separados por coma (defecto: todas)")
    ap.add_argument("--todo", action="store_true", help="sube las series completas, no solo la ventana reciente")
    ap.add_argument("--ventana", type=int, default=VENTANA_DIAS, help="dias hacia atras que se vuelven a comparar")
    ap.add_argument("--modificados-desde", type=float, default=0, help="salta los CSV sin cambios desde ese instante (epoch)")
    ap.add_argument("--carpeta", help="carpeta de los CSV procesados (defecto: processed/ o AGRO_SALIDA)")
    ap.add_argument("--limite-mb", type=float, default=LIMITE_MB, help="tope de la base antes de recortar anos viejos")
    ap.add_argument("--minimo-anios", type=int, default=MINIMO_ANIOS, help="anos que nunca se recortan")
    ap.add_argument("--simulacro", action="store_true")
    ap.add_argument("--estado", action="store_true")
    ap.add_argument("--esquema", action="store_true")
    a = ap.parse_args(argv)
    global PRO
    carpeta = a.carpeta or os.environ.get("AGRO_SALIDA")
    if carpeta:
        PRO = Path(carpeta).resolve()
    if a.esquema:
        print(esquema(), end="")
        return 0
    pedido = set(a.tablas.split(",")) if a.tablas else None
    seleccion = [t for t in TABLAS if not pedido or t[0] in pedido]
    if pedido and len(seleccion) != len(pedido):
        sys.exit(f"tabla desconocida: {sorted(pedido - {t[0] for t in TABLAS})}")
    if a.simulacro:
        simulacro(seleccion, a.ventana, a.modificados_desde)
        return 0
    t0 = time.time()
    fallos = 0
    with conectar() as con:
        if a.estado:
            with con.cursor() as cur:
                cur.execute("select tabla, ultima_fecha, filas, actualizado from public.cargas order by tabla")
                for tabla, ultima, filas, cuando in cur.fetchall():
                    print(f"{tabla:<28} ultima fecha {str(ultima or '-'):<10}  filas {filas:>7}  cargada {cuando:%Y-%m-%d %H:%M}")
            return 0
        with con.transaction(), con.cursor() as cur:
            cur.execute("set statement_timeout = '15min'")
            subir_puntos(cur)
            cur.execute("select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'")
            tipos_base = {}
            for tabla, col, tipo in cur.fetchall():
                tipos_base.setdefault(tabla, {})[col] = tipo
        for tabla, claves, col_fecha in seleccion:
            ruta = PRO / f"{tabla}.csv"
            if not ruta.exists():
                print(f"{tabla:<28} falta el CSV"); continue
            if a.modificados_desde and ruta.stat().st_mtime < a.modificados_desde:
                print(f"{tabla:<28} sin cambios en esta corrida"); continue
            if tabla not in tipos_base:
                print(f"{tabla:<28} SALTADA: la tabla no existe en la base; aplique supabase/migrations"); fallos += 1; continue
            try:
                if not cargar_tabla(con, tabla, claves, col_fecha, tipos_base, a.todo, a.ventana, print):
                    fallos += 1
            except Exception as e:  # una tabla que falla no detiene las demas
                print(f"{tabla:<28} FALLO: {str(e).splitlines()[0][:200]}"); fallos += 1
        try:
            recortar(con, a.limite_mb, a.minimo_anios, print)
        except Exception as e:
            print(f"recorte FALLO: {str(e).splitlines()[0][:200]}"); fallos += 1
    print(f"listo en {time.time() - t0:.0f} s" + (f"; {fallos} tabla(s) con problemas" if fallos else ""))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
