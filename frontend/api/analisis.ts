// POST /api/analisis  { entrada, rotacionId }  ->  NDJSON en vivo, una linea por evento:
// (`rotacionId` puede ser 'top3': Gemini explica las tres mejores juntas con el clima de la zona.)
//   { tipo: 'paso', id, texto }          lo que se esta haciendo (pasos en vivo)
//   { tipo: 'decision', decision }        resultado de Gemini Decision (llega en ~1 s)
//   { tipo: 'texto', delta }              trozos del analisis de Gemini
//   { tipo: 'fin' }                        Gemini termino
//   { tipo: 'error', causa, mensaje? }     sin_clave | cuota | clave | servidor | red | kharis
// El limite de 6 s y el resumen rapido los maneja el navegador (src/lib/decision/useAnalisis.ts).

import { validarEntrada } from '../src/lib/decision/motor.js'
import { LUGARES } from '../src/lib/decision/parametros.js'
import { TOP3, buscarRotacion, datosParaGemini, instruccionesGemini, pedidoPara } from '../src/lib/decision/textos.js'
import { traductor } from '../src/i18n/traductor.js'
import { ErrorGemini, geminiEnVivo, hayClave } from './_gemini.js'
import { decisionPara, historicoPara, json, leerCuerpo } from './_comun.js'
export { OPTIONS } from './_comun.js'

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request)
  const entrada = validarEntrada(cuerpo?.entrada)
  const rotacionId = typeof cuerpo?.rotacionId === 'string' ? cuerpo.rotacionId : null
  if (!entrada || !rotacionId) return json({ error: 'entrada_invalida' }, 400)

  const t = traductor(entrada.idioma)
  const codificador = new TextEncoder()
  const flujo = new ReadableStream<Uint8Array>({
    async start(control) {
      const enviar = (evento: unknown) => {
        try {
          control.enqueue(codificador.encode(JSON.stringify(evento) + '\n'))
        } catch {
          // El cliente ya cerro.
        }
      }
      try {
        enviar({ tipo: 'paso', id: 'datos', texto: t('gemini.pasoDatos', { lugar: LUGARES[entrada.zonaId].nombre }) })
        let decision
        try {
          decision = await decisionPara(entrada, request.url)
        } catch (e) {
          enviar({ tipo: 'error', causa: 'kharis', mensaje: String(e) })
          return
        }
        enviar({ tipo: 'paso', id: 'decision', texto: t('gemini.pasoDecision') })
        enviar({ tipo: 'decision', decision })
        if (rotacionId !== TOP3 && !buscarRotacion(decision, rotacionId)) {
          enviar({ tipo: 'error', causa: 'servidor', mensaje: t('gemini.rotacionDesconocida') })
          return
        }
        if (!hayClave()) {
          enviar({ tipo: 'error', causa: 'sin_clave' })
          return
        }
        enviar({ tipo: 'paso', id: 'gemini', texto: t(rotacionId === TOP3 ? 'geminiTop3.paso' : 'gemini.pasoGemini') })
        const historia = await historicoPara(decision, request.url)
        const pedido = {
          sistema: instruccionesGemini(entrada.idioma),
          mensajes: [
            {
              rol: 'user' as const,
              texto: `${datosParaGemini(decision, rotacionId)}${historia ? `\n\n${historia}` : ''}\n\n${pedidoPara(rotacionId, entrada.idioma, Boolean(historia))}`,
            },
          ],
          signal: request.signal,
        }
        for await (const delta of geminiEnVivo(pedido)) enviar({ tipo: 'texto', delta })
        enviar({ tipo: 'fin' })
      } catch (e) {
        const causa = e instanceof ErrorGemini ? e.causa : 'servidor'
        // El motivo queda en el registro del servidor (nunca lleva la clave); al navegador solo va la causa.
        if (causa !== 'cancelado') console.error(`[analisis] ${causa}: ${e instanceof Error ? e.message : String(e)}`)
        if (causa !== 'cancelado') enviar({ tipo: 'error', causa })
      } finally {
        try {
          control.close()
        } catch {
          // Ya cerrado.
        }
      }
    },
  })

  return new Response(flujo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
