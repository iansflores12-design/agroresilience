import { useId } from 'react'
import type { Zona } from '../../datos/zonas'
import estilos from './EspacioFenomeno.module.css'

export interface PropsFenomeno {
  zona: Zona | null
  cultivoId: string | null
}

/**
 * PLACEHOLDER(fenomeno): para integrar la explicacion grafica real, reemplazar el contenido de
 * `.lienzo` (el <div> con la proporcion reservada) por el componente definitivo, que recibe
 * `zona` y `cultivoId`. Conservar la <section data-placeholder="fenomeno"> y su titulo, y hacer
 * que el componente llene el 100 % del lienzo: la proporcion es 16:9 (4:3 en ventana compacta).
 */
export function EspacioFenomeno({ zona, cultivoId }: PropsFenomeno) {
  const idTitulo = useId()
  return (
    <section
      data-placeholder="fenomeno"
      aria-labelledby={idTitulo}
      data-zona={zona?.id}
      data-cultivo={cultivoId ?? undefined}
      className={estilos.seccion}
    >
      <h2 id={idTitulo} className="tipo-titulo">
        Explicación gráfica
      </h2>
      <div className={estilos.lienzo}>
        <p className="tipo-nota">Espacio reservado: aquí irá la explicación gráfica de un fenómeno</p>
      </div>
    </section>
  )
}
