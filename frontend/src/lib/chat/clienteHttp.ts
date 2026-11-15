import { recortarImagenes } from './imagen'
import { ErrorChat, type ClienteChat } from './tipos'

/** Cliente del backend: POST {urlBase}/chat con { mensajes, contexto }; responde { texto }. */
export function crearClienteHttp(urlBase: string): ClienteChat {
  const url = `${urlBase.replace(/\/+$/, '')}/chat`
  return {
    async enviar({ mensajes, contexto, signal }) {
      let respuesta: Response
      try {
        respuesta = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensajes: recortarImagenes(mensajes), contexto }),
          signal,
        })
      } catch (e) {
        if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          throw new ErrorChat('cancelado', 'Peticion cancelada')
        }
        throw new ErrorChat('red', 'No hubo conexion con el servidor')
      }
      if (!respuesta.ok) throw new ErrorChat('servidor', `El servidor respondio ${respuesta.status}`)
      let dato: unknown
      try {
        dato = await respuesta.json()
      } catch (e) {
        if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          throw new ErrorChat('cancelado', 'Peticion cancelada')
        }
        throw new ErrorChat('respuesta', 'La respuesta no es JSON')
      }
      const texto = (dato as { texto?: unknown } | null)?.texto
      if (typeof texto !== 'string') throw new ErrorChat('respuesta', 'La respuesta no trae "texto"')
      return { texto }
    },
  }
}
