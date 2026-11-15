import choluteca from '../../../public/kharis/choluteca.json'
import laEsperanza from '../../../public/kharis/la_esperanza.json'
import gracias from '../../../public/kharis/gracias.json'
import escalaFina from '../../../public/kharis/escala_fina.json'
import { ajustarAParcela, alturaEn } from './escala'
import { decidir, validarEntrada } from './motor'
import { ajustePorPrecio, precioCreible, type PreciosRegion } from './precios'
import { resumenRapido, datosParaGemini } from './textos'
import type { EntradaDecision, EscalaFina, PuntoKharis } from './tipos'

const meta = { fechaBase: '2026-11-10', modelo: 'v007' }
const pCholuteca = choluteca as unknown as PuntoKharis
const pEsperanza = laEsperanza as unknown as PuntoKharis

const base: EntradaDecision = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: [] }

describe('decidir', () => {
  it('compara al menos tres rotaciones, incluida la actual, ordenadas de mayor a menor', () => {
    const d = decidir(base, pCholuteca, meta)
    expect(d.rotaciones.length).toBeGreaterThanOrEqual(3)
    expect(d.rotaciones.filter((r) => r.actual)).toHaveLength(1)
    const puntajes = d.rotaciones.map((r) => r.puntaje)
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes)
    expect(d.rotaciones[0].id).toBe(d.mejorId)
    expect(d.rotaciones[0].mejor).toBe(true)
    for (const r of d.rotaciones) {
      expect(r.puntaje).toBeGreaterThanOrEqual(0)
      expect(r.puntaje).toBeLessThanOrEqual(100)
      expect(r.razones.length).toBeGreaterThan(0)
      expect(r.evidencia.length).toBeGreaterThan(0)
      expect(r.pasos).toHaveLength(3)
      expect(r.factores.reduce((s, f) => s + f.peso, 0)).toBeCloseTo(1, 1)
    }
  })

  it('es determinista', () => {
    expect(decidir(base, pCholuteca, meta)).toEqual(decidir(base, pCholuteca, meta))
  })

  it('la actual repite el cultivo y deja una temporada sin cultivo', () => {
    const actual = decidir(base, pCholuteca, meta).rotaciones.find((r) => r.actual)!
    expect(actual.pasos.map((p) => p.cultivoId)).toEqual(['maiz', 'maiz', null])
    expect(actual.diferencia).toBe(0)
  })

  it('los objetivos cambian el orden: con forraje sube el sorgo', () => {
    const sin = decidir(base, pCholuteca, meta)
    const con = decidir({ ...base, objetivos: ['forraje'] }, pCholuteca, meta)
    const pos = (d: typeof sin) => d.rotaciones.findIndex((r) => r.id === 'maiz-sorgo')
    expect(pos(con)).toBeLessThanOrEqual(pos(sin))
  })

  it('un terreno ondulado castiga mas dejar la tierra desnuda', () => {
    const erosion = (t: EntradaDecision['terreno']) =>
      decidir({ ...base, terreno: t }, pCholuteca, meta).rotaciones.find((r) => r.actual)!.factores.find((f) => f.clave === 'erosion')!.valor
    expect(erosion('ondulado')).toBeLessThan(erosion('plano'))
  })

  it('funciona en otro lugar y otra temporada', () => {
    const d = decidir({ ...base, zonaId: 'la_esperanza', cultivoId: 'frijol', temporada: 'postrera', terreno: 'elevado' }, pEsperanza, meta)
    expect(d.punto.nombre).toBe('La Esperanza')
    expect(d.rotaciones[0].pasos[0].temporada).toBe('postrera')
  })
})

describe('textos', () => {
  it('el resumen rapido nombra la rotacion y su puntaje', () => {
    const d = decidir(base, pCholuteca, meta)
    const r = d.rotaciones[1]
    const t = resumenRapido(d, r.id)
    expect(t).toContain(r.nombre)
    expect(t).toContain(`${r.puntaje} de 100`)
  })

  it('los datos para Gemini traen el ranking y la evidencia', () => {
    const d = decidir(base, pCholuteca, meta)
    const t = datosParaGemini(d, d.mejorId)
    expect(t).toContain('Ranking de Gemini Decision')
    expect(t).toContain('Evidencia del motor')
  })
})

describe('escala de parcela', () => {
  const escala = escalaFina as unknown as EscalaFina
  const pGracias = gracias as unknown as PuntoKharis
  // Ladera alta cerca de Gracias (Celaque): mucho mas alta que la celda del punto de Kharis.
  const alta = { lat: 14.55, lon: -88.68 }

  it('lee la altura de la malla y da null fuera de ella', () => {
    expect(alturaEn(escala, alta.lat, alta.lon)).toBeGreaterThan(1200)
    expect(alturaEn(escala, 10, -80)).toBeNull()
  })

  it('en una parcela alta las noches salen mas frescas y solo cambia lo validado', () => {
    const r = ajustarAParcela(pGracias, escala, alta, 'Gracias', 5)
    expect(r.info.cambioTmin).toBeLessThan(0)
    expect(r.info.cambioTmedia).toBeLessThan(0)
    expect(r.info.cambioEt0Pct).toBeLessThan(0)                                    // mas fresco: pierde menos agua
    expect(r.punto.pronostico.T2M_MAX).toBe(pGracias.pronostico.T2M_MAX)        // la maxima no se toca
    expect(r.punto.pronostico.PRECTOTCORR).toBe(pGracias.pronostico.PRECTOTCORR) // la lluvia tampoco
    expect(escala.variables).toEqual(['T2M_MIN', 'T2M'])
  })

  it('la decision con parcela trae su informacion y la evidencia de la altura', () => {
    const e: EntradaDecision = { ...base, zonaId: 'santa_rosa_copan', parcela: alta }
    const d = decidir(e, pGracias, { ...meta, escala, distanciaKm: 5 })
    expect(d.punto.parcela?.puntoId).toBe('gracias')
    expect(d.punto.nombre).toContain('su parcela')
    expect(d.rotaciones[0].evidencia[0].texto).toMatch(/de altura/)
  })

  it('valida y redondea la ubicacion de la parcela', () => {
    expect(validarEntrada({ ...base, parcela: { lat: 14.123456, lon: -87.654321 } })?.parcela).toEqual({ lat: 14.123, lon: -87.654 })
    expect(validarEntrada({ ...base, parcela: { lat: 40, lon: -3 } })).toBeNull()
  })
})

