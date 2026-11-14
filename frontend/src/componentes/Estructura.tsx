import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { destinoActual } from '../destinos'
import { BarraNavegacion } from './BarraNavegacion'
import { BarraSuperior } from './BarraSuperior'
import estilos from './Estructura.module.css'
import { Fab } from './Fab'

/** Armazon de la aplicacion: enlace de salto, barra superior, contenido y navegacion. */
export function Estructura() {
  const { pathname } = useLocation()
  const principal = useRef<HTMLElement>(null)
  const previa = useRef(pathname)
  const destino = destinoActual(pathname)

  // Al cambiar de ruta el foco pasa al <main> (no en la carga inicial).
  useEffect(() => {
    if (previa.current !== pathname) {
      previa.current = pathname
      principal.current?.focus()
    }
  }, [pathname])

  return (
    <div className={estilos.armazon}>
      <a className={estilos.salto} href="#contenido">
        Saltar al contenido
      </a>
      <BarraSuperior />
      <BarraNavegacion />
      <main id="contenido" ref={principal} tabIndex={-1} className={estilos.principal}>
        <Outlet />
      </main>
      {destino && destino.vista !== 'chat' && (
        <div className={estilos.zonaFab}>
          <Fab to={`/chat?desde=${destino.vista}`} icono="forum" etiqueta="Preguntar" extendido />
        </div>
      )}
    </div>
  )
}
