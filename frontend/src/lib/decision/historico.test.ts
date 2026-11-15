import { describe, expect, it } from 'vitest'
import { departamentoDe, recorteHistorico, type HistoricoDepartamento } from './historico'
import type { Decision } from './tipos'

const r = (n: number, mediana: number, buenos: number, fracasos: number) => ({ n, mediana, buenos, fracasos, peor: 2015, peor_rel: 22 })
const cultivo = (zona: boolean | null, riego = false) => ({
  todo: r(45, 70, 22, 6),
  nino: r(12, 55, 3, 4),
  neutro: r(20, 74, 11, 1),
  nina: r(13, 76, 8, 1),
  ultimos10: r(10, 72, 5, 1),
  calor_mediana: 2,
  riego_mediana_mm: riego ? 210 : 0,
  solo_con_riego: riego,
  zona_tradicional: zona,
})

const historico: HistoricoDepartamento = {
  departamento: 'Choluteca',
  punto_clima: 'choluteca',
  periodo: '1981-2026',
  fuente_lluvia: 'era5_ajustado',
  temporadas: {
    primera: {
      siembra_mediana: '05-14',
      lluvia_mediana_mm: 520,
      cultivos: { maiz: cultivo(null), frijol: cultivo(null), sorgo: cultivo(null), melon: cultivo(true, true) },
      mejor_cultivo_secano_veces: { maiz: 10, frijol: 5, sorgo: 30, tabaco: 0 },
      anios_extremos: { peores: [{ anio: 2015, enso: 'nino', maiz_rel: 22, mejor: 'sorgo' }], mejores: [] },
    },
    anual: { siembra_mediana: null, lluvia_mediana_mm: 1600, cultivos: { cafe: cultivo(false), cana: cultivo(true) } },
  },
  mercado_exportacion: { cana: { usd_2024_millones: 127, pct_exportaciones_2024: 0.97, usd_prom_2015_2024_millones: 75, usd_prom_2005_2014_millones: 40 } },
  enso_actual: { trimestre: '2026-ASO', oni: 2.46, fase: 'nino' },
}

const decision = {
  entrada: { temporada: 'primera', cultivoId: 'maiz' },
  rotaciones: [{ pasos: [{ temporada: 'primera', cultivoId: 'sorgo' }, { temporada: 'postrera', cultivoId: 'frijol' }] }],
} as unknown as Decision

describe('recorteHistorico', () => {
  it('deja solo la temporada, los cultivos de la consulta y la fase actual', () => {
    const texto = recorteHistorico(historico, decision)
    expect(texto).toContain('Historial de Choluteca, 1981-2026')
    expect(texto).toContain('fase El Niño')
    expect(texto).toContain('- Maíz: en años El Niño (12): mediana 55 % del potencial, buen año 3 de 12, fracaso 4 de 12')
    expect(texto).toContain('- Sorgo:')
    expect(texto).toContain('Sorgo 30 veces')
    expect(texto).not.toContain('tabaco 0')
    // frijol esta en postrera, que no tiene datos aqui; en primera si sale porque es cultivo de la consulta
    expect(texto).toContain('- Frijol:')
  })

  it('agrega exportacion solo si es de la zona, con su peso en el Atlas', () => {
    const texto = recorteHistorico(historico, decision)
    expect(texto).toContain('Caña de azúcar')
    expect(texto).toContain('127 millones de dólares en 2024')
    expect(texto).toContain('Melón')
    expect(texto).toContain('le faltan 210 mm')
    expect(texto).not.toContain('Café')
  })

  it('sin historico devuelve vacio y mapea puntos a departamentos', () => {
    expect(recorteHistorico(null, decision)).toBe('')
    expect(departamentoDe('sula')).toBe('cortes')
    expect(departamentoDe('nacaome')).toBe('valle')
    expect(departamentoDe('nada')).toBeNull()
  })
})

