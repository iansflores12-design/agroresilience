import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buscarCultivo } from '../../datos/cultivos'
import { departamentoDeZona, rotacionesPara } from '../../datos/aptitud'
import { zonas } from '../../datos/zonas'
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
import { confirmar } from '../../lib/sonido'

function guardar(zonaId: string | null, cultivoId: string | null) {
  window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ zonaId, cultivoId, edadSemanas: 3, sonido: false }))
}

describe('Pantalla Cultivos', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('sin cultivo muestra el parrafo de rotaciones y ninguna opcion desplegable', () => {
    renderizarApp('/')
    expect(screen.getByText('Elija su cultivo arriba y le decimos qué le conviene sembrar después.')).toBeInTheDocument()
    expect(document.querySelector('[aria-expanded]')).toBeNull()
  })

  it('con cultivo y sin lugar ofrece elegir lugar', () => {
    guardar(null, 'maiz')
    renderizarApp('/')
    expect(screen.getByText('Para recomendarle qué sembrar después necesitamos saber dónde está su parcela.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Elegir lugar' })).toHaveAttribute('href', '/mapa')
  })

  it('con cultivo y lugar recomienda la mejor opcion y abre el porque sin cambiar el cultivo', async () => {
    const usuario = userEvent.setup()
    guardar(zonas[0].id, 'maiz')
    renderizarApp('/')
    const opciones = rotacionesPara(departamentoDeZona(zonas[0].id), 'maiz', 'normal')
    const mejor = opciones.find((r) => r.mejor)!
    const seccion = screen.getByRole('region', { name: /^Qué sembrar después en / })

    expect(within(seccion).getByText('Lo que más le conviene')).toBeInTheDocument()
    expect(within(seccion).getByRole('heading', { level: 3, name: mejor.nombre })).toBeInTheDocument()
    const botones = within(seccion).getAllByRole('button', { expanded: false })
    expect(botones).toHaveLength(opciones.length)
    expect(within(seccion).getByText('Toque una opción para ver por qué.')).toBeInTheDocument()

    await usuario.click(botones[1])
    expect(botones[1]).toHaveAttribute('aria-expanded', 'true')
    expect(within(seccion).getByText('A favor')).toBeInTheDocument()
    await usuario.click(botones[1])
    expect(botones[1]).toHaveAttribute('aria-expanded', 'false')
    expect(within(seccion).queryByText('A favor')).not.toBeInTheDocument()

    await usuario.click(botones[1])
    expect(avisar.exito).not.toHaveBeenCalled()
    const tira = screen.getByRole('group', { name: 'Contexto elegido' })
    expect(within(tira).getByText(/^Maíz/)).toBeInTheDocument()
  })

  it('sin cultivo invita a elegir uno y no muestra el selector', () => {
    renderizarApp('/')
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué sembró?' })).toBeInTheDocument()
    expect(screen.queryByText('¿Hace cuánto sembró?')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('elegir un cultivo en la rejilla avisa y suena', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: /^Maíz\s*Unas/ }))
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
