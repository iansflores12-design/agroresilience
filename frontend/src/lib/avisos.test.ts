import { avisar } from './avisos'

const mocks = vi.hoisted(() => ({
  sileo: {
    success: vi.fn(() => 'id'),
    info: vi.fn(() => 'id'),
    warning: vi.fn(() => 'id'),
    error: vi.fn(() => 'id'),
    promise: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
  },
}))
vi.mock('sileo', () => mocks)

describe('avisos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exito llama a sileo.success con titulo, descripcion y fondo inverse-surface', () => {
    avisar.exito({ titulo: 'Listo', descripcion: 'Detalle' })
    expect(mocks.sileo.success).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Listo', description: 'Detalle', fill: expect.stringContaining('inverse-surface') }),
    )
  })

  it('info, alerta y error usan el metodo correspondiente', () => {
    avisar.info({ titulo: 'a' })
    avisar.alerta({ titulo: 'b' })
    avisar.error({ titulo: 'c' })
    expect(mocks.sileo.info).toHaveBeenCalledWith(expect.objectContaining({ title: 'a' }))
    expect(mocks.sileo.warning).toHaveBeenCalledWith(expect.objectContaining({ title: 'b' }))
    expect(mocks.sileo.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'c' }))
  })

  it('la accion se traduce a button { title, onClick }', () => {
    const alPulsar = vi.fn()
    avisar.exito({ titulo: 'x', accion: { texto: 'Ver mapa', alPulsar } })
    const opciones = (mocks.sileo.success.mock.calls[0] as unknown as [{ button: { title: string; onClick: () => void } }])[0]
    expect(opciones.button.title).toBe('Ver mapa')
    opciones.button.onClick()
    expect(alPulsar).toHaveBeenCalledOnce()
  })

  it('promesa mapea cargando, exito y error', async () => {
    mocks.sileo.promise.mockImplementation(async (p: Promise<unknown>) => p)
    const resultado = await avisar.promesa(Promise.resolve(7), {
      cargando: { titulo: 'Cargando' },
      exito: (n) => ({ titulo: `Listo ${n}` }),
      error: { titulo: 'Fallo' },
    })
    expect(resultado).toBe(7)
    const [, opciones] = mocks.sileo.promise.mock.calls[0] as unknown as [
      unknown,
      { loading: { title: string }; success: (n: number) => { title: string }; error: (e: unknown) => { title: string } },
    ]
    expect(opciones.loading.title).toBe('Cargando')
    expect(opciones.success(3).title).toBe('Listo 3')
    expect(opciones.error(new Error('x')).title).toBe('Fallo')
  })
})
