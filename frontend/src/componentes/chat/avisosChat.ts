import { avisar } from '../../lib/avisos'
import { ErrorChat } from '../../lib/chat'

const CLAVE_AVISO_DEMO = 'agroresilience.chat.demo.avisado'

/** Avisa una vez por sesion que las respuestas son locales (modo demostracion). */
export function avisarDemoUnaVez(descripcion = 'Las respuestas son locales: el asistente real se conectará al backend.') {
  try {
    if (window.sessionStorage.getItem(CLAVE_AVISO_DEMO)) return
    window.sessionStorage.setItem(CLAVE_AVISO_DEMO, '1')
  } catch {
    // Sin sessionStorage se avisa en cada carga de la pagina.
  }
  avisar.info({
    titulo: 'Modo de demostración',
    descripcion,
  })
}

export function descripcionError(e: unknown): string {
  if (e instanceof ErrorChat) {
    if (e.causa === 'red') return 'Revisa tu conexión e inténtalo de nuevo.'
    if (e.causa === 'servidor') return 'El servidor no pudo responder en este momento.'
    if (e.causa === 'respuesta') return 'El servidor envió una respuesta que no se entiende.'
  }
  return 'Inténtalo de nuevo.'
}
