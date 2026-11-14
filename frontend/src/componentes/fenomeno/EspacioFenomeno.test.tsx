import { render, screen } from '@testing-library/react'
import { EspacioFenomeno } from './EspacioFenomeno'

describe('EspacioFenomeno', () => {
  it('es la seccion del fenomeno con su titulo y la explicacion grafica dentro', () => {
    const { container } = render(<EspacioFenomeno zona={null} cultivoId={null} />)
    const seccion = container.querySelector('[data-fenomeno="sequia"]')
    expect(seccion).toBeInTheDocument()
    expect(container.querySelector('[data-placeholder]')).toBeNull()
    expect(screen.getByRole('region', { name: '¿Por qué pasa esto?' })).toBe(seccion)
    expect(screen.getByRole('heading', { level: 2, name: '¿Por qué pasa esto?' })).toBeInTheDocument()
    expect(seccion?.querySelector('svg[role="img"]')).toBeInTheDocument()
  })

  it('expone la zona y el cultivo en atributos de datos', () => {
    const zona = { id: 'z1', nombre: 'Lugar', humedad: null } as never
    const { container } = render(<EspacioFenomeno zona={zona} cultivoId="maiz" />)
    const seccion = container.querySelector('[data-fenomeno="sequia"]')
    expect(seccion).toHaveAttribute('data-zona', 'z1')
    expect(seccion).toHaveAttribute('data-cultivo', 'maiz')
  })
})
