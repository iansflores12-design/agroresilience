import { generar } from './_lib/gemini.js'
import { error, json, leerConfiguracion, leerPeticion, respuestaDeError, type Deps } from './_lib/http.js'
import { validarChat } from './_lib/tipos.js'
import { INSTRUCCION_CHAT, empaquetarDatos } from './_lib/instrucciones.js'

export const config = { maxDuration: 30 }

/** POST /api/chat { mensajes, contexto } -> { texto }. */
export async function manejar(peticion: Request, deps: Deps = {}): Promise<Response> {
  const leida = await leerPeticion(peticion)
  if ('respuesta' in leida) return leida.respuesta
  const cuerpo = validarChat(leida.valor)
  if (!cuerpo) return error(400, 'peticion')

  const cfg = leerConfiguracion(deps)
  if (!cfg.clave) return error(500, 'configuracion')

  // El contexto viaja dentro del ultimo mensaje de la persona, nunca en la instruccion de sistema.
  const ultimo = cuerpo.mensajes.length - 1
  const contenidos = cuerpo.mensajes.map((m, i) => ({
    role: m.rol === 'usuario' ? ('user' as const) : ('model' as const),
    parts: [
      {
        text:
          i === ultimo
            ? `${empaquetarDatos('Datos de la pantalla', cuerpo.contexto)}\n\nMensaje de la persona:\n${m.texto}`
            : m.texto,
      },
    ],
  }))

  try {
    const respuesta = await generar({
      clave: cfg.clave,
      modelo: cfg.modeloNormal,
      instruccion: INSTRUCCION_CHAT,
      contenidos,
      maxTokens: 500,
      temperatura: 0.4,
      tiempoMs: 25000,
      razonamiento: cfg.razonamiento,
      fetchFn: cfg.fetchFn,
    })
    return json(200, { texto: respuesta })
  } catch (e) {
    return respuestaDeError(e)
  }
}

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion)
  },
}
