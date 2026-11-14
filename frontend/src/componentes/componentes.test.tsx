import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BotonIcono } from './BotonIcono'
import { Boton } from './Boton'
import { Chip } from './Chip'
import { Heroe } from './Heroe'
import { Icono } from './Icono'
import { PlanoFondo } from './PlanoFondo'

describe('componentes base', () => {
  it('Icono es decorativo por defecto y se anuncia con titulo', () => {
    const { container, rerender } = render(<Icono nombre="grass" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Icono nombre="grass" titulo="Cultivos" />)
    expect(screen.getByRole('img', { name: 'Cultivos' })).toBeInTheDocument()
  })

  it('Boton con "to" renderiza un enlace y sin "to" un boton', async () => {
    const alPulsar = vi.fn()
    render(
      <MemoryRouter>
        <Boton to="/mapa">Ir</Boton>
        <Boton onClick={alPulsar}>Pulsar</Boton>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ir' })).toHaveAttribute('href', '/mapa')
    await userEvent.click(screen.getByRole('button', { name: 'Pulsar' }))
    expect(alPulsar).toHaveBeenCalledOnce()
  })

  it('BotonIcono usa la etiqueta como nombre accesible y aria-pressed al ser interruptor', () => {
    render(<BotonIcono icono="layers" etiqueta="Capas" seleccionado />)
    expect(screen.getByRole('button', { name: 'Capas' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Chip de filtro expone aria-pressed', () => {
    render(<Chip variante="filtro" seleccionado>Maiz</Chip>)
    expect(screen.getByRole('button', { name: 'Maiz' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('PlanoFondo es decorativo y Heroe muestra valor, unidad y nota', () => {
    const { container } = render(
      <>
        <PlanoFondo texto="Zona" />
        <Heroe valor="43,0" unidad="% vol." nota="Lectura" />
      </>,
    )
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Zona')
    expect(screen.getByText('43,0')).toBeInTheDocument()
    expect(screen.getByText('% vol.')).toBeInTheDocument()
    expect(screen.getByText('Lectura')).toBeInTheDocument()
  })
})
