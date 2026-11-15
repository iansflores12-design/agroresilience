import { useTranslation } from 'react-i18next'
import type { Rating } from '../../lib/decision/tipos'
import { clases } from '../clases'
import { Icono } from '../Icono'
import estilos from './RatingRotacion.module.css'
import { ICONO_RATING } from './visual'

/** Que tan buena es una rotacion: icono, palabra y color, nunca solo color. */
export function RatingRotacion({ rating, grande = false }: { rating: Rating; grande?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={clases(estilos.rating, estilos[rating], grande && estilos.grande)}>
      <Icono nombre={ICONO_RATING[rating]} tamano={grande ? 24 : 18} />
      {t(`rating.${rating}`)}
    </span>
  )
}
