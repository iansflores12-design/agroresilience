// POST /api/chat  { mensajes, contexto }  ->  { texto }
// Mismo contrato que src/lib/chat/clienteHttp.ts. Si `contexto.consulta` trae una consulta de
// Gemini Decision, el chat de seguimiento recibe su ranking y su evidencia.

import { validarEntrada } from '../src/lib/decision/motor.js'
import { INSTRUCCIONES_GEMINI, datosParaGemini } from '../src/lib/decision/textos.js'
import { ErrorGemini, geminiTexto, type MensajeGemini } from './_gemini.js'
import { decisionPara, json, leerCuerpo } from './_comun.js'

const MAX_MENSAJES = 20

// Lo que el chat sabe dibujar ademas de texto (ver src/pantallas/Chat/Enriquecido.tsx).
const PIEZAS_VISUALES = `Además del texto, puedes pedir dos piezas visuales, cada una en una línea propia y escrita exactamente así:
[[mapa:ID]] muestra el mapa de Honduras con qué tan bien se da ese cultivo. ID es uno de: maiz, frijol, sorgo, arroz, tomate, frijol-terciopelo.
[[animacion:Título corto|Paso uno|Paso dos|Paso tres]] muestra una explicación animada, paso a paso (de 2 a 5 pasos cortos). Un paso puede terminar en =NÚMERO (de 0 a 100) para dibujar una barra, por ejemplo "Lluvia que cubre lo que pide el maíz=72"; usa solo números que estén en los datos.
Usa el mapa cuando pregunten dónde se da un cultivo o pidan ver el mapa. Usa la animación cuando pidan una explicación animada, con efectos o paso a paso. Si no las piden, responde solo con texto. No uses otras etiquetas.`
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
      sistema: `${INSTRUCCIONES_GEMINI}\nResponde en 80 palabras o menos.\n${PIEZAS_VISUALES}\n\nDatos de la consulta:\n${datos}`,
      mensajes,
      signal: request.signal,
      maxTokens: 700,
    })
    return json({ texto })
  } catch (e) {
    const causa = e instanceof ErrorGemini ? e.causa : 'servidor'
    console.error(`[chat] ${causa}: ${e instanceof Error ? e.message : String(e)}`)
    return json({ error: causa }, causa === 'cuota' ? 429 : causa === 'sin_clave' ? 503 : 502)
  }
}
