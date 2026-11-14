// Cliente minimo de la API REST de Gemini (sin SDK). La clave va solo en la cabecera x-goog-api-key.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Modelos por defecto, estables segun la pagina de modelos de Google AI Studio (consultada el 2026-11-14).
export const MODELO_DECISION_DEFECTO = 'gemini-3.5-flash-lite'
export const MODELO_NORMAL_DEFECTO = 'gemini-3.6-flash'

export class ErrorModelo extends Error {
  readonly codigo: 'modelo' | 'tiempo'
  constructor(codigo: 'modelo' | 'tiempo') {
    super(codigo)
    this.name = 'ErrorModelo'
    this.codigo = codigo
  }
}

export interface Contenido {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export interface OpcionesModelo {
  clave: string
  modelo: string
  instruccion: string
  contenidos: Contenido[]
  maxTokens: number
  temperatura: number
  tiempoMs: number
  /** Nivel de razonamiento (MINIMAL, LOW...). undefined = no se envia thinkingConfig. */
  razonamiento?: string
  /** Esquema JSON: activa la salida estructurada. */
  esquema?: Record<string, unknown>
  fetchFn: typeof fetch
}

interface Llamada {
  url: string
  init: RequestInit
  agotado(): boolean
  terminar(): void
  cancelar(): void
}

function iniciar(o: OpcionesModelo, flujo: boolean): Llamada {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: o.maxTokens,
    temperature: o.temperatura,
  }
  if (o.razonamiento) generationConfig.thinkingConfig = { thinkingLevel: o.razonamiento }
  if (o.esquema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseJsonSchema = o.esquema
  }
  const accion = flujo ? 'streamGenerateContent?alt=sse' : 'generateContent'
  const controlador = new AbortController()
  let agotado = false
  const temporizador = setTimeout(() => {
    agotado = true
    controlador.abort()
  }, o.tiempoMs)
  return {
    url: `${BASE}/${encodeURIComponent(o.modelo)}:${accion}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.instruccion }] },
        contents: o.contenidos,
        generationConfig,
      }),
      signal: controlador.signal,
    },
    agotado: () => agotado,
    terminar: () => clearTimeout(temporizador),
    cancelar: () => {
      clearTimeout(temporizador)
      controlador.abort()
    },
  }
}

function traducir(e: unknown, agotado: boolean): ErrorModelo {
  if (agotado) return new ErrorModelo('tiempo')
  if (e instanceof ErrorModelo) return e
  const nombre = (e as { name?: string } | null)?.name
  return new ErrorModelo(nombre === 'TimeoutError' ? 'tiempo' : 'modelo')
}

/** Une los textos de la primera candidata, sin las partes de "pensamiento". */
function extraerTexto(dato: unknown): string {
  const partes = (dato as { candidates?: { content?: { parts?: unknown } }[] } | null)?.candidates?.[0]?.content?.parts
  if (!Array.isArray(partes)) return ''
  return partes
    .filter((p) => typeof p?.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('')
}

function fallar(r: Response): never {
  // Solo el estado: nunca el cuerpo del proveedor (puede traer datos internos).
  console.error(`gemini: respuesta ${r.status}`)
  void r.body?.cancel().catch(() => {})
  throw new ErrorModelo('modelo')
}

/** Llamada normal: devuelve el texto completo. */
export async function generar(o: OpcionesModelo): Promise<string> {
  const c = iniciar(o, false)
  try {
    const r = await o.fetchFn(c.url, c.init)
    if (!r.ok) fallar(r)
    const texto = extraerTexto(await r.json())
    if (texto === '') throw new ErrorModelo('modelo')
    return texto
  } catch (e) {
    throw traducir(e, c.agotado())
  } finally {
    c.terminar()
  }
}

function textoDeLinea(linea: string): string {
  if (!linea.startsWith('data:')) return ''
  const carga = linea.slice(5).trim()
  if (carga === '' || carga === '[DONE]') return ''
  try {
    return extraerTexto(JSON.parse(carga))
  } catch {
    throw new ErrorModelo('modelo')
  }
}

async function* fragmentos(cuerpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lector = cuerpo.getReader()
  const decodificador = new TextDecoder()
  let resto = ''
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      resto += decodificador.decode(value, { stream: true })
      const lineas = resto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) {
        const t = textoDeLinea(l)
        if (t) yield t
      }
    }
    const t = textoDeLinea(resto + decodificador.decode())
    if (t) yield t
  } finally {
    void lector.cancel().catch(() => {})
  }
}

/**
 * Llamada en flujo. Espera el primer fragmento antes de devolver, para que un fallo inicial
 * pueda responderse con su codigo de error; despues reenvia los fragmentos conforme llegan.
 */
export async function generarFlujo(o: OpcionesModelo): Promise<ReadableStream<Uint8Array>> {
  const c = iniciar(o, true)
  try {
    const r = await o.fetchFn(c.url, c.init)
    if (!r.ok) fallar(r)
    if (!r.body) throw new ErrorModelo('modelo')
    const it = fragmentos(r.body)
    const primero = await it.next()
    if (primero.done) throw new ErrorModelo('modelo')
    const codificador = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(codificador.encode(primero.value))
      },
      async pull(ctrl) {
        try {
          const s = await it.next()
          if (s.done) {
            c.terminar()
            ctrl.close()
          } else {
            ctrl.enqueue(codificador.encode(s.value))
          }
        } catch {
          c.terminar()
          ctrl.error(new Error('flujo interrumpido'))
        }
      },
      cancel() {
        c.cancelar()
        void it.return(undefined)
      },
    })
  } catch (e) {
    c.cancelar()
    throw traducir(e, c.agotado())
  }
}
