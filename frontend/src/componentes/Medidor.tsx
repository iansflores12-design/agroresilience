import { clases } from './clases'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'
import estilos from './Medidor.module.css'
import type { NivelMedidor } from './nivelMedidor'

const CONTENIDO: Record<NivelMedidor, { icono: NombreIcono; palabra: string }> = {
  seco: { icono: 'wb_sunny', palabra: 'Seca' },
  normal: { icono: 'check_circle', palabra: 'Normal' },
  humedo: { icono: 'water_drop', palabra: 'Húmeda' },
  sin: { icono: 'info', palabra: 'Sin dato' },
}

/** Estado de la tierra con icono, palabra y color: nunca solo color. */
export function Medidor({ nivel, grande = false }: { nivel: NivelMedidor; grande?: boolean }) {
  const { icono, palabra } = CONTENIDO[nivel]
  return (
    <span className={clases(estilos.medidor, estilos[nivel], grande && estilos.grande)}>
      <Icono nombre={icono} relleno={false} tamano={grande ? 28 : 20} />
      {palabra}
    </span>
  )
}
