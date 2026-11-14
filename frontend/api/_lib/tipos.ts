// Tipos y validadores de las funciones del asistente. No se importa nada de src/:
// estos contratos se duplican a proposito para que api/ se despliegue por separado.

export const ESCENARIOS = ['normal', 'seco', 'lluvioso'] as const
export const ENFOQUES = ['agua', 'seguro', 'tierra', 'venta'] as const
export const TIPOS_CAMBIO = ['repetir', 'leguminosa', 'cobertura', 'graminea', 'hortaliza'] as const
export const AVISOS = ['ninguno', 'canicula', 'lluvia_fuerte', 'tierra_seca'] as const
export const CLAVES_PARTE = ['agua', 'suelo', 'clima', 'venta'] as const
export const ORIGENES = ['gemini', 'motor'] as const

export type Escenario = (typeof ESCENARIOS)[number]
export type Enfoque = (typeof ENFOQUES)[number]
export type TipoCambio = (typeof TIPOS_CAMBIO)[number]
export type AvisoDecision = (typeof AVISOS)[number]

export interface CandidatoDecision {
  id: string
  nombre: string
  actual: boolean
  total: number
  porEscenario: Record<Escenario, number>
  partes: { clave: (typeof CLAVES_PARTE)[number]; valor: number }[]
  tipoCambio: TipoCambio
}

export interface PerspectivaResumen {
  temporada: string
  prob: Record<Escenario, number>
  conteo: Record<Escenario, number>
  usable: boolean
}

/** Contexto del chat (ver src/lib/chat/tipos.ts). Tolerante: acepta campos extra como recomendacion y perspectiva. */
export interface ContextoChat {
  vista?: 'cultivos' | 'mapa' | 'zona' | 'chat'
  cultivo?: { id: string; nombre: string } | null
  edadSemanas?: number | null
  etapa?: string | null
  zona?: { id: string; nombre: string; lat: number; lon: number } | null
  humedad?: { valor: number; fecha: string; unidad: string } | null
  recomendacion?: unknown
  perspectiva?: unknown
  [clave: string]: unknown
}

export interface MensajeChat {
  rol: 'usuario' | 'asistente'
  texto: string
}

export interface PeticionDecision {
  contexto: ContextoChat
  enfoques: Enfoque[]
  escenario: Escenario
  candidatos: CandidatoDecision[]
  perspectiva: PerspectivaResumen | null
  textoLibre?: string
}

export interface DecisionTomada {
  rotacionId: string
  enfoquePrincipal: Enfoque | null
  aviso: AvisoDecision
  origen: (typeof ORIGENES)[number]
}

export interface PeticionExplicacion extends PeticionDecision {
  decision: DecisionTomada
  preset: string
}

export interface PeticionChat {
  mensajes: MensajeChat[]
  contexto: ContextoChat
}

export const MAX_TEXTO = 2000
export const MAX_MENSAJES = 12

const esObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const esNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const esTexto = (x: unknown): x is string => typeof x === 'string'
const esUno = <T extends string>(lista: readonly T[], x: unknown): x is T =>
  typeof x === 'string' && (lista as readonly string[]).includes(x)

/**
 * Recorta cada texto a MAX_TEXTO y limita la profundidad. Devuelve undefined si el dato
 * es demasiado profundo (se trata como peticion invalida).
 */
export function limpiar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 8) return undefined
  if (typeof valor === 'string') return valor.slice(0, MAX_TEXTO)
  if (Array.isArray(valor)) {
    const salida: unknown[] = []
    for (const v of valor) {
      const l = limpiar(v, profundidad + 1)
      if (l === undefined && v !== undefined) return undefined
      salida.push(l)
    }
    return salida
  }
  if (esObj(valor)) {
    const salida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) {
      const l = limpiar(v, profundidad + 1)
      if (l === undefined && v !== undefined) return undefined
      salida[k] = l
    }
    return salida
  }
  return valor
}

function porEscenario(x: unknown): Record<Escenario, number> | null {
  if (!esObj(x)) return null
  if (!esNum(x.normal) || !esNum(x.seco) || !esNum(x.lluvioso)) return null
  return { normal: x.normal, seco: x.seco, lluvioso: x.lluvioso }
}

