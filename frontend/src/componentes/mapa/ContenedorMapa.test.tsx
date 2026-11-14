import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cajaHonduras, zonas } from '../../datos/zonas'
import { ContenedorMapa } from './ContenedorMapa'

describe('ContenedorMapa', () => {
  it('es el espacio reservado del mapa con un boton por zona y la insignia', () => {
    const { container } = render(
      <ContenedorMapa zonas={zonas} caja={cajaHonduras} zonaSeleccionadaId={null} cultivoId={null} alSeleccionarZona={() => {}} />,
    )
    expect(container.querySelector('[data-placeholder="mapa"]')).toBeInTheDocument()
    expect(screen.getByText('Espacio reservado para el componente de mapa')).toBeInTheDocument()
    for (const z of zonas) expect(screen.getByRole('button', { name: z.nombre })).toBeInTheDocument()
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
})
