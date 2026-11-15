"""Deja scripts/pipeline.py corriendo solo una vez al dia, en el equipo que guarda los crudos.

  Windows   Programador de tareas (schtasks), tarea "AgroResilience Pipeline"
  macOS     launchd, ~/Library/LaunchAgents/org.agroresilience.pipeline.plist
  Linux     imprime la linea de crontab para pegarla con `crontab -e`
La tarea usa el mismo Python con que se corre este script (corralo con el de .venv) y los argumentos que se
pasen despues de --, por ejemplo: programar.py --hora 05:30 -- --kharis
Las credenciales salen de config/*_token.txt; las variables de entorno de la terminal NO pasan a la tarea
(Meteomatics solo corre si METEOMATICS_USER y METEOMATICS_PASSWORD estan en el entorno del sistema).

Uso (desde la raiz del proyecto):
    .venv/Scripts/python -I scripts/programar.py                    todos los dias a las 05:30
    .venv/Scripts/python -I scripts/programar.py --hora 04:00 -- --kharis
    .venv/Scripts/python -I scripts/programar.py --estado           si esta programada y cuando corre
    .venv/Scripts/python -I scripts/programar.py --ahora            la lanza ya, para probar
    .venv/Scripts/python -I scripts/programar.py --quitar
"""
import argparse
import os
import platform
import plistlib
import re
import subprocess
import sys
from pathlib import Path

R = Path(__file__).resolve().parent.parent
PIPELINE = R / "scripts" / "pipeline.py"
NOMBRE_WIN = "AgroResilience Pipeline"
ETIQUETA_MAC = "org.agroresilience.pipeline"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{ETIQUETA_MAC}.plist"


def correr(cmd, revisar=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if revisar and r.returncode:
        sys.exit(f"fallo: {' '.join(cmd)}\n{(r.stderr or r.stdout).strip()}")
    return r


def comando(extra):
    return [sys.executable, "-I", str(PIPELINE), *extra]


# ---------- Windows ----------

def win_instalar(hora, extra):
    tr = subprocess.list2cmdline(comando(extra))
    # La tarea arranca en la raiz del proyecto: schtasks no tiene carpeta de trabajo, asi que va por cmd /c cd.
    tr = f'cmd /c cd /d "{R}" && {tr}'
    correr(["schtasks", "/Create", "/F", "/SC", "DAILY", "/ST", hora, "/TN", NOMBRE_WIN, "/TR", tr])
    print(f"programada: {NOMBRE_WIN}, todos los dias a las {hora}")


def win_estado():
    r = correr(["schtasks", "/Query", "/TN", NOMBRE_WIN, "/V", "/FO", "LIST"], revisar=False)
    if r.returncode:
        print("no esta programada"); return
    for linea in r.stdout.splitlines():
        if re.match(r"\s*(Next Run Time|Last Run Time|Last Result|Status|Hora pr|.ltimo|Estado)", linea):
            print(linea.strip())


# ---------- macOS ----------

def mac_dominio():
    return f"gui/{os.getuid()}"


def mac_instalar(hora, extra):
    h, m = (int(x) for x in hora.split(":"))
    (R / "logs").mkdir(exist_ok=True)
    datos = {
        "Label": ETIQUETA_MAC,
        "ProgramArguments": comando(extra),
        "WorkingDirectory": str(R),
        # Si el equipo estaba dormido a esa hora, launchd la corre al despertar.
        "StartCalendarInterval": {"Hour": h, "Minute": m},
        # Lo que pipeline.py imprime; el detalle de cada paso queda en logs/pipeline_<fecha>.log.
        "StandardOutPath": str(R / "logs" / "programada.log"),
        "StandardErrorPath": str(R / "logs" / "programada.log"),
        "ProcessType": "Background",
        "LowPriorityIO": True,
    }
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    correr(["launchctl", "bootout", f"{mac_dominio()}/{ETIQUETA_MAC}"], revisar=False)
    PLIST.write_bytes(plistlib.dumps(datos))
    correr(["launchctl", "bootstrap", mac_dominio(), str(PLIST)])
    print(f"programada: {ETIQUETA_MAC}, todos los dias a las {hora}\n  {PLIST}")


def mac_estado():
    r = correr(["launchctl", "print", f"{mac_dominio()}/{ETIQUETA_MAC}"], revisar=False)
    if r.returncode:
        print("no esta programada"); return
    datos = plistlib.loads(PLIST.read_bytes()) if PLIST.exists() else {}
    h = datos.get("StartCalendarInterval", {})
    print(f"programada todos los dias a las {h.get('Hour', 0):02d}:{h.get('Minute', 0):02d}")
    print("comando:", " ".join(datos.get("ProgramArguments", [])))
    for linea in r.stdout.splitlines():
        if re.match(r"\s*(state|last exit code|runs) =", linea):
            print(linea.strip())


# ---------- Linux ----------

def cron(hora, extra):
    h, m = (int(x) for x in hora.split(":"))
    print("Pegue esta linea con `crontab -e`:")
    print(f"{m} {h} * * * cd {subprocess.list2cmdline([str(R)])} && {subprocess.list2cmdline(comando(extra))} >> logs/programada.log 2>&1")


def main():
    if "--" in sys.argv:
        i = sys.argv.index("--")
        propios, extra = sys.argv[1:i], sys.argv[i + 1:]
    else:
        propios, extra = sys.argv[1:], []
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--hora", default="05:30", help="HH:MM, hora local del equipo (defecto 05:30)")
    ap.add_argument("--estado", action="store_true")
    ap.add_argument("--quitar", action="store_true")
    ap.add_argument("--ahora", action="store_true", help="lanza la tarea programada ya")
    a = ap.parse_args(propios)
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", a.hora):
        sys.exit("--hora va como HH:MM, por ejemplo 05:30")
    so = platform.system()
    if so == "Windows":
        if a.estado: win_estado()
        elif a.quitar: correr(["schtasks", "/Delete", "/F", "/TN", NOMBRE_WIN]); print("quitada")
        elif a.ahora: correr(["schtasks", "/Run", "/TN", NOMBRE_WIN]); print("lanzada; avance en logs/")
        else: win_instalar(a.hora, extra)
    elif so == "Darwin":
        if a.estado: mac_estado()
        elif a.quitar:
            correr(["launchctl", "bootout", f"{mac_dominio()}/{ETIQUETA_MAC}"], revisar=False)
            PLIST.unlink(missing_ok=True); print("quitada")
        elif a.ahora: correr(["launchctl", "kickstart", f"{mac_dominio()}/{ETIQUETA_MAC}"]); print("lanzada; avance en logs/")
        else: mac_instalar(a.hora, extra)
    else:
        if a.estado or a.quitar or a.ahora:
            sys.exit("en Linux la tarea vive en crontab: revisela con `crontab -l`")
        cron(a.hora, extra)


if __name__ == "__main__":
    main()
