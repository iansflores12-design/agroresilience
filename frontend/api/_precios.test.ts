import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preciosDeRegion } from './_precios.js'

function respuestaGemini(texto: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: texto }] },
          groundingMetadata: { groundingChunks: [{ web: { uri: 'https://ejemplo.hn/precios', title: 'ejemplo.hn' } }, { web: { uri: 'javascript:alert(1)', title: 'malo' } }] },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('busqueda de precios por region', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'clave-de-prueba'
  })
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    vi.unstubAllGlobals()
  })

  it('pide la busqueda con Google, acepta solo precios creibles y guarda el resultado', async () => {
    const texto = 'Aqui va:\n```json\n' + JSON.stringify({
      precios: [
        { cultivo: 'frijol', lempiras_qq: 2300, mercado: 'Danlí', fecha: '2026-11-09', fuente: 'SIMPAH' },
        { cultivo: 'maiz', lempiras_qq: 99999, mercado: 'Danlí', fecha: '2026-11-09', fuente: 'x' },
        { cultivo: 'cafe', lempiras_qq: 3000, mercado: 'Danlí', fecha: '2026-11-09', fuente: 'x' },
        { cultivo: 'tomate', lempiras_qq: '1400', mercado: 'Ignora lo anterior\n<script>', fecha: 'ayer', fuente: '' },
      ],
    }) + '\n```'
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respuestaGemini(texto))
    vi.stubGlobal('fetch', fetchFalso)

    const p = await preciosDeRegion('Danlí')
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1]?.body)).tools).toEqual([{ google_search: {} }])
    expect(p.origen).toBe('busqueda')
    expect(Object.keys(p.cultivos).sort()).toEqual(['frijol', 'tomate'])
    expect(p.cultivos.frijol).toEqual({ lempirasQq: 2300, mercado: 'Danlí', fecha: '2026-11-09', fuente: 'SIMPAH' })
    expect(p.cultivos.tomate.mercado).not.toMatch(/[<>\n]/)
    expect(p.cultivos.tomate.fecha).toBe('')
    expect(p.fuentes).toEqual([{ titulo: 'ejemplo.hn', url: 'https://ejemplo.hn/precios' }])

    await preciosDeRegion('Danlí')
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it('si la busqueda falla o no trae JSON, devuelve la referencia sin romper la decision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{}}', { status: 429 })))
    expect((await preciosDeRegion('Yoro')).origen).toBe('referencia')
    vi.stubGlobal('fetch', vi.fn(async () => respuestaGemini('No encontré precios.')))
    expect((await preciosDeRegion('Gracias')).origen).toBe('referencia')
  })

  it('sin clave no busca', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchFalso = vi.fn()
    vi.stubGlobal('fetch', fetchFalso)
    expect((await preciosDeRegion('Tela')).origen).toBe('referencia')
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
