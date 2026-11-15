import { armarContexto } from './contexto'
import { crearClienteResistente, respuestaLocal } from './clienteResistente'
import { crearClienteHttp } from './clienteHttp'
import { crearClienteChat, urlApi } from './index'
import { ErrorChat, type ContextoChat } from './tipos'

const contextoVacio: ContextoChat = { vista: 'chat', cultivo: null, edadSemanas: null, etapa: null, zona: null, humedad: null }

describe('armarContexto', () => {
  it('con cultivo y zona incluye edad, etapa y humedad de la zona', () => {
    const c = armarContexto({ vista: 'zona', cultivoId: 'maiz', edadSemanas: 3, zonaId: 'choluteca' })
    expect(c.vista).toBe('zona')
    expect(c.cultivo).toEqual({ id: 'maiz', nombre: expect.any(String) })
    expect(c.edadSemanas).toBe(3)
    expect(c.etapa).toEqual(expect.any(String))
    expect(c.zona).toMatchObject({ id: 'choluteca', nombre: 'Choluteca' })
    expect(c.humedad).toEqual({ valor: expect.any(Number), fecha: expect.any(String), unidad: 'm3/m3' })
  })

  it('sin cultivo deja cultivo, edad y etapa en null', () => {
    const c = armarContexto({ vista: 'chat', cultivoId: null, edadSemanas: 5, zonaId: 'choluteca' })
    expect(c.cultivo).toBeNull()
    expect(c.edadSemanas).toBeNull()
    expect(c.etapa).toBeNull()
    expect(c.zona).not.toBeNull()
  })

  it('sin zona deja zona y humedad en null', () => {
    const c = armarContexto({ vista: 'mapa', cultivoId: 'frijol', edadSemanas: 0, zonaId: null })
    expect(c.zona).toBeNull()
    expect(c.humedad).toBeNull()
    expect(c.cultivo?.id).toBe('frijol')
  })
})

describe('clienteHttp', () => {
  afterEach(() => vi.unstubAllGlobals())
  const peticion = { mensajes: [], contexto: contextoVacio }

  it('hace POST a {urlBase}/chat con JSON y devuelve el texto', async () => {
    const fetchSim = vi.fn(async (_url: string) => new Response(JSON.stringify({ texto: 'hola' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSim)
    const r = await crearClienteHttp('http://api.test/').enviar(peticion)
    expect(r).toEqual({ texto: 'hola' })
    const [url, init] = fetchSim.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/chat')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ mensajes: [], contexto: contextoVacio })
  })

  it('traduce un 500 a ErrorChat servidor', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }))
    await expect(crearClienteHttp('http://api.test').enviar(peticion)).rejects.toMatchObject({ causa: 'servidor' })
  })

  it('traduce un fallo de red a ErrorChat red', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const e = await crearClienteHttp('http://api.test').enviar(peticion).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErrorChat)
    expect(e).toMatchObject({ causa: 'red' })
  })

  it('traduce JSON sin texto o invalido a ErrorChat respuesta', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ otro: 1 }), { status: 200 }))
    await expect(crearClienteHttp('http://api.test').enviar(peticion)).rejects.toMatchObject({ causa: 'respuesta' })
    vi.stubGlobal('fetch', async () => new Response('no json', { status: 200 }))
    await expect(crearClienteHttp('http://api.test').enviar(peticion)).rejects.toMatchObject({ causa: 'respuesta' })
  })

  it('traduce la cancelacion a ErrorChat cancelado', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_ok, fallo) => {
          init.signal?.addEventListener('abort', () => fallo(new DOMException('abortado', 'AbortError')))
        }),
    )
    const control = new AbortController()
    const promesa = crearClienteHttp('http://api.test').enviar({ ...peticion, signal: control.signal })
    control.abort()
    await expect(promesa).rejects.toMatchObject({ causa: 'cancelado' })
  })
})

describe('clienteResistente', () => {
  const contexto = armarContexto({ vista: 'chat', cultivoId: 'maiz', edadSemanas: 3, zonaId: 'choluteca' })

  it('reintenta y devuelve la respuesta cuando la API se recupera', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new ErrorChat('servidor')).mockResolvedValueOnce({ texto: 'real' })
    const r = await crearClienteResistente({ enviar }, { esperasMs: [1, 1] }).enviar({ mensajes: [], contexto })
    expect(r).toEqual({ texto: 'real' })
    expect(enviar).toHaveBeenCalledTimes(2)
  })

  it('si la API nunca responde, contesta con los datos del contexto en vez de fallar', async () => {
    const enviar = vi.fn().mockRejectedValue(new ErrorChat('red'))
    const r = await crearClienteResistente({ enviar }, { esperasMs: [1, 1] }).enviar({ mensajes: [], contexto })
    expect(enviar).toHaveBeenCalledTimes(3)
    expect(r.respaldo).toBe(true)
    expect(r.texto).toBe(respuestaLocal(contexto))
    expect(r.texto).toContain('semana 3')
    expect(r.texto).toContain('Choluteca')
    expect(r.texto).not.toMatch(/demostraci|prueba/i)
  })

  it('corta un intento colgado y pasa al siguiente', async () => {
    const enviar = vi
      .fn()
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_, no) => signal.addEventListener('abort', () => no(new ErrorChat('cancelado')))))
      .mockResolvedValueOnce({ texto: 'segundo' })
    const r = await crearClienteResistente({ enviar }, { esperasMs: [1], limiteMs: 20 }).enviar({ mensajes: [], contexto })
    expect(r.texto).toBe('segundo')
  })

  it('la cancelacion del usuario se respeta', async () => {
    const control = new AbortController()
    control.abort()
    const enviar = vi.fn().mockRejectedValue(new ErrorChat('cancelado'))
    await expect(
      crearClienteResistente({ enviar }, { esperasMs: [1] }).enviar({ mensajes: [], contexto, signal: control.signal }),
    ).rejects.toMatchObject({ causa: 'cancelado' })
  })
})

describe('crearClienteChat', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin VITE_API_URL usa /api del mismo sitio, nunca un modo de prueba', async () => {
    vi.stubEnv('VITE_API_URL', '')
    expect(urlApi()).toBe('/api')
    const fetchSim = vi.fn(async (_url: string) => new Response(JSON.stringify({ texto: 'real' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSim)
    const r = await crearClienteChat().enviar({ mensajes: [], contexto: contextoVacio })
    expect(r.texto).toBe('real')
    expect(fetchSim.mock.calls[0][0]).toBe('/api/chat')
  })

  it('con VITE_API_URL usa el cliente HTTP', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    expect(urlApi()).toBe('http://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ texto: 'real' }), { status: 200 })))
    const r = await crearClienteChat().enviar({ mensajes: [], contexto: contextoVacio })
    expect(r.texto).toBe('real')
  })
})
