import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geminiTexto, modelos, reiniciarPausas } from './_gemini.js'

const ok = (texto: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 })

const pedido = { sistema: 's', mensajes: [{ rol: 'user' as const, texto: 'hola' }] }

describe('cadena de modelos de Gemini', () => {
  beforeEach(() => {
    reiniciarPausas()
    process.env.GEMINI_API_KEY = 'clave-de-prueba'
  })
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_LIMITE_MS
    vi.unstubAllGlobals()
  })

  it('si un modelo no tiene red, prueba el siguiente', async () => {
    const llamadas: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      llamadas.push(url)
      if (llamadas.length === 1) throw new TypeError('fetch failed')
      return ok('respuesta')
    }))
    expect(await geminiTexto(pedido)).toBe('respuesta')
    expect(llamadas[0]).toContain(modelos()[0])
    expect(llamadas[1]).toContain(modelos()[1])
  })

  it('si un modelo se cuelga, lo corta y prueba el siguiente', async () => {
    process.env.GEMINI_LIMITE_MS = '20'
    let n = 0
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      n++
      if (n === 1) return new Promise((_, no) => init.signal?.addEventListener('abort', () => no(new DOMException('abort', 'AbortError'))))
      return Promise.resolve(ok('del segundo'))
    }))
    expect(await geminiTexto(pedido)).toBe('del segundo')
  })

  it('la cancelacion de quien pregunta no salta al siguiente modelo', async () => {
    const control = new AbortController()
    const fetchSim = vi.fn((_url: string, init: RequestInit) => new Promise((_, no) => init.signal?.addEventListener('abort', () => no(new DOMException('abort', 'AbortError')))))
    vi.stubGlobal('fetch', fetchSim)
    const promesa = geminiTexto({ ...pedido, signal: control.signal })
    control.abort()
    await expect(promesa).rejects.toMatchObject({ causa: 'cancelado' })
    expect(fetchSim).toHaveBeenCalledTimes(1)
  })
})
