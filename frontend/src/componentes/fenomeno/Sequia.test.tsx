import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Zona } from '../../datos/zonas'
import { Sequia } from './Sequia'
import { PALABRAS_NIVEL, textoFenomeno, todosLosTextos, ZONAS_ESCENA } from './textos'

function zonaCon(percentil: number | null): Zona {
  return {
    id: 'z1',
    nombre: 'Danlí',
    lat: 0,
    lon: 0,
    humedad:
      percentil === null
        ? null
        : { valor: 0.3, fecha: '2026-01-01', unidad: 'm3/m3', serie: [], normal: null, anomalia: null, percentil, muestras: 5 },
    lluvia30d: null,
    temperatura: null,
    suelo: null,
  }
}

function fijarMovimientoReducido(reducido: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reducido && q.includes('reduce'),
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

const valorSlider = () => Number(screen.getByRole('slider').getAttribute('aria-valuenow'))

describe('Sequia', () => {
  let cuadros: FrameRequestCallback[]
  let cancelar: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    cuadros = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => cuadros.push(cb))
    cancelar = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    fijarMovimientoReducido(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fijarMovimientoReducido(false)
  })

  it('renderiza sin zona: arranca en 0, sin linea de hoy y con el pie fijo', () => {
    render(<Sequia zona={null} cultivoId={null} />)
    expect(valorSlider()).toBe(0)
    expect(screen.queryByText(/Así está/)).toBeNull()
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('Dibujo de ejemplo: las cifras no son mediciones.')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('maíz y frijol'))
  })

  it.each([
    [55, 0, 'Normal'],
    [30, 7, 'Seca'],
    [10, 14, 'Muy seca'],
  ])('con percentil %i el deslizador arranca en %i (%s) y muestra la linea de hoy', (p, valor, palabra) => {
    render(<Sequia zona={zonaCon(p)} cultivoId={null} />)
    expect(valorSlider()).toBe(valor)
    expect(screen.getByText('Así está Danlí hoy')).toBeInTheDocument()
    expect(screen.getAllByText(palabra).length).toBeGreaterThan(0)
    expect(screen.getByText('Hoy')).toBeInTheDocument()
  })

  it('zona sin percentil: arranca en 0 y no hay linea de hoy', () => {
    render(<Sequia zona={zonaCon(null)} cultivoId={null} />)
    expect(valorSlider()).toBe(0)
    expect(screen.queryByText(/Así está/)).toBeNull()
  })

  it('el usuario puede mover el deslizador y volver a hoy', () => {
    // Con movimiento reducido el deslizador salta sin animar (jsdom no tiene cuadros reales).
    fijarMovimientoReducido(true)
    render(<Sequia zona={zonaCon(55)} cultivoId={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cuánta sequía' }))
    expect(valorSlider()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a hoy' }))
    expect(valorSlider()).toBe(0)
  })

  it('cambiar de zona de la escena cambia el texto', () => {
    render(<Sequia zona={null} cultivoId={null} />)
    expect(screen.getByText(textoFenomeno('cielo', 0, null))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cielo' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Río' }))
    expect(screen.queryByText(textoFenomeno('cielo', 0, null))).toBeNull()
    expect(screen.getByText(textoFenomeno('rio', 0, null))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Río' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el texto cambia con el nivel y esta en una region aria-live', () => {
    render(<Sequia zona={zonaCon(10)} cultivoId={null} />)
    const texto = screen.getByText(textoFenomeno('cielo', 2, null))
    expect(texto).toHaveAttribute('aria-live', 'polite')
  })

  it('el cultivo elegido aparece en el texto y se resalta en el dibujo', () => {
    const { container } = render(<Sequia zona={null} cultivoId="frijol" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cultivo' }))
    expect(screen.getByText(textoFenomeno('cultivo', 0, 'frijol'))).toHaveTextContent(/frijol/)
    const estados = [...container.querySelectorAll('g[data-estado]')].map((g) => g.getAttribute('data-estado'))
    expect(estados).toContain('resaltado')
    expect(estados).toContain('atenuado')
  })

  it('con otro cultivo o ninguno muestra maiz y frijol sin resaltar', () => {
    const { container } = render(<Sequia zona={null} cultivoId="sorgo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cultivo' }))
    expect(screen.getByText(textoFenomeno('cultivo', 0, 'sorgo'))).toHaveTextContent(/maíz y el frijol/)
    const estados = [...container.querySelectorAll('g[data-estado]')].map((g) => g.getAttribute('data-estado'))
    expect(estados.every((e) => e === 'normal')).toBe(true)
  })

  it('con movimiento reducido no hay boton de avance ni autoinicio', () => {
    vi.useFakeTimers()
    fijarMovimientoReducido(true)
    render(<Sequia zona={null} cultivoId={null} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByRole('button', { name: 'Ver cómo avanza' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(cuadros).toHaveLength(0)
    vi.useRealTimers()
  })

  it('sin movimiento reducido y sin dato arranca solo y se puede pausar', () => {
    vi.useFakeTimers()
    render(<Sequia zona={null} cultivoId={null} />)
    expect(screen.getByRole('button', { name: 'Ver cómo avanza' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(screen.getByRole('button', { name: 'Ver cómo avanza' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('ejecuta un cuadro del bucle y pide el siguiente', () => {
    render(<Sequia zona={null} cultivoId={null} />)
    expect(cuadros).toHaveLength(1)
    act(() => cuadros[0](performance.now() + 16))
    expect(cuadros).toHaveLength(2)
  })

  it('al desmontar cancela el bucle', () => {
    const { unmount } = render(<Sequia zona={null} cultivoId={null} />)
    unmount()
    expect(cancelar).toHaveBeenCalled()
  })
})

describe('textos de la sequia', () => {
  const prohibidas = /evapotranspiraci|frente seco|paraheliotrop|\bC4\b|\bC3\b|estoma/i

  it('hay 15 textos distintos por zona y nivel (mas las variantes de cultivo)', () => {
    for (const z of ZONAS_ESCENA) {
      const textos = ([0, 1, 2] as const).map((n) => textoFenomeno(z, n, null))
      expect(new Set(textos).size).toBe(3)
    }
    expect(PALABRAS_NIVEL).toEqual(['Normal', 'Seca', 'Muy seca'])
  })

  it('ninguno pasa de 140 caracteres, ni usa jerga, ni lleva emojis', () => {
    const todos = todosLosTextos()
    expect(todos.length).toBe(4 * 3 + 3 * 3)
    for (const t of todos) {
      expect(t.length).toBeLessThanOrEqual(140)
      expect(t).not.toMatch(prohibidas)
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })

  it('cultivo usa el nombre del cultivo elegido', () => {
    expect(textoFenomeno('cultivo', 2, 'maiz')).toMatch(/maíz.*(mazorca|floración)|(mazorca|floración).*maíz/i)
    expect(textoFenomeno('cultivo', 1, 'frijol')).toMatch(/frijol.*flores/i)
    expect(textoFenomeno('cultivo', 0, null)).toMatch(/maíz y el frijol/)
  })
})
