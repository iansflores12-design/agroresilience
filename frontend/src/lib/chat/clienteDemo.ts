import { ErrorChat, type ClienteChat, type ContextoChat } from './tipos'

const ESPERA_MS = 700

export const PREFIJO_DEMO = 'Respuesta de demostración.'

function resumir(c: ContextoChat): string {
  const lineas: string[] = []
  if (c.cultivo) {
    const semana = c.edadSemanas === null ? '' : `, semana ${c.edadSemanas}`
    const etapa = c.etapa ? ` (${c.etapa})` : ''
    lineas.push(`Cultivo: ${c.cultivo.nombre}${semana}${etapa}.`)
  } else {
    lineas.push('Cultivo: ninguno elegido.')
  }
  lineas.push(c.zona ? `Zona: ${c.zona.nombre}.` : 'Zona: ninguna elegida.')
  if (c.humedad) {
    const pct = Math.round(c.humedad.valor * 1000) / 10
    lineas.push(`Humedad del suelo: ${pct} % (lectura del ${c.humedad.fecha}).`)
  } else if (c.zona) {
    lineas.push('Humedad del suelo: sin lectura.')
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
            texto: `${PREFIJO_DEMO} Esto es lo que el asistente ve ahora:\n${resumir(contexto)}\nEl asistente real se conectará al backend.`,
          })
        }, esperaMs)
        signal?.addEventListener('abort', alAbortar, { once: true })
      })
    },
  }
}
