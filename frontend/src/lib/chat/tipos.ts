import type { Escenario } from '../../datos/aptitud'
import type { MensajeChat } from '../../estado/Conversacion'
import type { Enfoque, PerspectivaResumen } from '../recomendacion/tipos'

export interface ContextoChat {
  vista: 'cultivos' | 'mapa' | 'zona' | 'chat'
  cultivo: { id: string; nombre: string } | null
  edadSemanas: number | null
  etapa: string | null
  zona: { id: string; nombre: string; lat: number; lon: number } | null
  humedad: { valor: number; fecha: string; unidad: string } | null
  /** Rotacion que se le recomendo en la portada, si hubo una. */
  recomendacion?: {
    rotacion: { id: string; nombre: string }
    enfoques: Enfoque[]
    escenario: Escenario
    origen: 'gemini' | 'motor'
  } | null
  /** Como viene el ano en su zona, si hay dato. */
  perspectiva?: PerspectivaResumen | null
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
