import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buscarCultivo } from '../../datos/cultivos'
import { CLAVE_ESTADO } from '../../estado/EstadoApp'
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/sonido', () => ({
  tic: vi.fn(),
  asentar: vi.fn(),
  vibrar: vi.fn(),
  confirmar: vi.fn(),
  configurarSonido: vi.fn(),
}))

const perfil = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: [], edadSemanas: 0, sonido: true }

describe('Pantalla Plan', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify(perfil))
  })

  it('muestra objetivos, el selector de cultivo y la edad con su selector deslizable', () => {
    renderizarApp('/')
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué quiere lograr?' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Qué sembró?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Maíz\s*Unas/ })).toHaveAttribute('aria-pressed', 'true')
    const selector = screen.getByRole('slider', { name: 'Edad del cultivo' })
    expect(selector).toHaveAttribute('aria-valuemax', String(buscarCultivo('maiz')!.cicloSemanas))
    expect(screen.getByText('semanas desde la siembra')).toBeInTheDocument()
  })

  it('cambiar de cultivo lo marca y ajusta el selector de semanas a su ciclo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: /^Arroz\s*Unas/ }))
    expect(screen.getByRole('button', { name: /^Arroz\s*Unas/ })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(screen.getByRole('slider', { name: 'Edad del cultivo' })).toHaveAttribute(
        'aria-valuemax',
        String(buscarCultivo('arroz')!.cicloSemanas),
      ),
    )
  })

  it('marcar un objetivo lo deja presionado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const agua = screen.getByRole('button', { name: /^Ahorrar agua/ })
    await usuario.click(agua)
    expect(agua).toHaveAttribute('aria-pressed', 'true')
  })
})
