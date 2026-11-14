import type { ContextoChat } from '../chat/tipos'
import type { Escenario } from '../../datos/aptitud'
import type { CandidatoDecision, Enfoque, PerspectivaResumen } from './tipos'

/** Lo que recibe POST {VITE_API_URL}/decision (contrato de api/_lib/tipos.ts). */
export interface PeticionDecision {
  contexto: ContextoChat
  enfoques: Enfoque[]
  escenario: Escenario
  candidatos: CandidatoDecision[]
  perspectiva: PerspectivaResumen | null
}

/** Lo que recibe POST {VITE_API_URL}/explicacion: lo mismo mas la decision y el texto guardado. */
export interface PeticionExplicacion extends PeticionDecision {
  decision: { rotacionId: string; enfoquePrincipal: Enfoque | null; aviso: string; origen: 'gemini' | 'motor' }
  preset: string
}

/** URL base del backend (`VITE_API_URL`); vacia = modo demostracion. */
export function urlBaseApi(): string {
  const v: unknown = import.meta.env.VITE_API_URL
  return typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
}

/** POST /decision. Devuelve el JSON sin validar (validarDecision lo revisa); lanza si falla la red o el servidor. */
export async function pedirDecision(urlBase: string, peticion: PeticionDecision, signal?: AbortSignal): Promise<unknown> {
  const respuesta = await fetch(`${urlBase.replace(/\/+$/, '')}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(peticion),
    signal,
  })
  if (!respuesta.ok) throw new Error(`El servidor respondio ${respuesta.status}`)
  return respuesta.json()
}