describe('historial en el puntaje', () => {
  it('sin historico no cambia nada; con el, los años parecidos mueven el puntaje y lo explican', async () => {
    const { decidir } = await import('./motor')
    const punto = (await import('../../../public/kharis/choluteca.json')).default as unknown as import('./tipos').PuntoKharis
    const real = (await import('../../../public/historico/choluteca.json')).default as unknown as HistoricoDepartamento
    const entrada = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: [] } as import('./tipos').EntradaDecision
    const meta = { fechaBase: '2026-11-10', modelo: 'v007' }
    const sin = decidir(entrada, punto, meta)
    const con = decidir(entrada, punto, { ...meta, historico: real })
    expect(sin.rotaciones.every((x) => x.ajusteHistorial === undefined)).toBe(true)
    const puntajes = con.rotaciones.map((x) => x.puntaje)
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes)
    for (const x of con.rotaciones) {
      const antes = sin.rotaciones.find((y) => y.id === x.id)!
      expect(x.ajusteHistorial).toBeGreaterThanOrEqual(-12)
      expect(x.ajusteHistorial).toBeLessThanOrEqual(6)
      expect(Math.abs(x.puntaje - Math.max(0, Math.min(100, antes.puntaje + x.ajusteHistorial!)))).toBeLessThanOrEqual(1)
      expect(x.evidencia.some((e) => e.fuente.includes('NOAA'))).toBe(true)
    }
    // Repetir maiz (lo de hoy) pierde mas que cambiar a sorgo: el maiz falla mas en años de El Niño.
    const actual = con.rotaciones.find((x) => x.actual)!
    const sorgo = con.rotaciones.find((x) => x.id === 'maiz-sorgo')!
    expect(sorgo.ajusteHistorial!).toBeGreaterThan(actual.ajusteHistorial!)
  })
})

describe('retroalimentacion: cosechas reportadas', () => {
  it('las cosechas malas bajan el puntaje, las buenas lo suben, y se explican', async () => {
    const { decidir, validarEntrada } = await import('./motor')
    const punto = (await import('../../../public/kharis/choluteca.json')).default as unknown as import('./tipos').PuntoKharis
    const real = (await import('../../../public/historico/choluteca.json')).default as unknown as HistoricoDepartamento
    type E = import('./tipos').EntradaDecision
    const base = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: [] } as E
    const meta = { fechaBase: '2026-11-10', modelo: 'v007', historico: real }
    const rep = (resultado: 'buena' | 'mala') => [2023, 2024, 2025].map((anio) => ({ cultivoId: 'sorgo', temporada: 'postrera' as const, anio, resultado }))
    const de = (e: E) => decidir(e, punto, meta).rotaciones.find((x) => x.id === 'maiz-sorgo')!
    const sin = de(base)
    const malas = de({ ...base, cosechas: rep('mala') })
    const buenas = de({ ...base, cosechas: rep('buena') })
    expect(malas.puntaje).toBeLessThan(sin.puntaje)
    expect(buenas.puntaje).toBeGreaterThanOrEqual(sin.puntaje)
    expect(malas.cosechasUsadas).toBe(3)
    expect(malas.razones.some((r) => r.tipo === 'historial' && r.texto.includes('Usted reportó 3 cosechas'))).toBe(true)
    expect(malas.evidencia.some((e) => e.fuente === 'Lo que usted reportó en esta app')).toBe(true)
    expect(sin.faltaSaber).toContain('Cómo le fue en su parcela en años pasados')
    expect(malas.faltaSaber).not.toContain('Cómo le fue en su parcela en años pasados')
    // Sin historial del departamento, las cosechas igual corrigen.
    const soloPropias = decidir({ ...base, cosechas: rep('mala') }, punto, { fechaBase: '2026-11-10', modelo: 'v007' }).rotaciones.find((x) => x.id === 'maiz-sorgo')!
    expect(soloPropias.ajusteHistorial).toBeLessThan(0)
    // La API valida y limpia los reportes.
    const limpia = validarEntrada({ ...base, cosechas: [...rep('mala'), { cultivoId: 'nada', temporada: 'primera', anio: 2024, resultado: 'buena' }, { cultivoId: 'maiz', temporada: 'primera', anio: 1500, resultado: 'buena' }] })
    expect(limpia?.cosechas).toHaveLength(3)
  })
})
