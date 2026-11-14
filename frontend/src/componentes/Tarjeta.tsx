import type { ComponentPropsWithoutRef } from 'react'
import { clases } from './clases'
import estilos from './Tarjeta.module.css'

export interface PropsTarjeta extends ComponentPropsWithoutRef<'div'> {
  variante?: 'relleno' | 'elevada' | 'contorno'
  /** Etiqueta HTML a renderizar. Por defecto div. */
  como?: 'div' | 'section' | 'article' | 'li' | 'aside'
}

export function Tarjeta({
  variante = 'relleno',
  como = 'div',
  className,
  ...resto
}: PropsTarjeta) {
  const Etiqueta = como as 'div'
  return <Etiqueta {...resto} className={clases(estilos.tarjeta, estilos[variante], className)} />
}
