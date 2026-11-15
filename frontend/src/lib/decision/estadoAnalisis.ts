// Linea de tiempo del analisis (ver docs: "Qué ve el usuario según el tiempo").
//
//   Rapido: pasos en vivo -> analisis a fondo en pantalla (en vivo) -> chat.
//   Lento:  pasos en vivo -> al limite, resumen rapido -> Gemini termina: analisis listo + aviso -> chat.
//   Falla:  se queda el resumen rapido con boton de reintento. Un intento fallido no cuenta en la cuota.

import type { CausaAnalisis, EventoServidor } from './cliente'
import type { Decision } from './tipos'

/** Si el primer texto de Gemini no llega antes de esto, se muestra el resumen rapido. */
export const LIMITE_MS = 6000

export type Fase = 'pasos' | 'escribiendo' | 'resumen' | 'listo' | 'fallo'

export interface PasoVivo {
  id: string
  texto: string
  hecho: boolean
}

export interface EstadoAnalisis {
  fase: Fase
  pasos: PasoVivo[]
  texto: string
  decision: Decision | null
  causa: CausaAnalisis | null
  limitePasado: boolean
  /** El analisis llego despues del resumen rapido: hay que avisar. */
  llegoTarde: boolean
  /** Vino de la memoria: no se llamo a Gemini. */
  guardado: boolean
}

export type EventoAnalisis = EventoServidor | { tipo: 'limite' } | { tipo: 'guardado'; texto: string } | { tipo: 'reinicio' }

export const estadoInicial: EstadoAnalisis = {
  fase: 'pasos',
  pasos: [],
  texto: '',
  decision: null,
  causa: null,
  limitePasado: false,
  llegoTarde: false,
  guardado: false,
}

const terminado = (f: Fase) => f === 'listo' || f === 'fallo'

export function transicion(e: EstadoAnalisis, ev: EventoAnalisis): EstadoAnalisis {
  switch (ev.tipo) {
    case 'reinicio':
      return estadoInicial
    case 'guardado':
      return { ...estadoInicial, fase: 'listo', texto: ev.texto, guardado: true }
    case 'paso':
      if (terminado(e.fase)) return e
      return { ...e, pasos: [...e.pasos.map((p) => ({ ...p, hecho: true })), { id: ev.id, texto: ev.texto, hecho: false }] }
    case 'decision':
      return { ...e, decision: ev.decision }
    case 'texto': {
      if (terminado(e.fase)) return e
      const fase = e.fase === 'pasos' && !e.limitePasado ? 'escribiendo' : e.fase
      return { ...e, fase, texto: e.texto + ev.delta }
    }
    case 'limite':
      if (e.fase !== 'pasos') return { ...e, limitePasado: true }
      return { ...e, limitePasado: true, fase: 'resumen' }
    case 'fin':
      if (terminado(e.fase)) return e
      if (!e.texto.trim()) return { ...e, fase: 'fallo', causa: 'servidor' }
      return {
        ...e,
        fase: 'listo',
        llegoTarde: e.fase === 'resumen',
        pasos: e.pasos.map((p) => ({ ...p, hecho: true })),
      }
    case 'error':
      if (terminado(e.fase)) return e
      return { ...e, fase: 'fallo', causa: ev.causa }
  }
}

export function textoCausa(c: CausaAnalisis | null): string {
  switch (c) {
    case 'sin_clave':
      return 'El análisis a fondo de Gemini todavía no está conectado en este servidor.'
    case 'cuota':
      return 'Gemini recibió muchas consultas. Espere un momento y vuelva a intentar.'
    case 'cuota_local':
      return 'Ya usó los análisis a fondo de hoy. Mañana puede pedir más.'
    case 'clave':
      return 'El servidor no tiene permiso para usar Gemini.'
    case 'kharis':
      return 'No se pudo leer el pronóstico de su lugar.'
    case 'red':
      return 'Se cortó la conexión.'
    default:
      return 'Gemini no pudo responder esta vez.'
  }
}
