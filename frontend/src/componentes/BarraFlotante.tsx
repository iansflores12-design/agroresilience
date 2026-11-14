import type { ComponentPropsWithoutRef } from 'react'
import { clases } from './clases'
import estilos from './BarraFlotante.module.css'

export type PropsBarraFlotante = ComponentPropsWithoutRef<'div'>

/** Contenedor flotante opaco con elevacion 3. El posicionamiento lo decide quien la usa. */
export function BarraFlotante({ className, ...resto }: PropsBarraFlotante) {
  return <div {...resto} className={clases(estilos.barra, 'plano-superior', className)} />
}
