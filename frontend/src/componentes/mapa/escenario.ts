import { zonas as todasLasZonas, type Zona } from '../../datos/zonas'
import type { Escenario } from '../../datos/aptitud'

/**
 * Tipo de año sacado de los datos, no elegido a mano: lluvia de los últimos 30 días contra lo
 * normal para esas fechas (CHIRPS en zonas.generado.json). Con un lugar elegido se usa ese lugar;
 * si no, la mediana de todo el país. Menos de 75 % de lo normal es seco; más de 125 %, lluvioso.
 */
export interface AnioDetectado {
  escenario: Escenario
  /** Lluvia de 30 días como porcentaje de lo normal; null si no hay datos. */
  pct: number | null
}

export const UMBRAL_SECO = 0.75
export const UMBRAL_LLUVIOSO = 1.25

function proporcion(z: Zona): number | null {
  const l = z.lluvia30d
  return l && l.normal_mm && l.normal_mm > 0 ? l.valor_mm / l.normal_mm : null
}

export function detectarAnio(zona: Zona | null, zonas: Zona[] = todasLasZonas): AnioDetectado {
  let p = zona ? proporcion(zona) : null
  if (p === null) {
    const todas = zonas.map(proporcion).filter((x): x is number => x !== null).sort((a, b) => a - b)
    p = todas.length ? todas[Math.floor(todas.length / 2)] : null
  }
  if (p === null) return { escenario: 'normal', pct: null }
  const escenario: Escenario = p < UMBRAL_SECO ? 'seco' : p > UMBRAL_LLUVIOSO ? 'lluvioso' : 'normal'
  return { escenario, pct: Math.round(p * 100) }
}
