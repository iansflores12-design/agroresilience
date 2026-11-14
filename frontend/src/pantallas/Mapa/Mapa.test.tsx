import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { humedadPorcentaje, zonas } from '../../datos/zonas'
import { avisar } from '../../lib/avisos'
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/avisos', () => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn() },
}))

describe('Mapa', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('muestra el espacio reservado, un boton por zona y la invitacion a elegir', () => {
    const { container } = renderizarApp('/mapa')
    expect(container.querySelector('[data-placeholder="mapa"]')).toBeInTheDocument()
    for (const z of zonas) expect(screen.getByRole('button', { name: z.nombre })).toBeInTheDocument()
    expect(screen.getByText('Toque un punto del mapa o un lugar de la lista.')).toBeInTheDocument()
  })

  it('elegir un punto cambia la zona del estado, avisa y muestra la tarjeta', async () => {
    const usuario = userEvent.setup()
    const zona = zonas[2]
    renderizarApp('/mapa')
    await usuario.click(screen.getByRole('button', { name: zona.nombre }))
    expect(screen.getByRole('button', { name: zona.nombre })).toHaveAttribute('aria-pressed', 'true')
    expect(avisar.exito).toHaveBeenCalledWith(expect.objectContaining({ titulo: `Lugar: ${zona.nombre}` }))
    const tarjeta = screen.getByRole('complementary', { name: 'Lugar elegido' })
    expect(within(tarjeta).getByText(zona.nombre)).toBeInTheDocument()
    expect(within(tarjeta).getByText(`${humedadPorcentaje(zona)?.toFixed(1)} % de agua en la tierra`)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Ver cómo está la tierra' })).toHaveAttribute('href', '/zona')
    // El estado compartido llega a la tira de contexto.
    expect(within(screen.getByRole('group', { name: 'Contexto elegido' })).getByText(zona.nombre)).toBeInTheDocument()
  })

  it('la accion "Ver la tierra" del aviso lleva a /zona', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/mapa')
    await usuario.click(screen.getByRole('button', { name: zonas[0].nombre }))
    const aviso = vi.mocked(avisar.exito).mock.calls[0][0]
    expect(aviso.accion?.texto).toBe('Ver la tierra')
    aviso.accion?.alPulsar()
    expect(await screen.findByRole('heading', { level: 1, name: /^¿Cómo está la tierra/ })).toBeInTheDocument()
  })

  it('los controles que dependen del mapa real avisan', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/mapa')
    await usuario.click(screen.getByRole('button', { name: 'Capas' }))
    await usuario.click(screen.getByRole('button', { name: 'Mi ubicación' }))
    expect(avisar.info).toHaveBeenCalledTimes(2)
  })
})
