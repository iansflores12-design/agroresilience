import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BotonIcono } from './BotonIcono'
import { Icono } from './Icono'
import estilos from './MenuContexto.module.css'

export interface OpcionMenu {
  id: string
  nombre: string
  detalle?: string
}

/**
 * Hoja para cambiar el cultivo o el lugar sin salir de la pantalla: en el telefono sube desde
 * abajo y en pantalla ancha aparece centrada. Al elegir una opcion se cierra.
 */
export function MenuContexto({
  abierto,
  titulo,
  opciones,
  elegida,
  alElegir,
  alCerrar,
  enlace,
}: {
  abierto: boolean
  titulo: string
  opciones: OpcionMenu[]
  elegida: string | null
  alElegir: (id: string) => void
  alCerrar: () => void
  /** Enlace extra al pie (por ejemplo, elegir en el mapa). */
  enlace?: { texto: string; to: string }
}) {
  const { t } = useTranslation()
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (abierto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!abierto && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [abierto])

  return (
    <dialog
      ref={dialogo}
      className={estilos.hoja}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
      onClick={(e) => {
        // Toque fuera de la hoja (en el fondo) la cierra.
        if (e.target === e.currentTarget) alCerrar()
      }}
    >
      {abierto && (
        <div className={estilos.interior}>
          <div className={estilos.cabeza}>
            <h2 className={estilos.titulo}>{titulo}</h2>
            <BotonIcono icono="close" etiqueta={t('comun.cerrar')} onClick={alCerrar} />
          </div>
          <ul className={estilos.lista} role="list">
            {opciones.map((o) => {
              const sel = o.id === elegida
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={estilos.opcion}
                    aria-pressed={sel}
                    onClick={() => {
                      alElegir(o.id)
                      alCerrar()
                    }}
                  >
                    <span className={estilos.textos}>
                      <span className={estilos.nombre}>{o.nombre}</span>
                      {o.detalle && <span className={estilos.detalle}>{o.detalle}</span>}
                    </span>
                    {sel && <Icono nombre="check" />}
                  </button>
                </li>
              )
            })}
          </ul>
          {enlace && (
            <Link className={estilos.enlace} to={enlace.to} onClick={alCerrar}>
              <Icono nombre="map" tamano={20} />
              {enlace.texto}
            </Link>
          )}
        </div>
      )}
    </dialog>
  )
}
