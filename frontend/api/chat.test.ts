import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reiniciarPausas } from './_gemini.js'
import { POST, imagenDe } from './chat.js'

const FOTO = 'data:image/jpeg;base64,/9j/QUJD'

function pedir(cuerpo: unknown) {
  return POST(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(cuerpo) }))
}

describe('/api/chat con fotos', () => {
  let enviado: { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: Record<string, unknown>[] }[] }
  beforeEach(() => {
    reiniciarPausas()
    process.env.GEMINI_API_KEY = 'clave-de-prueba'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      enviado = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Es maíz con falta de nitrógeno.' }] } }] }), { status: 200 })
    }))
  })
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    vi.unstubAllGlobals()
  })

  it('valida el data URL de la foto', () => {
    expect(imagenDe(FOTO)).toEqual({ mimeType: 'image/jpeg', data: '/9j/QUJD' })
    expect(imagenDe('data:image/svg+xml;base64,QUJD')).toBeNull()
    expect(imagenDe('https://ejemplo.com/foto.jpg')).toBeNull()
    expect(imagenDe(42)).toBeNull()
  })

  it('manda la foto como inlineData y pide revisar el cultivo en el idioma de la app', async () => {
    const r = await pedir({ mensajes: [{ rol: 'usuario', texto: '', imagen: FOTO }], contexto: { idioma: 'en' } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ texto: 'Es maíz con falta de nitrógeno.' })
    const partes = enviado.contents[0].parts
    expect(partes[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: '/9j/QUJD' } })
    expect(partes[1]).toEqual({ text: 'What do you see in this photo of my crop?' })
    expect(enviado.systemInstruction.parts[0].text).toContain('pests, diseases or nutrient deficiency')
  })

  it('sin foto no agrega la instruccion de fotos y solo manda las dos ultimas', async () => {
    await pedir({ mensajes: [{ rol: 'usuario', texto: 'hola' }], contexto: {} })
    expect(enviado.systemInstruction.parts[0].text).not.toContain('mandó una foto')
    await pedir({
      mensajes: [
        { rol: 'usuario', texto: 'a', imagen: FOTO },
        { rol: 'asistente', texto: 'ok' },
        { rol: 'usuario', texto: 'b', imagen: FOTO },
        { rol: 'asistente', texto: 'ok' },
        { rol: 'usuario', texto: 'c', imagen: FOTO },
      ],
      contexto: {},
    })
    const conFoto = enviado.contents.filter((c) => c.parts.some((p) => 'inlineData' in p))
    expect(conFoto).toHaveLength(2)
  })
})
