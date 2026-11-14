import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { aptitud, palabraNivel, ranking } from '../../datos/aptitud'
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
    // Sin cultivo no hay numeros sobre el mapa.
    expect(container.querySelectorAll('[data-departamento]')).toHaveLength(0)
  })

  it('con cultivo pinta el nivel de cada departamento, escribe su puntaje y deja elegirlos con el teclado', async () => {
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

    // Los 18 departamentos muestran su puntaje, siempre, y no se anuncian dos veces.
    const puntajes = [...container.querySelectorAll<HTMLElement>('[data-departamento]')]
    expect(puntajes).toHaveLength(18)
    for (const p of ranking('sorgo', 'seco')) {
      const etiqueta = puntajes.find((e) => e.dataset.departamento === p.id)!
      expect(etiqueta.querySelector('[class*="numero"]')).toHaveTextContent(String(p.total))
      expect(etiqueta).toHaveAttribute('aria-hidden', 'true')
    }
    // El elegido ademas lleva su nombre.
    expect(container.querySelectorAll('[data-elegido="true"]')).toHaveLength(1)
    expect(container.querySelector('[data-departamento="HN-VA"]')).toHaveTextContent(`${valle.total}Valle`)

    // Los tres mejores llevan insignia con 1, 2 y 3, en el orden del ranking.
    const mejores = ranking('sorgo', 'seco').slice(0, 3)
    const insignias = [...container.querySelectorAll<HTMLElement>('[data-posicion]')]
    expect(insignias.map((e) => e.dataset.posicion)).toEqual(['1', '2', '3'])
    expect(insignias.map((e) => (e.closest('[data-departamento]') as HTMLElement).dataset.departamento).sort()).toEqual(
      mejores.map((p) => p.id).sort(),
    )

    const yoro = screen.getByRole('button', { name: /^Departamento de Yoro:/ })
    expect(yoro).toHaveAttribute('aria-pressed', 'false')
    yoro.focus()
    await userEvent.keyboard(' ')
    expect(alSeleccionarDepartamento).toHaveBeenCalledWith('HN-YO')
  })

  it('al cambiar el tipo de año cambian los numeros del mapa', () => {
    const props = { zonas: [], caja: cajaHonduras, zonaSeleccionadaId: null, cultivoId: 'maiz', alSeleccionarZona: () => {} }
    const { container, rerender } = render(<ContenedorMapa {...props} escenario="normal" />)
    const numeros = () =>
      Object.fromEntries(
        [...container.querySelectorAll<HTMLElement>('[data-departamento]')].map((e) => [
          e.dataset.departamento,
          e.querySelector('[class*="numero"]')?.textContent,
        ]),
      )
    const normal = numeros()
    rerender(<ContenedorMapa {...props} escenario="seco" />)
    const seco = numeros()
    expect(Object.keys(seco)).toHaveLength(18)
    expect(seco).not.toEqual(normal)
    for (const p of ranking('maiz', 'seco')) expect(seco[p.id]).toBe(String(p.total))
    // Sin cultivo desaparecen.
    rerender(<ContenedorMapa {...props} cultivoId={null} />)
    expect(container.querySelectorAll('[data-departamento]')).toHaveLength(0)
  })
})