function candidato(x: unknown): CandidatoDecision | null {
  if (!esObj(x)) return null
  const pe = porEscenario(x.porEscenario)
  if (!esTexto(x.id) || x.id.length === 0 || !esTexto(x.nombre) || typeof x.actual !== 'boolean') return null
  if (!esNum(x.total) || !pe || !esUno(TIPOS_CAMBIO, x.tipoCambio)) return null
  if (!Array.isArray(x.partes) || x.partes.length > 8) return null
  const partes: CandidatoDecision['partes'] = []
  for (const p of x.partes) {
    if (!esObj(p) || !esUno(CLAVES_PARTE, p.clave) || !esNum(p.valor)) return null
    partes.push({ clave: p.clave, valor: p.valor })
  }
  return { id: x.id, nombre: x.nombre, actual: x.actual, total: x.total, porEscenario: pe, partes, tipoCambio: x.tipoCambio }
}

function perspectiva(x: unknown): PerspectivaResumen | null | undefined {
  if (x === null || x === undefined) return null
  if (!esObj(x)) return undefined
  const prob = porEscenario(x.prob)
  const conteo = porEscenario(x.conteo)
  if (!esTexto(x.temporada) || !prob || !conteo || typeof x.usable !== 'boolean') return undefined
  return { temporada: x.temporada, prob, conteo, usable: x.usable }
}

export function validarContexto(x: unknown): ContextoChat | null {
  return esObj(x) ? (x as ContextoChat) : null
}

export function validarDecision(x: unknown): PeticionDecision | null {
  if (!esObj(x)) return null
  const contexto = validarContexto(x.contexto)
  if (!contexto || !Array.isArray(x.enfoques) || !esUno(ESCENARIOS, x.escenario)) return null
  if (x.enfoques.length > ENFOQUES.length || !x.enfoques.every((e) => esUno(ENFOQUES, e))) return null
  if (!Array.isArray(x.candidatos) || x.candidatos.length < 1 || x.candidatos.length > 3) return null
  const candidatos: CandidatoDecision[] = []
  for (const c of x.candidatos) {
    const v = candidato(c)
    if (!v) return null
    candidatos.push(v)
  }
  if (new Set(candidatos.map((c) => c.id)).size !== candidatos.length) return null
  const p = perspectiva(x.perspectiva)
  if (p === undefined) return null
  if (x.textoLibre !== undefined && !esTexto(x.textoLibre)) return null
  return {
    contexto,
    enfoques: [...new Set(x.enfoques as Enfoque[])],
    escenario: x.escenario,
    candidatos,
    perspectiva: p,
    ...(x.textoLibre !== undefined ? { textoLibre: x.textoLibre } : {}),
  }
}

export function validarExplicacion(x: unknown): PeticionExplicacion | null {
  const base = validarDecision(x)
  if (!base || !esObj(x) || !esObj(x.decision) || !esTexto(x.preset)) return null
  const d = x.decision
  if (!esTexto(d.rotacionId) || !base.candidatos.some((c) => c.id === d.rotacionId)) return null
  if (d.enfoquePrincipal !== null && !esUno(ENFOQUES, d.enfoquePrincipal)) return null
  if (!esUno(AVISOS, d.aviso) || !esUno(ORIGENES, d.origen)) return null
  return {
    ...base,
    decision: { rotacionId: d.rotacionId, enfoquePrincipal: d.enfoquePrincipal, aviso: d.aviso, origen: d.origen },
    preset: x.preset,
  }
}

export function validarChat(x: unknown): PeticionChat | null {
  if (!esObj(x) || !Array.isArray(x.mensajes)) return null
  const contexto = validarContexto(x.contexto)
  if (!contexto) return null
  const mensajes: MensajeChat[] = []
  for (const m of x.mensajes) {
    if (!esObj(m) || !esUno(['usuario', 'asistente'] as const, m.rol) || !esTexto(m.texto)) return null
    // Los mensajes vacios (p. ej. una respuesta que fallo) se descartan: Gemini rechaza partes vacias.
    if (m.texto.trim() !== '') mensajes.push({ rol: m.rol, texto: m.texto })
  }
  const ultimos = mensajes.slice(-MAX_MENSAJES)
  // El historial debe empezar y terminar con un mensaje de la persona.
  while (ultimos.length > 0 && ultimos[0].rol !== 'usuario') ultimos.shift()
  if (ultimos.length === 0 || ultimos[ultimos.length - 1].rol !== 'usuario') return null
  return { mensajes: ultimos, contexto }
}
