// Cliente minimo de la API de Gemini (REST, sin SDK). Solo corre en el servidor: la clave
// GEMINI_API_KEY nunca llega al navegador.

// GEMINI_URL_BASE solo sirve para pruebas locales con un Gemini simulado.
const URL_BASE = process.env.GEMINI_URL_BASE?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models/'

// 'cortado': Gemini llego al limite de tokens y dejo el texto a medias.
export type CausaGemini = 'sin_clave' | 'cuota' | 'clave' | 'servidor' | 'red' | 'cancelado' | 'cortado'

export class ErrorGemini extends Error {
  readonly causa: CausaGemini
  constructor(causa: CausaGemini, mensaje?: string) {
    super(mensaje ?? `Gemini: ${causa}`)
    this.name = 'ErrorGemini'
    this.causa = causa
  }
}

export interface MensajeGemini {
  rol: 'user' | 'model'
  texto: string
}

export interface PedidoGemini {
  sistema: string
  mensajes: MensajeGemini[]
  signal?: AbortSignal
  maxTokens?: number
}

export function hayClave(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

function modelo(): string {
  return process.env.GEMINI_MODELO?.trim() || 'gemini-3.8-flash'
}

/**
 * Tope de tokens de salida. El razonamiento del modelo cuenta contra este tope, asi que va
 * holgado: el largo del texto lo fijan las instrucciones, no este numero.
 */
export const MAX_TOKENS = 4096

/**
 * Nivel de razonamiento. Por defecto el minimo: Gemini solo explica numeros ya calculados, y
 * con mas razonamiento el modelo gasta el tope de tokens antes de escribir la respuesta.
 */
function nivelPensamiento(): string {
  return process.env.GEMINI_PENSAMIENTO?.trim() || 'minimal'
}

function cuerpo(p: PedidoGemini, conPensamiento: boolean): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: p.sistema }] },
    contents: p.mensajes.map((m) => ({ role: m.rol, parts: [{ text: m.texto }] })),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: p.maxTokens ?? MAX_TOKENS,
      ...(conPensamiento ? { thinkingConfig: { thinkingLevel: nivelPensamiento() } } : {}),
    },
  })
}

async function llamar(metodo: string, p: PedidoGemini): Promise<Response> {
  const clave = process.env.GEMINI_API_KEY?.trim()
  if (!clave) throw new ErrorGemini('sin_clave', 'Falta GEMINI_API_KEY en el servidor')
  const pedir = async (conPensamiento: boolean): Promise<Response> => {
    try {
      return await fetch(`${URL_BASE}${modelo()}:${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
        body: cuerpo(p, conPensamiento),
        signal: p.signal,
      })
    } catch (e) {
      if (p.signal?.aborted) throw new ErrorGemini('cancelado')
      throw new ErrorGemini('red', String(e))
    }
  }
  let r = await pedir(true)
  // Un modelo que no acepta ese nivel de razonamiento responde 400: se repite sin el.
  if (r.status === 400) r = await pedir(false)
  if (r.ok) return r
  const detalle = await r.text().catch(() => '')
  if (r.status === 429) throw new ErrorGemini('cuota', detalle)
  if (r.status === 401 || r.status === 403) throw new ErrorGemini('clave', detalle)
  throw new ErrorGemini('servidor', `Gemini respondio ${r.status}: ${detalle.slice(0, 300)}`)
}

function textoDe(dato: unknown): string {
  const partes = (dato as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
    ?.candidates?.[0]?.content?.parts
  return (partes ?? []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('')
}

/** Gemini paro por llegar al tope de tokens: el texto quedo a medias. */
function quedoCortado(dato: unknown): boolean {
  return (dato as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason === 'MAX_TOKENS'
}

/** Texto de Gemini a medida que llega (Server-Sent Events). */
export async function* geminiEnVivo(p: PedidoGemini): AsyncGenerator<string> {
  const r = await llamar('streamGenerateContent?alt=sse', p)
  if (!r.body) throw new ErrorGemini('servidor', 'Respuesta sin cuerpo')
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  let cortado = false
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      resto += value
      let corte: number
      while ((corte = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, corte).trim()
        resto = resto.slice(corte + 1)
        if (!linea.startsWith('data:')) continue
        const crudo = linea.slice(5).trim()
        if (!crudo || crudo === '[DONE]') continue
        try {
          const dato: unknown = JSON.parse(crudo)
          if (quedoCortado(dato)) cortado = true
          const t = textoDe(dato)
          if (t) yield t
        } catch {
          // Linea incompleta o ajena: se ignora.
        }
      }
    }
  } catch (e) {
    if (p.signal?.aborted) throw new ErrorGemini('cancelado')
    throw e instanceof ErrorGemini ? e : new ErrorGemini('red', String(e))
  } finally {
    lector.releaseLock()
  }
  if (cortado) throw new ErrorGemini('cortado', 'Gemini llego al tope de tokens')
}

/** Respuesta completa de una vez (para el chat). */
export async function geminiTexto(p: PedidoGemini): Promise<string> {
  const r = await llamar('generateContent', p)
  const dato: unknown = await r.json().catch(() => null)
  if (quedoCortado(dato)) throw new ErrorGemini('cortado', 'Gemini llego al tope de tokens')
  const texto = textoDe(dato).trim()
  if (!texto) throw new ErrorGemini('servidor', 'Gemini no devolvio texto')
  return texto
}
