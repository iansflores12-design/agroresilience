import { buscarCultivo, cultivos, etapaEnSemana } from './cultivos'
import { rotaciones } from './rotaciones'

describe('cultivos', () => {
  it('cada cultivo tiene etapas contiguas que cubren todo el ciclo', () => {
    for (const c of cultivos) {
      expect(c.etapas[0].desdeSemana).toBe(0)
      expect(c.etapas[c.etapas.length - 1].hastaSemana).toBe(c.cicloSemanas)
      c.etapas.slice(1).forEach((e, i) => expect(e.desdeSemana).toBe(c.etapas[i].hastaSemana + 1))
    }
  })

  it('buscarCultivo devuelve el cultivo o null', () => {
    expect(buscarCultivo(cultivos[0].id)).toBe(cultivos[0])
    expect(buscarCultivo('no-existe')).toBeNull()
    expect(buscarCultivo(null)).toBeNull()
  })

  it('etapaEnSemana respeta los limites de cada etapa y satura fuera de rango', () => {
    const c = cultivos[0]
    for (const e of c.etapas) {
      expect(etapaEnSemana(c, e.desdeSemana)).toBe(e)
      expect(etapaEnSemana(c, e.hastaSemana)).toBe(e)
    }
    expect(etapaEnSemana(c, -3)).toBe(c.etapas[0])
    expect(etapaEnSemana(c, c.cicloSemanas + 10)).toBe(c.etapas[c.etapas.length - 1])
  })

  it('las rotaciones solo usan cultivos existentes y meses validos', () => {
    expect(rotaciones).toHaveLength(4)
    for (const r of rotaciones) {
      for (const p of r.pasos) {
        expect(buscarCultivo(p.cultivoId)).not.toBeNull()
        expect(p.mesInicio).toBeGreaterThanOrEqual(1)
        expect(p.mesFin).toBeLessThanOrEqual(12)
      }
    }
  })
})
