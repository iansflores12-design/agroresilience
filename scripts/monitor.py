"""Panel en vivo: avance por fuente (%) y velocidad de bajada/subida de la red. Salir: Ctrl+C."""
import os, re, sys, time
from datetime import date, timedelta
from pathlib import Path
import psutil

R = Path(__file__).resolve().parent.parent
HOY = date.today() - timedelta(days=5)
dias = lambda d: (HOY - date.fromisoformat(d)).days + 1
META = {"imerg": dias("2000-06-01"), "smap": dias("2015-04-01"), "gldas": dias("2000-01-01") * 8}
import json
PUNTOS = len(json.loads((R / 'config' / 'zonas.json').read_text(encoding='utf-8'))['puntos'])
os.system("")  # activa colores ANSI en Windows


def archivos(c):
    tot = 0
    for carpeta in ([c, "imerg_late"] if c == "imerg" else [c]):  # IMERG = Final (hasta 2025-09) + Late (reciente)
        d = R / "raw" / carpeta
        tot += sum(1 for f in d.iterdir() if f.suffix == ".nc4") if d.exists() else 0
    return tot


_cache = {"t": 0, "v": {}}


def puntos_listos():
    """Puntos distintos ya guardados en cada CSV (se recalcula cada 20 s)."""
    if time.time() - _cache["t"] < 20:
        return _cache["v"]
    arch = {"era5": "era5_diario.csv", "modis": "modis_ndvi.csv", "sentinel2": "sentinel2_indices.csv", "landsat": "landsat_ndvi.csv"}
    out = {}
    for k, f in arch.items():
        ids = set()
        base = R / "processed" / f
        for ruta in [base, *sorted((R / "processed").glob(f.replace(".csv", "_n[0-9].csv")))]:  # incluye parciales en paralelo
            if ruta.exists():
                with open(ruta, encoding="utf-8") as fh:
                    next(fh, None)
                    ids |= {l.split(",", 1)[0] for l in fh}
        if ids:
            out[k] = len(ids)
    _cache.update(t=time.time(), v=out)
    return out


def barra(p, n=30):
    k = int(n * min(p, 100) / 100)
    return "█" * k + "░" * (n - k)


def mb(b):
    return f"{b / 1e6:6.2f} MB/s"


prev, t0, suavizado = psutil.net_io_counters(), time.time(), [0.0, 0.0]
while True:
    time.sleep(2)
    n, t1 = psutil.net_io_counters(), time.time()
    dt = t1 - t0
    bj, sb = (n.bytes_recv - prev.bytes_recv) / dt, (n.bytes_sent - prev.bytes_sent) / dt
    prev, t0 = n, t1
    sw = [0.7 * suavizado[0] + 0.3 * bj, 0.7 * suavizado[1] + 0.3 * sb]
    suavizado = sw
    pl = puntos_listos()
    filas = [("GRACE", 100.0, "1/1 archivo")]
    for c in ("imerg", "smap", "gldas"):
        a = archivos(c)
        filas.append((c.upper(), 100 * a / META[c], f"{a:,}/{META[c]:,} archivos"))
    for c in ("era5", "modis", "sentinel2", "landsat", "dem"):
        v = pl.get(c)
        if c == "dem" and (R / "processed" / "topografia_por_punto.csv").exists():
            v = PUNTOS  # la topografia se hizo en una corrida de prueba, no sale en el log
        filas.append((c.upper(), 0.0 if v is None else 100 * v / PUNTOS, "sin empezar" if v is None else f"{v}/{PUNTOS} puntos"))
    out = ["\033[H\033[J", "  AGRORESILIENCE · descargas en vivo   (Ctrl+C para salir)\n"]
    for nombre, p, det in filas:
        out.append(f"  {nombre:<10} {barra(p)} {p:5.1f}%  {det}")
    out.append(f"\n  Red  ↓ bajada {mb(sw[0])}    ↑ subida {mb(sw[1])}   (pico del equipo, todo el PC)")
    sys.stdout.write("\n".join(out) + "\n")
    sys.stdout.flush()
