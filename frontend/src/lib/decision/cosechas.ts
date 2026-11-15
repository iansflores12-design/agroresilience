// Reportes de cosecha del productor: como le fue de verdad con un cultivo, en una temporada y un año.
// Es la retroalimentacion del motor: cada reporte pesa como tres años simulados del historial.

import type { ReporteCosecha, ResultadoCosecha, Temporada } from './tipos.js'

export const RESULTADOS: ResultadoCosecha[] = ['buena', 'regular', 'mala']
const TEMPORADAS: Temporada[] = ['primera', 'postrera', 'verano']
export const MAX_COSECHAS = 12
/** Cuantos años simulados vale un año vivido por el productor en su propia parcela. */
export const PESO_REPORTE = 3
/** Buena cuenta 100, regular 50 y mala 0, igual que el historial. */
export const VALOR_RESULTADO: Record<ResultadoCosecha, number> = { buena: 100, regular: 50, mala: 0 }

/** Valida una lista de reportes venida de fuera (API o almacenamiento). Deja uno por cultivo, temporada y año. */
export function leerCosechas(x: unknown, esCultivo: (id: string) => boolean, anioMax = new Date().getFullYear() + 1): ReporteCosecha[] {
  if (!Array.isArray(x)) return []
  const vistos = new Map<string, ReporteCosecha>()
  for (const dato of x) {
    if (typeof dato !== 'object' || dato === null) continue
    const d = dato as Record<string, unknown>
    if (typeof d.cultivoId !== 'string' || !esCultivo(d.cultivoId)) continue
    if (!TEMPORADAS.includes(d.temporada as Temporada) || !RESULTADOS.includes(d.resultado as ResultadoCosecha)) continue
    if (typeof d.anio !== 'number' || !Number.isInteger(d.anio) || d.anio < 1980 || d.anio > anioMax) continue
    const r: ReporteCosecha = { cultivoId: d.cultivoId, temporada: d.temporada as Temporada, anio: d.anio, resultado: d.resultado as ResultadoCosecha }
    vistos.set(claveCosecha(r), r)
  }
  return [...vistos.values()].sort((a, b) => b.anio - a.anio).slice(0, MAX_COSECHAS)
}

export const claveCosecha = (r: Pick<ReporteCosecha, 'cultivoId' | 'temporada' | 'anio'>) => `${r.cultivoId}|${r.temporada}|${r.anio}`
