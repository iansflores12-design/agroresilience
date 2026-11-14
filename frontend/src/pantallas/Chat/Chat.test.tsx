import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ProveedorConversacion } from '../../estado/Conversacion'
import { ProveedorEstadoApp } from '../../estado/EstadoApp'
import { ErrorChat, type ClienteChat } from '../../lib/chat'
import Chat from './index'

const mocks = vi.hoisted(() => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn(), promesa: vi.fn(), cerrar: vi.fn(), limpiar: vi.fn() },
}))
vi.mock('../../lib/avisos', () => ({ avisar: mocks.avisar }))

type ClienteSim = ClienteChat & { enviar: ReturnType<typeof vi.fn> }

function clienteDe(texto = 'respuesta'): ClienteSim {
  return { enviar: vi.fn(async () => ({ texto })) }
}

function montar(cliente: ClienteChat, ruta = '/chat') {
  const arbol = (visible: boolean) => (
    <ProveedorEstadoApp>
      <ProveedorConversacion>
        <MemoryRouter initialEntries={[ruta]}>{visible && <Chat cliente={cliente} modoDemo />}</MemoryRouter>
      </ProveedorConversacion>
    </ProveedorEstadoApp>
  )
  const r = render(arbol(true))
  return { ...r, ocultar: () => r.rerender(arbol(false)), mostrar: () => r.rerender(arbol(true)) }
}

