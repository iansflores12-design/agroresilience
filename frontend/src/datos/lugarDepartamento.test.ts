import { departamentoDeZona } from './aptitud'
import { departamentoElegido, departamentoEnPunto, departamentosConDatos, zonaDeDepartamento } from './lugarDepartamento'
import { zonas } from './zonas'

describe('lugar por departamento', () => {
  it('encuentra el departamento de un punto GPS', () => {
    expect(departamentoEnPunto(14.0818, -87.2068)).toBe('HN-FM') // Tegucigalpa
    expect(departamentoEnPunto(15.7597, -86.7822)).toBe('HN-AT') // La Ceiba
    expect(departamentoEnPunto(13.3, -87.19)).toBe('HN-CH') // Choluteca
    expect(departamentoEnPunto(0, 0)).toBeNull()
  })

  it('cada punto de datos cae en su departamento', () => {
    for (const z of zonas) expect(departamentoEnPunto(z.lat, z.lon)).toBe(departamentoDeZona(z.id))
  })

  it('los 18 departamentos tienen un punto de datos: el propio o el mas cercano', () => {
    const lista = departamentosConDatos()
    expect(lista).toHaveLength(18)
    for (const d of lista) expect(d.zona).not.toBeNull()
    expect(['juticalpa', 'catacamas']).toContain(zonaDeDepartamento('HN-OL')?.id)
    expect(lista.find((d) => d.id === 'HN-AT')?.propia).toBe(false)
    expect(departamentoElegido({ departamentoId: null, zonaId: 'nacaome' })).toBe('HN-VA')
    expect(departamentoElegido({ departamentoId: 'HN-AT', zonaId: 'san_pedro_sula' })).toBe('HN-AT')
  })
})
