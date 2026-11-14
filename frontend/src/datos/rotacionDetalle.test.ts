import { detalleRotacion } from './rotacionDetalle'

describe('detalleRotacion', () => {
  it('devuelve 4 bloques con fuentes para un par valido', () => {
    const d = detalleRotacion('maiz', 'frijol')
    expect(d).not.toBeNull()
    expect(d!.bloques).toHaveLength(4)
    for (const b of d!.bloques) expect(b.fuentes.length).toBeGreaterThanOrEqual(1)
    expect(d!.fuentes.length).toBeGreaterThan(0)
  })

  it('devuelve null para ids desconocidos o ausentes', () => {
    expect(detalleRotacion('nada', 'maiz')).toBeNull()
    expect(detalleRotacion('maiz', 'nada')).toBeNull()
    expect(detalleRotacion(null, 'maiz')).toBeNull()
    expect(detalleRotacion('maiz', undefined)).toBeNull()
  })
})
