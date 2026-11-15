import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorGemini, MAX_TOKENS, geminiEnVivo, geminiTexto } from './_gemini.js'

const pedido = { sistema: 'Instrucciones', mensajes: [{ rol: 'user' as const, texto: 'Hola' }] }

function respuesta(dato: unknown, estado = 200): Response {
  return new Response(JSON.stringify(dato), { status: estado, headers: { 'Content-Type': 'application/json' } })
}

function enVivo(trozos: unknown[]): Response {
  return new Response(trozos.map((t) => `data: ${JSON.stringify(t)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const candidato = (texto: string, finishReason?: string) => ({
  candidates: [{ content: { parts: [{ text: texto }] }, ...(finishReason ? { finishReason } : {}) }],
})

function configDe(llamada: unknown[]): { maxOutputTokens: number; thinkingConfig?: { thinkingLevel: string } } {
  return JSON.parse((llamada[1] as { body: string }).body).generationConfig
}

async function causaDe(promesa: Promise<unknown>): Promise<string> {
  const e = await promesa.then(
    () => null,
    (x: unknown) => x,
  )
  return e instanceof ErrorGemini ? e.causa : 'sin_error'
}

describe('cliente de Gemini', () => {
  const pedir = vi.fn<(...args: unknown[]) => Promise<Response>>()

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'clave-de-prueba')
    vi.stubEnv('GEMINI_PENSAMIENTO', '')
    vi.stubGlobal('fetch', pedir)
  })

  afterEach(() => {
    pedir.mockReset()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('pide razonamiento minimo y un tope holgado por defecto', async () => {
    pedir.mockResolvedValue(respuesta(candidato('Listo', 'STOP')))
    expect(await geminiTexto(pedido)).toBe('Listo')
    expect(configDe(pedir.mock.calls[0])).toMatchObject({ maxOutputTokens: MAX_TOKENS, thinkingConfig: { thinkingLevel: 'minimal' } })
  })

  it('respeta GEMINI_PENSAMIENTO', async () => {
    vi.stubEnv('GEMINI_PENSAMIENTO', 'high')
    pedir.mockResolvedValue(respuesta(candidato('Listo', 'STOP')))
    await geminiTexto(pedido)
    expect(configDe(pedir.mock.calls[0]).thinkingConfig).toEqual({ thinkingLevel: 'high' })
  })

  it('si el modelo rechaza el nivel de razonamiento (400), repite sin el', async () => {
    pedir.mockResolvedValueOnce(respuesta({ error: { code: 400 } }, 400)).mockResolvedValueOnce(respuesta(candidato('Listo', 'STOP')))
    expect(await geminiTexto(pedido)).toBe('Listo')
    expect(pedir).toHaveBeenCalledTimes(2)
    expect(configDe(pedir.mock.calls[1]).thinkingConfig).toBeUndefined()
  })

  it('texto cortado por el tope de tokens es un error, no una respuesta', async () => {
    pedir.mockResolvedValue(respuesta(candidato('Esta rotacion es la mejor,', 'MAX_TOKENS')))
    expect(await causaDe(geminiTexto(pedido))).toBe('cortado')
  })

  it('en vivo: entrega el texto y al final avisa que quedo cortado', async () => {
    pedir.mockResolvedValue(enVivo([candidato('Por que '), candidato('se recomienda', 'MAX_TOKENS')]))
    const trozos: string[] = []
    const leer = async () => {
      for await (const t of geminiEnVivo(pedido)) trozos.push(t)
    }
    expect(await causaDe(leer())).toBe('cortado')
    expect(trozos.join('')).toBe('Por que se recomienda')
  })

  it('en vivo: un texto completo termina sin error', async () => {
    pedir.mockResolvedValue(enVivo([candidato('Por que '), candidato('se recomienda.', 'STOP')]))
    const trozos: string[] = []
    for await (const t of geminiEnVivo(pedido)) trozos.push(t)
    expect(trozos.join('')).toBe('Por que se recomienda.')
  })
})
