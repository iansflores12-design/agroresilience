import { clases } from './clases'
import estilos from './Boton.module.css'
import { Control, type PropsControl } from './Control'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'

export interface PropsBoton extends PropsControl {
  variante?: 'relleno' | 'tonal' | 'contorno' | 'texto'
  icono?: NombreIcono
}

export function Boton({ variante = 'relleno', icono, className, children, ...resto }: PropsBoton) {
  return (
    <Control
      {...resto}
      className={clases(
        estilos.boton,
        estilos[variante],
        icono && estilos.conIcono,
        'capa-estado',
        'zona-tactil',
        className,
      )}
    >
      {icono && <Icono nombre={icono} tamano={18} />}
      {children}
    </Control>
  )
}
