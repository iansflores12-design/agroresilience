import { Link, useLocation } from 'react-router-dom'
import { destinoActual, destinos } from '../destinos'
import { clases } from './clases'
import estilos from './BarraNavegacion.module.css'
import { Icono } from './Icono'

/** Barra inferior en ventana compacta y media; riel lateral en expandida (lo decide el CSS). */
export function BarraNavegacion() {
  const { pathname } = useLocation()
  const activo = destinoActual(pathname)
  return (
    <nav className={clases(estilos.nav, 'plano-superior')} aria-label="Principal">
      <ul className={estilos.lista}>
        {destinos.map((d) => {
          const esActivo = activo?.ruta === d.ruta
          return (
            <li key={d.ruta} className={estilos.elemento}>
              <Link
                to={d.ruta}
                className={clases(estilos.enlace, esActivo && estilos.activo)}
                aria-current={esActivo ? 'page' : undefined}
              >
                <span className={clases(estilos.indicador, 'capa-estado')}>
                  <Icono nombre={d.icono} relleno={esActivo} />
                </span>
                <span className={estilos.etiqueta}>{d.etiqueta}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
