import choluteca from '../../../public/kharis/choluteca.json'
import laEsperanza from '../../../public/kharis/la_esperanza.json'
import gracias from '../../../public/kharis/gracias.json'
import escalaFina from '../../../public/kharis/escala_fina.json'
import { ajustarAParcela, alturaEn } from './escala'
import { decidir, validarEntrada } from './motor'
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
    expect(validarEntrada({ ...base, cultivoId: 'cafe' })).toBeNull()
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
