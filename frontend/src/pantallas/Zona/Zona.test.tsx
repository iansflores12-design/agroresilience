import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { zonas, type Zona } from '../../datos/zonas'
import { avisar } from '../../lib/avisos'
import { CLAVE_ESTADO } from '../../estado/EstadoApp'
import { renderizarApp } from '../../pruebas/renderizar'
import { GraficaHumedad } from './GraficaHumedad'
import { HojaZona } from './HojaZona'

vi.mock('../../lib/avisos', () => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn() },
}))

const esperado = (z: Zona) => ((z.humedad?.valor ?? 0) * 100).toFixed(1)

function guardarZona(zonaId: string | null, cultivoId: string | null = null) {
  window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ zonaId, cultivoId, edadSemanas: 3, sonido: false }))
}

describe('Zona (pantalla)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('sin zona muestra el estado vacio con los chips visibles y el espacio del fenomeno', () => {
    const { container } = renderizarApp('/zona')
    expect(screen.getByText('Aún no hay zona elegida')).toBeInTheDocument()
    for (const z of zonas) expect(screen.getByRole('button', { name: z.nombre })).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('[data-placeholder="fenomeno"]')).toBeInTheDocument()
  })

  it('muestra la humedad de la zona elegida y cambia al cambiar de chip', async () => {
    const usuario = userEvent.setup()
    guardarZona(zonas[0].id)
    renderizarApp('/zona')
    expect(screen.getByText(esperado(zonas[0]))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: zonas[0].nombre })).toHaveAttribute('aria-pressed', 'true')

    const otra = zonas.find((z) => esperado(z) !== esperado(zonas[0])) as Zona
    await usuario.click(screen.getByRole('button', { name: otra.nombre }))
    expect(screen.getByText(esperado(otra))).toBeInTheDocument()
    expect(screen.queryByText(esperado(zonas[0]))).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Humedad del suelo, \d+ lecturas/ })).toBeInTheDocument()
  })

  it('sin cultivo no lanza aviso y muestra la linea con el enlace a elegir cultivo', () => {
    guardarZona(zonas[0].id)
    renderizarApp('/zona')
    expect(avisar.alerta).not.toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Aún no eliges cultivo' }))
    expect(screen.getByText('Sin cultivo elegido. Con un cultivo, la hoja suma su etapa.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Elegir cultivo' })).toHaveAttribute('href', '/')
  })

  it('con cultivo muestra su etapa y sensibilidad con la nota de validacion', () => {
    guardarZona(zonas[0].id, 'maiz')
    renderizarApp('/zona')
    expect(screen.getByText(/Sensibilidad a la falta de agua/)).toBeInTheDocument()
    expect(screen.getByText(/pendiente de validación agronómica/)).toBeInTheDocument()
    expect(avisar.alerta).not.toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Aún no eliges cultivo' }))
  })

  it('copiar resumen escribe en el portapapeles y avisa; si falla, avisa el error', async () => {
    const usuario = userEvent.setup()
    guardarZona(zonas[0].id, 'maiz')
    renderizarApp('/zona')
    const escribir = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true })
    await usuario.click(screen.getByRole('button', { name: 'Copiar resumen' }))
    expect(escribir).toHaveBeenCalledWith(expect.stringContaining(zonas[0].nombre))
    expect(avisar.exito).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Resumen copiado' }))

    escribir.mockRejectedValue(new Error('denegado'))
    await act(async () => {
      await usuario.click(screen.getByRole('button', { name: 'Copiar resumen' }))
    })
    expect(avisar.error).toHaveBeenCalled()
  })
})

describe('HojaZona con datos sinteticos', () => {
  const vacia: Zona = { id: 'x', nombre: 'Zona de prueba', lat: 14, lon: -87, humedad: null, lluvia30d: null, temperatura: null, suelo: null }

  it('dice "Sin lectura" y la razon, sin inventar valores', () => {
    render(
      <MemoryRouter>
        <HojaZona zona={vacia} cultivoId={null} edadSemanas={0} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Sin lectura')).toHaveLength(4)
    expect(screen.getByText(/No hay lectura de humedad/)).toBeInTheDocument()
    expect(screen.getByText(/No hay datos de suelo/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('muestra cada dato con su fecha y su fuente', () => {
    const z = zonas[0]
    render(
      <MemoryRouter>
        <HojaZona zona={z} cultivoId={null} edadSemanas={0} fuentes={{ humedad: 'F-H', lluvia: 'F-L', temperatura: 'F-T', suelo: 'F-S' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Fuente: F-H/)).toBeInTheDocument()
    expect(screen.getByText(/Fuente: F-S/)).toBeInTheDocument()
    const lluvia = screen.getByRole('heading', { name: 'Lluvia de 30 días' }).closest('article') as HTMLElement
    expect(within(lluvia).getByText(/Fuente: F-L/)).toBeInTheDocument()
    expect(within(lluvia).getByText(/^Hasta el \d+ de \w+ de \d{4}/)).toBeInTheDocument()
  })
})

describe('GraficaHumedad', () => {
  it('corta la linea cuando hay mas de 5 dias entre lecturas', () => {
    const serie: [string, number][] = [
      ['2026-10-01', 0.2],
      ['2026-10-03', 0.22],
      ['2026-10-20', 0.3],
      ['2026-10-21', 0.31],
    ]
    const { container } = render(<GraficaHumedad serie={serie} normal={0.25} />)
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('normal para la época es 25.0 %')
  })
})
