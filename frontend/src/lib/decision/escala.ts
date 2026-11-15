// Escala de parcela: lleva el pronostico del punto de Kharis a la ubicacion y altura de la parcela.
// Solo ajusta lo que la validacion dejando un punto fuera respaldo (kharis_engine/analizar_escala_fina.py):
// la temperatura minima y la media por altura. La maxima y la lluvia no se tocan (no mejoraban).
// Con la minima y la media nuevas se recalcula el agua que pierde la tierra (ET0, Hargreaves FAO-56).

import type { EscalaFina, IndiceKharis, InfoParcela, PuntoKharis } from './tipos.js'

/** Caja de Honduras (config/zonas.json) con un margen pequeno. */
export const CAJA = { latMin: 12.9, latMax: 16.6, lonMin: -89.5, lonMax: -83.0 }

export function dentroDeHonduras(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= CAJA.latMin && lat <= CAJA.latMax && lon >= CAJA.lonMin && lon <= CAJA.lonMax
}

export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Punto de Kharis mas cercano a la parcela. */
export function puntoMasCercano(indice: IndiceKharis, parcela: { lat: number; lon: number }) {
  let mejor = indice.puntos[0]
  let d = Infinity
  for (const p of indice.puntos) {
    const x = distanciaKm(parcela, p)
    if (x < d) {
      d = x
      mejor = p
    }
  }
  return { entrada: mejor, distanciaKm: d }
}

/** Altura (m) de la celda de 0.02 grados que contiene el lugar, o null si no hay dato (mar). */
export function alturaEn(e: EscalaFina, lat: number, lon: number): number | null {
  const m = e.malla
  const f = Math.round((lat - m.lat0) / m.paso)
  const c = Math.round((lon - m.lon0) / m.paso)
  if (f < 0 || c < 0 || f >= m.filas || c >= m.columnas) return null
  const z = m.altura_m[f * m.columnas + c]
  return z === m.sin_dato ? null : z
}

function fecha(inicio: string, k: number): Date {
  const d = new Date(inicio + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + k)
  return d
}

/** Cambio de una variable en un mes (grados C) por la diferencia de altura y de latitud. */
function cambio(e: EscalaFina, v: string, mes: number, dzM: number, dLat: number): number {
  const c = e.coeficientes[v]
  if (!c) return 0
  return (c.G_por_km[mes] * dzM) / 1000 + c.B_por_grado_lat[mes] * dLat
}

/**
 * Copia del punto con la ET0 recalculada para la parcela. Hargreaves: ET0 proporcional a
 * (Tmedia + 17.8) * raiz(Tmax - Tmin); se ajusta el factor de la temperatura media.
 */
export function ajustarAParcela(
  punto: PuntoKharis,
  e: EscalaFina,
  parcela: { lat: number; lon: number },
  puntoNombre: string,
  distancia: number,
): { punto: PuntoKharis; info: InfoParcela } {
  const ref = e.puntos[punto.punto]
  const z = alturaEn(e, parcela.lat, parcela.lon)
  const base: InfoParcela = {
    lat: parcela.lat, lon: parcela.lon, alturaM: z, puntoId: punto.punto, puntoNombre,
    distanciaKm: Math.round(distancia), alturaCeldaM: ref ? Math.round(ref.altura_celda_m) : 0,
    cambioTmin: 0, cambioTmedia: 0, cambioEt0Pct: 0,
  }
  if (!ref || z === null) return { punto, info: base }
  const dz = z - ref.altura_celda_m
  const dLat = parcela.lat - ref.lat
  const pr = punto.pronostico
  const tmin = pr.T2M_MIN?.media
  const tmed = pr.T2M?.media
  const et0 = punto.fisica.et0.slice()
  let sumMin = 0
  let sumMed = 0
  let sumRel = 0
  let n = 0
  for (let k = 0; k < pr.dias; k++) {
    const mes = fecha(pr.inicio, k).getUTCMonth()
    const dMin = e.variables.includes('T2M_MIN') ? cambio(e, 'T2M_MIN', mes, dz, dLat) : 0
    const dMed = e.variables.includes('T2M') ? cambio(e, 'T2M', mes, dz, dLat) : 0
    sumMin += dMin
    sumMed += dMed
    const tx = pr.T2M_MAX.media[k]
    const tn = tmin?.[k]
    const valor = et0[k]
    if (tx == null || tn == null || valor == null) continue
    const tm = tmed?.[k] ?? (tx + tn) / 2
    // Solo el termino de la temperatura media: la maxima no se ajusta (no se valido), asi que cambiar la
    // diferencia entre maxima y minima inventaria un dia mas soleado. Se deja igual.
    const f = (tm + dMed + 17.8) / (tm + 17.8)
    const nuevo = valor * Math.min(Math.max(f, 0.5), 1.5)
    et0[k] = nuevo
    sumRel += nuevo / Math.max(valor, 1e-6)
    n += 1
  }
  const dias = Math.max(pr.dias, 1)
  return {
    punto: { ...punto, fisica: { ...punto.fisica, et0 } },
    info: {
      ...base,
      cambioTmin: Math.round((10 * sumMin) / dias) / 10,
      cambioTmedia: Math.round((10 * sumMed) / dias) / 10,
      cambioEt0Pct: n ? Math.round(100 * (sumRel / n - 1)) : 0,
    },
  }
}
