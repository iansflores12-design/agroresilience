import { asentar, configurarSonido, confirmar, tic, vibrar } from './sonido'

describe('sonido', () => {
  afterEach(() => {
    configurarSonido(true)
    vi.unstubAllGlobals()
  })

  it('no falla sin AudioContext (jsdom)', () => {
    expect(() => {
      tic()
      tic(true)
      asentar()
      confirmar()
      vibrar(3)
    }).not.toThrow()
  })

  it('no hace nada con el sonido apagado', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    configurarSonido(false)
    vibrar(3)
    tic()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('vibra cuando esta activo y hay soporte', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vibrar(3)
    expect(vibrate).toHaveBeenCalledWith(3)
  })
})
