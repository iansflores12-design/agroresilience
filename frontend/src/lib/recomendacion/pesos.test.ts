import { PESOS_ROTACION } from '../../datos/aptitud'
import { pesosDeEnfoques } from './pesos'
import { ENFOQUES } from './tipos'

const suma = (p: Record<string, number>) => Object.values(p).reduce((s, v) => s + v, 0)

describe('pesosDeEnfoques', () => {
  it('sin enfoques devuelve los pesos por defecto', () => {
    expect(pesosDeEnfoques([])).toEqual(PESOS_ROTACION)
  })

  it('siempre suman 1 y el enfoque elegido sube su parte', () => {
    for (const { id } of ENFOQUES) expect(suma(pesosDeEnfoques([id]))).toBeCloseTo(1)
    expect(suma(pesosDeEnfoques(['agua', 'venta']))).toBeCloseTo(1)
    const p = pesosDeEnfoques(['agua'])
    expect(p.agua).toBeGreaterThan(PESOS_ROTACION.agua)
    expect(p.agua / p.suelo).toBeCloseTo((PESOS_ROTACION.agua * 3) / PESOS_ROTACION.suelo)
    expect(pesosDeEnfoques(['seguro']).clima).toBeGreaterThan(PESOS_ROTACION.clima)
    expect(pesosDeEnfoques(['tierra']).suelo).toBeGreaterThan(PESOS_ROTACION.suelo)
    expect(pesosDeEnfoques(['venta']).venta).toBeGreaterThan(PESOS_ROTACION.venta)
  })
})
