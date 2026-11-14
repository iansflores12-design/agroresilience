import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buscarCultivo } from '../../datos/cultivos'
import { rotaciones } from '../../datos/rotaciones'
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
import { confirmar } from '../../lib/sonido'

describe('Pantalla Cultivos', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('lista las cuatro rotaciones con su beneficio y la nota de referencia', () => {
    renderizarApp('/')
    for (const r of rotaciones) {
      expect(screen.getByRole('heading', { level: 3, name: r.nombre })).toBeInTheDocument()
      expect(screen.getByText(r.beneficio)).toBeInTheDocument()
    }
    expect(screen.getByText('Calendario de referencia. Consulte a su técnico.')).toBeInTheDocument()
  })

  it('sin cultivo invita a elegir uno y no muestra el selector', () => {
    renderizarApp('/')
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué sembró?' })).toBeInTheDocument()
    expect(screen.queryByText('¿Hace cuánto sembró?')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('elegir un cultivo en una rotacion lo marca en todas, avisa y suena', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const milpa = screen.getByRole('heading', { level: 3, name: 'Milpa de ladera' }).closest('li')!
    await usuario.click(within(milpa).getByRole('button', { name: /^Maíz, primera/ }))

    const maiz = screen.getAllByRole('button', { name: /^Maíz/ })
    expect(maiz.length).toBeGreaterThan(2)
    for (const b of maiz) expect(b).toHaveAttribute('aria-pressed', 'true')
    for (const b of screen.getAllByRole('button', { name: /^Frijol, / })) {
      expect(b).toHaveAttribute('aria-pressed', 'false')
    }

    expect(avisar.exito).toHaveBeenCalledTimes(1)
    expect(avisar.exito).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Cultivo: Maíz',
        descripcion: 'Se usará en el mapa, la tierra y las preguntas.',
        accion: expect.objectContaining({ texto: 'Ver mapa' }),
      }),
    )
    expect(confirmar).toHaveBeenCalledTimes(1)
  })

  it('con cultivo elegido aparece la edad con el selector de 0 al ciclo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: /^Arroz\s*Unas/ }))
    const arroz = buscarCultivo('arroz')!
    const selector = screen.getByRole('slider', { name: 'Edad del cultivo' })
    expect(selector).toHaveAttribute('aria-valuemin', '0')
    expect(selector).toHaveAttribute('aria-valuemax', String(arroz.cicloSemanas))
    expect(screen.getByText('semanas desde la siembra')).toBeInTheDocument()
    expect(screen.getByText('¿Hace cuánto sembró?')).toBeInTheDocument()
  })

  it('al mover la edad al final muestra la etapa sin lanzar aviso', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: /^Maíz\s*Unas/ }))
    const ciclo = buscarCultivo('maiz')!.cicloSemanas
    const selector = screen.getByRole('slider')
    selector.focus()
    await usuario.keyboard('{End}')
    await waitFor(() => expect(selector).toHaveAttribute('aria-valuenow', String(ciclo)))
    expect(screen.getByText(/^Está en la etapa de /)).toBeInTheDocument()
    expect(avisar.info).not.toHaveBeenCalled()
  })
})
