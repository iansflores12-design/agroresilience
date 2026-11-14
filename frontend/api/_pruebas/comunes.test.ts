// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { manejar as chat } from '../chat.js'
import { manejar as decision } from '../decision.js'
import { manejar as explicacion } from '../explicacion.js'
import { contexto, cuerpoDecision, cuerpoExplicacion, ENTORNO, fetchSimulado, peticion, respuestaGemini } from './ayudas.js'

const casos = [
  { nombre: 'decision', manejar: decision, valido: () => cuerpoDecision() },
  { nombre: 'explicacion', manejar: explicacion, valido: () => cuerpoExplicacion() },
  {
    nombre: 'chat',
    manejar: chat,
    valido: () => ({ mensajes: [{ id: '1', rol: 'usuario', texto: 'Hola', fecha: 'hoy' }], contexto }),
  },
]

describe.each(casos)('$nombre: validaciones comunes', ({ manejar, valido }) => {
  it('responde 405 si el metodo no es POST', async () => {
    const sim = fetchSimulado(() => respuestaGemini('x'))
    for (const metodo of ['GET', 'PUT', 'DELETE']) {
      const r = await manejar(peticion(valido(), metodo), { fetch: sim.fetch, entorno: ENTORNO })
      expect(r.status).toBe(405)
      expect(r.headers.get('Allow')).toBe('POST')
    }
    expect(sim.llamadas).toHaveLength(0)
  })

  it('responde 413 si el cuerpo supera 16 KB', async () => {
    const grande = { ...valido(), relleno: 'x'.repeat(17 * 1024) }
    const r = await manejar(peticion(grande), { entorno: ENTORNO })
    expect(r.status).toBe(413)
  })

  it('responde 400 con JSON invalido', async () => {
    const r = await manejar(peticion('{no es json'), { entorno: ENTORNO })
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'peticion' })
  })

  it('responde 400 con forma invalida', async () => {
    for (const malo of [[], {}, { mensajes: 'x' }, { candidatos: [] }]) {
      const r = await manejar(peticion(malo), { entorno: ENTORNO })
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ error: 'peticion' })
    }
  })

  it('responde 500 configuracion si falta la clave', async () => {
    const sim = fetchSimulado(() => respuestaGemini('x'))
    const r = await manejar(peticion(valido()), { fetch: sim.fetch, entorno: {} })
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'configuracion' })
    expect(sim.llamadas).toHaveLength(0)
  })
})
