// CONTENIDO ILUSTRATIVO para la interfaz. Pendiente de validacion con el equipo agronomico:
// las secuencias son ejemplos del calendario de referencia, no recomendaciones de campo.
// Temporadas de Honduras: primera de mayo a agosto, postrera de septiembre a diciembre,
// verano de enero a abril.

export interface PasoRotacion {
  cultivoId: string
  temporada: 'primera' | 'postrera' | 'verano'
  /** Meses de 1 a 12. */
  mesInicio: number
  mesFin: number
}

export interface Rotacion {
  id: string
  nombre: string
  resumen: string
  beneficio: string
  pasos: PasoRotacion[]
}

const primera = (cultivoId: string): PasoRotacion => ({ cultivoId, temporada: 'primera', mesInicio: 5, mesFin: 8 })
const postrera = (cultivoId: string): PasoRotacion => ({ cultivoId, temporada: 'postrera', mesInicio: 9, mesFin: 12 })
const verano = (cultivoId: string): PasoRotacion => ({ cultivoId, temporada: 'verano', mesInicio: 1, mesFin: 4 })

export const rotaciones: Rotacion[] = [
  {
    id: 'milpa-ladera',
    nombre: 'Milpa de ladera',
    resumen: 'Maíz de primera, frijol de postrera y frijol terciopelo en verano.',
    beneficio: 'La cobertura de verano protege el suelo de la ladera y aporta nitrógeno.',
    pasos: [primera('maiz'), postrera('frijol'), verano('frijol-terciopelo')],
  },
  {
    id: 'granos-corredor-seco',
    nombre: 'Granos del corredor seco',
    resumen: 'Maíz de primera y sorgo de postrera.',
    beneficio: 'El sorgo aguanta mejor la falta de agua al final de la temporada.',
    pasos: [primera('maiz'), postrera('sorgo')],
  },
  {
    id: 'valle-riego',
    nombre: 'Valle con riego',
    resumen: 'Arroz de primera, frijol de postrera y tomate en verano.',
    beneficio: 'Alterna cultivos de agua abundante con leguminosa y hortaliza.',
    pasos: [primera('arroz'), postrera('frijol'), verano('tomate')],
  },
  {
    id: 'hortaliza-grano',
    nombre: 'Hortaliza y grano',
    resumen: 'Tomate en verano, maíz de primera y frijol de postrera.',
    beneficio: 'Reparte el uso de agua y de nutrientes entre hortaliza, grano y leguminosa.',
    pasos: [verano('tomate'), primera('maiz'), postrera('frijol')],
  },
]
