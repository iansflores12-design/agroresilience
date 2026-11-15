import type { MensajeChat } from '../../estado/Conversacion'
import type { EntradaDecision } from '../decision/tipos'

export interface ContextoChat {
  /** Consulta de Gemini Decision para el chat de seguimiento de una rotacion. */
  consulta?: { entrada: EntradaDecision; rotacionId: string }
  vista: 'cultivos' | 'mapa' | 'zona' | 'chat'
  cultivo: { id: string; nombre: string } | null
  edadSemanas: number | null
  etapa: string | null
  zona: { id: string; nombre: string; lat: number; lon: number } | null
  humedad: { valor: number; fecha: string; unidad: string } | null
}

export interface PeticionChat {
  mensajes: MensajeChat[]
  contexto: ContextoChat
  signal?: AbortSignal
}

export interface ClienteChat {
  enviar(p: PeticionChat): Promise<{ texto: string }>
}

export type CausaErrorChat = 'red' | 'servidor' | 'cancelado' | 'respuesta'

export class ErrorChat extends Error {
  readonly causa: CausaErrorChat

  constructor(causa: CausaErrorChat, mensaje?: string) {
    super(mensaje ?? `Error del chat: ${causa}`)
    this.name = 'ErrorChat'
    this.causa = causa
  }
}
