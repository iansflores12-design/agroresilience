import { generar } from './_lib/gemini.js'
import { error, json, leerConfiguracion, leerPeticion, respuestaDeError, type Deps } from './_lib/http.js'
import { AVISOS, ENFOQUES, validarDecision, type AvisoDecision, type Enfoque } from './_lib/tipos.js'
import { INSTRUCCION_DECISION, empaquetarDatos } from './_lib/instrucciones.js'

export const config = { maxDuration: 10 }

/** POST /api/decision -> { rotacionId, enfoquePrincipal, aviso }. Logica pura, probable sin Vercel. */
export async function manejar(peticion: Request, deps: Deps = {}): Promise<Response> {
  const leida = await leerPeticion(peticion)
  if ('respuesta' in leida) return leida.respuesta
  const cuerpo = validarDecision(leida.valor)
  if (!cuerpo) return error(400, 'peticion')

  // Con un solo candidato no hay nada que decidir: no se llama al modelo.
  if (cuerpo.candidatos.length === 1) {
    return json(200, {
      rotacionId: cuerpo.candidatos[0].id,
      enfoquePrincipal: cuerpo.enfoques[0] ?? null,
      aviso: 'ninguno' satisfies AvisoDecision,
    })
  }

  const cfg = leerConfiguracion(deps)
  if (!cfg.clave) return error(500, 'configuracion')

  const ids = cuerpo.candidatos.map((c) => c.id)
  const esquema = {
    type: 'object',
    properties: {
      rotacionId: { type: 'string', enum: ids },
      enfoquePrincipal: { type: 'string', enum: [...ENFOQUES, 'ninguno'] },
      aviso: { type: 'string', enum: [...AVISOS] },
    },
    required: ['rotacionId', 'enfoquePrincipal', 'aviso'],
  }
  const { contexto, enfoques, escenario, candidatos, perspectiva, textoLibre } = cuerpo

  let salida: unknown
  try {
    const crudo = await generar({
      clave: cfg.clave,
      modelo: cfg.modeloDecision,
      instruccion: INSTRUCCION_DECISION,
      contenidos: [
        {
          role: 'user',
          parts: [
            {
              text: empaquetarDatos('Datos para decidir', { contexto, enfoques, escenario, candidatos, perspectiva, textoLibre }),
            },
          ],
        },
      ],
      maxTokens: 80,
      temperatura: 0,
      tiempoMs: 4000,
      razonamiento: cfg.razonamiento,
      esquema,
      fetchFn: cfg.fetchFn,
    })
    salida = JSON.parse(crudo)
  } catch (e) {
    return respuestaDeError(e)
  }

  const s = salida as { rotacionId?: unknown; enfoquePrincipal?: unknown; aviso?: unknown } | null
  if (!s || typeof s.rotacionId !== 'string' || !ids.includes(s.rotacionId)) return error(502, 'modelo')
  if (!(AVISOS as readonly unknown[]).includes(s.aviso)) return error(502, 'modelo')
  // El enfoque principal debe ser uno de los que la persona eligio; si no, queda en null.
  const enfoque = enfoques.includes(s.enfoquePrincipal as Enfoque) ? (s.enfoquePrincipal as Enfoque) : null
  return json(200, { rotacionId: s.rotacionId, enfoquePrincipal: enfoque, aviso: s.aviso as AvisoDecision })
}

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion)
  },
}
