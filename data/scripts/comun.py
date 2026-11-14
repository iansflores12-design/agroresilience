"""Utilidades comunes: zonas, manifiesto, logs y descarga reanudable.

Regla: raw/ nunca se modifica. Si un archivo ya esta en el manifiesto y existe
en disco, no se vuelve a bajar.
"""
import csv
import hashlib
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RAW = RAIZ / "raw"
PROCESSED = RAIZ / "processed"
MANIFIESTO = RAIZ / "manifest" / "raw_manifest.csv"
LOGS = RAIZ / "logs"
TZ_HN = timezone(timedelta(hours=-6))  # Honduras, sin horario de verano
CAMPOS = ["dataset", "archivo", "url", "fecha_descarga_hn", "bytes", "sha256", "nota"]
AGENTE = "datos-agroresilience/1.0 (python-urllib)"


def zonas():
    return json.loads((RAIZ / "config" / "zonas.json").read_text(encoding="utf-8"))


def logger(dataset):
    LOGS.mkdir(exist_ok=True)
    log = logging.getLogger(dataset)
    if not log.handlers:
        log.setLevel(logging.INFO)
        fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        for h in (logging.FileHandler(LOGS / f"{dataset}.log", encoding="utf-8"), logging.StreamHandler()):
            h.setFormatter(fmt)
            log.addHandler(h)
    return log


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def en_manifiesto():
    if not MANIFIESTO.exists():
        return set()
    with open(MANIFIESTO, newline="", encoding="utf-8") as f:
        return {fila["archivo"] for fila in csv.DictReader(f)}


def registrar(dataset, ruta, url, nota=""):
    ruta = Path(ruta)
    nuevo = not MANIFIESTO.exists()
    with open(MANIFIESTO, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        if nuevo:
            w.writeheader()
        w.writerow({
            "dataset": dataset,
            "archivo": str(ruta.relative_to(RAIZ)),
            "url": url,
            "fecha_descarga_hn": datetime.now(TZ_HN).isoformat(timespec="seconds"),
            "bytes": ruta.stat().st_size,
            "sha256": sha256(ruta),
            "nota": nota,
        })


def ya_bajado(ruta):
    ruta = Path(ruta)
    return ruta.exists() and str(ruta.relative_to(RAIZ)) in en_manifiesto()


def bajar(dataset, url, destino, log, nota="", intentos=3, pausa=10, timeout=300, cabeceras=None):
    """Baja url a destino tal cual (bytes). Devuelve 'ok', 'omitido' o 'fallo'."""
    destino = Path(destino)
    if ya_bajado(destino):
        log.info("omitido (ya en manifiesto): %s", destino.name)
        return "omitido"
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + ".parcial")
    for i in range(1, intentos + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE, **(cabeceras or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r, open(tmp, "wb") as f:
                while True:
                    bloque = r.read(1 << 20)
                    if not bloque:
                        break
                    f.write(bloque)
            tmp.rename(destino)
            registrar(dataset, destino, url, nota)
            log.info("ok: %s (%d bytes)", destino.name, destino.stat().st_size)
            return "ok"
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode("utf-8", "replace")[:2000]
            log.error("intento %d/%d HTTP %s en %s: %s", i, intentos, e.code, url, cuerpo)
        except Exception as e:  # red, timeout
            log.error("intento %d/%d error en %s: %r", i, intentos, url, e)
        if tmp.exists():
            tmp.unlink()
        if i < intentos:
            time.sleep(pausa)
    return "fallo"


def resumen(dataset, resultados, carpeta):
    archivos = [p for p in Path(carpeta).glob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in archivos)
    print(f"RESUMEN {dataset}: {len(archivos)} archivos, {total / 1e6:.2f} MB, "
          f"nuevos={resultados.count('ok')}, omitidos={resultados.count('omitido')}, "
          f"fallos={resultados.count('fallo')}")
