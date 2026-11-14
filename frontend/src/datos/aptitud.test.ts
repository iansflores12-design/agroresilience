import { PESOS_ROTACION, aptitud, departamentoDeZona, departamentos, factores, nivelDePuntaje, ranking, rotacionesPara, tieneAptitud } from './aptitud'
import { cultivos } from './cultivos'
import limites from './departamentos.geo.json'
import { zonas } from './zonas'

describe('aptitud', () => {
  it('cada departamento tiene su limite en el mapa y cada zona su departamento', () => {
    const conLimite = limites.features.map((f) => f.properties.id).sort()
    expect(conLimite).toEqual(departamentos.map((d) => d.id).sort())
    for (const z of zonas) expect(departamentos.some((d) => d.id === departamentoDeZona(z.id))).toBe(true)
  })

  it('hay puntaje para todos los cultivos y los pesos suman 1', () => {
    for (const c of cultivos) expect(tieneAptitud(c.id)).toBe(true)
    expect(tieneAptitud('cafe')).toBe(false)
    expect(tieneAptitud(null)).toBe(false)
    expect(factores.reduce((s, f) => s + f.peso, 0)).toBeCloseTo(1)
  })

  it('ordena los 18 departamentos de mejor a peor, con puntajes de 0 a 100', () => {
    for (const c of cultivos) {
      const orden = ranking(c.id, 'normal')
      expect(orden).toHaveLength(18)
      for (const [i, p] of orden.entries()) {
        expect(p.total).toBeGreaterThanOrEqual(0)
        expect(p.total).toBeLessThanOrEqual(100)
        expect(p.nivel).toBe(nivelDePuntaje(p.total))
        if (i > 0) expect(orden[i - 1].total).toBeGreaterThanOrEqual(p.total)
      }
    }
    expect(ranking(null, 'normal')).toEqual([])
  })

  it('un ano seco baja el maiz en el corredor seco y el sorgo lo aguanta mejor', () => {
    const normal = aptitud('HN-CH', 'maiz', 'normal')!
    const seco = aptitud('HN-CH', 'maiz', 'seco')!
    expect(seco.total).toBeLessThan(normal.total)
    expect(aptitud('HN-CH', 'sorgo', 'seco')!.total).toBeGreaterThan(seco.total)
    expect(seco.partes).toHaveLength(factores.length)
    expect(seco.puesto).toBeGreaterThan(0)
    expect(aptitud(null, 'maiz', 'seco')).toBeNull()
    expect(aptitud('HN-CH', null, 'seco')).toBeNull()
  })

  it('las rotaciones empiezan por repetir el cultivo y siguen de mejor a peor', () => {
    const opciones = rotacionesPara('HN-CH', 'maiz', 'seco')
    expect(opciones).toHaveLength(cultivos.length)
    expect(opciones[0]).toMatchObject({ id: 'maiz', actual: true, diferencia: 0, nombre: 'Maíz y otra vez maíz' })
    const otras = opciones.slice(1)
    for (const [i, r] of otras.entries()) {
      expect(r.actual).toBe(false)
      expect(r.diferencia).toBe(r.total - opciones[0].total)
      expect(r.pasos.map((p) => p.cultivo.id)).toEqual(['maiz', r.id])
      if (i > 0) expect(otras[i - 1].total).toBeGreaterThanOrEqual(r.total)
    }
    expect(opciones.find((r) => r.mejor)!.total).toBe(Math.max(...opciones.map((r) => r.total)))
    expect(rotacionesPara(null, 'maiz', 'seco')).toEqual([])
    expect(rotacionesPara('HN-CH', null, 'seco')).toEqual([])
  })

  it('rotacionesPara con pesos propios cambia el total y reordena; sin pesos es igual', () => {
    const base = rotacionesPara('HN-CH', 'maiz', 'normal')
    expect(rotacionesPara('HN-CH', 'maiz', 'normal', { pesos: PESOS_ROTACION })).toEqual(base)
    expect(rotacionesPara('HN-CH', 'maiz', 'normal', {})).toEqual(base)
    const soloVenta = rotacionesPara('HN-CH', 'maiz', 'normal', { pesos: { agua: 0, suelo: 0, clima: 0, venta: 1 } })
    expect(soloVenta[0].partes.find((p) => p.clave === 'venta')!.peso).toBe(1)
    for (const r of soloVenta) expect(r.total).toBe(r.partes.find((p) => p.clave === 'venta')!.valor)
    const otras = soloVenta.slice(1)
    for (const [i, r] of otras.entries()) if (i > 0) expect(otras[i - 1].total).toBeGreaterThanOrEqual(r.total)
    expect(soloVenta.map((r) => r.id)).not.toEqual(base.map((r) => r.id))
  })
})
