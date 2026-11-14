import { ErrorModelo, MODELO_DECISION_DEFECTO, MODELO_NORMAL_DEFECTO } from './gemini.js'
import { limpiar } from './tipos.js'

export const TOPE_CUERPO = 16 * 1024

export interface Deps {
  fetch?: typeof fetch
  entorno?: Record<string, string | undefined>
}

const CABECERAS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

export function json(estado: number, cuerpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CABECERAS, ...extra },
  })
}

export type CodigoError = 'peticion' | 'configuracion' | 'modelo' | 'tiempo' | 'metodo' | 'tamano'

export function error(estado: number, codigo: CodigoError, extra: Record<string, string> = {}): Response {
  return json(estado, { error: codigo }, extra)
}

export function texto(flujo: ReadableStream<Uint8Array>): Response {
  return new Response(flujo, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CABECERAS },
  })
}

/** Falla del modelo -> 504 si se agoto el tiempo, 502 en cualquier otro caso. Sin detalles internos. */
export function respuestaDeError(e: unknown): Response {
  return e instanceof ErrorModelo && e.codigo === 'tiempo' ? error(504, 'tiempo') : error(502, 'modelo')
}

async function leerTope(peticion: Request): Promise<string | null> {
  const declarado = Number(peticion.headers.get('content-length'))
  if (Number.isFinite(declarado) && declarado > TOPE_CUERPO) return null
  if (!peticion.body) return ''
  const lector = peticion.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > TOPE_CUERPO) {
      void lector.cancel().catch(() => {})
      return null
    }
    trozos.push(value)
  }
  const todo = new Uint8Array(total)
  let pos = 0
  for (const t of trozos) {
    todo.set(t, pos)
    pos += t.byteLength
  }
  return new TextDecoder().decode(todo)
}

/** Valida metodo, tamano y JSON. Devuelve el valor ya limpio (textos recortados) o la respuesta de error. */
export async function leerPeticion(peticion: Request): Promise<{ valor: unknown } | { respuesta: Response }> {
  if (peticion.method !== 'POST') return { respuesta: error(405, 'metodo', { Allow: 'POST' }) }
  const crudo = await leerTope(peticion)
  if (crudo === null) return { respuesta: error(413, 'tamano') }
  let valor: unknown
  try {
    valor = JSON.parse(crudo)
  } catch {
    return { respuesta: error(400, 'peticion') }
  }
  const limpio = limpiar(valor)
  if (limpio === undefined) return { respuesta: error(400, 'peticion') }
  return { valor: limpio }
}

export interface Configuracion {
  clave: string | null
  modeloDecision: string
  modeloNormal: string
  razonamiento: string | undefined
  fetchFn: typeof fetch
}

export function leerConfiguracion(deps: Deps): Configuracion {
  const e = deps.entorno ?? process.env
  const nivel = (e.GEMINI_RAZONAMIENTO ?? '').trim().toUpperCase()
  return {
    clave: e.GEMINI_API_KEY?.trim() || null,
    modeloDecision: e.GEMINI_MODELO_DECISION?.trim() || MODELO_DECISION_DEFECTO,
    modeloNormal: e.GEMINI_MODELO_NORMAL?.trim() || MODELO_NORMAL_DEFECTO,
    // Por defecto razonamiento minimo: el razonamiento gasta tokens de salida y tiempo.
    // GEMINI_RAZONAMIENTO=ninguno omite el parametro (para modelos que no admiten MINIMAL).
    razonamiento: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'].includes(nivel) ? nivel : nivel === 'NINGUNO' ? undefined : 'MINIMAL',
    fetchFn: deps.fetch ?? fetch,
  }
}
