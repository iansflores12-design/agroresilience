import { recomendar } from './motor'
import type { IdOpcion, RespuestasSiembra, Terreno, Ubicacion } from './tipos'

const ub = (lat: number, lon: number): Ubicacion => ({ lat, lon, precisionM: null, origen: 'manual' })
const terrenoBase: Terreno = { textura: 'franco', pendiente: 'plana', drenaje: 'bueno', tieneRiego: true }

// Lugares del mock: Choluteca (seco), Atlantida (humedo), Tegucigalpa (cercano a lo normal)
const seco = ub(13.3, -87.19)
const humedo = ub(15.78, -86.8)
const normal = ub(14.08, -87.2)

const base = (o: Partial<RespuestasSiembra> = {}): RespuestasSiembra => ({
  cultivoId: 'maiz',
  diasDesdeSiembra: 63, // semana 9: floracion
  objetivo: 'agua',
  terreno: terrenoBase,
  ubicacion: seco,
  ...o,
})

describe('recomendar', () => {
  it('lugar seco, floracion, objetivo agua y con riego: riego por goteo o cobertura, no esperar', () => {
    const r = recomendar(base())
    expect(['riego_goteo', 'cobertura_rastrojo']).toContain(r.mejor.id)
    expect(r.mejor.id).not.toBe('esperar_monitorear')
    expect(r.etapa.id).toBe('floracion')
    expect(r.punto.id).toBe('choluteca')
    expect(r.origenDatos).toBe('mockup')
    expect(r.mejor.razones.length).toBeGreaterThan(0)
  })

  it('lugar humedo con drenaje malo y arcilloso: surcos de drenaje', () => {
    const r = recomendar(base({ ubicacion: humedo, objetivo: 'rendimiento', terreno: { ...terrenoBase, drenaje: 'malo', textura: 'arcilloso' } }))
    expect(r.mejor.id).toBe('drenaje_surcos')
    const puntaje = (id: IdOpcion) => r.opciones.find((o) => o.id === id)!.puntaje
    expect(puntaje('riego_goteo')).toBeLessThan(40)
    expect(puntaje('riego_auxiliar')).toBeLessThan(40)
  })

  it('sin riego, ninguna opcion de riego es la mejor', () => {
    const r = recomendar(base({ terreno: { ...terrenoBase, tieneRiego: false }, objetivo: 'rendimiento' }))
    expect(['riego_goteo', 'riego_auxiliar']).not.toContain(r.mejor.id)
  })

  it('pendiente inclinada y objetivo suelo: curvas a nivel', () => {
    const r = recomendar(base({ ubicacion: normal, objetivo: 'suelo', terreno: { ...terrenoBase, pendiente: 'inclinada' } }))
    expect(r.mejor.id).toBe('curvas_nivel')
  })

  it('datos null no rompen el calculo', () => {
    const r = recomendar(base({ ubicacion: ub(14.03, -86.58) }))
    expect(r.punto.id).toBe('el_paraiso')
    expect(r.opciones).toHaveLength(6)
  })

  it('puntajes enteros 0..100, 6 opciones, ordenadas y deterministas', () => {
    const entrada = base({ ubicacion: humedo, objetivo: 'costo' })
    const r = recomendar(entrada)
    expect(r.opciones).toHaveLength(6)
    expect(new Set(r.opciones.map((o) => o.id)).size).toBe(6)
    for (const [i, o] of r.opciones.entries()) {
      expect(Number.isInteger(o.puntaje)).toBe(true)
      expect(o.puntaje).toBeGreaterThanOrEqual(0)
      expect(o.puntaje).toBeLessThanOrEqual(100)
      if (i > 0) expect(r.opciones[i - 1].puntaje).toBeGreaterThanOrEqual(o.puntaje)
    }
    expect(r.mejor).toBe(r.opciones[0])
    expect(recomendar(entrada)).toEqual(r)
  })
})
