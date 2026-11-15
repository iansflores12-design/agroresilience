import { traductor } from '../../i18n/traductor'
import { ErrorChat, type ClienteChat, type ContextoChat } from './tipos'

/** Lo que se sabe del productor sin la IA: cultivo, lugar y humedad del suelo. */
export function resumirContexto(c: ContextoChat): string {
  const t = traductor(c.idioma)
  const lineas: string[] = []
  if (c.cultivo) {
    const semana = c.edadSemanas === null ? '' : t('chat.datos.semana', { n: c.edadSemanas })
    const etapa = c.etapa ? ` (${c.etapa})` : ''
    lineas.push(t('chat.datos.cultivo', { cultivo: c.cultivo.nombre, semana, etapa }))
  } else {
    lineas.push(t('chat.datos.sinCultivo'))
  }
  lineas.push(c.zona ? t('chat.datos.zona', { zona: c.zona.nombre }) : t('chat.datos.sinZona'))
  if (c.humedad) {
    const pct = Math.round(c.humedad.valor * 1000) / 10
    lineas.push(t('chat.datos.humedad', { pct, fecha: c.humedad.fecha }))
  } else if (c.zona) {
    lineas.push(t('chat.datos.sinHumedad'))
  }
  return lineas.join('\n')
}

/** Respuesta armada en el navegador cuando la API no contesta, para que el chat nunca quede sin respuesta. */
export function respuestaLocal(c: ContextoChat, conFoto = false): string {
  const t = traductor(c.idioma)
  const foto = conFoto ? `\n${t('chat.respaldo.foto')}` : ''
  return `${t('chat.respaldo.intro')}\n${resumirContexto(c)}${foto}\n${t('chat.respaldo.cierre')}`
}

export interface OpcionesResistente {
  /** Esperas antes de cada reintento; su largo es el numero de reintentos. */
  esperasMs?: number[]
  /** Tope de cada intento. */
  limiteMs?: number
}

const cancelado = () => new ErrorChat('cancelado', 'Peticion cancelada')

function pausa(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((listo, fallo) => {
    if (signal?.aborted) return fallo(cancelado())
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar)
      listo()
    }, ms)
    const alAbortar = () => {
      clearTimeout(id)
      fallo(cancelado())
    }
    signal?.addEventListener('abort', alAbortar, { once: true })
  })
}

/**
 * Envuelve al cliente de la API: cada intento tiene tope, los fallos se reintentan con espera y, si
 * la API sigue sin responder, contesta con los datos del contexto. Solo la cancelacion del usuario
 * se propaga como error.
 */
export function crearClienteResistente(base: ClienteChat, { esperasMs = [800, 2500], limiteMs = 45_000 }: OpcionesResistente = {}): ClienteChat {
  return {
    async enviar({ mensajes, contexto, signal }) {
      for (let intento = 0; intento <= esperasMs.length; intento++) {
        if (intento > 0) await pausa(esperasMs[intento - 1], signal)
        const control = new AbortController()
        const alCancelar = () => control.abort()
        signal?.addEventListener('abort', alCancelar, { once: true })
        const tope = setTimeout(() => control.abort(), limiteMs)
        try {
          return await base.enviar({ mensajes, contexto, signal: control.signal })
        } catch {
          if (signal?.aborted) throw cancelado()
          // Fallo de red, del servidor, respuesta rara o tope vencido: se reintenta.
        } finally {
          clearTimeout(tope)
          signal?.removeEventListener('abort', alCancelar)
        }
      }
      return { texto: respuestaLocal(contexto, Boolean(mensajes[mensajes.length - 1]?.imagen)), respaldo: true }
    },
  }
}
