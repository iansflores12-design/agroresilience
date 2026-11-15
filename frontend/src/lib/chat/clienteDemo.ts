import { traductor } from '../../i18n/traductor'
import { ErrorChat, type ClienteChat, type ContextoChat } from './tipos'

const ESPERA_MS = 700

export const PREFIJO_DEMO = 'Respuesta de demostración.'

function resumir(c: ContextoChat): string {
  const t = traductor(c.idioma)
  const lineas: string[] = []
  if (c.cultivo) {
    const semana = c.edadSemanas === null ? '' : t('chat.demo.semana', { n: c.edadSemanas })
    const etapa = c.etapa ? ` (${c.etapa})` : ''
    lineas.push(t('chat.demo.cultivo', { cultivo: c.cultivo.nombre, semana, etapa }))
  } else {
    lineas.push(t('chat.demo.sinCultivo'))
  }
  lineas.push(c.zona ? t('chat.demo.zona', { zona: c.zona.nombre }) : t('chat.demo.sinZona'))
  if (c.humedad) {
    const pct = Math.round(c.humedad.valor * 1000) / 10
    lineas.push(t('chat.demo.humedad', { pct, fecha: c.humedad.fecha }))
  } else if (c.zona) {
    lineas.push(t('chat.demo.sinHumedad'))
  }
  return lineas.join('\n')
}

/** Cliente local: responde tras una espera corta, sin backend ni consejos agronomicos. */
export function crearClienteDemo(esperaMs: number = ESPERA_MS): ClienteChat {
  return {
    enviar({ contexto, signal }) {
      return new Promise((resolver, rechazar) => {
        if (signal?.aborted) {
          rechazar(new ErrorChat('cancelado', 'Peticion cancelada'))
          return
        }
        const alAbortar = () => {
          clearTimeout(temporizador)
          rechazar(new ErrorChat('cancelado', 'Peticion cancelada'))
        }
        const temporizador = setTimeout(() => {
          signal?.removeEventListener('abort', alAbortar)
          resolver({
            texto: `${traductor(contexto.idioma)('chat.demo.prefijo')} ${traductor(contexto.idioma)('chat.demo.ve')}\n${resumir(contexto)}\n${traductor(contexto.idioma)('chat.demo.real')}`,
          })
        }, esperaMs)
        signal?.addEventListener('abort', alAbortar, { once: true })
      })
    },
  }
}
