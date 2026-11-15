// POST /api/chat  { mensajes, contexto }  ->  { texto }
// Mismo contrato que src/lib/chat/clienteHttp.ts. Si `contexto.consulta` trae una consulta de
// Gemini Decision, el chat de seguimiento recibe su ranking y su evidencia.

import { validarEntrada } from '../src/lib/decision/motor.js'
import { INSTRUCCIONES_GEMINI, datosParaGemini } from '../src/lib/decision/textos.js'
import { ErrorGemini, geminiTexto, type MensajeGemini } from './_gemini.js'
import { decisionPara, json, leerCuerpo } from './_comun.js'

const MAX_MENSAJES = 20
const MAX_LARGO = 2000

function contextoGeneral(c: Record<string, unknown>): string {
  const cultivo = (c.cultivo as { nombre?: string } | null)?.nombre
  const zona = (c.zona as { nombre?: string } | null)?.nombre
  const humedad = c.humedad as { valor?: number; fecha?: string } | null
  const lineas = [
    `Cultivo: ${cultivo ?? 'no eligió'}${typeof c.edadSemanas === 'number' ? `, semana ${c.edadSemanas}` : ''}${typeof c.etapa === 'string' ? ` (${c.etapa})` : ''}.`,
    `Lugar: ${zona ?? 'no eligió'}.`,
  ]
  if (humedad && typeof humedad.valor === 'number') {
    lineas.push(`Humedad del suelo (SMAP, primeros 5 cm): ${Math.round(humedad.valor * 1000) / 10} % el ${humedad.fecha}.`)
  }
  return lineas.join('\n')
}

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request)
  const contexto = (cuerpo?.contexto ?? {}) as Record<string, unknown>
  const crudos = Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes : null
  if (!crudos) return json({ error: 'entrada_invalida' }, 400)

  const mensajes: MensajeGemini[] = crudos
    .filter((m): m is { rol: string; texto: string } => typeof m?.texto === 'string' && (m.rol === 'usuario' || m.rol === 'asistente'))
    .slice(-MAX_MENSAJES)
    .map((m) => ({ rol: m.rol === 'usuario' ? 'user' : 'model', texto: m.texto.slice(0, MAX_LARGO) }))
  while (mensajes.length && mensajes[0].rol !== 'user') mensajes.shift()
  if (!mensajes.length) return json({ error: 'sin_pregunta' }, 400)

  let datos = contextoGeneral(contexto)
  const consulta = contexto.consulta as { entrada?: unknown; rotacionId?: unknown } | undefined
  const entrada = validarEntrada(consulta?.entrada)
  if (entrada && typeof consulta?.rotacionId === 'string') {
    try {
      datos = datosParaGemini(await decisionPara(entrada, request.url), consulta.rotacionId)
    } catch {
      // Sin Kharis se responde con el contexto general.
    }
  }

  try {
    const texto = await geminiTexto({
      sistema: `${INSTRUCCIONES_GEMINI}\nResponde en 120 palabras o menos.\n\nDatos de la consulta:\n${datos}`,
      mensajes,
      signal: request.signal,
    })
    return json({ texto })
  } catch (e) {
    const causa = e instanceof ErrorGemini ? e.causa : 'servidor'
    return json({ error: causa }, causa === 'cuota' ? 429 : causa === 'sin_clave' ? 503 : 502)
  }
}
