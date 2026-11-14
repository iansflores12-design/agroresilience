import { generarFlujo } from './_lib/gemini.js'
import { error, leerConfiguracion, leerPeticion, respuestaDeError, texto, type Deps } from './_lib/http.js'
import { validarExplicacion } from './_lib/tipos.js'
import { INSTRUCCION_EXPLICACION, empaquetarDatos } from './_lib/instrucciones.js'

export const config = { maxDuration: 30 }

/** POST /api/explicacion -> texto plano en flujo: resumen, linea "---", detalle. */
export async function manejar(peticion: Request, deps: Deps = {}): Promise<Response> {
  const leida = await leerPeticion(peticion)
  if ('respuesta' in leida) return leida.respuesta
  const cuerpo = validarExplicacion(leida.valor)
  if (!cuerpo) return error(400, 'peticion')

  const cfg = leerConfiguracion(deps)
  if (!cfg.clave) return error(500, 'configuracion')

  try {
    const flujo = await generarFlujo({
      clave: cfg.clave,
      modelo: cfg.modeloNormal,
      instruccion: INSTRUCCION_EXPLICACION,
      contenidos: [{ role: 'user', parts: [{ text: empaquetarDatos('Datos para explicar', cuerpo) }] }],
      maxTokens: 450,
      temperatura: 0.4,
      tiempoMs: 25000,
      razonamiento: cfg.razonamiento,
      fetchFn: cfg.fetchFn,
    })
    return texto(flujo)
  } catch (e) {
    return respuestaDeError(e)
  }
}

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion)
  },
}
