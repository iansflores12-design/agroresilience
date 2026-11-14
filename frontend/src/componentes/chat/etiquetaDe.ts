import type { MensajeChat } from '../../estado/Conversacion'

/** Etiqueta honesta de cada mensaje del asistente: el texto guardado no se hace pasar por el asistente. */
export function etiquetaDe(m: MensajeChat): string | null {
  if (m.rol === 'usuario') return null
  return m.origen === 'preset' ? 'Texto guardado' : 'Asistente'
}
