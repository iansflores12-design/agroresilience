import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EspacioFenomeno } from './EspacioFenomeno'
import { ESCENAS, ExplicacionFenomeno } from './ExplicacionFenomeno'

describe('EspacioFenomeno', () => {
  it('conserva la seccion con su titulo y muestra la explicacion', () => {
    const { container } = render(<EspacioFenomeno zona={null} cultivoId={null} />)
    const seccion = container.querySelector('[data-placeholder="fenomeno"]')
    expect(screen.getByRole('region', { name: '¿Por qué pasa esto?' })).toBe(seccion)
    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'El Niño y La Niña' })).toBeInTheDocument()
  })
})

describe('ExplicacionFenomeno', () => {
  afterEach(() => vi.useRealTimers())

  it('cada fenomeno tiene tres escenas, una por paso', () => {
    for (const escenas of Object.values(ESCENAS)) expect(escenas).toHaveLength(3)
  })

  it('cambia de fenomeno y de paso con los botones', async () => {
    const u = userEvent.setup()
    const { container } = render(<ExplicacionFenomeno />)
    await u.click(screen.getByRole('button', { name: 'Huracanes' }))
    expect(container.querySelector('[data-ver]')?.getAttribute('data-ver')).toBe(ESCENAS.huracan[0])
    await u.click(screen.getByRole('button', { name: 'Paso siguiente' }))
    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument()
    expect(container.querySelector('[data-ver]')?.getAttribute('data-ver')).toBe(ESCENAS.huracan[1])
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
  })

  it('avanza solo y al final ofrece verlo de nuevo', () => {
    vi.useFakeTimers()
    render(<ExplicacionFenomeno inicial="lluvias" fijo />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText(/Paso 3 de 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver de nuevo' })).toBeInTheDocument()
  })

  it('con movimiento reducido no avanza solo', () => {
    vi.useFakeTimers()
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      render(<ExplicacionFenomeno />)
      act(() => vi.advanceTimersByTime(20000))
      expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('explicaciones del lugar', () => {
  it('explica el porqué del cultivo, la tierra y la altura con los datos del departamento', async () => {
    const { zonas } = await import('../../datos/zonas')
    const zona = zonas.find((z) => z.id === 'choluteca')!
    const u = userEvent.setup()
    render(<EspacioFenomeno zona={zona} cultivoId="maiz" departamentoId="HN-CH" />)
    // El primer tema es el porqué del cultivo en ese departamento.
    expect(screen.getByText(/^Maíz en Choluteca saca \d+ de 100/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Su tierra' }))
    expect(screen.getByText(/La tierra en Choluteca tiene \d+ % de arcilla/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'La altura' }))
    expect(screen.getByText(/Choluteca está, en promedio, a unos 120 m/)).toBeInTheDocument()
    // Los fenómenos del clima siguen después.
    expect(screen.getByRole('button', { name: 'Huracanes' })).toBeInTheDocument()
  })
})
