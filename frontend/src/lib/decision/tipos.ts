// Contratos de Gemini Decision. Este modulo no usa el DOM: lo comparten el navegador y las
// funciones de `api/`.

export type Terreno = 'plano' | 'elevado' | 'bajo' | 'ondulado'
export type Temporada = 'primera' | 'postrera' | 'verano'
export type Objetivo = 'agua' | 'suelo' | 'erosion' | 'ingreso' | 'forraje' | 'nitrogeno' | 'plagas'

/** Lo que el productor contesta antes de calcular, mas sus objetivos. */
export interface EntradaDecision {
  zonaId: string
  terreno: Terreno
  cultivoId: string
  temporada: Temporada
  objetivos: Objetivo[]
}

export type Rating = 'alta' | 'buena' | 'intermedia' | 'baja'
export type Confianza = 'alta' | 'media' | 'baja'
export type ClaveFactor = 'agua' | 'calor' | 'suelo' | 'erosion' | 'venta' | 'forraje' | 'plagas' | 'nitrogeno'

export interface Factor {
  clave: ClaveFactor
  nombre: string
  /** Peso ya ajustado a los objetivos; los pesos suman 1. */
  peso: number
  valor: number
}

export interface Evidencia {
  texto: string
  fuente: string
}

export interface PasoPlan {
  /** Null = la tierra queda sin cultivo esa temporada. */
  cultivoId: string | null
  nombre: string
  temporada: Temporada
  meses: string
  /** Datos del motor para el paso; null si es descanso. */
  lluviaMm: number | null
  aguaPideMm: number | null
  diasCalor: number | null
}

export interface RotacionDecidida {
  id: string
  nombre: string
  /** Cultivo que da el icono de la tarjeta: el que la rotacion agrega. */
  cultivoIcono: string
  actual: boolean
  mejor: boolean
  /** De 0 a 100. Es el porcentaje que se muestra. */
  puntaje: number
  rating: Rating
  /** Puntos frente a lo que hace hoy. */
  diferencia: number
  confianza: Confianza
  pasos: PasoPlan[]
  factores: Factor[]
  razones: string[]
  beneficios: string[]
  riesgos: string[]
  faltaSaber: string[]
  evidencia: Evidencia[]
}

export interface Decision {
  version: 'gemini-decision.v1'
  entrada: EntradaDecision
  punto: { id: string; nombre: string; fechaBase: string; modelo: string; fraccionPronosticada: number }
  /** Rotaciones de la mejor a la peor. */
  rotaciones: RotacionDecidida[]
  mejorId: string
  avisos: string[]
}

/* ---------- Subconjunto del contrato kharis.web.v1 que usa la decision ---------- */

type Serie = (number | null)[]
type Banda = { media: Serie; p10: Serie; p90: Serie }

export interface SenalKharis {
  valor: number | null
  percentil: number | null
  probabilidad: number
  activo: boolean
}

export interface PuntoKharis {
  punto: string
  lat: number
  lon: number
  elevacion: number
  pronostico: { inicio: string; dias: number; T2M_MAX: Banda; PRECTOTCORR: Banda }
  fisica: { et0: Serie; prob_lluvia_intensa: Serie }
  senales: ({ temporada: number; fraccion_pronosticada: number } & Record<string, SenalKharis | number>)[]
}

export interface IndiceKharis {
  contrato: string
  version_modelo: string
  fecha_base: string
  puntos: { punto: string; archivo: string }[]
}
