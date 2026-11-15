import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Zona } from '../../datos/zonas'
import { ExplicacionFenomeno } from './ExplicacionFenomeno'
import { useTemasLugar } from './temasLugar'
import estilos from './EspacioFenomeno.module.css'

export interface PropsFenomeno {
  zona: Zona | null
  cultivoId: string | null
  /** Departamento elegido: da la altura y el nombre en las explicaciones del lugar. */
  departamentoId?: string | null
}

/** Explicaciones gráficas en la pantalla de la tierra: el porqué del cultivo, la tierra, la altura y el clima. */
export function EspacioFenomeno({ zona, cultivoId, departamentoId = null }: PropsFenomeno) {
  const idTitulo = useId()
  const { t } = useTranslation()
  const temasLugar = useTemasLugar({ zona, departamentoId, cultivoId })
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
      <ExplicacionFenomeno key={departamentoId ?? 'sin-lugar'} temasExtra={temasLugar} />
    </section>
  )
}
