import { leerFlujoTexto, pedirExplicacion } from './clienteExplicacion'
import type { PeticionExplicacion } from './clienteDecision'

function flujoDe(bytes: Uint8Array, tamanos: number[]): ReadableStream<Uint8Array> {
  let desde = 0
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(control) {
      if (desde >= bytes.length) {
        control.close()
        return
      }
      const n = tamanos[i++ % tamanos.length]
      control.enqueue(bytes.slice(desde, desde + n))
      desde += n
    },
  })
}

const texto = 'Siembre frijol: ñandú, canícula y árbol.\n---\nMás detalle sobre la cosecha. ¿Quiere saber más?'

describe('leerFlujoTexto', () => {
  it('une fragmentos de cualquier tamano, incluso de a un byte', async () => {
    const bytes = new TextEncoder().encode(texto)
    for (const tamanos of [[1], [2], [3, 1, 5], [7], [1000]]) {
      expect(await leerFlujoTexto(flujoDe(bytes, tamanos))).toBe(texto)
    }
  })

  it('no rompe una letra con tilde cortada a la mitad', async () => {
    const bytes = new TextEncoder().encode('canícula')
    const corte = bytes.indexOf(0xc3) + 1 // entre los dos bytes de la "í"
    const flujo = flujoDe(bytes, [corte, bytes.length])
    expect(await leerFlujoTexto(flujo)).toBe('canícula')
  })

  it('lanza si se aborta a medio leer', async () => {
    const control = new AbortController()
    const flujo = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) })
    const promesa = leerFlujoTexto(flujo, control.signal)
    control.abort()
    await expect(promesa).rejects.toBeDefined()
  })
})

describe('pedirExplicacion', () => {
  afterEach(() => vi.unstubAllGlobals())
  const peticion = { preset: 'p' } as PeticionExplicacion

  it('hace POST a {urlBase}/explicacion y devuelve el texto del flujo', async () => {
    const bytes = new TextEncoder().encode(texto)
    const fetchSim = vi.fn(async () => new Response(flujoDe(bytes, [5]), { status: 200 }))
    vi.stubGlobal('fetch', fetchSim)
    expect(await pedirExplicacion('http://api.test/', peticion)).toBe(texto)
    const [url, init] = fetchSim.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/explicacion')
    expect(init.method).toBe('POST')
  })

  it('lanza si el servidor no responde bien', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 502 }))
    await expect(pedirExplicacion('http://api.test', peticion)).rejects.toThrow()
  })
})
