import type { ReactNode } from 'react'
import type { MensajeChat } from '../../estado/Conversacion'
import { clases } from '../clases'
import { etiquetaDe } from './etiquetaDe'
import estilos from './ListaMensajes.module.css'

export interface PropsListaMensajes {
  mensajes: MensajeChat[]
  /** Muestra los tres puntos de "escribiendo". */
  esperando?: boolean
  /** Entrada corta de cada mensaje (respeta prefers-reduced-motion). */
  animada?: boolean
  etiqueta?: string
  className?: string
  /** Va al final de la lista, dentro del registro (por ejemplo el ancla de desplazamiento). */
  children?: ReactNode
}

/** Lista de burbujas de la conversacion, compartida por la pantalla Chat y la recomendacion de la portada. */
export function ListaMensajes({
  mensajes,
  esperando = false,
  animada = false,
  etiqueta = 'Conversación con el asistente',
  className,
  children,
}: PropsListaMensajes) {
  return (
    <div
      className={clases(estilos.lista, animada && estilos.animada, className)}
      role="log"
      aria-live="polite"
      aria-label={etiqueta}
    >
      {mensajes.map((m) => {
        const marca = etiquetaDe(m)
        return (
          <div key={m.id} className={clases(estilos.fila, m.rol === 'usuario' ? estilos.filaUsuario : estilos.filaAsistente)}>
            {marca && <span className={estilos.etiqueta}>{marca}</span>}
            <p className={clases(estilos.burbuja, m.rol === 'usuario' ? estilos.burbujaUsuario : estilos.burbujaAsistente)}>
              {m.texto}
            </p>
          </div>
        )
      })}
      {esperando && (
        <div className={clases(estilos.fila, estilos.filaAsistente)}>
          <span className={estilos.etiqueta}>Asistente</span>
          <div className={clases(estilos.burbuja, estilos.burbujaAsistente)}>
            <span className={estilos.puntos} aria-hidden="true">
              <span className={estilos.punto} />
              <span className={estilos.punto} />
              <span className={estilos.punto} />
            </span>
            <span className="solo-lectores">El asistente está escribiendo</span>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
