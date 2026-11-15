"""Descarga de NASA Earthdata (necesita token) a raw/, recortada a Honduras cuando se puede.

Token: variable AGRO_EARTHDATA_TOKEN o archivo config/earthdata_token.txt (una linea; NO se sube a git).
Se genera en https://urs.earthdata.nasa.gov/profile  ->  Generate Token (dura 60 dias).

Uso:
    .venv/Scripts/python -I scripts/descargar_earthdata.py FUENTE [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]
FUENTE: grace | imerg | smap | gldas | todo
  grace -> raw/grace/GRCTellus*.nc          (un archivo global; lo procesa procesar_nuevo.py)
  imerg -> raw/imerg/*3IMERG.AAAAMMDD*_HND.nc4   (GPM_3IMERGDF v07, recorte Honduras via Harmony)
  smap  -> raw/smap/SMAP_L3_SM_P_E_AAAAMMDD_*_HND.nc4 (SPL3SMP_E, recorte Honduras via Harmony)
  gldas -> raw/gldas/*.nc4  (GLDAS Noah 0.25, recorte Honduras); adaptar con scripts/adaptar_gldas.py
Despues:  .venv/Scripts/python -I scripts/procesar_nuevo.py     (procesa solo lo nuevo)
Es reanudable: salta lo ya descargado.
"""
import argparse
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
E = RAIZ / "raw"
BBOX = {"lat": (12.5, 17.0), "lon": (-90.0, -82.5)}  # Honduras con margen
CMR = "https://cmr.earthdata.nasa.gov/search"
HARMONY = "https://harmony.earthdata.nasa.gov"
COLECCIONES = {"imerg": "C2723754864-GES_DISC", "imerg_late": "C2723754859-GES_DISC",  # Late Run: la Final V07 solo llega a 2025-09-30
    "smap": "C2938664763-NSIDC_CPRD", "gldas": "C1342986035-GES_DISC"}
VARIABLES = {"gldas": "SoilMoi0_10cm_inst,SoilMoi10_40cm_inst,SoilMoi40_100cm_inst,Evap_tavg,Qs_acc"}  # solo lo necesario: archivos 10x mas chicos
GRACE_SN = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"


def token():
    t = os.environ.get("AGRO_EARTHDATA_TOKEN")
    f = RAIZ / "config" / "earthdata_token.txt"
    if not t and f.exists():
        t = f.read_text(encoding="utf-8").strip()
    if not t:
        sys.exit("Falta el token de Earthdata (ver el encabezado de este script).")
    return t


def sesion():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {token()}"
    s.trust_env = False  # que no use ~/.netrc
    return s


def get(s, url, **kw):
    """GET que conserva el token en las redirecciones (requests lo quita al cambiar de host)."""
    for _ in range(8):
        r = s.get(url, allow_redirects=False, timeout=300, **kw)
        if r.status_code in (301, 302, 303, 307, 308):
            url = requests.compat.urljoin(url, r.headers["Location"])
            kw = {}
            continue
        return r
    raise RuntimeError("demasiadas redirecciones")


def bajar(s, url, dest):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return False
    if any(dest.parent.glob(f"*{dest.stem}*_HND.nc4")) or any(dest.parent.glob(f"*{dest.stem.replace('.', '_')}*_HND.nc4")):
        return False  # ya bajado y renombrado
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = get(s, url, stream=True)
    r.raise_for_status()
    tmp = dest.with_suffix(dest.suffix + ".part")
    with open(tmp, "wb") as f:
        for b in r.iter_content(1 << 20):
            f.write(b)
    tmp.replace(dest)
    return True


def grace(s, desde, hasta):
    j = requests.get(f"{CMR}/granules.json", params={"short_name": GRACE_SN, "page_size": 5}, timeout=60).json()
    for e in j["feed"]["entry"]:
        urls = [l["href"] for l in e.get("links", []) if l.get("href", "").endswith(".nc") and "data#" in l.get("rel", "")]
        for u in urls:
            n = u.rsplit("/", 1)[1]
            print("GRACE", n, "(nuevo)" if bajar(s, u, E / "grace" / n) else "(ya estaba)")
            return
    sys.exit("GRACE: no encontre el archivo en CMR")


def seguro(clave, d0, f1):
    """Un trozo que falla (respuesta vacia, corte de red) se reintenta y no tumba a los demas."""
    for i in range(3):
        try:
            return trozo(clave, d0, f1)
        except Exception as e:
            print(f"  {clave} {d0}..{f1}: error {e!r}; reintento {i + 1}", flush=True)
            time.sleep(30 * (i + 1))


