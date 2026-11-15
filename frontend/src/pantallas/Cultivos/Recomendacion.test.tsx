import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { zonas } from '../../datos/zonas'
import { CLAVE_CONVERSACION } from '../../estado/Conversacion'
import { CLAVE_ESTADO } from '../../estado/EstadoApp'
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/avisos', () => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn(), promesa: vi.fn(), cerrar: vi.fn(), limpiar: vi.fn() },
}))
vi.mock('../../lib/sonido', () => ({
  tic: vi.fn(),
  asentar: vi.fn(),
  vibrar: vi.fn(),
  confirmar: vi.fn(),
  configurarSonido: vi.fn(),
}))

import { avisar } from '../../lib/avisos'

function guardar(zonaId: string | null, cultivoId: string | null, enfoques: string[] = []) {
  window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ zonaId, cultivoId, edadSemanas: 3, sonido: false, enfoques }))
}

function flujo(texto: string): Response {
  const bytes = new TextEncoder().encode(texto)
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 7))
        c.enqueue(bytes.slice(7))
        c.close()
      },
    }),
    { status: 200 },
  )
}

describe('Recomendacion en la portada', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
    // Modo demo por defecto aunque .env.local defina VITE_API_URL; las pruebas con API la fijan aparte.
    vi.stubEnv('VITE_API_URL', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('solo aparece con cultivo y lugar elegidos', () => {
    const sin = renderizarApp('/')
    expect(screen.queryByRole('button', { name: 'Recomiéndeme' })).not.toBeInTheDocument()
    sin.unmount()
    guardar(null, 'maiz')
    const soloCultivo = renderizarApp('/')
    expect(screen.queryByRole('button', { name: 'Recomiéndeme' })).not.toBeInTheDocument()
    soloCultivo.unmount()
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    expect(screen.getByRole('button', { name: 'Recomiéndeme' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '¿Qué le importa más?' })).toBeInTheDocument()
  })

  it('los chips de enfoque guardan hasta dos en el estado global', async () => {
    const u = userEvent.setup()
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    const grupo = screen.getByRole('group', { name: '¿Qué le importa más?' })
    await u.click(within(grupo).getByRole('button', { name: 'Ahorrar agua' }))
    await u.click(within(grupo).getByRole('button', { name: 'Cuidar la tierra' }))
    await u.click(within(grupo).getByRole('button', { name: 'Vender mejor' }))
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE_ESTADO)!)
    expect(guardado.enfoques).toEqual(['tierra', 'venta'])
    expect(within(grupo).getByRole('button', { name: 'Ahorrar agua' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(grupo).getByRole('button', { name: 'Vender mejor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('en modo demo el boton muestra el texto guardado con su etiqueta y avisa una vez', async () => {
    const u = userEvent.setup()
    guardar(zonas[0].id, 'maiz', ['agua'])
    renderizarApp('/')
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    const registro = await screen.findByRole('log', { name: 'Recomendación y conversación' })
    expect(within(registro).getByText('Texto guardado')).toBeInTheDocument()
    expect(within(registro).queryByText('Asistente')).not.toBeInTheDocument()
    expect(screen.getByText('Recomendada para usted')).toBeInTheDocument()
    expect(avisar.info).toHaveBeenCalledTimes(1)
    expect(avisar.error).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    expect(avisar.info).toHaveBeenCalledTimes(1)
  })

  it('sin red muestra el texto guardado y un solo aviso de conexion', async () => {
    const u = userEvent.setup()
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    const registro = await screen.findByRole('log', { name: 'Recomendación y conversación' })
    expect(within(registro).getByText('Texto guardado')).toBeInTheDocument()
    await waitFor(() => expect(avisar.alerta).toHaveBeenCalledTimes(1))
    expect(avisar.alerta).toHaveBeenCalledWith({ titulo: 'Sin conexión: le mostramos el texto guardado' })
    expect(avisar.error).not.toHaveBeenCalled()
  })

  it('con backend a tiempo muestra el texto del asistente y no el guardado', async () => {
    const u = userEvent.setup()
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    const fetchSim = vi.fn(async (url: string) =>
      url.endsWith('/decision')
        ? new Response(JSON.stringify({ rotacionId: 'frijol', enfoquePrincipal: null, aviso: 'ninguno' }), { status: 200 })
        : flujo('Resumen del asistente.\n---\nDetalle del asistente. ¿Quiere saber más?'),
    )
    vi.stubGlobal('fetch', fetchSim)
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    expect(await screen.findByText(/Resumen del asistente\./)).toBeInTheDocument()
    const registro = screen.getByRole('log', { name: 'Recomendación y conversación' })
    expect(within(registro).getByText('Asistente')).toBeInTheDocument()
    expect(within(registro).queryByText('Texto guardado')).not.toBeInTheDocument()
    expect(avisar.alerta).not.toHaveBeenCalled()
    expect(fetchSim.mock.calls.map((c) => c[0])).toEqual(['http://api.test/decision', 'http://api.test/explicacion'])
  })

  it('una pregunta posterior va al mismo hilo que /chat', async () => {
    const u = userEvent.setup()
    guardar(zonas[0].id, 'maiz')
    const portada = renderizarApp('/')
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    await screen.findByText('Pregunte más')
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), '¿Y si llueve poco?{Enter}')
    expect(await screen.findByText(/^Respuesta de demostración\./)).toBeInTheDocument()
    expect(screen.getByText('¿Y si llueve poco?')).toBeInTheDocument()

    const hilo = JSON.parse(window.sessionStorage.getItem(CLAVE_CONVERSACION)!) as { rol: string; texto: string; origen?: string }[]
    expect(hilo.map((m) => m.origen)).toEqual(['preset', 'usuario', 'asistente'])

    portada.unmount()
    renderizarApp('/chat')
    const chat = await screen.findByRole('log', { name: /Conversación/ })
    expect(within(chat).getByText('¿Y si llueve poco?')).toBeInTheDocument()
    expect(within(chat).getByText('Texto guardado')).toBeInTheDocument()
  })

  it('cambiar un enfoque oculta la recomendacion anterior y deja el hilo intacto', async () => {
    const u = userEvent.setup()
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    await u.click(screen.getByRole('button', { name: 'Recomiéndeme' }))
    await screen.findByRole('log', { name: 'Recomendación y conversación' })
    await u.click(screen.getByRole('button', { name: 'Vender mejor' }))
    expect(screen.queryByRole('log', { name: 'Recomendación y conversación' })).not.toBeInTheDocument()
    expect(screen.queryByText('Recomendada para usted')).not.toBeInTheDocument()
    expect(JSON.parse(window.sessionStorage.getItem(CLAVE_CONVERSACION)!)).toHaveLength(1)
  })
})
