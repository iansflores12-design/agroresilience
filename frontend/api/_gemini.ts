// Cliente minimo de la API de Gemini (REST, sin SDK). Solo corre en el servidor: la clave
// GEMINI_API_KEY nunca llega al navegador.

// GEMINI_URL_BASE solo sirve para pruebas locales con un Gemini simulado.
const URL_BASE = process.env.GEMINI_URL_BASE?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models/'

export type CausaGemini = 'sin_clave' | 'cuota' | 'clave' | 'servidor' | 'red' | 'cancelado'

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
  /** Deja que el modelo busque en Google antes de responder. */
  busqueda?: boolean
  temperatura?: number
}

export function hayClave(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

/** El modelo configurado y, detrás, el de respaldo: se usa si el primero está saturado, sin cuota o no existe. */
function modelos(): string[] {
  const principal = process.env.GEMINI_MODELO?.trim() || 'gemini-3.8-flash'
  const respaldo = process.env.GEMINI_MODELO_RESPALDO?.trim() || 'gemini-3.5-flash'
  return principal === respaldo ? [principal] : [principal, respaldo]
}

function cuerpo(p: PedidoGemini): string {
  const nivel = process.env.GEMINI_PENSAMIENTO?.trim()
  return JSON.stringify({
    systemInstruction: { parts: [{ text: p.sistema }] },
    contents: p.mensajes.map((m) => ({ role: m.rol, parts: [{ text: m.texto }] })),
    ...(p.busqueda ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: p.temperatura ?? 0.4,
      // Holgado: los modelos que razonan gastan parte de este tope antes de escribir y, si es
      // corto, la respuesta llega cortada a media frase. El largo real lo limita el pedido.
      maxOutputTokens: p.maxTokens ?? 4096,
      ...(nivel ? { thinkingConfig: { thinkingLevel: nivel } } : {}),
    },
  })
}

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms))

/** Respuestas con las que vale la pena probar otro modelo: saturado, sin cuota, caído o inexistente. */
const PROBAR_OTRO = new Set([429, 500, 503, 404])

async function llamar(metodo: string, p: PedidoGemini): Promise<Response> {
  const clave = process.env.GEMINI_API_KEY?.trim()
  if (!clave) throw new ErrorGemini('sin_clave', 'Falta GEMINI_API_KEY en el servidor')
  const lista = modelos()
  let r: Response
  for (let i = 0; ; i++) {
    try {
      r = await fetch(`${URL_BASE}${lista[i]}:${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
        body: cuerpo(p),
        signal: p.signal,
      })
    } catch (e) {
      if (p.signal?.aborted) throw new ErrorGemini('cancelado')
      throw new ErrorGemini('red', String(e))
    }
    if (PROBAR_OTRO.has(r.status) && i < lista.length - 1 && !p.signal?.aborted) {
      console.error(`[gemini] ${lista[i]} respondio ${r.status}; se prueba ${lista[i + 1]}`)
      await esperar(300)
      continue
    }
    break
  }
  if (r.ok) return r
  const detalle = await r.text().catch(() => '')
  // 503 = "muchas consultas a este modelo": para el productor es lo mismo que la cuota, espere y reintente.
  if (r.status === 429 || r.status === 503) throw new ErrorGemini('cuota', `Gemini respondio ${r.status}: ${detalle.slice(0, 300)}`)
  if (r.status === 401 || r.status === 403) throw new ErrorGemini('clave', detalle)
  throw new ErrorGemini('servidor', `Gemini respondio ${r.status}: ${detalle.slice(0, 300)}`)
}

function textoDe(dato: unknown): string {
  const partes = (dato as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
    ?.candidates?.[0]?.content?.parts
  return (partes ?? []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('')
}

/** Texto de Gemini a medida que llega (Server-Sent Events). */
export async function* geminiEnVivo(p: PedidoGemini): AsyncGenerator<string> {
  const r = await llamar('streamGenerateContent?alt=sse', p)
  if (!r.body) throw new ErrorGemini('servidor', 'Respuesta sin cuerpo')
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
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
          const t = textoDe(JSON.parse(crudo))
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
}

/** Respuesta completa de una vez (para el chat). */
export async function geminiTexto(p: PedidoGemini): Promise<string> {
  const r = await llamar('generateContent', p)
  const texto = textoDe(await r.json().catch(() => null)).trim()
  if (!texto) throw new ErrorGemini('servidor', 'Gemini no devolvio texto')
  return texto
}

export interface FuenteWeb {
  titulo: string
  url: string
}

/** Respuesta completa con las paginas que el modelo consulto (para pedidos con `busqueda`). */
export async function geminiConFuentes(p: PedidoGemini): Promise<{ texto: string; fuentes: FuenteWeb[] }> {
  const r = await llamar('generateContent', p)
  const dato: unknown = await r.json().catch(() => null)
  const texto = textoDe(dato).trim()
  if (!texto) throw new ErrorGemini('servidor', 'Gemini no devolvio texto')
  const trozos = (dato as { candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })
    ?.candidates?.[0]?.groundingMetadata?.groundingChunks
  const fuentes: FuenteWeb[] = []
  for (const t of trozos ?? []) {
    const url = t.web?.uri
    if (typeof url !== 'string' || !url.startsWith('https://') || fuentes.some((f) => f.url === url)) continue
    fuentes.push({ titulo: (t.web?.title ?? '').slice(0, 80) || 'Fuente', url })
  }
  return { texto, fuentes }
}
