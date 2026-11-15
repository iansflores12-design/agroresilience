import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Zona } from '../../datos/zonas'
import { ExplicacionFenomeno } from './ExplicacionFenomeno'
import estilos from './EspacioFenomeno.module.css'

export interface PropsFenomeno {
  zona: Zona | null
  cultivoId: string | null
}

/** La explicación gráfica de los fenómenos del clima, en la pantalla de la zona. */
export function EspacioFenomeno({ zona, cultivoId }: PropsFenomeno) {
  const idTitulo = useId()
  const { t } = useTranslation()
  return (
    <section
      data-placeholder="fenomeno"
      aria-labelledby={idTitulo}
      data-zona={zona?.id}
      data-cultivo={cultivoId ?? undefined}
      className={estilos.seccion}
    >
      <h2 id={idTitulo} className="tipo-titulo">
        {t('fenomeno.titulo')}
      </h2>
      <ExplicacionFenomeno />
    </section>
  )
}
