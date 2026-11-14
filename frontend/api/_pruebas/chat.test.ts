// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { manejar } from '../chat.js'
import { CLAVE_PRUEBA, contexto, ENTORNO, fetchColgado, fetchSimulado, peticion, respuestaGemini } from './ayudas.js'

afterEach(() => {
  vi.useRealTimers()
})

function mensajes(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    rol: i % 2 === 0 ? 'usuario' : 'asistente',
    texto: `mensaje ${i}`,
    fecha: '2026-11-14',
  }))
}

describe('POST /api/chat', () => {
  it('recorta a los ultimos 12 mensajes', async () => {
    const sim = fetchSimulado(() => respuestaGemini('ok'))
    const lista = Array.from({ length: 20 }, (_, i) => ({ id: String(i), rol: 'usuario', texto: `m${i}`, fecha: 'x' }))
    await manejar(peticion({ mensajes: lista, contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    const c = sim.llamadas[0].cuerpo.contents
    expect(c).toHaveLength(12)
    expect(c[0].parts[0].text).toBe('m8')
    expect(c[11].parts[0].text).toContain('m19')
  })

  it('si el recorte deja primero un mensaje del asistente, lo descarta para empezar con la persona', async () => {
    const sim = fetchSimulado(() => respuestaGemini('ok'))
    // 21 alternados: los ultimos 12 son los indices 9..20; el 9 es del asistente y se descarta.
    await manejar(peticion({ mensajes: mensajes(21), contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    const c = sim.llamadas[0].cuerpo.contents
    expect(c).toHaveLength(11)
    expect(c[0].role).toBe('user')
    expect(c[0].parts[0].text).toBe('mensaje 10')
  })

  it('mapea los roles y mete el contexto solo en el ultimo mensaje de la persona', async () => {
    const sim = fetchSimulado(() => respuestaGemini('ok'))
    const lista = [
      { id: '1', rol: 'usuario', texto: 'hola', fecha: 'x' },
      { id: '2', rol: 'asistente', texto: 'buenas', fecha: 'x' },
      { id: '3', rol: 'usuario', texto: 'marca-usuario', fecha: 'x' },
    ]
    await manejar(peticion({ mensajes: lista, contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    const l = sim.llamadas[0]
    expect(l.cuerpo.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(l.cuerpo.contents[0].parts[0].text).toBe('hola')
    expect(l.cuerpo.contents[2].parts[0].text).toContain('marca-usuario')
    expect(l.cuerpo.contents[2].parts[0].text).toContain('Choluteca')
    expect(l.cuerpo.systemInstruction.parts[0].text).not.toContain('marca-usuario')
    expect(l.cuerpo.systemInstruction.parts[0].text).not.toContain('Choluteca')
    expect((l.cuerpo.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(500)
  })

  it('recorta cada texto a 2000 caracteres', async () => {
    const sim = fetchSimulado(() => respuestaGemini('ok'))
    const lista = [{ id: '1', rol: 'usuario', texto: 'a'.repeat(5000), fecha: 'x' }]
    await manejar(peticion({ mensajes: lista, contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    const texto = sim.llamadas[0].cuerpo.contents[0].parts[0].text
    expect(texto).toContain('a'.repeat(2000))
    expect(texto).not.toContain('a'.repeat(2001))
  })

  it('acepta campos opcionales recomendacion y perspectiva en el contexto', async () => {
    const sim = fetchSimulado(() => respuestaGemini('ok'))
    const ctx = { ...contexto, recomendacion: { rotacionId: 'b' }, perspectiva: { temporada: 'primera' } }
    const r = await manejar(peticion({ mensajes: mensajes(1), contexto: ctx }), { fetch: sim.fetch, entorno: ENTORNO })
    expect(r.status).toBe(200)
    expect(sim.llamadas[0].cuerpo.contents[0].parts[0].text).toContain('primera')
  })

  it('la clave nunca aparece en la URL ni en la respuesta', async () => {
    const sim = fetchSimulado(() => respuestaGemini('Hola'))
    const r = await manejar(peticion({ mensajes: mensajes(1), contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    expect(sim.llamadas[0].url).not.toContain(CLAVE_PRUEBA)
    expect(await r.text()).not.toContain(CLAVE_PRUEBA)
  })

  it('responde 504 si se agota el tiempo (25 s)', async () => {
    vi.useFakeTimers()
    const sim = fetchColgado()
    const promesa = manejar(peticion({ mensajes: mensajes(1), contexto }), { fetch: sim.fetch, entorno: ENTORNO })
    await vi.advanceTimersByTimeAsync(25000)
    const r = await promesa
    expect(r.status).toBe(504)
    expect(await r.json()).toEqual({ error: 'tiempo' })
  })
})
