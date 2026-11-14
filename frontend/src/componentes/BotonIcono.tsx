import { clases } from './clases'
import estilos from './BotonIcono.module.css'
import { Control, type PropsControl } from './Control'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'

export interface PropsBotonIcono extends Omit<PropsControl, 'children' | 'aria-label'> {
  icono: NombreIcono
  /** Obligatoria: nombre accesible del boton (aria-label). */
  etiqueta: string
  variante?: 'estandar' | 'relleno' | 'tonal' | 'contorno'
  /** Estado de interruptor: cambia el color y la forma, y aria-pressed. */
  seleccionado?: boolean
  /** Icono relleno cuando esta seleccionado (solo los que tienen version rellena). */
  rellenoAlSeleccionar?: boolean
}

export function BotonIcono({
  icono,
  etiqueta,
  variante = 'estandar',
  seleccionado,
  rellenoAlSeleccionar,
  className,
  ...resto
}: PropsBotonIcono) {
  const esInterruptor = seleccionado !== undefined
  return (
    <Control
      {...resto}
      aria-label={etiqueta}
      aria-pressed={esInterruptor && !resto.to ? seleccionado : undefined}
      className={clases(
        estilos.boton,
        estilos[variante],
        seleccionado && estilos.seleccionado,
        'capa-estado',
        'zona-tactil',
        className,
      )}
    >
      <Icono nombre={icono} relleno={Boolean(seleccionado && rellenoAlSeleccionar)} />
    </Control>
  )
}
