import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { destinoActual } from '../destinos'
import { mover, useOrdenNavegacion } from '../estado/ordenNavegacion'
import { clases } from './clases'
import estilos from './BarraNavegacion.module.css'
import { Icono } from './Icono'

export interface PropsBarraNavegacion {
  contraido?: boolean
  alContraer?: () => void
}

/** Arrastre en curso: empieza al presionar y se activa cuando el puntero se mueve mas que UMBRAL. */
interface Arrastre {
  ruta: string
  id: number
  inicio: { x: number; y: number }
  /** Horizontal en la barra de abajo, vertical en el menu lateral. */
  eje: 'x' | 'y'
  /** Centro de cada lugar de la lista al empezar, en el eje. */
  centros: number[]
  desde: number
  orden: string[]
  activo: boolean
}

const UMBRAL = 8
const ANIMACION = { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }

const sinMovimiento = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Barra inferior en ventana compacta y media; menu lateral en expandida (lo decide el CSS).
 * Los destinos se reordenan arrastrandolos (raton o dedo) o con Alt + flechas; el orden se guarda.
 */
export function BarraNavegacion({ contraido = false, alContraer }: PropsBarraNavegacion) {
  const { pathname } = useLocation()
  const activo = destinoActual(pathname)
  const { t } = useTranslation()
  const [guardados, guardarOrden] = useOrdenNavegacion()
  // Mientras se arrastra, el orden provisional; al soltar se guarda.
  const [provisional, fijarProvisional] = useState<string[] | null>(null)
  const [arrastrada, fijarArrastrada] = useState<string | null>(null)
  const [desfase, fijarDesfase] = useState(0)
  const [aviso, fijarAviso] = useState('')
  const arrastre = useRef<Arrastre | null>(null)
  const evitarClic = useRef(false)
  const elementos = useRef(new Map<string, HTMLLIElement>())
  const enlaces = useRef(new Map<string, HTMLAnchorElement>())
  // Posicion de cada elemento en el ultimo dibujo (sin transformaciones), para animar los cambios.
  const antes = useRef(new Map<string, { x: number; y: number }>())
  const desfaseAnterior = useRef(0)
  const ultimaSoltada = useRef<string | null>(null)
  const ultimoEje = useRef<'x' | 'y'>('x')
  const [eje, fijarEje] = useState<'x' | 'y'>('x')

  const visibles = provisional
    ? provisional.map((r) => guardados.find((d) => d.ruta === r)).filter((d) => d !== undefined)
    : guardados

  // FLIP: cada destino que cambio de lugar se desliza desde donde estaba. El que se arrastra sigue
  // al puntero; al soltarlo, se acomoda desde donde quedo.
  useLayoutEffect(() => {
    const quieto = sinMovimiento()
    for (const [ruta, li] of elementos.current) {
      const ahora = { x: li.offsetLeft, y: li.offsetTop }
      const previo = antes.current.get(ruta)
      antes.current.set(ruta, ahora)
      if (!previo || quieto || ruta === arrastrada || typeof li.animate !== 'function') continue
      let dx = previo.x - ahora.x
      let dy = previo.y - ahora.y
      if (ruta === ultimaSoltada.current) {
        if (ultimoEje.current === 'x') dx += desfaseAnterior.current
        else dy += desfaseAnterior.current
        ultimaSoltada.current = null
      }
      if (dx || dy) li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], ANIMACION)
    }
  })

  function anunciar(ruta: string, orden: string[]) {
    const d = guardados.find((x) => x.ruta === ruta)
    if (!d) return
    fijarAviso(t('nav.movido', { destino: t(d.etiqueta), n: orden.indexOf(ruta) + 1, total: orden.length }))
  }

  function alPresionar(e: PointerEvent<HTMLAnchorElement>, ruta: string) {
    if (e.button !== 0 || arrastre.current) return
    const rects = visibles.map((d) => elementos.current.get(d.ruta)?.getBoundingClientRect())
    if (rects.some((r) => !r)) return
    const cajas = rects as DOMRect[]
    const eje = cajas.length > 1 && Math.abs(cajas[1].left - cajas[0].left) > Math.abs(cajas[1].top - cajas[0].top) ? 'x' : 'y'
    arrastre.current = {
      ruta,
      id: e.pointerId,
      inicio: { x: e.clientX, y: e.clientY },
      eje,
      centros: cajas.map((r) => (eje === 'x' ? r.left + r.width / 2 : r.top + r.height / 2)),
      desde: visibles.findIndex((d) => d.ruta === ruta),
      orden: visibles.map((d) => d.ruta),
      activo: false,
    }
  }

  function alMover(e: PointerEvent<HTMLAnchorElement>) {
    const a = arrastre.current
    if (!a || e.pointerId !== a.id) return
    const dx = e.clientX - a.inicio.x
    const dy = e.clientY - a.inicio.y
    if (!a.activo) {
      if (Math.hypot(dx, dy) < UMBRAL) return
      a.activo = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      fijarArrastrada(a.ruta)
      fijarEje(a.eje)
    }
    e.preventDefault()
    const primero = a.centros[0]
    const ultimo = a.centros[a.centros.length - 1]
    const centro = Math.min(ultimo, Math.max(primero, a.centros[a.desde] + (a.eje === 'x' ? dx : dy)))
    let hasta = 0
    a.centros.forEach((c, i) => {
      if (Math.abs(c - centro) < Math.abs(a.centros[hasta] - centro)) hasta = i
    })
    const nuevo = mover(a.orden, a.ruta, hasta)
    if (nuevo !== a.orden) {
      a.orden = nuevo
      fijarProvisional(nuevo)
    }
    fijarDesfase(centro - a.centros[hasta])
  }

  function terminar(e: PointerEvent<HTMLAnchorElement>, guardar: boolean) {
    const a = arrastre.current
    if (!a || e.pointerId !== a.id) return
    arrastre.current = null
    if (!a.activo) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // El clic que sigue al soltar no debe navegar.
    evitarClic.current = true
    window.setTimeout(() => (evitarClic.current = false), 0)
    ultimaSoltada.current = a.ruta
    ultimoEje.current = a.eje
    desfaseAnterior.current = desfase
    if (guardar) {
      guardarOrden(a.orden)
      anunciar(a.ruta, a.orden)
    }
    fijarProvisional(null)
    fijarArrastrada(null)
    fijarDesfase(0)
  }

  function alTeclear(e: KeyboardEvent<HTMLAnchorElement>, ruta: string) {
    if (!e.altKey) return
    const paso = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
    if (!paso) return
    e.preventDefault()
    const orden = guardados.map((d) => d.ruta)
    const nuevo = mover(orden, ruta, orden.indexOf(ruta) + paso)
    if (nuevo === orden) return
    guardarOrden(nuevo)
    anunciar(ruta, nuevo)
    // Mover el nodo en la pagina le puede quitar el foco: se le devuelve.
    requestAnimationFrame(() => enlaces.current.get(ruta)?.focus())
  }

  return (
    <nav className={clases(estilos.nav, 'plano-superior')} aria-label={t('nav.principal')}>
      <div className={estilos.marca} aria-hidden="true">
        <span className={estilos.logo}>
          <Icono nombre="grass" relleno tamano={24} />
        </span>
        <span className={estilos.nombre}>{t('app.nombre')}</span>
      </div>
      <span id="nav-reordenar" className="solo-lectores">
        {t('nav.reordenarAyuda')}
      </span>
      <ul className={clases(estilos.lista, arrastrada && estilos.listaArrastrando)}>
        {visibles.map((d) => {
          const esActivo = activo?.ruta === d.ruta
          const esArrastrada = arrastrada === d.ruta
          return (
            <li
              key={d.ruta}
              ref={(el) => {
                if (el) elementos.current.set(d.ruta, el)
                else elementos.current.delete(d.ruta)
              }}
              className={clases(estilos.elemento, esArrastrada && estilos.arrastrando)}
              style={esArrastrada ? { transform: eje === 'x' ? `translateX(${desfase}px)` : `translateY(${desfase}px)` } : undefined}
            >
              <Link
                ref={(el) => {
                  if (el) enlaces.current.set(d.ruta, el)
                  else enlaces.current.delete(d.ruta)
                }}
                to={d.ruta}
                className={clases(estilos.enlace, esActivo && estilos.activo)}
                aria-current={esActivo ? 'page' : undefined}
                aria-describedby="nav-reordenar"
                title={contraido ? t(d.etiqueta) : undefined}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onPointerDown={(e) => alPresionar(e, d.ruta)}
                onPointerMove={alMover}
                onPointerUp={(e) => terminar(e, true)}
                onPointerCancel={(e) => terminar(e, false)}
                onKeyDown={(e) => alTeclear(e, d.ruta)}
                onClick={(e) => {
                  if (evitarClic.current) {
                    e.preventDefault()
                    evitarClic.current = false
                  }
                }}
              >
                <span className={clases(estilos.indicador, 'capa-estado')}>
                  <Icono nombre={d.icono} relleno={esActivo} />
                </span>
                <span className={estilos.etiqueta}>{t(d.etiqueta)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <span className="solo-lectores" aria-live="polite">
        {aviso}
      </span>
      <div className={estilos.pie}>
        <button
          type="button"
          className={clases(estilos.contraer, 'capa-estado')}
          aria-pressed={contraido}
          onClick={alContraer}
        >
          <Icono nombre={contraido ? 'chevron_right' : 'arrow_back'} />
          <span className={estilos.etiquetaContraer}>{contraido ? t('nav.expandir') : t('nav.contraer')}</span>
        </button>
      </div>
    </nav>
  )
}
