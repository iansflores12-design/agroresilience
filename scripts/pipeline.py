"""Actualiza TODO en orden, reejecutable (ideal para el Programador de tareas, 1 vez al dia).

 1. descargas incrementales (solo lo nuevo):  POWER/ONI recientes, Earthdata (IMERG Final+Late, SMAP, GLDAS),
    ERA5 + MODIS + Sentinel-2 + Landsat (Planetary Computer / Open-Meteo), ECOSTRESS directo,
    Meteomatics (solo si hay METEOMATICS_USER y METEOMATICS_PASSWORD en el entorno)
 2. procesamiento a processed/:  malla SMAP, GLDAS, procesar_nuevo.py (lee solo archivos nuevos por sha256)
 3. dataset de entrenamiento:  scripts/construir_dataset.py -> processed/modelo/
 4. limpieza (SOLO con --limpiar): scripts/limpiar_crudos.py borra los crudos ya procesados
Un paso que falla no detiene los demas; todo queda en logs/pipeline_<fecha>.log.
Uso: .venv/Scripts/python -I scripts/pipeline.py [--sin-descargas] [--limpiar]
"""
import os, subprocess, sys, time
from datetime import date
from pathlib import Path

S = Path(__file__).resolve().parent
R = S.parent
py = sys.executable
log = R / "logs" / f"pipeline_{date.today():%Y%m%d}.log"
log.parent.mkdir(exist_ok=True)
descargas = [["actualizar_reciente.py"], ["descargar_earthdata.py", "todo"], ["fuentes_extra.py", "todo"],
             ["era5_cds.py"], ["ecostress_directo.py"]]
if os.environ.get("METEOMATICS_USER"):
    descargas += [["meteomatics.py"], ["meteomatics.py", "--nuevos"]]
proceso = [["unir_sufijos.py"], ["generar_malla_smap.py"], ["adaptar_gldas.py"], ["procesar_nuevo.py"],
           ["construir_dataset.py"]] + ([["limpiar_crudos.py"]] if "--limpiar" in sys.argv else [])
pasos = (proceso if "--sin-descargas" in sys.argv else descargas + proceso)
with open(log, "a", encoding="utf-8") as f:
    for p in pasos:
        t0 = time.time()
        f.write(f"\n>>> {' '.join(p)}  ({time.strftime('%H:%M:%S')})\n"); f.flush()
        r = subprocess.run([py, "-u", "-I", str(S / p[0]), *p[1:]], stdout=f, stderr=subprocess.STDOUT)
        estado = "ok" if r.returncode == 0 else f"FALLO (codigo {r.returncode})"
        f.write(f"<<< {p[0]}: {estado} en {time.time() - t0:.0f} s\n"); f.flush()
        print(f"{p[0]}: {estado}", flush=True)
print("log:", log)

