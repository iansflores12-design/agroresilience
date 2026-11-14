import { armarPreset, SITUACIONES } from './presets'
import type { AvisoDecision, TipoCambio } from '../lib/recomendacion/tipos'
import type { Escenario } from './aptitud'

const enfoques = ['agua', 'seguro', 'tierra', 'venta', 'general']
const tipos: TipoCambio[] = ['repetir', 'leguminosa', 'cobertura', 'graminea', 'hortaliza']
const avisos: AvisoDecision[] = ['ninguno', 'canicula', 'lluvia_fuerte', 'tierra_seca']
const escenarios: Escenario[] = ['seco', 'normal', 'lluvioso']
const base = { actual: 'Frijol terciopelo', siguiente: 'Sorgo (maicillo)', lugar: 'Francisco Morazán' }

describe('presets', () => {
  it('hay una plantilla por cada enfoque y tipo de cambio', () => {
    expect(SITUACIONES).toHaveLength(25)
    for (const e of enfoques) for (const t of tipos) expect(SITUACIONES).toContain(`${e}.${t}`)
  })

  it('nunca deja llaves, no pasa de 420 caracteres y no usa jerga', () => {
    for (const situacion of SITUACIONES)
      for (const diferencia of [-5, 0, 1, 12])
        for (const escenario of escenarios)
          for (const aviso of avisos) {
            const t = armarPreset({ ...base, situacion, diferencia, escenario, aviso })
            expect(t).not.toMatch(/[{}]/)
            expect(t.length).toBeLessThanOrEqual(420)
            expect(t).not.toMatch(/percentil|anomal|leguminosa/i)
            expect(t).not.toMatch(/undefined|NaN/)
          }
  })

  it('la frase de puntos solo sale si le gana a repetir', () => {
    const con = armarPreset({ ...base, situacion: 'agua.cobertura', diferencia: 7, escenario: 'normal', aviso: 'ninguno' })
    expect(con).toContain('7 puntos')
    for (const d of [0, -3]) {
      const sin = armarPreset({ ...base, situacion: 'agua.cobertura', diferencia: d, escenario: 'normal', aviso: 'ninguno' })
      expect(sin).not.toMatch(/puntos|punto /)
    }
  })

  it('agrega la frase de anio y la del aviso', () => {
    const t = armarPreset({ ...base, situacion: 'tierra.repetir', diferencia: 0, escenario: 'seco', aviso: 'canicula' })
    expect(t).toMatch(/año sale seco/)
    expect(t).toMatch(/canícula/)
  })

  it('una situacion desconocida no lanza error', () => {
    for (const s of ['rara.graminea', 'rara', '', 'agua.cosa']) {
      const t = armarPreset({ ...base, situacion: s, diferencia: 3, escenario: 'normal', aviso: 'ninguno' })
      expect(t.length).toBeGreaterThan(20)
      expect(t).not.toMatch(/[{}]/)
    }
  })
})