describe('validarEntrada', () => {
  it('acepta una entrada valida y limpia objetivos desconocidos', () => {
    expect(validarEntrada({ ...base, objetivos: ['agua', 'x', 'agua'] })).toEqual({ ...base, objetivos: ['agua'] })
  })
  it('rechaza lugar, cultivo, terreno o temporada invalidos', () => {
    expect(validarEntrada({ ...base, zonaId: 'marte' })).toBeNull()
    expect(validarEntrada({ ...base, cultivoId: 'cacao' })).toBeNull()
    expect(validarEntrada({ ...base, terreno: 'raro' })).toBeNull()
    expect(validarEntrada({ ...base, temporada: 'invierno' })).toBeNull()
    expect(validarEntrada(null)).toBeNull()
  })
})

// Muestra el ranking real para revisarlo a ojo con `npx vitest run motor -- --reporter verbose`.
it('ranking de ejemplo (Choluteca, maiz de primera, plano)', () => {
  const d = decidir(base, pCholuteca, meta)
  const tabla = d.rotaciones.map((r) => `${r.puntaje} ${r.rating.padEnd(10)} ${r.nombre} | ${r.factores.map((f) => `${f.clave}:${f.valor}`).join(' ')}`)
  console.log(tabla.join('\n'))
  console.log(resumenRapido(d, d.mejorId))
  expect(tabla.length).toBeGreaterThan(0)
})

describe('precios por region', () => {
  const precios = (cultivos: PreciosRegion['cultivos']): PreciosRegion => ({ region: 'Choluteca', origen: 'busqueda', consultado: '2026-11-15', cultivos, fuentes: [] })
  const frijol = (lempirasQq: number) => precios({ frijol: { lempirasQq, mercado: 'Choluteca', fecha: '2026-11-10', fuente: 'SIMPAH' } })
  const venta = (d: ReturnType<typeof decidir>, id: string) => d.rotaciones.find((r) => r.id === id)!.factores.find((f) => f.clave === 'venta')!.valor

  it('sin precio de la region la decision no cambia', () => {
    const sin = decidir(base, pCholuteca, meta)
    const con = decidir(base, pCholuteca, { ...meta, precios: precios({}) })
    expect(con.rotaciones).toEqual(sin.rotaciones)
  })

  it('un precio mas alto que la referencia sube la venta de las rotaciones con ese cultivo, y uno mas bajo la baja', () => {
    const sin = decidir(base, pCholuteca, meta)
    const conFrijol = sin.rotaciones.find((r) => r.pasos.some((x) => x.cultivoId === 'frijol'))!
    const caro = decidir(base, pCholuteca, { ...meta, precios: frijol(2600) })
    const barato = decidir(base, pCholuteca, { ...meta, precios: frijol(1400) })
    expect(venta(caro, conFrijol.id)).toBeGreaterThan(venta(sin, conFrijol.id))
    expect(venta(barato, conFrijol.id)).toBeLessThan(venta(sin, conFrijol.id))
    const actual = sin.rotaciones.find((r) => r.actual)!
    expect(venta(caro, actual.id)).toBe(venta(sin, actual.id))
    const r = caro.rotaciones.find((x) => x.id === conFrijol.id)!
    expect(r.evidencia.some((x) => x.texto.includes('L2,600'))).toBe(true)
    expect(r.faltaSaber.some((x) => /precio del frijol/i.test(x))).toBe(false)
    expect(caro.precios?.origen).toBe('busqueda')
  })

  it('Gemini recibe el precio de cada cultivo: el de la region si lo hay y, si no, la referencia', () => {
    const sin = datosParaGemini(decidir(base, pCholuteca, meta), 'top3')
    expect(sin).toContain('Precios por cultivo')
    expect(sin).toContain('Frijol: L2,000 en San Pedro Sula (24-08-2026), referencia nacional')
    const con = datosParaGemini(decidir(base, pCholuteca, { ...meta, precios: frijol(2600) }), 'top3')
    expect(con).toContain('Frijol: L2,600 en Choluteca (10-11-2026), precio de la región')
    expect(con).toContain('suma 12 puntos')
    expect(con).toContain('Maíz: L770')
  })

  it('el ajuste tiene tope y descarta precios fuera de rango', () => {
    expect(ajustePorPrecio('frijol', frijol(2200))).toBe(4)
    expect(ajustePorPrecio('frijol', frijol(3900))).toBe(15)
    expect(ajustePorPrecio('frijol', frijol(1000))).toBe(-15)
    expect(precioCreible('frijol', 20000)).toBe(false)
    expect(ajustePorPrecio('frijol', frijol(20000))).toBe(0)
  })
})
