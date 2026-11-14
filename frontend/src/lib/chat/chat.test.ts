import { armarContexto } from './contexto'
import { crearClienteDemo, PREFIJO_DEMO } from './clienteDemo'
import { crearClienteHttp } from './clienteHttp'
import { crearClienteChat, esModoDemo } from './index'
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

describe('armarContexto con recomendacion y perspectiva', () => {
  it('las agrega solo si vienen y el cliente demo las resume', async () => {
    const recomendacion = { rotacion: { id: 'frijol', nombre: 'Maíz y después frijol' }, enfoques: ['agua' as const], escenario: 'normal' as const, origen: 'motor' as const }
    const perspectiva = { temporada: 'Primera 2027', prob: { seco: 0.2, normal: 0.5, lluvioso: 0.3 }, conteo: { seco: 2, normal: 5, lluvioso: 3 }, usable: false }
    const c = armarContexto({ vista: 'cultivos', cultivoId: 'maiz', edadSemanas: 1, zonaId: 'choluteca', recomendacion, perspectiva })
    expect(c.recomendacion).toEqual(recomendacion)
    expect(c.perspectiva).toEqual(perspectiva)
    const sin = armarContexto({ vista: 'cultivos', cultivoId: 'maiz', edadSemanas: 1, zonaId: 'choluteca' })
    expect('recomendacion' in sin).toBe(false)
    expect('perspectiva' in sin).toBe(false)
    const r = await crearClienteDemo(1).enviar({ mensajes: [], contexto: c })
    expect(r.texto).toContain('Maíz y después frijol')
    expect(r.texto).toContain('sin señal clara')
  })
})

describe('clienteHttp', () => {
  afterEach(() => vi.unstubAllGlobals())
  const peticion = { mensajes: [], contexto: contextoVacio }

  it('hace POST a {urlBase}/chat con JSON y devuelve el texto', async () => {
    const fetchSim = vi.fn(async () => new Response(JSON.stringify({ texto: 'hola' }), { status: 200 }))
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

describe('clienteDemo', () => {
  it('responde con el prefijo y resume el contexto', async () => {
    const contexto = armarContexto({ vista: 'chat', cultivoId: 'maiz', edadSemanas: 3, zonaId: 'choluteca' })
    const r = await crearClienteDemo(1).enviar({ mensajes: [], contexto })
    expect(r.texto.startsWith(PREFIJO_DEMO)).toBe(true)
    expect(PREFIJO_DEMO).toBe('Respuesta de demostración.')
    expect(r.texto).toContain('semana 3')
    expect(r.texto).toContain('Choluteca')
    expect(r.texto).toContain(contexto.humedad!.fecha)
    expect(r.texto).toContain('backend')
  })

  it('es cancelable con signal', async () => {
    const control = new AbortController()
    const promesa = crearClienteDemo(10_000).enviar({ mensajes: [], contexto: contextoVacio, signal: control.signal })
    control.abort()
    await expect(promesa).rejects.toMatchObject({ causa: 'cancelado' })
    await expect(
      crearClienteDemo(1).enviar({ mensajes: [], contexto: contextoVacio, signal: control.signal }),
    ).rejects.toMatchObject({ causa: 'cancelado' })
  })
})

describe('crearClienteChat', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sin VITE_API_URL es modo demostracion', async () => {
    vi.stubEnv('VITE_API_URL', '')
    expect(esModoDemo()).toBe(true)
    const r = await crearClienteChat().enviar({ mensajes: [], contexto: contextoVacio })
    expect(r.texto.startsWith(PREFIJO_DEMO)).toBe(true)
  })

  it('con VITE_API_URL usa el cliente HTTP', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    expect(esModoDemo()).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ texto: 'real' }), { status: 200 })))
    const r = await crearClienteChat().enviar({ mensajes: [], contexto: contextoVacio })
    expect(r.texto).toBe('real')
  })
})