describe('pantalla Chat', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('muestra redactor, registro accesible, insignia y boton deshabilitado', () => {
    montar(clienteDe())
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: /Conversación/ })).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    expect(screen.getByText('Modo de prueba: todavía sin conexión al asistente real')).toBeInTheDocument()
    expect(screen.getByText('Sin cultivo')).toBeInTheDocument()
    expect(screen.getByText('Sin zona')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar conversación' })).not.toBeInTheDocument()
  })

  it('Enter envia, agrega el mensaje y luego la respuesta, y avisa la demostracion una vez', async () => {
    const cliente = clienteDe('hola de vuelta')
    const u = userEvent.setup()
    montar(cliente)
    const campo = screen.getByRole('textbox', { name: 'Mensaje' })
    await u.type(campo, 'Pregunta uno{Enter}')
    expect(await screen.findByText('hola de vuelta')).toBeInTheDocument()
    expect(screen.getByText('Pregunta uno')).toBeInTheDocument()
    expect(campo).toHaveValue('')
    expect(campo).toHaveFocus()
    expect(cliente.enviar).toHaveBeenCalledTimes(1)
    expect(cliente.enviar.mock.calls[0][0].mensajes.map((m: { texto: string }) => m.texto)).toEqual(['Pregunta uno'])
    await u.type(campo, 'Dos{Enter}')
    await waitFor(() => expect(cliente.enviar).toHaveBeenCalledTimes(2))
    expect(mocks.avisar.info).toHaveBeenCalledTimes(1)
  })

  it('Mayus+Enter salta de linea y no envia', async () => {
    const cliente = clienteDe()
    const u = userEvent.setup()
    montar(cliente)
    const campo = screen.getByRole('textbox', { name: 'Mensaje' })
    await u.type(campo, 'a{Shift>}{Enter}{/Shift}b')
    expect(campo).toHaveValue('a\nb')
    expect(cliente.enviar).not.toHaveBeenCalled()
  })

  it('una sugerencia se envia al tocarla', async () => {
    const cliente = clienteDe()
    const u = userEvent.setup()
    montar(cliente)
    const sugerencia = screen.getByRole('group', { name: 'Sugerencias' }).querySelector('button')!
    const texto = sugerencia.textContent!
    await u.click(sugerencia)
    expect(await screen.findByText(texto, { selector: 'p' })).toBeInTheDocument()
    expect(cliente.enviar).toHaveBeenCalledTimes(1)
  })

  it('las sugerencias y la tira usan el contexto elegido', () => {
    window.localStorage.setItem(
      'agroresilience.estado.v1',
      JSON.stringify({ cultivoId: 'maiz', zonaId: 'choluteca', edadSemanas: 2, sonido: true }),
    )
    montar(clienteDe(), '/chat?desde=zona')
    expect(screen.getByRole('link', { name: 'Choluteca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /humedad en Choluteca para maíz/ })).toBeInTheDocument()
    expect(screen.getByText(/Tierra: /)).toBeInTheDocument()
  })

  it('manda la vista de ?desde= en el contexto', async () => {
    const cliente = clienteDe()
    const u = userEvent.setup()
    montar(cliente, '/chat?desde=mapa')
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'x{Enter}')
    await waitFor(() => expect(cliente.enviar).toHaveBeenCalled())
    expect(cliente.enviar.mock.calls[0][0].contexto.vista).toBe('mapa')
  })

  it('un error avisa y Reintentar reenvia sin duplicar el mensaje', async () => {
    const cliente: ClienteSim = {
      enviar: vi.fn().mockRejectedValueOnce(new ErrorChat('red')).mockResolvedValueOnce({ texto: 'ahora si' }),
    }
    const u = userEvent.setup()
    montar(cliente)
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'fallo{Enter}')
    await waitFor(() => expect(mocks.avisar.error).toHaveBeenCalledTimes(1))
    const aviso = mocks.avisar.error.mock.calls[0][0]
    expect(aviso.titulo).toBe('No se pudo enviar')
    expect(aviso.accion.texto).toBe('Reintentar')
    aviso.accion.alPulsar()
    expect(await screen.findByText('ahora si')).toBeInTheDocument()
    expect(screen.getAllByText('fallo')).toHaveLength(1)
    expect(cliente.enviar).toHaveBeenCalledTimes(2)
  })

  it('Detener aborta la peticion sin avisar de error', async () => {
    const cliente: ClienteChat = {
      enviar: ({ signal }) =>
        new Promise((_ok, fallo) => {
          signal?.addEventListener('abort', () => fallo(new ErrorChat('cancelado')))
        }),
    }
    const u = userEvent.setup()
    montar(cliente)
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'espera{Enter}')
    expect(await screen.findByText('El asistente está escribiendo')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Detener' }))
    await waitFor(() => expect(screen.queryByText('El asistente está escribiendo')).not.toBeInTheDocument())
    expect(mocks.avisar.error).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
  })

  it('salir de la pantalla aborta la peticion', async () => {
    let senal: AbortSignal | undefined
    const cliente: ClienteChat = {
      enviar: ({ signal }) =>
        new Promise((_ok, fallo) => {
          senal = signal
          signal?.addEventListener('abort', () => fallo(new ErrorChat('cancelado')))
        }),
    }
    const u = userEvent.setup()
    const { ocultar } = montar(cliente)
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'x{Enter}')
    await waitFor(() => expect(senal).toBeDefined())
    ocultar()
    expect(senal?.aborted).toBe(true)
    expect(mocks.avisar.error).not.toHaveBeenCalled()
  })

  it('borrar y deshacer restauran los mensajes', async () => {
    const u = userEvent.setup()
    montar(clienteDe('r1'))
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'p1{Enter}')
    await screen.findByText('r1')
    await u.click(screen.getByRole('button', { name: 'Borrar conversación' }))
    expect(screen.queryByText('p1')).not.toBeInTheDocument()
    const aviso = mocks.avisar.exito.mock.calls[0][0]
    expect(aviso.titulo).toBe('Conversación borrada')
    expect(aviso.accion.texto).toBe('Deshacer')
    aviso.accion.alPulsar()
    expect(await screen.findByText('p1')).toBeInTheDocument()
    expect(screen.getByText('r1')).toBeInTheDocument()
  })

  it('los mensajes persisten al desmontar y volver a montar la pantalla', async () => {
    const u = userEvent.setup()
    const { ocultar, mostrar } = montar(clienteDe('guardada'))
    await u.type(screen.getByRole('textbox', { name: 'Mensaje' }), 'recuerdame{Enter}')
    await screen.findByText('guardada')
    ocultar()
    expect(screen.queryByText('recuerdame')).not.toBeInTheDocument()
    mostrar()
    expect(screen.getByText('recuerdame')).toBeInTheDocument()
    expect(screen.getByText('guardada')).toBeInTheDocument()
  })
})
