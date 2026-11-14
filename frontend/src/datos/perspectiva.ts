import datosGenerados from './perspectiva.generado.json'
import type { Escenario } from './aptitud'

export interface CaniculaPerspectiva {
  normalDias: number | null
  parecidosDias: number | null
}

export interface PerspectivaZona {
  id: string
  prob: Record<Escenario, number>
  conteo: Record<Escenario, number>
  aniosParecidos: number[]
  usable: boolean
  aciertos: number
  aniosProbados: number
  lluviaNormalMm: number
  canicula: CaniculaPerspectiva | null
}

export interface TemporadaPerspectiva {
  id: string
  tipo: 'primera' | 'postrera'
  anio: number
  nombre: string
  meses: string
  zonas: PerspectivaZona[]
}

export interface OniActual {
  anio: number
  trimestre: string
  valor: number
  tendencia: number
  fase: 'nino' | 'nina' | 'neutral'
}

export interface DatosPerspectiva {
  generado: string
  fuentes: { lluvia: string; oni: string }
  metodo: { k: number; descripcion: string }
  oni: OniActual
  temporadas: TemporadaPerspectiva[]
}

export interface PerspectivaResumen {
  temporada: string // "Primera 2027"
  prob: Record<Escenario, number>
  conteo: Record<Escenario, number>
  usable: boolean
}

export const perspectiva = datosGenerados as unknown as DatosPerspectiva
export const oni: OniActual = perspectiva.oni
export const fuentesPerspectiva: DatosPerspectiva['fuentes'] = perspectiva.fuentes

const nombresClase: Record<Escenario, string> = {
  seco: 'secos',
  normal: 'normales',
  lluvioso: 'lluviosos',
}

/** Zona de la proxima temporada (la primera de la lista), o null si no hay dato. */
function zonaProxima(zonaId: string | null) {
  if (!zonaId) return null
  const temporada = perspectiva.temporadas[0]
  const zona = temporada?.zonas.find((z) => z.id === zonaId)
  return temporada && zona ? { temporada, zona } : null
}

export function perspectivaDe(zonaId: string | null): PerspectivaResumen | null {
  const r = zonaProxima(zonaId)
  if (!r) return null
  return {
    temporada: r.temporada.nombre,
    prob: r.zona.prob,
    conteo: r.zona.conteo,
    usable: r.zona.usable,
  }
}

/** Clase mas probable de la proxima temporada; null si no hay dato o la senal no es usable. */
export function escenarioMasProbable(zonaId: string | null): Escenario | null {
  const p = perspectivaDe(zonaId)
  if (!p || !p.usable) return null
  const orden: Escenario[] = ['normal', 'seco', 'lluvioso']
  return orden.reduce((mejor, c) => (p.prob[c] > p.prob[mejor] ? c : mejor), orden[0])
}

export function frasePerspectiva(zonaId: string | null): string | null {
  const p = perspectivaDe(zonaId)
  if (!p) return null
  if (!p.usable) {
    return 'Este año no hay una señal clara: puede venir seco, normal o lluvioso.'
  }
  const clase = escenarioMasProbable(zonaId)
  if (!clase) return null
  const total = p.conteo.seco + p.conteo.normal + p.conteo.lluvioso
  const n = p.conteo[clase]
  const plural = n === 1 ? nombresClase[clase].slice(0, -1) : nombresClase[clase]
  const verbo = n === 1 ? 'fue' : 'fueron'
  return `De ${total} años parecidos a este, ${n} ${verbo} ${plural}.`
}
