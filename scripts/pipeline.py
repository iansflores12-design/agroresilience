"""Actualiza TODO en orden, reejecutable (scripts/programar.py lo deja corriendo 1 vez al dia).

 1. descargas incrementales (solo lo nuevo):  POWER/ONI recientes, Earthdata (IMERG Final+Late, SMAP, GLDAS),
    ERA5 + MODIS + Sentinel-2 + Landsat (Planetary Computer / Open-Meteo), ECOSTRESS directo,
    Meteomatics (solo si hay METEOMATICS_USER y METEOMATICS_PASSWORD en el entorno)
 2. procesamiento a processed/:  malla SMAP, GLDAS, procesar_nuevo.py (lee solo archivos nuevos por sha256)
 3. dataset de entrenamiento:  scripts/construir_dataset.py -> processed/modelo/
 4. Supabase:  scripts/cargar_supabase.py sube solo los CSV que cambiaron en esta corrida. Se salta si no hay
    conexion (SUPABASE_DB_URL o config/supabase_db_token.txt) o con --sin-supabase
 5. motor Kharis (SOLO con --kharis):  run_kharis.py --actualizar aprende de los datos nuevos y pronostica.
    Usa el Python de .venv_kharis/ si existe (lleva PyTorch)
 6. limpieza: scripts/limpiar_crudos.py borra de raw/ solo los crudos cuyo contenido ya esta en processed/.
    Las marcas .hecho_* quedan, asi que lo borrado no se vuelve a descargar. --conservar-crudos la salta
Registro: processed/registro_descargas.json guarda, por fuente, la ultima fecha que hay y si esta corrida trajo
algo nuevo. Cada descargador pide solo lo posterior a lo que ya tiene (marcas .hecho_* y fechas de processed/).
Un paso que falla no detiene los demas; todo queda en logs/pipeline_<fecha>.log. Si otra corrida sigue viva,
esta no arranca (logs/pipeline.lock). Sale con codigo 1 si algun paso fallo, para que el programador lo marque.
Uso: .venv/Scripts/python -I scripts/pipeline.py [--sin-descargas] [--sin-supabase] [--kharis] [--conservar-crudos]
"""
import csv, json, os, subprocess, sys, time
from datetime import date
from pathlib import Path

S = Path(__file__).resolve().parent
R = S.parent
py = sys.executable
args = set(sys.argv[1:])
log = R / "logs" / f"pipeline_{date.today():%Y%m%d}.log"
log.parent.mkdir(exist_ok=True)
candado = R / "logs" / "pipeline.lock"


def viva(pid):
    """True si el proceso sigue corriendo (para no pisar una corrida anterior que no termino)."""
    try:
        import psutil
        return psutil.pid_exists(pid)
    except ImportError:
        if os.name == "nt":
            r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True)
            return str(pid) in r.stdout
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def hay_supabase():
    return bool(os.environ.get("SUPABASE_DB_URL", "").strip()) or (R / "config" / "supabase_db_token.txt").exists()


def ultimas_fechas():
    """{tabla: (ultima fecha, filas)} de cada serie con fecha en processed/ (las de cargar_supabase.TABLAS)."""
    sys.path.insert(0, str(S))
    from cargar_supabase import TABLAS
    salida = {}
    for tabla, _, col in TABLAS:
        ruta = R / "processed" / f"{tabla}.csv"
        if not col or not ruta.exists():
            continue
        with open(ruta, newline="", encoding="utf-8") as f:
            lector = csv.reader(f)
            i = next(lector).index(col)
            ultima, filas = "", 0
            for fila in lector:
                filas += 1
                if fila[i] > ultima:
                    ultima = fila[i]
        salida[tabla] = (ultima[:10] or None, filas)
    return salida


