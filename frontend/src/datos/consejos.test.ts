import { departamentos, ranking, type Escenario } from './aptitud'
import { consejosPara } from './consejos'

const ESCENARIOS: Escenario[] = ['seco', 'normal', 'lluvioso']
const CULTIVOS = ['maiz', 'frijol', 'sorgo', 'arroz', 'tomate', 'frijol-terciopelo']
const PROHIBIDAS = [/evapotranspiraci/i, /percentil/i, /anomal/i, /m3\/m3/i, /fertilizante/i, /dosis/i, /kg\/ha/i]
const EMOJIS = /\p{Extended_Pictographic}/u

describe('consejosPara', () => {
  it('devuelve de 3 a 5 consejos para cualquier departamento, cultivo y tipo de año', () => {
    for (const d of departamentos) {
      for (const c of CULTIVOS) {
        for (const e of ESCENARIOS) {
          const lista = consejosPara(d.id, c, e)
          expect(lista.length).toBeGreaterThanOrEqual(3)
          expect(lista.length).toBeLessThanOrEqual(5)
          expect(new Set(lista.map((x) => x.id)).size).toBe(lista.length)
        }
      }
    }
  })

  it('siempre termina con el consejo de hablar con el técnico', () => {
    for (const d of departamentos) {
      const lista = consejosPara(d.id, 'maiz', 'normal')
      expect(lista.at(-1)).toMatchObject({ id: 'tecnico', tema: 'cultivo' })
      expect(lista.at(-1)!.texto).toMatch(/técnico agrícola/)
    }
  })

  it('cambia con el tipo de año', () => {
    const seco = consejosPara('HN-CH', 'maiz', 'seco')
    const lluvioso = consejosPara('HN-CH', 'maiz', 'lluvioso')
    expect(seco).not.toEqual(lluvioso)
    expect(seco.map((x) => x.id)).toContain('ano-seco')
    expect(lluvioso.map((x) => x.id)).not.toContain('ano-seco')
  })

  it('con la canícula como parte más débil aconseja cuidar la floración', () => {
    const lista = consejosPara('HN-CH', 'maiz', 'seco')
    const canicula = lista.find((x) => x.id === 'canicula')!
    expect(canicula.tema).toBe('siembra')
    expect(canicula.texto).toMatch(/floración/)
    expect(canicula.detalle).toMatch(/Canícula esperada: 45 días/)
  })

  it('con poca agua en la tierra aconseja dejar cobertura', () => {
    expect(consejosPara('HN-VA', 'maiz', 'normal').map((x) => x.id)).toContain('tierra-cobertura')
    expect(consejosPara('HN-GD', 'maiz', 'normal').map((x) => x.id)).not.toContain('tierra-cobertura')
  })

  it('si el puntaje es difícil, sugiere pensar en otro cultivo', () => {
    const peor = ranking('arroz', 'normal').at(-1)!
    expect(peor.nivel).toBe('dificil')
    expect(consejosPara(peor.id, 'arroz', 'normal')[0].id).toBe('otro-cultivo')
  })

  it('no usa jerga, dosis ni emojis, y explica el pH en palabras de campo', () => {
    for (const d of departamentos) {
      for (const c of CULTIVOS) {
        for (const e of ESCENARIOS) {
          for (const x of consejosPara(d.id, c, e)) {
            const todo = `${x.titulo} ${x.texto} ${x.detalle}`
            for (const p of PROHIBIDAS) expect(todo).not.toMatch(p)
            expect(todo).not.toMatch(EMOJIS)
            expect(`${x.titulo} ${x.texto}`).not.toMatch(/\bpH\b/)
            expect(x.titulo.length).toBeGreaterThan(0)
            expect(x.detalle.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('devuelve [] sin departamento, sin cultivo o con un cultivo sin puntaje', () => {
    expect(consejosPara(null, 'maiz', 'normal')).toEqual([])
    expect(consejosPara('HN-CH', null, 'normal')).toEqual([])
    expect(consejosPara('HN-CH', 'cafe', 'normal')).toEqual([])
    expect(consejosPara('HN-XX', 'maiz', 'normal')).toEqual([])
  })

  it('es determinista', () => {
    expect(consejosPara('HN-OL', 'frijol', 'seco')).toEqual(consejosPara('HN-OL', 'frijol', 'seco'))
  })
})
