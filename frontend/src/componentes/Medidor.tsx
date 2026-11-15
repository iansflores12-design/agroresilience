import { useTranslation } from 'react-i18next'
import { clases } from './clases'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'
import estilos from './Medidor.module.css'
import type { NivelMedidor } from './nivelMedidor'

const ICONO: Record<NivelMedidor, NombreIcono> = {
  seco: 'wb_sunny',
  normal: 'check_circle',
  humedo: 'water_drop',
  sin: 'info',
}

/** Estado de la tierra con icono, palabra y color: nunca solo color. */
export function Medidor({ nivel, grande = false }: { nivel: NivelMedidor; grande?: boolean }) {
  const { t } = useTranslation()
  const icono = ICONO[nivel]
  return (
    <span className={clases(estilos.medidor, estilos[nivel], grande && estilos.grande)}>
      <Icono nombre={icono} relleno={false} tamano={grande ? 28 : 20} />
      {t(`medidor.${nivel}`)}
    </span>
  )
}
