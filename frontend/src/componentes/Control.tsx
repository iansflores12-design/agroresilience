import type { AriaAttributes, MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Propiedades comunes de los controles tocables. Con `to` se renderiza un Link. */
export interface PropsControl extends AriaAttributes {
  to?: string
  onClick?: MouseEventHandler<HTMLElement>
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  className?: string
  id?: string
  title?: string
  children?: ReactNode
}

/** Boton o enlace segun haya `to`. Uso interno de los componentes base. */
export function Control({ to, type = 'button', disabled, children, ...resto }: PropsControl) {
  if (to && !disabled) {
    return (
      <Link to={to} {...resto}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} disabled={disabled} {...resto}>
      {children}
    </button>
  )
}
