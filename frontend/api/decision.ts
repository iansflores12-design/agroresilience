// POST /api/decision  { entrada }  ->  Decision (gemini-decision.v1)
// Gemini Decision: ranking de rotaciones con el pronostico de Kharis. Determinista y rapido.

import { validarEntrada } from '../src/lib/decision/motor.js'
import { decisionPara, json, leerCuerpo } from './_comun.js'
export { OPTIONS } from './_comun.js'

export async function POST(request: Request): Promise<Response> {
  const cuerpo = await leerCuerpo(request)
  const entrada = validarEntrada(cuerpo?.entrada)
  if (!entrada) return json({ error: 'entrada_invalida' }, 400)
  try {
    return json(await decisionPara(entrada, request.url))
  } catch (e) {
    return json({ error: 'kharis', mensaje: String(e) }, 502)
  }
}
