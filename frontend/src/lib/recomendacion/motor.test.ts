import { rotacionesPara } from '../../datos/aptitud'
import { candidatosPara, decisionDelMotor, escenarioParaPuntuar, validarDecision } from './motor'
import type { CandidatoDecision, PerspectivaResumen } from './tipos'

const persp = (seco: number, usable = true): PerspectivaResumen => ({
  temporada: 'Primera 2027',
  prob: { seco, normal: 1 - seco, lluvioso: 0 },
  conteo: { seco: 0, normal: 0, lluvioso: 0 },
  usable,
})

const cand = (id: string, total: number): CandidatoDecision => ({
  id,
  nombre: id,
  actual: false,
  total,
  porEscenario: { seco: total, normal: total, lluvioso: total },
  partes: [],
  tipoCambio: 'graminea',
})

describe('escenarioParaPuntuar', () => {
  it('usa seco solo con enfoque seguro, perspectiva usable y 40% o mas de seco', () => {
    expect(escenarioParaPuntuar('normal', ['seguro'], persp(0.4))).toBe('seco')
    expect(escenarioParaPuntuar('normal', ['seguro'], persp(0.39))).toBe('normal')
    expect(escenarioParaPuntuar('normal', ['seguro'], persp(0.9, false))).toBe('normal')
    expect(escenarioParaPuntuar('normal', ['agua'], persp(0.9))).toBe('normal')
    expect(escenarioParaPuntuar('lluvioso', ['seguro'], null)).toBe('lluvioso')
  })
})

describe('candidatosPara', () => {
  it('da las 3 mejores con puntaje por escenario y tipo de cambio', () => {
    const r = candidatosPara({ departamentoId: 'HN-CH', cultivoId: 'maiz', escenario: 'normal', enfoques: ['venta'], perspectiva: null })
    expect(r.escenarioUsado).toBe('normal')
    expect(r.candidatos).toHaveLength(3)
    expect(r.rotaciones).toHaveLength(6)
    for (const [i, c] of r.candidatos.entries()) {
      if (i > 0) expect(r.candidatos[i - 1].total).toBeGreaterThanOrEqual(c.total)
      expect(c.porEscenario.normal).toBe(c.total)
      expect(c.partes).toHaveLength(4)
    }
    expect(r.candidatos.find((c) => c.actual)?.tipoCambio ?? 'repetir').toBe('repetir')
  })

  it('con enfoque seguro y mucho riesgo de sequia puntua en seco', () => {
    const r = candidatosPara({ departamentoId: 'HN-CH', cultivoId: 'maiz', escenario: 'normal', enfoques: ['seguro'], perspectiva: persp(0.6) })
    expect(r.escenarioUsado).toBe('seco')
    expect(r.rotaciones.map((x) => x.total)).toEqual(
      rotacionesPara('HN-CH', 'maiz', 'seco', { pesos: { agua: 0.3 / 1.5, suelo: 0.25 / 1.5, clima: 0.75 / 1.5, venta: 0.2 / 1.5 } }).map((x) => x.total),
    )
  })

  it('sin cultivo no hay candidatos', () => {
    expect(candidatosPara({ departamentoId: 'HN-CH', cultivoId: null, escenario: 'normal', enfoques: [], perspectiva: null }).candidatos).toEqual([])
  })
})

describe('decisiones', () => {
  const lista = [cand('a', 80), cand('b', 75), cand('c', 60)]

  it('decisionDelMotor elige la de mayor total', () => {
    expect(decisionDelMotor(lista, ['agua', 'venta'])).toEqual({ rotacionId: 'a', enfoquePrincipal: 'agua', aviso: 'ninguno', origen: 'motor' })
    expect(decisionDelMotor(lista, []).enfoquePrincipal).toBeNull()
  })

  it('validarDecision cae al motor si la respuesta no es un objeto valido', () => {
    expect(validarDecision('hola', lista, []).origen).toBe('motor')
    expect(validarDecision(null, lista, []).origen).toBe('motor')
    expect(validarDecision({ rotacionId: 3 }, lista, []).origen).toBe('motor')
  })

  it('validarDecision cae al motor si el id no es candidato', () => {
    expect(validarDecision({ rotacionId: 'z', enfoquePrincipal: null, aviso: 'ninguno' }, lista, [])).toMatchObject({ rotacionId: 'a', origen: 'motor' })
  })

  it('validarDecision cae al motor si esta mas de 10 puntos abajo del mejor', () => {
    expect(validarDecision({ rotacionId: 'c' }, lista, [])).toMatchObject({ rotacionId: 'a', origen: 'motor' })
    expect(validarDecision({ rotacionId: 'b' }, lista, [])).toMatchObject({ rotacionId: 'b', origen: 'gemini' })
    expect(validarDecision({ rotacionId: 'c' }, [cand('a', 80), cand('c', 70)], [])).toMatchObject({ rotacionId: 'c', origen: 'gemini' })
  })

  it('validarDecision acepta una respuesta valida y normaliza campos fuera de lista', () => {
    expect(validarDecision({ rotacionId: 'b', enfoquePrincipal: 'venta', aviso: 'canicula' }, lista, [])).toEqual({
      rotacionId: 'b',
      enfoquePrincipal: 'venta',
      aviso: 'canicula',
      origen: 'gemini',
    })
    expect(validarDecision({ rotacionId: 'b', enfoquePrincipal: 'dinero', aviso: 'tormenta' }, lista, [])).toEqual({
      rotacionId: 'b',
      enfoquePrincipal: null,
      aviso: 'ninguno',
      origen: 'gemini',
    })
  })
})
