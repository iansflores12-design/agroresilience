import type { ClaveParteRotacion, Escenario } from '../../datos/aptitud'

export type { ClaveParteRotacion }

export type Enfoque = 'agua' | 'seguro' | 'tierra' | 'venta'

export const ENFOQUES: { id: Enfoque; nombre: string }[] = [
  { id: 'agua', nombre: 'Ahorrar agua' },
  { id: 'seguro', nombre: 'No arriesgar la cosecha' },
  { id: 'tierra', nombre: 'Cuidar la tierra' },
  { id: 'venta', nombre: 'Vender mejor' },
]

export type TipoCambio = 'repetir' | 'leguminosa' | 'cobertura' | 'graminea' | 'hortaliza'
export type AvisoDecision = 'ninguno' | 'canicula' | 'lluvia_fuerte' | 'tierra_seca'

export interface CandidatoDecision {
  /** Id del cultivo siguiente (RotacionPuntuada.id). */
  id: string
  nombre: string
  actual: boolean
  /** Puntaje con los pesos del enfoque en el escenario usado. */
  total: number
  porEscenario: Record<Escenario, number>
  partes: { clave: ClaveParteRotacion; valor: number }[]
  tipoCambio: TipoCambio
}

export interface PerspectivaResumen {
  /** Por ejemplo "Primera 2027". */
  temporada: string
  /** Suma 1. */
  prob: Record<Escenario, number>
  /** Cuantos anios parecidos cayeron en cada clase. */
  conteo: Record<Escenario, number>
  /** false = sin senal clara. */
  usable: boolean
}

export interface Decision {
  rotacionId: string
  enfoquePrincipal: Enfoque | null
  aviso: AvisoDecision
  origen: 'gemini' | 'motor'
}

/** Lo que responde POST /api/decision (sin origen). */
export type RespuestaDecision = Omit<Decision, 'origen'>
