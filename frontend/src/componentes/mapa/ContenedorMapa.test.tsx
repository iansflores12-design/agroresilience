import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { aptitud, palabraNivel } from '../../datos/aptitud'
import { cajaHonduras, zonas } from '../../datos/zonas'
import { ContenedorMapa } from './ContenedorMapa'

describe('ContenedorMapa', () => {
  it('dibuja el mapa con un boton por zona y los 18 departamentos', () => {
    const { container } = render(
      <ContenedorMapa zonas={zonas} caja={cajaHonduras} zonaSeleccionadaId={null} cultivoId={null} alSeleccionarZona={() => {}} />,
    )
    expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
    for (const z of zonas) expect(screen.getByRole('button', { name: z.nombre })).toBeInTheDocument()
    expect(container.querySelectorAll('path[data-nivel]')).toHaveLength(18)
  })

  it('marca la zona elegida con aria-pressed y avisa al pulsar un punto', async () => {
    const alSeleccionar = vi.fn()
    render(
      <ContenedorMapa zonas={zonas} caja={cajaHonduras} zonaSeleccionadaId={zonas[1].id} cultivoId={null} alSeleccionarZona={alSeleccionar} />,
    )
    expect(screen.getByRole('button', { name: zonas[1].nombre })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: zonas[0].nombre })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: zonas[0].nombre }))
    expect(alSeleccionar).toHaveBeenCalledWith(zonas[0].id)
  })

  it('sin cultivo los departamentos no llevan puntaje ni se pueden elegir', () => {
    const { container } = render(
      <ContenedorMapa zonas={[]} caja={cajaHonduras} zonaSeleccionadaId={null} cultivoId={null} alSeleccionarZona={() => {}} />,
    )
    expect(container.querySelectorAll('path[data-nivel="sin"]')).toHaveLength(18)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('con cultivo pinta el nivel de cada departamento, escribe el puntaje del elegido y deja elegirlos con el teclado', async () => {
    const alSeleccionarDepartamento = vi.fn()
    const { container } = render(
      <ContenedorMapa
        zonas={[]}
        caja={cajaHonduras}
        zonaSeleccionadaId={null}
        cultivoId="sorgo"
        alSeleccionarZona={() => {}}
        departamentoId="HN-VA"
        alSeleccionarDepartamento={alSeleccionarDepartamento}
        escenario="seco"
      />,
    )
    const valle = aptitud('HN-VA', 'sorgo', 'seco')!
    const boton = screen.getByRole('button', {
      name: `Departamento de Valle: ${palabraNivel[valle.nivel].toLowerCase()} para sorgo (maicillo), ${valle.total} de 100`,
    })
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(boton).toHaveAttribute('data-nivel', valle.nivel)
    const puntajes = [...container.querySelectorAll('.leaflet-tooltip')]
    expect(puntajes).toHaveLength(18)
    // Solo el departamento elegido muestra su puntaje.
    expect(puntajes.filter((e) => !e.hasAttribute('hidden')).map((e) => e.textContent)).toEqual([String(valle.total)])

    const yoro = screen.getByRole('button', { name: /^Departamento de Yoro:/ })
    expect(yoro).toHaveAttribute('aria-pressed', 'false')
    yoro.focus()
    await userEvent.keyboard(' ')
    expect(alSeleccionarDepartamento).toHaveBeenCalledWith('HN-YO')
  })
})
