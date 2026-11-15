import { traductor } from '../../i18n/traductor'
import type { ContextoChat } from '../../lib/chat/tipos'

/** Sugerencias armadas con lo que el asistente ve; generales si falta cultivo o zona. */
export function armarSugerencias(c: ContextoChat): string[] {
  const t = traductor(c.idioma)
  const s = (clave: string, datos: Record<string, unknown> = {}) => t(`chat.sugerencias.${clave}`, datos)
  const cultivo = c.cultivo ? c.cultivo.nombre.toLocaleLowerCase(c.idioma ?? 'es') : null
  const zona = c.zona?.nombre ?? null
  const semana = c.edadSemanas ?? 0
  if (cultivo && zona) {
    return [s('humedadPara', { zona, cultivo }), s('masSeca', { zona }), s('cuidados', { cultivo, semana }), s('rotacion', { cultivo })]
  }
  if (cultivo) {
    return [s('cuidados', { cultivo, semana }), s('rotacion', { cultivo }), s('faltaAgua', { cultivo }), s('zonaPrimero')]
  }
  if (zona) {
    return [s('humedadEn', { zona }), s('masSeca', { zona }), s('cultivosEn', { zona }), s('datos')]
  }
  return [s('queEsHumedad'), s('queEsRotacion'), s('leerMapa'), s('datos')]
}

/**
 * Preguntas para seguir la conversación después de una respuesta: dependen de si la última pregunta
 * traía foto y del cultivo elegido, y nunca repiten algo que el productor ya preguntó.
 */
export function armarSeguimiento(c: ContextoChat, ultimaPregunta: { texto: string; imagen?: string } | null, yaPreguntadas: string[]): string[] {
  const t = traductor(c.idioma)
  const s = (clave: string, datos: Record<string, unknown> = {}) => t(`chat.seguir.${clave}`, datos)
  const cultivo = c.cultivo ? c.cultivo.nombre.toLocaleLowerCase(c.idioma ?? 'es') : null
  const candidatas = ultimaPregunta?.imagen
    ? [s('fotoTratamiento'), s('fotoEvitar'), s('simple')]
    : [s('estaSemana'), s('simple'), cultivo ? s('plagas', { cultivo }) : s('sinLluvia'), s('sinLluvia'), s('fenomeno'), s('costo')]
  const usadas = new Set(yaPreguntadas.map((p) => p.trim().toLocaleLowerCase()))
  return [...new Set(candidatas)].filter((p) => !usadas.has(p.toLocaleLowerCase())).slice(0, 3)
}
