import { useId } from 'react'
import type { Zona } from '../../datos/zonas'
import estilos from './EspacioFenomeno.module.css'
import { Sequia } from './Sequia'

export interface PropsFenomeno {
  zona: Zona | null
  cultivoId: string | null
}

/**
 * Explicacion grafica del fenomeno (hoy, la sequia). Conserva el contrato `PropsFenomeno`, el
 * titulo y la <section data-fenomeno="sequia">; la escena llena el lienzo (16:9, 4:3 en compacta).
 */
export function EspacioFenomeno({ zona, cultivoId }: PropsFenomeno) {
  const idTitulo = useId()
  return (
    <section
      data-fenomeno="sequia"
      aria-labelledby={idTitulo}
      data-zona={zona?.id}
      data-cultivo={cultivoId ?? undefined}
      className={estilos.seccion}
    >
      <h2 id={idTitulo} className="tipo-titulo">
        ¿Por qué pasa esto?
      </h2>
      <Sequia zona={zona} cultivoId={cultivoId} />
    </section>
  )
}
