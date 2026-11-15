import type { Zona } from '../../datos/zonas'
import { detectarAnio } from './escenario'

const zona = (valor: number, normal: number | null): Zona =>
  ({ id: 'z', nombre: 'Z', lat: 0, lon: 0, humedad: null, temperatura: null, suelo: null, lluvia30d: { valor_mm: valor, hasta: '2026-11-08', normal_mm: normal } }) as Zona

describe('tipo de año detectado', () => {
  it('sale de la lluvia del ultimo mes contra lo normal', () => {
    expect(detectarAnio(zona(50, 100), [])).toEqual({ escenario: 'seco', pct: 50 })
    expect(detectarAnio(zona(100, 100), [])).toEqual({ escenario: 'normal', pct: 100 })
    expect(detectarAnio(zona(176, 100), [])).toEqual({ escenario: 'lluvioso', pct: 176 })
  })

  it('sin lugar usa la mediana del pais y sin datos es normal', () => {
    expect(detectarAnio(null, [zona(50, 100), zona(60, 100), zona(200, 100)]).escenario).toBe('seco')
    expect(detectarAnio(zona(10, null), [])).toEqual({ escenario: 'normal', pct: null })
  })
})
