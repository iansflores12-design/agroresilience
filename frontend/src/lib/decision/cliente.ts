// Cliente del navegador para Gemini Decision y el analisis de Gemini.

import { leerKharis } from './kharis'
import { decidir } from './motor'
import type { Decision, EntradaDecision } from './tipos'

const API = '/api'
const KHARIS = '/kharis/'

function esDecision(x: unknown): x is Decision {
  return typeof x === 'object' && x !== null && (x as Decision).version === 'gemini-decision.v1' && Array.isArray((x as Decision).rotaciones)
}

/** Calcula la decision en el navegador con los mismos datos y el mismo codigo que el servidor. */
export async function decidirLocal(entrada: EntradaDecision): Promise<Decision> {
  const { indice, punto, escala, distanciaKm } = await leerKharis(new URL(KHARIS, window.location.href).href, entrada)
  return decidir(entrada, punto, { fechaBase: indice.fecha_base, modelo: indice.version_modelo, escala, distanciaKm })
}

/**
 * Pide la decision al backend. Si el backend no esta (sitio estatico, sin red hacia la
 * funcion), la calcula aqui: el resultado es identico porque el codigo es el mismo.
 */
export async function pedirDecision(entrada: EntradaDecision, signal?: AbortSignal): Promise<Decision> {
  try {
    const r = await fetch(`${API}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrada }),
      signal,
    })
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const d: unknown = await r.json()
      if (esDecision(d)) return d
    }
  } catch (e) {
    if (signal?.aborted) throw e
  }
  return decidirLocal(entrada)
}

export type CausaAnalisis = 'sin_clave' | 'cuota' | 'clave' | 'servidor' | 'red' | 'kharis' | 'cuota_local'

export type EventoServidor =
  | { tipo: 'paso'; id: string; texto: string }
  | { tipo: 'decision'; decision: Decision }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'fin' }
  | { tipo: 'error'; causa: CausaAnalisis; mensaje?: string }

/** Pide el analisis en vivo. Llama a `alEvento` por cada linea NDJSON. */
export async function pedirAnalisis(
  entrada: EntradaDecision,
  rotacionId: string,
  alEvento: (e: EventoServidor) => void,
  signal: AbortSignal,
): Promise<void> {
  let r: Response
  try {
    r = await fetch(`${API}/analisis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrada, rotacionId }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw e
    alEvento({ tipo: 'error', causa: 'red' })
    return
  }
  if (!r.ok || !r.body || !(r.headers.get('content-type') ?? '').includes('ndjson')) {
    alEvento({ tipo: 'error', causa: r.status === 404 || !r.ok ? 'servidor' : 'red' })
    return
  }
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  let terminado = false
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      resto += value
      let corte: number
      while ((corte = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, corte).trim()
        resto = resto.slice(corte + 1)
        if (!linea) continue
        try {
          const ev = JSON.parse(linea) as EventoServidor
          if (ev.tipo === 'fin' || ev.tipo === 'error') terminado = true
          alEvento(ev)
        } catch {
          // Linea rota: se ignora.
        }
      }
    }
  } catch (e) {
    if (signal.aborted) throw e
    alEvento({ tipo: 'error', causa: 'red' })
    return
  }
  if (!terminado) alEvento({ tipo: 'error', causa: 'red' })
}
