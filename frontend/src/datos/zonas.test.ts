import datos from './zonas.generado.json'
import { buscarZona, cajaHonduras, estadoHumedad, humedadPorcentaje, zonas, type Zona } from './zonas'

const plantilla: Zona = {
  id: 'prueba',
  nombre: 'Prueba',
  lat: 14,
  lon: -87,
  humedad: {
    valor: 0.4321,
    fecha: '2026-01-01',
    unidad: 'm3/m3',
    serie: [],
    normal: 0.3,
    anomalia: 0.1,
    percentil: 50,
    muestras: 10,
  },
  lluvia30d: null,
  temperatura: null,
  suelo: null,
}
const conPercentil = (percentil: number | null): Zona => ({
  ...plantilla,
  humedad: { ...plantilla.humedad!, percentil },
})

describe('zonas', () => {
  it('expone las zonas y la caja del JSON generado', () => {
    expect(zonas).toHaveLength(datos.zonas.length)
    expect(cajaHonduras).toEqual(datos.caja)
  })

  it('buscarZona encuentra por id y devuelve null si no existe', () => {
    const primera = datos.zonas[0]
    expect(buscarZona(primera.id)?.nombre).toBe(primera.nombre)
    expect(buscarZona('no-existe')).toBeNull()
    expect(buscarZona(null)).toBeNull()
  })

  it('humedadPorcentaje multiplica por 100 con un decimal y devuelve null sin lectura', () => {
    expect(humedadPorcentaje(plantilla)).toBe(43.2)
    expect(humedadPorcentaje({ ...plantilla, humedad: null })).toBeNull()
    const real = zonas.find((z) => z.humedad)
    if (real) expect(humedadPorcentaje(real)).toBeCloseTo(real.humedad!.valor * 100, 1)
  })

  it('estadoHumedad usa los umbrales de percentil 20 y 80', () => {
    expect(estadoHumedad(conPercentil(5))).toBe('Más seca de lo normal')
    expect(estadoHumedad(conPercentil(19))).toBe('Más seca de lo normal')
    expect(estadoHumedad(conPercentil(20))).toBe('Dentro de lo normal')
    expect(estadoHumedad(conPercentil(80))).toBe('Dentro de lo normal')
    expect(estadoHumedad(conPercentil(81))).toBe('Más húmeda de lo normal')
    expect(estadoHumedad(conPercentil(null))).toBe('Sin referencia histórica')
    expect(estadoHumedad({ ...plantilla, humedad: null })).toBe('Sin referencia histórica')
  })
})
