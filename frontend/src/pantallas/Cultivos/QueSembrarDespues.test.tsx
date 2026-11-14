import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { zonas } from '../../datos/zonas'
import { CLAVE_ESTADO } from '../../estado/EstadoApp'
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/avisos', () => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn(), promesa: vi.fn(), cerrar: vi.fn(), limpiar: vi.fn() },
}))
vi.mock('../../lib/sonido', () => ({ tic: vi.fn(), asentar: vi.fn(), vibrar: vi.fn(), confirmar: vi.fn(), configurarSonido: vi.fn() }))
vi.mock('../../datos/perspectiva', async (original) => ({
  ...(await original<typeof import('../../datos/perspectiva')>()),
  escenarioMasProbable: vi.fn(),
  frasePerspectiva: vi.fn(),
}))

import { escenarioMasProbable, frasePerspectiva } from '../../datos/perspectiva'

function guardar() {
  window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ zonaId: zonas[0].id, cultivoId: 'maiz', edadSemanas: 3, sonido: false }))
}

describe('Perspectiva en "¿Cómo viene el año?"', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('con senal clara preselecciona lo mas probable y lo marca; la eleccion de la persona manda', async () => {
    vi.mocked(escenarioMasProbable).mockReturnValue('seco')
    vi.mocked(frasePerspectiva).mockReturnValue('De 10 años parecidos a este, 6 fueron secos.')
    const u = userEvent.setup()
    guardar()
    const primera = renderizarApp('/')
    const seco = screen.getByRole('button', { name: /Año seco/ })
    expect(seco).toHaveAttribute('aria-pressed', 'true')
    expect(seco).toHaveTextContent('Lo más probable')
    expect(screen.getByRole('button', { name: /Año normal/ })).not.toHaveTextContent('Lo más probable')
    expect(screen.getByText('Ver de dónde sale este dato')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Año lluvioso/ }))
    primera.unmount()
    renderizarApp('/')
    expect(screen.getByRole('button', { name: /Año lluvioso/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Año seco/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sin senal clara no marca nada, deja el escenario y muestra la frase corta', () => {
    vi.mocked(escenarioMasProbable).mockReturnValue(null)
    vi.mocked(frasePerspectiva).mockReturnValue('Este año no hay una señal clara: puede venir seco, normal o lluvioso.')
    guardar()
    renderizarApp('/')
    expect(screen.getByRole('button', { name: /Año normal/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Lo más probable')).not.toBeInTheDocument()
    expect(screen.getByText('Este año no hay una señal clara: puede venir seco, normal o lluvioso.')).toBeInTheDocument()
  })
})
