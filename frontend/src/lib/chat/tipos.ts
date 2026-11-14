import type { MensajeChat } from '../../estado/Conversacion'

export interface ContextoChat {
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
