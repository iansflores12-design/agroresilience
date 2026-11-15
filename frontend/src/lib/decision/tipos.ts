// Contratos de Gemini Decision. Este modulo no usa el DOM: lo comparten el navegador y las
// funciones de `api/`.

import type { Idioma } from '../../i18n/idiomas.js'

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
  /** Ubicacion de la parcela (GPS). Con ella se usa el punto de Kharis mas cercano y el ajuste por altura. */
  parcela?: { lat: number; lon: number }
  /** Idioma de los textos de la decision y de Gemini. Por defecto, español. */
  idioma?: Idioma
}

/** Ajuste a escala de parcela (kharis.escala_fina.v1). */
export interface InfoParcela {
  lat: number
  lon: number
  alturaM: number | null
  puntoId: string
  puntoNombre: string
  distanciaKm: number
  alturaCeldaM: number
  /** Cambio medio en grados C de la minima y la media (promedio de 12 meses). */
  cambioTmin: number
  cambioTmedia: number
  /** Cambio medio del agua que pierde la tierra (ET0), en porcentaje. */
  cambioEt0Pct: number
}

export interface EscalaFina {
  contrato: string
  variables: string[]
  validacion: Record<string, number>
  coeficientes: Record<string, { G_por_km: number[]; B_por_grado_lat: number[] }>
  malla: { lat0: number; lon0: number; paso: number; filas: number; columnas: number; sin_dato: number; fuente: string; altura_m: number[] }
  puntos: Record<string, { lat: number; lon: number; altura_celda_m: number }>
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
  /** El productor la marco como objetivo: pesa mas. */
  objetivo: boolean
}

/** Una razon del puntaje. `tipo` dice de que parte sale (para su icono). */
export interface Razon {
  tipo: ClaveFactor | 'comparacion' | 'objetivos' | 'actual'
  texto: string
}

export interface Evidencia {
  texto: string
  fuente: string
}

export interface PasoPlan {
  /** Null = la tierra queda sin cultivo esa temporada. */
  cultivoId: string | null
  nombre: string
  /** El cultivo sigue del paso anterior (el frijol terciopelo ocupa dos temporadas). */
  continua?: boolean
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
  razones: Razon[]
  beneficios: string[]
  riesgos: string[]
  faltaSaber: string[]
  evidencia: Evidencia[]
}

export interface Decision {
  version: 'gemini-decision.v1'
  entrada: EntradaDecision
  punto: { id: string; nombre: string; fechaBase: string; modelo: string; fraccionPronosticada: number; parcela?: InfoParcela }
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
  pronostico: { inicio: string; dias: number; T2M_MAX: Banda; T2M_MIN?: Banda; T2M?: Banda; PRECTOTCORR: Banda }
  fisica: { et0: Serie; prob_lluvia_intensa: Serie }
  senales: ({ temporada: number; fraccion_pronosticada: number } & Record<string, SenalKharis | number>)[]
}

export interface IndiceKharis {
  contrato: string
  version_modelo: string
  fecha_base: string
  puntos: { punto: string; archivo: string; lat: number; lon: number }[]
}
