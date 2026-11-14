import { Link, useLocation } from 'react-router-dom'
import { destinoActual, destinos } from '../destinos'
import { clases } from './clases'
import estilos from './BarraNavegacion.module.css'
import { Icono } from './Icono'

export interface PropsBarraNavegacion {
  contraido?: boolean
  alContraer?: () => void
}

/** Barra inferior en ventana compacta y media; menu lateral en expandida (lo decide el CSS). */
export function BarraNavegacion({ contraido = false, alContraer }: PropsBarraNavegacion) {
  const { pathname } = useLocation()
  const activo = destinoActual(pathname)
  return (
    <nav className={clases(estilos.nav, 'plano-superior')} aria-label="Principal">
      <div className={estilos.marca} aria-hidden="true">
        <span className={estilos.logo}>
          <Icono nombre="grass" relleno tamano={24} />
        </span>
        <span className={estilos.nombre}>AgroResilience</span>
      </div>
      <ul className={estilos.lista}>
        {destinos.map((d) => {
          const esActivo = activo?.ruta === d.ruta
          return (
            <li key={d.ruta} className={estilos.elemento}>
              <Link
                to={d.ruta}
                className={clases(estilos.enlace, esActivo && estilos.activo)}
                aria-current={esActivo ? 'page' : undefined}
                title={contraido ? d.etiqueta : undefined}
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
      <div className={estilos.pie}>
        <button
          type="button"
          className={clases(estilos.contraer, 'capa-estado')}
          aria-pressed={contraido}
          onClick={alContraer}
        >
          <Icono nombre={contraido ? 'chevron_right' : 'arrow_back'} />
          <span className={estilos.etiquetaContraer}>{contraido ? 'Expandir' : 'Contraer'}</span>
        </button>
      </div>
    </nav>
  )
}