def registrar(antes, despues):
    """Escribe processed/registro_descargas.json y devuelve las fuentes que trajeron algo nuevo."""
    ruta = R / "processed" / "registro_descargas.json"
    try:
        previo = json.loads(ruta.read_text(encoding="utf-8")).get("fuentes", {})
    except (OSError, ValueError):
        previo = {}
    ahora = time.strftime("%Y-%m-%d %H:%M:%S")
    fuentes, nuevas = {}, []
    for tabla, (ultima, filas) in despues.items():
        a = antes.get(tabla, (None, 0))
        hubo = (ultima or "") > (a[0] or "") or filas > a[1]
        if hubo:
            nuevas.append(f"{tabla} (hasta {ultima})")
        fuentes[tabla] = {"ultima_fecha": ultima, "filas": filas,
                          "ultimo_dato_nuevo": ahora if hubo else previo.get(tabla, {}).get("ultimo_dato_nuevo")}
    ruta.write_text(json.dumps({"ultima_corrida": ahora, "fuentes": fuentes}, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    return nuevas


def python_kharis():
    for sub in (("Scripts", "python.exe"), ("bin", "python")):
        p = R / ".venv_kharis" / sub[0] / sub[1]
        if p.exists():
            return str(p)
    return py


if candado.exists():
    try:
        pid = int(candado.read_text().strip() or 0)
    except ValueError:
        pid = 0
    if pid and pid != os.getpid() and viva(pid):
        sys.exit(f"otra corrida del pipeline sigue viva (pid {pid}); si no es asi, borre {candado}")
candado.write_text(str(os.getpid()))

inicio = time.time()
descargas = [["actualizar_reciente.py"], ["descargar_earthdata.py", "todo"], ["fuentes_extra.py", "todo"],
             ["era5_cds.py"], ["ecostress_directo.py"]]
if os.environ.get("METEOMATICS_USER"):
    descargas += [["meteomatics.py"], ["meteomatics.py", "--nuevos"]]
proceso = [["unir_sufijos.py"], ["generar_malla_smap.py"], ["adaptar_gldas.py"], ["procesar_nuevo.py"],
           ["construir_dataset.py"]]
# (comando, carpeta de trabajo): todos los pasos corren con -u -I desde la raiz, salvo Kharis desde su carpeta.
pasos = [([py, "-u", "-I", str(S / p[0]), *p[1:]], R) for p in ([] if "--sin-descargas" in args else descargas) + proceso]
if "--sin-supabase" not in args:
    if hay_supabase():
        # Solo los CSV que se escribieron desde que arranco esta corrida.
        pasos.append(([py, "-u", "-I", str(S / "cargar_supabase.py"), "--modificados-desde", f"{inicio:.0f}"], R))
    else:
        print("cargar_supabase.py: saltado (falta SUPABASE_DB_URL o config/supabase_db_token.txt)")
if "--kharis" in args:
    pasos.append(([python_kharis(), "-u", "run_kharis.py", "--actualizar"], R / "kharis_engine"))
if "--conservar-crudos" not in args:
    pasos.append(([py, "-u", "-I", str(S / "limpiar_crudos.py")], R))

fallos = []
antes = ultimas_fechas()
try:
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n===== corrida {time.strftime('%Y-%m-%d %H:%M:%S')}  {' '.join(sorted(args)) or '(completa)'}\n")
        for cmd, carpeta in pasos:
            nombre = Path(cmd[3] if cmd[2] == "-I" else cmd[2]).name
            t0 = time.time()
            f.write(f"\n>>> {nombre} {' '.join(cmd[4 if cmd[2] == '-I' else 3:])}  ({time.strftime('%H:%M:%S')})\n"); f.flush()
            try:
                r = subprocess.run(cmd, cwd=carpeta, stdout=f, stderr=subprocess.STDOUT)
                codigo = r.returncode
            except OSError as e:  # el ejecutable no existe, por ejemplo
                f.write(f"no se pudo lanzar: {e}\n"); codigo = -1
            estado = "ok" if codigo == 0 else f"FALLO (codigo {codigo})"
            if codigo:
                fallos.append(nombre)
            f.write(f"<<< {nombre}: {estado} en {time.time() - t0:.0f} s\n"); f.flush()
            print(f"{nombre}: {estado}", flush=True)
        nuevas = registrar(antes, ultimas_fechas())
        f.write("\ndatos nuevos: " + (", ".join(nuevas) or "ninguno") + "\n")
        print("datos nuevos:", ", ".join(nuevas) or "ninguno")
        resumen = f"terminado en {(time.time() - inicio) / 60:.0f} min" + (f"; fallaron: {', '.join(fallos)}" if fallos else "; todo ok")
        f.write(f"\n===== {resumen}\n")
finally:
    candado.unlink(missing_ok=True)
print(resumen)
print("log:", log)
sys.exit(1 if fallos else 0)
