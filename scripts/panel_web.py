"""Panel web de descargas con boton Refrescar. Uso: .venv/Scripts/python -I scripts/panel_web.py  ->  http://localhost:8765"""
import json, re, time
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import psutil

R = Path(__file__).resolve().parent.parent
SAL, ENT, LOG = R / "processed", R / "raw", R / "logs"
NP = len(json.loads((R / "config" / "zonas.json").read_text(encoding="utf-8"))["puntos"])
HOY = date.today() - timedelta(days=5)
FINAL = Path(r"C:\Users\iansf\AppData\Local\Temp\claude\d1f5f83649f8c603\e1cc7de1-ec37-41f3-8626-515db37fb794\tasks\bt2m8rnvp.output")
_red = {"t": time.time(), "n": psutil.net_io_counters()}


def nc4(*carpetas):
    return sum(sum(1 for f in (ENT / c).iterdir() if f.suffix == ".nc4") for c in carpetas if (ENT / c).exists())


def puntos_csv(nombre):
    ids = set()
    for f in [SAL / nombre, *sorted(SAL.glob(nombre.replace(".csv", "_n[0-9].csv")))]:
        if f.exists():
            with open(f, encoding="utf-8") as fh:
                next(fh, None)
                ids |= {l.split(",", 1)[0] for l in fh}
    return len(ids)


def ultima(log, patron):
    f = LOG / log
    if not f.exists():
        return None
    for l in reversed(f.read_text(encoding="utf-8", errors="replace").splitlines()):
        m = re.search(patron, l)
        if m:
            return m
    return None


def estado():
    d = lambda s: (HOY - date.fromisoformat(s)).days + 1
    filas = []
    def add(nombre, hecho, total, unidad, nota=""):
        filas.append({"fuente": nombre, "hecho": hecho, "total": total, "unidad": unidad, "nota": nota,
                      "pct": round(min(100, 100 * hecho / total), 1) if total else 0})
    add("NASA POWER", len(list((ENT / "power").glob("*.json"))), NP, "puntos")
    add("IMERG (Final + Late)", nc4("imerg", "imerg_late"), d("2000-06-01"), "dias")
    add("SMAP", nc4("smap"), d("2015-04-01") - 85, "dias", "85 dias sin dato en la NASA")
    add("GLDAS", nc4("gldas"), 77348, "archivos", "la NASA publica hasta jul-2026")
    add("ERA5", puntos_csv("era5_diario.csv"), NP, "puntos")
    add("MODIS NDVI", puntos_csv("modis_ndvi.csv"), NP, "puntos")
    add("Sentinel-2", puntos_csv("sentinel2_indices.csv"), NP, "puntos")
    add("Landsat", puntos_csv("landsat_ndvi.csv"), NP, "puntos")
    add("SRTM / topografia", puntos_csv("topografia_por_punto.csv"), NP, "puntos")
    add("SoilGrids", len(list((ENT / "soilgrids").glob("*.json"))), NP, "puntos")
    add("GAEZ", NP if (SAL / "gaez_aptitud_por_punto.csv").exists() else 0, NP, "puntos")
    add("GEDI biomasa", NP if (SAL / "gedi_biomasa_por_punto.csv").exists() else 0, NP, "puntos", "4 puntos sin disparos validos")
    mm = len(list((ENT / "meteomatics").glob("hist_*.json"))) + len(list((ENT / "meteomatics_n").glob("hist_*.json")))
    add("Meteomatics", mm, 124, "archivos")
    m = ultima("ecostress_directo.log", r"(\d+)/(\d+) archivos")
    add("ECOSTRESS LST", int(m.group(1)) if m else 0, int(m.group(2)) if m else 1, "archivos",
        (ultima("ecostress_directo.log", r"faltan ~\d+ min") or [""])[0])
    fin = FINAL.read_text(encoding="utf-8", errors="replace") if FINAL.exists() else ""
    final = "listo" if "FINAL LISTO" in fin else ("procesando" if "descargas terminadas" in fin else "esperando descargas")
    n, t = psutil.net_io_counters(), time.time()
    dt = max(t - _red["t"], 0.1)
    red = {"bajada": round((n.bytes_recv - _red["n"].bytes_recv) / dt / 1e6, 2), "subida": round((n.bytes_sent - _red["n"].bytes_sent) / dt / 1e6, 2)}
    _red.update(t=t, n=n)
    return {"hora": time.strftime("%H:%M:%S"), "filas": filas, "final": final, "red": red}


