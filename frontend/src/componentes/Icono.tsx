import type { CSSProperties } from 'react'
import { clases } from './clases'
import estilos from './Icono.module.css'
import { iconos, iconosRelleno, type NombreIcono } from './iconos'

export interface PropsIcono {
  nombre: NombreIcono
  /** Usa la version rellena si existe (grass, map, water_drop, forum). */
  relleno?: boolean
  /** Lado en px. Por defecto 24. */
  tamano?: number
  className?: string
  /** Si se da, el icono deja de ser decorativo y se anuncia con este texto. */
  titulo?: string
}

export function Icono({ nombre, relleno = false, tamano = 24, className, titulo }: PropsIcono) {
  const Svg = (relleno && iconosRelleno[nombre]) || iconos[nombre]
  const estilo = { '--tamano-icono': `${tamano}px` } as CSSProperties
  return (
    <Svg
      className={clases(estilos.icono, className)}
      style={estilo}
      {...(titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true, focusable: false })}
    />
  )
}
