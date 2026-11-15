// POST /api/chat  { mensajes, contexto }  ->  { texto }
// Mismo contrato que src/lib/chat/clienteHttp.ts. Si `contexto.consulta` trae una consulta de
// Gemini Decision, el chat de seguimiento recibe su ranking y su evidencia.

import { validarEntrada } from '../src/lib/decision/motor.js'
import { datosParaGemini, instruccionesGemini } from '../src/lib/decision/textos.js'
import { normalizarIdioma, type Idioma } from '../src/i18n/idiomas.js'
import { traductor } from '../src/i18n/traductor.js'
import { ErrorGemini, geminiTexto, type MensajeGemini } from './_gemini.js'
import { decisionPara, historicoPara, json, leerCuerpo } from './_comun.js'
export { OPTIONS } from './_comun.js'

const MAX_MENSAJES = 20
// Lo que el chat sabe dibujar ademas de texto (ver src/pantallas/Chat/Enriquecido.tsx): `geminiTop3.piezasVisuales`.
const MAX_LARGO = 2000
/** Solo las ultimas fotos viajan a Gemini; las anteriores quedan como texto. */
const MAX_IMAGENES = 2
/** ~1.5 MB en base64: una foto de 1024 px comprimida pesa mucho menos. */
const MAX_IMAGEN = 1_500_000
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

/** Convierte el data URL de la foto en la parte inlineData de Gemini, o null si no es una imagen valida. */
export function imagenDe(valor: unknown): MensajeGemini['imagen'] | null {
  if (typeof valor !== 'string' || valor.length > MAX_IMAGEN) return null
  const m = DATA_URL.exec(valor)
  return m ? { mimeType: m[1], data: m[2] } : null
}

function contextoGeneral(c: Record<string, unknown>, idioma: Idioma): string {
  const t = traductor(idioma)
  const cultivo = (c.cultivo as { nombre?: string } | null)?.nombre
  const zona = (c.zona as { nombre?: string } | null)?.nombre
  const humedad = c.humedad as { valor?: number; fecha?: string } | null
  const lineas = [
    t('gemini.chatCultivo', {
      cultivo: cultivo ?? t('gemini.noEligio'),
      semana: typeof c.edadSemanas === 'number' ? t('gemini.chatSemana', { n: c.edadSemanas }) : '',
      etapa: typeof c.etapa === 'string' ? ` (${c.etapa})` : '',
    }),
    t('gemini.chatLugar', { lugar: zona ?? t('gemini.noEligio') }),
  ]
  if (humedad && typeof humedad.valor === 'number') {
    lineas.push(t('gemini.chatHumedad', { pct: Math.round(humedad.valor * 1000) / 10, fecha: humedad.fecha }))
  }
  return lineas.join('\n')
}

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request)
  const contexto = (cuerpo?.contexto ?? {}) as Record<string, unknown>
  const crudos = Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes : null
  if (!crudos) return json({ error: 'entrada_invalida' }, 400)

  const idiomaPrevio = normalizarIdioma(contexto.idioma ?? cuerpo?.idioma)
  const mensajes: MensajeGemini[] = crudos
    .filter((m): m is { rol: string; texto: string; imagen?: unknown } => typeof m?.texto === 'string' && (m.rol === 'usuario' || m.rol === 'asistente'))
    .slice(-MAX_MENSAJES)
    .map((m) => {
      const imagen = m.rol === 'usuario' ? imagenDe(m.imagen) : null
      const texto = m.texto.slice(0, MAX_LARGO)
      return {
        rol: m.rol === 'usuario' ? ('user' as const) : ('model' as const),
        texto: imagen && !texto.trim() ? traductor(idiomaPrevio)('gemini.fotoSinTexto') : texto,
        ...(imagen ? { imagen } : {}),
      }
    })
    .filter((m) => m.texto.trim() || m.imagen)
  // Solo las ultimas fotos viajan completas.
  let fotos = 0
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (!mensajes[i].imagen) continue
    if (++fotos > MAX_IMAGENES) delete mensajes[i].imagen
  }
  while (mensajes.length && mensajes[0].rol !== 'user') mensajes.shift()
  if (!mensajes.length) return json({ error: 'sin_pregunta' }, 400)

  const idioma = idiomaPrevio
  const t = traductor(idioma)
  let datos = contextoGeneral(contexto, idioma)
  const consulta = contexto.consulta as { entrada?: unknown; rotacionId?: unknown } | undefined
  const entrada = validarEntrada(consulta?.entrada)
  if (entrada && !entrada.idioma) entrada.idioma = idioma
  if (entrada && typeof consulta?.rotacionId === 'string') {
    try {
      const decision = await decisionPara(entrada, request.url)
      const historia = await historicoPara(decision, request.url)
      datos = datosParaGemini(decision, consulta.rotacionId) + (historia ? `\n\n${historia}` : '')
    } catch {
      // Sin Kharis se responde con el contexto general.
    }
  }

  try {
    const texto = await geminiTexto({
      sistema: `${instruccionesGemini(idioma)}\n${t('gemini.limiteChat')}\n${t('geminiTop3.piezasVisuales')}${fotos ? `\n${t('gemini.instruccionFoto')}` : ''}\n\n${t('gemini.datosConsulta')}\n${datos}`,
      mensajes,
      signal: request.signal,
      maxTokens: 3000,
    })
    return json({ texto })
  } catch (e) {
    const causa = e instanceof ErrorGemini ? e.causa : 'servidor'
    console.error(`[chat] ${causa}: ${e instanceof Error ? e.message : String(e)}`)
    return json({ error: causa }, causa === 'cuota' ? 429 : causa === 'sin_clave' ? 503 : 502)
  }
}