HTML = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Descargas AgroResilience</title><style>
:root{--bg:#f6f7f5;--card:#fff;--tx:#1d2a22;--mut:#5f6f65;--bar:#e3e8e4;--ok:#2f8f5b;--go:#c98a1b;--ac:#1f6f4a}
@media(prefers-color-scheme:dark){:root{--bg:#121714;--card:#1b221e;--tx:#e6ece8;--mut:#9aaba1;--bar:#2a332d;--ok:#4fbf83;--go:#e0a73a;--ac:#4fbf83}}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.4 system-ui,Segoe UI,sans-serif}
main{max-width:820px;margin:0 auto;padding:20px 16px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
h1{font-size:20px;margin:0}.mut{color:var(--mut);font-size:13px}
button{background:var(--ac);color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer}
button:active{transform:translateY(1px)}
.card{background:var(--card);border-radius:12px;padding:6px 16px;margin-top:14px;box-shadow:0 1px 3px #0001}
.f{display:grid;grid-template-columns:160px 1fr 64px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--bar)}
.f:last-child{border:0}.b{height:10px;background:var(--bar);border-radius:6px;overflow:hidden}.b i{display:block;height:100%;background:var(--go)}
.b i.ok{background:var(--ok)}.p{text-align:right;font-variant-numeric:tabular-nums}.d{grid-column:2/4;margin-top:-8px}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.chip{background:var(--card);border-radius:20px;padding:6px 14px;font-size:14px}
@media(max-width:560px){.f{grid-template-columns:1fr 54px}.b{grid-column:1/3;order:3}.d{grid-column:1/3;margin-top:0}}
</style></head><body><main>
<header><div><h1>Descargas AgroResilience</h1><div class="mut" id="hora">cargando...</div></div>
<button id="btn">Refrescar</button></header>
<div class="chips"><span class="chip" id="final"></span><span class="chip" id="red"></span></div>
<div class="card" id="lista"></div></main><script>
async function cargar(){const b=document.getElementById('btn');b.textContent='...';
try{const e=await (await fetch('/estado')).json();
document.getElementById('hora').textContent='Actualizado '+e.hora+' (se refresca solo cada 15 s)';
document.getElementById('final').textContent='Proceso final: '+e.final;
document.getElementById('red').textContent='Red: bajada '+e.red.bajada+' MB/s, subida '+e.red.subida+' MB/s';
document.getElementById('lista').innerHTML=e.filas.map(f=>`<div class="f"><div>${f.fuente}</div>
<div class="b"><i class="${f.pct>=99.5?'ok':''}" style="width:${f.pct}%"></i></div><div class="p">${f.pct}%</div>
<div class="d mut">${f.hecho.toLocaleString()} / ${f.total.toLocaleString()} ${f.unidad}${f.nota?' · '+f.nota:''}</div></div>`).join('');
}catch(err){document.getElementById('hora').textContent='Sin conexion con el panel: '+err}
b.textContent='Refrescar'}
document.getElementById('btn').onclick=cargar;cargar();setInterval(cargar,15000);
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        cuerpo, tipo = (json.dumps(estado()).encode(), "application/json") if self.path.startswith("/estado") else (HTML.encode(), "text/html; charset=utf-8")
        self.send_response(200); self.send_header("Content-Type", tipo); self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(cuerpo)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("Panel en http://localhost:8765")
    ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()
