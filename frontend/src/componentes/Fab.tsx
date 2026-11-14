import { clases } from './clases'
import estilos from './Fab.module.css'
import { Control, type PropsControl } from './Control'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'

export interface PropsFab extends Omit<PropsControl, 'children' | 'aria-label'> {
  icono: NombreIcono
  /** Nombre accesible; en la version extendida tambien es el texto visible. */
  etiqueta: string
  extendido?: boolean
}

export function Fab({ icono, etiqueta, extendido = false, className, ...resto }: PropsFab) {
  return (
    <Control
      {...resto}
      aria-label={extendido ? undefined : etiqueta}
      className={clases(
        estilos.fab,
        extendido && estilos.extendido,
        'plano-superior',
        'capa-estado',
        className,
      )}
    >
      <Icono nombre={icono} />
      {extendido && <span>{etiqueta}</span>}
    </Control>
  )
}
