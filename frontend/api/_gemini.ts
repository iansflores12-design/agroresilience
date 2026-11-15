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

/**
 * Cadena de modelos, del que da mas consultas gratis al dia al que da menos (probado el 15-11-2026 con
 * una clave sin facturacion, scripts/probar_modelos.mjs): los Flash-Lite dan cientos de consultas al
 * dia y los Flash solo unas 20. Si uno esta sin cuota, saturado o no existe, se prueba el siguiente.
 */
const CADENA = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.8-flash']

/**
 * GEMINI_MODELOS (lista separada por comas) reemplaza la cadena completa. GEMINI_MODELO y
 * GEMINI_MODELO_RESPALDO, de configuraciones anteriores, se suman al final como respaldo extra:
 * asi una clave vieja con un Flash de 20 consultas al dia no deja al sitio sin cuota.
 */
export function modelos(): string[] {
  const lista = process.env.GEMINI_MODELOS?.split(',').map((m) => m.trim()).filter(Boolean)
  if (lista?.length) return [...new Set(lista)]
  const elegidos = [process.env.GEMINI_MODELO, process.env.GEMINI_MODELO_RESPALDO].map((m) => m?.trim()).filter((m): m is string => Boolean(m))
  return [...new Set([...CADENA, ...elegidos])]
}

/** Modelos que acaban de fallar: se saltan un rato para no gastar una llamada en cada consulta. */
const enPausa = new Map<string, number>()

function pausaMs(estado: number, busqueda: boolean): number {
  // Sin facturacion la busqueda con Google no tiene cuota: no vale la pena insistir pronto.
  if (estado === 429) return busqueda ? 60 * 60_000 : 5 * 60_000
  if (estado === 404) return 60 * 60_000
  return 30_000
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
  const todos = modelos()
  const marca = (m: string) => (p.busqueda ? `${m}|busqueda` : m)
  const ahora = Date.now()
  const libres = todos.filter((m) => (enPausa.get(marca(m)) ?? 0) <= ahora)
  // Si todos estan en pausa se prueba igual el primero, para devolver su error real.
  const lista = libres.length ? libres : todos.slice(0, 1)
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
    if (PROBAR_OTRO.has(r.status)) {
      enPausa.set(marca(lista[i]), Date.now() + pausaMs(r.status, Boolean(p.busqueda)))
      if (i < lista.length - 1 && !p.signal?.aborted) {
        console.error(`[gemini] ${lista[i]} respondio ${r.status}; se prueba ${lista[i + 1]}`)
        await esperar(200)
        continue
      }
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

/** Solo para pruebas: olvida las pausas. */
export function reiniciarPausas(): void {
  enPausa.clear()
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
