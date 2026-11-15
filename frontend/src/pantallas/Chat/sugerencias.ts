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