def trozos(clave, desde, hasta, dias):
    d0, d1 = date.fromisoformat(desde), date.fromisoformat(hasta)
    while d0 <= d1:
        f1 = min(d0 + timedelta(days=dias - 1), d1)
        if not (E / clave / f".hecho_{d0}_{f1}").exists():
            yield clave, d0, f1
        d0 = f1 + timedelta(days=1)


def trozo(clave, d0, f1, extra=None):
    """Un trozo de tiempo: pide el recorte a Harmony, espera y baja los archivos en paralelo."""
    s = sesion()
    params = [("subset", f"lat({BBOX['lat'][0]}:{BBOX['lat'][1]})"), ("subset", f"lon({BBOX['lon'][0]}:{BBOX['lon'][1]})"),
              ("subset", f'time("{d0}T00:00:00Z":"{f1}T23:59:59Z")'), ("forceAsync", "true"), ("skipPreview", "true"),
              ("format", "application/x-netcdf4")] + (extra or [])
    url = f"{HARMONY}/{COLECCIONES[clave]}/ogc-api-coverages/1.0.0/collections/{VARIABLES.get(clave, 'all')}/coverage/rangeset"
    for intento in range(4):
        r = get(s, url, params=params)
        if r.status_code < 400:
            break
        time.sleep(30 * (intento + 1))
    else:
        print(f"  Harmony {clave} {d0}..{f1}: {r.status_code} {r.text[:200]}", flush=True)
        return
    job = r.json()
    jurl = next(l["href"] for l in job["links"] if l.get("rel") == "self")
    while job["status"] in ("accepted", "running", "running_with_errors"):
        time.sleep(10)
        job = get(s, jurl).json()
    if job["status"] not in ("successful", "complete_with_errors"):
        print(f"  {clave} {d0}..{f1}: termino como {job['status']}: {job.get('message', '')}", flush=True)
        return
    enlaces = [l["href"] for l in job["links"] if l.get("rel") == "data"]

    def uno(h):
        nombre = h.rsplit("/", 1)[1].split("?")[0]
        for i in range(3):
            try:
                return bajar(sesion(), h, E / clave / nombre)
            except Exception:
                time.sleep(5 * (i + 1))
        return False
    with ThreadPoolExecutor(8) as ex:
        n = sum(ex.map(uno, enlaces))
    (E / clave).mkdir(parents=True, exist_ok=True)
    (E / clave / f".hecho_{d0}_{f1}").write_text(str(n))
    print(f"  {clave} {d0}..{f1}: {n} archivos nuevos de {len(enlaces)}", flush=True)


def renombrar_hnd(clave):
    """Deja los nombres como los espera procesar_nuevo.py (terminan en _HND.nc4)."""
    for p in sorted((E / clave).glob("*.nc4")):
        if p.name.endswith("_HND.nc4"):
            continue
        if clave == "smap":
            m = re.search(r"_E_(\d{8})", p.name)
            nuevo = f"SMAP_L3_SM_P_E_{m.group(1)}_{p.stem.replace('.', '_')}_HND.nc4" if m else None
        elif clave.startswith("imerg"):
            nuevo = p.stem + "_HND.nc4" if "3IMERG" in p.name else None
        else:
            nuevo = None
        if nuevo and not (p.parent / nuevo).exists():
            p.rename(p.parent / nuevo)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fuente", choices=["grace", "imerg", "imerg_late", "smap", "gldas", "todo"])
    ap.add_argument("--desde")
    ap.add_argument("--hasta", default=(date.today() - timedelta(days=5)).isoformat())
    ap.add_argument("--trabajos", type=int, default=6, help="trozos de tiempo pedidos a Harmony en paralelo")
    a = ap.parse_args(argv)
    inicio = {"imerg": "2000-06-01", "imerg_late": "2025-10-01", "smap": "2015-04-01", "gldas": "2000-01-01"}
    dias = {"imerg": 92, "imerg_late": 92, "smap": 92, "gldas": 30}
    fuentes = ["grace", "imerg", "imerg_late", "smap", "gldas"] if a.fuente == "todo" else [a.fuente]
    if "grace" in fuentes:
        grace(sesion(), a.desde, a.hasta)
    tareas = []
    for f in fuentes:
        if f != "grace":
            tareas += list(trozos(f, max(a.desde or "1996-01-01", inicio[f]), a.hasta, dias[f]))
    print(f"{len(tareas)} trozos por pedir, {a.trabajos} en paralelo", flush=True)
    with ThreadPoolExecutor(a.trabajos) as ex:
        list(ex.map(lambda t: seguro(*t), tareas))
    for f in fuentes:
        if f != "grace":
            renombrar_hnd(f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
