// Condiciones del lugar. Primera version: fixture mockup ilustrativo. Despues llegara un archivo
// real con la misma forma (CondicionesArchivo) y se validara con validarCondiciones.
import type { CondicionesArchivo } from './tipos'
import mock from './fixtures/condiciones.mock.json'

export const condicionesMock = mock as CondicionesArchivo

const CAMPOS_NUM_NULL = [
  'humedadSuelo_m3m3',
  'lluvia30d_mm',
  'lluviaNormal30d_mm',
  'temperatura_c',
  'arcilla_pct',
  'arena_pct',
] as const

const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Comprobacion de forma. Devuelve el mismo objeto tipado o null si algo no encaja. */
export function validarCondiciones(x: unknown): CondicionesArchivo | null {
  if (!esObj(x)) return null
  if (x.version !== 1) return null
  if (typeof x.origen !== 'string' || typeof x.generado !== 'string') return null
  const caja = x.caja
  if (!esObj(caja)) return null
  if (!esNum(caja.lat_min) || !esNum(caja.lat_max) || !esNum(caja.lon_min) || !esNum(caja.lon_max)) return null
  if (caja.lat_min >= caja.lat_max || caja.lon_min >= caja.lon_max) return null
  if (!Array.isArray(x.puntos) || x.puntos.length === 0) return null
  for (const p of x.puntos) {
    if (!esObj(p)) return null
    if (typeof p.id !== 'string' || typeof p.nombre !== 'string') return null
    if (!esNum(p.lat) || !esNum(p.lon)) return null
    for (const c of CAMPOS_NUM_NULL) {
      if (p[c] !== null && !esNum(p[c])) return null
    }
  }
  return x as unknown as CondicionesArchivo
}
