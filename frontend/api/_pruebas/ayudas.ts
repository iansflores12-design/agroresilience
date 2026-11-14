import { vi } from 'vitest'
import type { CandidatoDecision, ContextoChat } from '../_lib/tipos.js'

// Valor ficticio: solo sirve para comprobar que nunca aparece en URL ni respuestas.
export const CLAVE_PRUEBA = 'clave-de-prueba-123456'
export const ENTORNO = { GEMINI_API_KEY: CLAVE_PRUEBA }

export const contexto: ContextoChat = {
  vista: 'cultivos',
  cultivo: { id: 'maiz', nombre: 'Maiz' },
  edadSemanas: 6,
  etapa: 'crecimiento',
  zona: { id: 'z1', nombre: 'Choluteca', lat: 13.3, lon: -87.2 },
  humedad: { valor: 0.21, fecha: '2026-11-12', unidad: 'm3/m3' },
}

export function candidato(id: string, actual = false): CandidatoDecision {
  return {
    id,
    nombre: `Rotacion ${id}`,
    actual,
    total: 70,
    porEscenario: { normal: 70, seco: 60, lluvioso: 75 },
    partes: [
      { clave: 'agua', valor: 60 },
      { clave: 'suelo', valor: 70 },
    ],
    tipoCambio: 'leguminosa',
  }
}

export function cuerpoDecision(ids: string[] = ['a', 'b', 'c']) {
  return {
    contexto,
    enfoques: ['agua', 'seguro'],
    escenario: 'seco',
    candidatos: ids.map((id, i) => candidato(id, i === 0)),
    perspectiva: null,
  }
}

export function cuerpoExplicacion(extra: Record<string, unknown> = {}) {
  return {
    ...cuerpoDecision(),
    decision: { rotacionId: 'b', enfoquePrincipal: 'agua', aviso: 'ninguno', origen: 'gemini' },
    preset: 'Resumen del preset',
    ...extra,
  }
}

export function peticion(cuerpo: unknown, metodo = 'POST'): Request {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  return new Request('http://localhost/api/x', {
    method: metodo,
    ...(metodo === 'GET' || metodo === 'HEAD' ? {} : { body: texto, headers: { 'Content-Type': 'application/json' } }),
  })
}

export function respuestaGemini(texto: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Respuesta SSE de Gemini; cada fragmento llega como un trozo aparte. */
export function respuestaSSE(fragmentos: string[]): Response {
  const enc = new TextEncoder()
  const cuerpo = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const f of fragmentos) {
        const evento = { candidates: [{ content: { role: 'model', parts: [{ text: f }] } }] }
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(evento)}\r\n\r\n`))
      }
      ctrl.close()
    },
  })
  return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

export interface LlamadaVista {
  url: string
  cabeceras: Record<string, string>
  cuerpo: {
    systemInstruction: { parts: { text: string }[] }
    contents: { role: string; parts: { text: string }[] }[]
    generationConfig: Record<string, unknown>
  }
}

/** fetch simulado que registra lo que se le envia y responde con lo que se indique. */
export function fetchSimulado(responder: (llamada: LlamadaVista, init: RequestInit) => Promise<Response> | Response) {
  const llamadas: LlamadaVista[] = []
  const fn = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const llamada: LlamadaVista = {
      url: String(entrada),
      cabeceras: Object.fromEntries(new Headers(init?.headers).entries()),
      cuerpo: JSON.parse(String(init?.body)),
    }
    llamadas.push(llamada)
    return responder(llamada, init ?? {})
  })
  return { fetch: fn as unknown as typeof fetch, llamadas, fn }
}

/** fetch que nunca responde y rechaza al abortarse la senal (para probar el tiempo agotado). */
export function fetchColgado() {
  return fetchSimulado(
    (_l, init) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError')))
      }),
  )
}
