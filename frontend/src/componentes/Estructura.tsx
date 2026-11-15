import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router-dom'
import { BarraNavegacion } from './BarraNavegacion'
import { BarraSuperior } from './BarraSuperior'
import estilos from './Estructura.module.css'

/** Armazon de la aplicacion: enlace de salto, barra superior, contenido y navegacion. */
export function Estructura() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const principal = useRef<HTMLElement>(null)
  const previa = useRef(pathname)
  const [contraido, setContraido] = useState(() => {
    try {
      return window.localStorage.getItem('agroresilience.menu.contraido') === '1'
    } catch {
      return false
    }
  })
  function alternarMenu() {
    setContraido((c) => {
      try {
        window.localStorage.setItem('agroresilience.menu.contraido', c ? '0' : '1')
      } catch {
        // Sin almacenamiento el menu simplemente no recuerda su estado.
      }
      return !c
    })
  }

  // Al cambiar de ruta el foco pasa al <main> (no en la carga inicial).
  useEffect(() => {
    if (previa.current !== pathname) {
      previa.current = pathname
      principal.current?.focus()
    }
  }, [pathname])

  return (
    <div className={estilos.armazon} data-contraido={contraido || undefined}>
      <a className={estilos.salto} href="#contenido">
        {t('app.saltar')}
      </a>
      <BarraSuperior />
      <BarraNavegacion contraido={contraido} alContraer={alternarMenu} />
      <main id="contenido" ref={principal} tabIndex={-1} className={estilos.principal}>
        <Outlet />
      </main>
    </div>
  )
}
