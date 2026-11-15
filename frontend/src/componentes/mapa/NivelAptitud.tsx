import { useTranslation } from 'react-i18next'
import type { Nivel } from '../../datos/aptitud'
import { clases } from '../clases'
import { Icono } from '../Icono'
import type { NombreIcono } from '../iconos'
import estilos from './NivelAptitud.module.css'

const ICONO: Record<Nivel, NombreIcono> = { buena: 'check_circle', regular: 'remove', dificil: 'warning' }

/** Que tan bien se da un cultivo, con icono, palabra y color: nunca solo color. */
export function NivelAptitud({ nivel, grande = false }: { nivel: Nivel; grande?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={clases(estilos.nivel, estilos[nivel], grande && estilos.grande)}>
      <Icono nombre={ICONO[nivel]} tamano={grande ? 28 : 20} />
      {t(`aptitud.niveles.${nivel}`)}
    </span>
  )
}

const ORDEN: Nivel[] = ['buena', 'regular', 'dificil']

/** Leyenda de los colores del mapa. */
export function LeyendaAptitud({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={clases(estilos.leyenda, className)}>
      <span className="tipo-nota" id="leyenda-aptitud">
        {t('aptitud.leyenda')}
      </span>
      <ul className={estilos.niveles} aria-labelledby="leyenda-aptitud">
        {ORDEN.map((nivel) => (
          <li key={nivel}>
            <NivelAptitud nivel={nivel} />
          </li>
        ))}
      </ul>
    </div>
  )
}
