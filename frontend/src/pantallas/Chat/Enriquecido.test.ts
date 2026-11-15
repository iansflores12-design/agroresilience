import { partirMensaje } from './Enriquecido'

describe('partirMensaje', () => {
  it('deja el texto solo cuando no hay etiquetas', () => {
    expect(partirMensaje('Siembre en mayo.')).toEqual([{ tipo: 'texto', texto: 'Siembre en mayo.' }])
  })

  it('saca el mapa y la animación, con sus barras', () => {
    const trozos = partirMensaje('El maíz se da así:\n[[mapa:maiz]]\nY el agua:\n[[animacion:El agua del maíz|Llueve en mayo|La lluvia cubre=72|Riegue en la floración]]')
    expect(trozos.map((t) => t.tipo)).toEqual(['texto', 'mapa', 'texto', 'animacion'])
    expect(trozos[1]).toEqual({ tipo: 'mapa', cultivoId: 'maiz' })
    expect(trozos[3]).toEqual({
      tipo: 'animacion',
      titulo: 'El agua del maíz',
      pasos: [
        { texto: 'Llueve en mayo', valor: null },
        { texto: 'La lluvia cubre', valor: 72 },
        { texto: 'Riegue en la floración', valor: null },
      ],
    })
  })

  it('descarta etiquetas de cultivos desconocidos o animaciones sin pasos, sin mostrarlas en crudo', () => {
    expect(partirMensaje('Hola [[mapa:cafe]] [[animacion:Solo título]] adiós')).toEqual([
      { tipo: 'texto', texto: 'Hola' },
      { tipo: 'texto', texto: 'adiós' },
    ])
  })
})

describe('partirMensaje con fenomenos', () => {
  it('reconoce [[fenomeno:ID]] y descarta los desconocidos', () => {
    expect(partirMensaje('Mire:\n[[fenomeno:nino]]\n[[fenomeno:volcan]]')).toEqual([
      { tipo: 'texto', texto: 'Mire:' },
      { tipo: 'fenomeno', fenomeno: 'nino' },
    ])
  })
})
