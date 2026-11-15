import { render, screen } from '@testing-library/react'
import { EspacioFenomeno } from './EspacioFenomeno'

describe('EspacioFenomeno', () => {
  it('es el espacio reservado con su titulo y su texto', () => {
    const { container } = render(<EspacioFenomeno zona={null} cultivoId={null} />)
    const seccion = container.querySelector('[data-placeholder="fenomeno"]')
    expect(seccion).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '¿Por qué pasa esto?' })).toBe(seccion)
    expect(screen.getByText('Espacio reservado: aquí irá la explicación gráfica de un fenómeno')).toBeInTheDocument()
  })
})
