"""Escala de parcela: gradiente por altura y reparto de la lluvia con IMERG, validados dejando un punto fuera.

Kharis predice el clima de la celda de NASA POWER (0.5 x 0.625 grados) de cada uno de sus 30 puntos. Una
parcela esta en otro lugar y a otra altura. Para llevar el pronostico a la parcela:

  temperatura(parcela) = temperatura(punto) + G[mes] * (altura parcela - altura celda del punto)
                                            + B[mes] * (latitud parcela - latitud del punto)
  lluvia(parcela)      = lluvia(punto) * IMERG[mes](parcela) / IMERG[mes](punto)      (factor acotado a 0.5-2)

G y B salen de una regresion entre las 30 celdas (climatologia mensual 1996-2020 contra la altura media de
cada celda en NASADEM). IMERG es la climatologia 2001-2020 a 0.1 grados.

Validacion: cada punto se deja fuera, se ajusta con los otros 29 y se predice su climatologia mensual desde
el punto vecino mas cercano, con y sin el ajuste. Si el ajuste no mejora, no se usa.

  ..\\.venv_kharis\\Scripts\\python.exe analizar_escala_fina.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent
PROC = RAIZ.parent / "processed"
TEMPS = ["T2M_MAX", "T2M_MIN", "T2M"]
CELDA_LAT, CELDA_LON = 0.5, 0.625          # malla de NASA POWER (MERRA-2)
TOPE = (0.5, 2.0)


def celda_power(lat, lon):
    cl = np.round(np.asarray(lat) / CELDA_LAT) * CELDA_LAT
    co = np.round(np.asarray(lon) / CELDA_LON) * CELDA_LON
    return cl, co


def media_en_caja(malla, la, lo, lat0, lat1, lon0, lon1, mar=0.0):
    sel = malla[np.ix_((la >= lat0) & (la < lat1), (lo >= lon0) & (lo < lon1))]
    if sel.size == 0:
        return np.nan
    return float(np.nanmean(np.where(np.isfinite(sel), sel, mar)))


def valor_en(malla, la, lo, lat, lon):
    return malla[..., int(np.abs(la - lat).argmin()), int(np.abs(lo - lon).argmin())]


def cargar():
    alt = np.load(PROC / "escala_fina" / "malla_altura_002.npz")
    imr = np.load(PROC / "escala_fina" / "imerg_clima_mensual.npz")
    topo = pd.read_csv(PROC / "topografia_por_punto.csv").set_index("punto")
    df = pd.read_csv(RAIZ / "datos" / "kharis_entrada.csv.gz", usecols=["punto", "fecha", *TEMPS, "PRECTOTCORR"], parse_dates=["fecha"])
    df = df[(df["fecha"] >= "1996-01-01") & (df["fecha"] <= "2020-12-31")]
    df["mes"] = df["fecha"].dt.month
    clima = df.groupby(["punto", "mes"])[[*TEMPS, "PRECTOTCORR"]].mean()
    puntos = sorted(set(clima.index.get_level_values(0)) & set(topo.index))
    return alt, imr, topo.loc[puntos], clima, puntos


def main():
    alt, imr, topo, clima, puntos = cargar()
    za, la_a, lo_a = alt["altura"], alt["lat"], alt["lon"]
    ll, la_i, lo_i = imr["lluvia"], imr["lat"], imr["lon"]
    P = len(puntos)
    lat, lon = topo["latitud"].to_numpy(), topo["longitud"].to_numpy()
    cl, co = celda_power(lat, lon)
    # altura media de la celda de POWER (el mar cuenta como 0 m) e IMERG promediado en esa celda
    z_celda = np.array([media_en_caja(za, la_a, lo_a, c - CELDA_LAT / 2, c + CELDA_LAT / 2, o - CELDA_LON / 2, o + CELDA_LON / 2)
                        for c, o in zip(cl, co)])
    imerg_celda = np.stack([[media_en_caja(ll[m], la_i, lo_i, c - CELDA_LAT / 2, c + CELDA_LAT / 2, o - CELDA_LON / 2, o + CELDA_LON / 2, np.nan)
                             for m in range(12)] for c, o in zip(cl, co)])          # [P, 12]
    C = {v: np.array([[clima.loc[(p, m), v] for m in range(1, 13)] for p in puntos]) for v in [*TEMPS, "PRECTOTCORR"]}   # [P, 12]

    def ajustar(idx, v):
        """G y B por mes con minimos cuadrados (intercepto, altura en km, latitud)."""
        X = np.column_stack([np.ones(len(idx)), z_celda[idx] / 1000.0, lat[idx]])
        coef = np.linalg.lstsq(X, C[v][idx], rcond=None)[0]          # [3, 12]
        return coef[1], coef[2]                                       # G (grados/km), B (grados/grado de lat)

    dist = np.hypot((lat[:, None] - lat[None, :]) * 111, (lon[:, None] - lon[None, :]) * 111 * np.cos(np.radians(14.5)))
    np.fill_diagonal(dist, np.inf)
    res = {"metodo": __doc__.split("\n\n")[1].strip(), "validacion_dejando_un_punto_fuera": {}}
    err = {v: {"sin": [], "con": []} for v in [*TEMPS, "PRECTOTCORR"]}
    for h in range(P):
        otros = np.array([i for i in range(P) if i != h])
        nn = int(np.argmin(dist[h]))
        for v in TEMPS:
            G, B = ajustar(otros, v)
            sin = C[v][nn]
            con = sin + G * (z_celda[h] - z_celda[nn]) / 1000.0 + B * (lat[h] - lat[nn])
            err[v]["sin"].append(np.abs(sin - C[v][h]))
            err[v]["con"].append(np.abs(con - C[v][h]))
        f = np.clip(imerg_celda[h] / np.maximum(imerg_celda[nn], 0.05), *TOPE)
        sin = C["PRECTOTCORR"][nn]
        err["PRECTOTCORR"]["sin"].append(np.abs(sin - C["PRECTOTCORR"][h]))
        err["PRECTOTCORR"]["con"].append(np.abs(sin * f - C["PRECTOTCORR"][h]))
    print("Validacion dejando un punto fuera (climatologia mensual 1996-2020, desde el punto vecino mas cercano):")
    for v, e in err.items():
        s, c = float(np.mean(e["sin"])), float(np.mean(e["con"]))
        mejora = 1 - c / s
        res["validacion_dejando_un_punto_fuera"][v] = {"error_sin_ajuste": round(s, 3), "error_con_ajuste": round(c, 3), "mejora": round(mejora, 4)}
        print(f"  {v:>12}: sin ajuste {s:.3f} | con ajuste {c:.3f} | mejora {mejora:+.1%}")
    print(f"  distancia media al vecino: {np.mean(dist.min(1)):.0f} km")

    # Coeficientes finales con los 30 puntos
    final = {v: dict(zip(("G_por_km", "B_por_grado_lat"), (np.round(x, 3).tolist() for x in ajustar(np.arange(P), v)))) for v in TEMPS}
    res["coeficientes"] = final
    res["puntos"] = {p: {"lat": float(lat[i]), "lon": float(lon[i]), "altura_celda_m": round(float(z_celda[i]), 1),
                         "imerg_celda_mm_dia": np.round(imerg_celda[i], 2).tolist()} for i, p in enumerate(puntos)}
    for v in TEMPS:
        print(f"  {v}: gradiente por altura de {np.mean(final[v]['G_por_km']):+.2f} grados por km (promedio de los 12 meses)")
    (RAIZ / "reports").mkdir(exist_ok=True)
    (RAIZ / "reports" / "escala_fina.json").write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"-> {RAIZ / 'reports' / 'escala_fina.json'}")

    # ---------- archivo para el sitio: solo lo que la validacion respalda ----------
    usados = [v for v in TEMPS if res["validacion_dejando_un_punto_fuera"][v]["mejora"] > 0]
    descartados = [v for v in [*TEMPS, "PRECTOTCORR"] if v not in usados]
    z = np.where(np.isfinite(za), np.round(za), -9999).astype(int)
    web = {
        "contrato": "kharis.escala_fina.v1",
        "nota": "Ajuste de temperatura por altura de la parcela (NASADEM 0.02 grados). Validado dejando un punto fuera; "
                "solo se usan las variables que mejoraron.",
        "variables": usados,
        "descartadas": {v: res["validacion_dejando_un_punto_fuera"][v]["mejora"] for v in descartados},
        "validacion": {v: res["validacion_dejando_un_punto_fuera"][v]["mejora"] for v in [*TEMPS, "PRECTOTCORR"]},
        "coeficientes": {v: final[v] for v in usados},
        "malla": {"lat0": float(la_a[0]), "lon0": float(lo_a[0]), "paso": float(round(la_a[1] - la_a[0], 4)),
                  "filas": int(za.shape[0]), "columnas": int(za.shape[1]), "sin_dato": -9999,
                  "fuente": "NASADEM (SRTM 30 m) promedio a 0.02 grados", "altura_m": z.reshape(-1).tolist()},
        "puntos": {p: {"lat": float(lat[i]), "lon": float(lon[i]), "altura_celda_m": round(float(z_celda[i]), 1)} for i, p in enumerate(puntos)},
    }
    for destino in (RAIZ / "salidas" / "web" / "escala_fina.json", RAIZ.parent / "frontend" / "public" / "kharis" / "escala_fina.json"):
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(web, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"-> {destino} ({destino.stat().st_size / 1024:.0f} KB) | usa {', '.join(usados)}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
    sys.stdout.flush()
    os._exit(0)
