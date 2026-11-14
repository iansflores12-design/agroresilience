// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { manejar } from '../explicacion.js'
import { CLAVE_PRUEBA, cuerpoExplicacion, ENTORNO, fetchColgado, fetchSimulado, peticion, respuestaSSE } from './ayudas.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('POST /api/explicacion', () => {
  it('reenvia los fragmentos en orden como texto plano y arma bien la peticion', async () => {
    const trozos = ['Resumen corto.\n', '---\n', 'Detalle con datos. ', 'Quiere saber mas?']
    const sim = fetchSimulado(() => respuestaSSE(trozos))
    const cuerpo = cuerpoExplicacion({ textoLibre: 'marca-usuario' })
    const r = await manejar(peticion(cuerpo), { fetch: sim.fetch, entorno: ENTORNO })

    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')

    const lector = r.body!.getReader()
    const recibidos: string[] = []
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      recibidos.push(dec.decode(value))
    }
    expect(recibidos).toEqual(trozos)
    expect(recibidos.join('')).toBe('Resumen corto.\n---\nDetalle con datos. Quiere saber mas?')

    const l = sim.llamadas[0]
    expect(l.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse',
    )
    expect(l.url).not.toContain(CLAVE_PRUEBA)
    expect(l.cabeceras['x-goog-api-key']).toBe(CLAVE_PRUEBA)
    expect((l.cuerpo.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(450)
    expect(l.cuerpo.systemInstruction.parts[0].text).not.toContain('marca-usuario')
    expect(l.cuerpo.systemInstruction.parts[0].text).not.toContain('Resumen del preset')
    expect(l.cuerpo.contents[0].parts[0].text).toContain('marca-usuario')
    expect(l.cuerpo.contents[0].parts[0].text).toContain('Resumen del preset')
  })

  it('responde 400 si la decision apunta a una rotacion que no esta en los candidatos', async () => {
    const cuerpo = cuerpoExplicacion({
      decision: { rotacionId: 'zzz', enfoquePrincipal: null, aviso: 'ninguno', origen: 'motor' },
    })
    const r = await manejar(peticion(cuerpo), { entorno: ENTORNO })
    expect(r.status).toBe(400)
  })

  it('responde 502 si el flujo llega vacio', async () => {
    const sim = fetchSimulado(() => respuestaSSE([]))
    const r = await manejar(peticion(cuerpoExplicacion()), { fetch: sim.fetch, entorno: ENTORNO })
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'modelo' })
  })

  it('responde 502 si el proveedor falla, sin filtrar su mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sim = fetchSimulado(() => new Response('detalle interno secreto', { status: 429 }))
    const r = await manejar(peticion(cuerpoExplicacion()), { fetch: sim.fetch, entorno: ENTORNO })
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('secreto')
  })

  it('responde 504 si el modelo no empieza a responder en 25 s', async () => {
    vi.useFakeTimers()
    const sim = fetchColgado()
    const promesa = manejar(peticion(cuerpoExplicacion()), { fetch: sim.fetch, entorno: ENTORNO })
    await vi.advanceTimersByTimeAsync(25000)
    const r = await promesa
    expect(r.status).toBe(504)
    expect(await r.json()).toEqual({ error: 'tiempo' })
  })
})
