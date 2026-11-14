import { clases } from './clases'
import estilos from './Chip.module.css'
import { Control, type PropsControl } from './Control'
import { Icono } from './Icono'
import type { NombreIcono } from './iconos'

export interface PropsChip extends PropsControl {
  variante?: 'asistente' | 'filtro'
  seleccionado?: boolean
  icono?: NombreIcono
}

export function Chip({
  variante = 'asistente',
  seleccionado = false,
  icono,
  className,
  children,
  ...resto
}: PropsChip) {
  const nombreIcono = icono ?? (variante === 'filtro' && seleccionado ? 'check' : undefined)
  return (
    <Control
      {...resto}
      aria-pressed={variante === 'filtro' && !resto.to ? seleccionado : undefined}
      className={clases(
        estilos.chip,
        estilos[variante],
        seleccionado && estilos.seleccionado,
        nombreIcono && estilos.conIcono,
        'capa-estado',
        'zona-tactil',
        className,
      )}
    >
      {nombreIcono && <Icono nombre={nombreIcono} tamano={18} />}
      <span className={estilos.texto}>{children}</span>
    </Control>
  )
}
