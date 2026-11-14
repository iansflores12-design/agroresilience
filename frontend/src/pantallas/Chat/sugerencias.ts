import type { ContextoChat } from '../../lib/chat/tipos'

function minusculas(texto: string): string {
  return texto.toLocaleLowerCase('es')
}

/** Sugerencias armadas con lo que el asistente ve; generales si falta cultivo o zona. */
export function armarSugerencias(c: ContextoChat): string[] {
  const cultivo = c.cultivo ? minusculas(c.cultivo.nombre) : null
  const zona = c.zona?.nombre ?? null
  if (cultivo && zona) {
    return [
      `¿Cómo está la humedad en ${zona} para ${cultivo}?`,
      `¿Está ${zona} más seca de lo normal?`,
      `¿Qué cuidados necesita el cultivo de ${cultivo} en la semana ${c.edadSemanas ?? 0}?`,
      `¿Qué rotación me conviene después de ${cultivo}?`,
    ]
  }
  if (cultivo) {
    return [
      `¿Qué cuidados necesita el cultivo de ${cultivo} en la semana ${c.edadSemanas ?? 0}?`,
      `¿Qué rotación me conviene después de ${cultivo}?`,
      `¿Cómo afecta la falta de agua al cultivo de ${cultivo}?`,
      '¿Qué zona me conviene revisar primero?',
    ]
  }
  if (zona) {
    return [
      `¿Cómo está la humedad en ${zona}?`,
      `¿Está ${zona} más seca de lo normal?`,
      `¿Qué cultivos conviene considerar en ${zona}?`,
      '¿De dónde vienen los datos de humedad?',
    ]
  }
  return [
    '¿Qué es la humedad del suelo y por qué importa?',
    '¿Qué es una rotación de cultivos?',
    '¿Cómo leo el mapa de zonas?',
    '¿De dónde vienen los datos de humedad?',
  ]
}
