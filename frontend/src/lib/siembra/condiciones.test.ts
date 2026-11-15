import { condicionesMock, validarCondiciones } from './condiciones'

describe('validarCondiciones', () => {
  it('acepta el mock', () => {
    expect(validarCondiciones(condicionesMock)).toBe(condicionesMock)
    expect(condicionesMock.origen).toBe('mockup')
    expect(condicionesMock.puntos.length).toBeGreaterThanOrEqual(8)
  })

  it('rechaza objetos mal formados', () => {
    expect(validarCondiciones(null)).toBeNull()
    expect(validarCondiciones('hola')).toBeNull()
    expect(validarCondiciones({})).toBeNull()
    expect(validarCondiciones({ ...condicionesMock, version: 2 })).toBeNull()
    expect(validarCondiciones({ ...condicionesMock, puntos: [] })).toBeNull()
    expect(validarCondiciones({ ...condicionesMock, caja: { lat_min: 1 } })).toBeNull()
    const malo = { ...condicionesMock, puntos: [{ ...condicionesMock.puntos[0], lat: 'x' }] }
    expect(validarCondiciones(malo)).toBeNull()
    const sinCampo = { ...condicionesMock, puntos: [{ id: 'a', nombre: 'A', lat: 14, lon: -87 }] }
    expect(validarCondiciones(sinCampo)).toBeNull()
  })
})
