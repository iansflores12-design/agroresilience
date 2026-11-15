import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { clases } from '../../componentes/clases'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import estilos from './Indicadores.module.css'

/**
 * Indicador circular determinado de M3 Expressive: arco del valor, hueco y pista. El numero
 * va en el centro. Es dato, no control: va en tinta, no en color de senal.
 */
export function AnilloPuntaje({ valor, tamano = 152 }: { valor: number; tamano?: number }) {
  const { t } = useTranslation()
  const grosor = 12
  const hueco = 6
  const r = (tamano - grosor) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, valor))
  const activo = (c * v) / 100
  const largoActivo = Math.max(0, activo - grosor)
  const largoPista = c - activo - 2 * hueco - grosor
  return (
    <div className={estilos.anillo} style={{ width: tamano, height: tamano }} role="img" aria-label={t('comun.deCien', { valor: v })}>
      <svg viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden="true">
        <g transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`} strokeWidth={grosor} strokeLinecap="round" fill="none">
          {largoPista > 0 && (
            <circle
              className={estilos.pista}
              cx={tamano / 2}
              cy={tamano / 2}
              r={r}
              strokeDasharray={`${largoPista} ${c}`}
              strokeDashoffset={-(activo + hueco + grosor / 2)}
            />
          )}
          {v > 0 && (
            <circle
              className={estilos.activo}
              cx={tamano / 2}
              cy={tamano / 2}
              r={r}
              strokeDasharray={`${largoActivo} ${c}`}
              strokeDashoffset={-grosor / 2}
            />
          )}
        </g>
      </svg>
      <span className={estilos.centro} aria-hidden="true">
        <span className={estilos.numero}>{v}</span>
        <span className={estilos.deCien}>{t('comun.deCien', { valor: '' }).trim()}</span>
      </span>
    </div>
  )
}

/** Indicador lineal de M3 Expressive: barra activa, hueco, pista y punto de parada. */
export function BarraLineal({ valor, tono = 'tinta', etiqueta }: { valor: number; tono?: 'tinta' | 'agua'; etiqueta?: string }) {
  const v = Math.max(0, Math.min(100, valor))
  return (
    <span
      className={clases(estilos.lineal, estilos[tono])}
      role={etiqueta ? 'img' : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
    >
      {v > 0 && <span className={estilos.linealActivo} style={{ flexGrow: v }} />}
      {v < 100 && (
        <span className={estilos.linealPista} style={{ flexGrow: 100 - v }}>
          <span className={estilos.parada} />
        </span>
      )}
    </span>
  )
}

/** Indicador circular indeterminado pequeno (para el paso en curso). */
export function Girando() {
  return <span className={estilos.girando} aria-hidden="true" />
}

export interface Pestana {
  id: string
  etiqueta: string
  icono: NombreIcono
  cuenta?: number
  contenido: ReactNode
}

/** Pestanas principales de M3, con flechas, Inicio y Fin del teclado. */
export function Pestanas({ pestanas, etiqueta }: { pestanas: Pestana[]; etiqueta: string }) {
  const [activa, fijarActiva] = useState(pestanas[0]?.id)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const indice = Math.max(0, pestanas.findIndex((p) => p.id === activa))

  function mover(i: number) {
    const j = (i + pestanas.length) % pestanas.length
    fijarActiva(pestanas[j].id)
    refs.current[j]?.focus()
  }

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') mover(indice + 1)
    else if (e.key === 'ArrowLeft') mover(indice - 1)
    else if (e.key === 'Home') mover(0)
    else if (e.key === 'End') mover(pestanas.length - 1)
    else return
    e.preventDefault()
  }

  const actual = pestanas[indice]
  return (
    <div className={estilos.pestanas}>
      <div role="tablist" aria-label={etiqueta} className={estilos.listaPestanas} onKeyDown={alTeclear}>
        {pestanas.map((p, i) => {
          const sel = i === indice
          return (
            <button
              key={p.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={sel}
              aria-controls={`panel-${p.id}`}
              tabIndex={sel ? 0 : -1}
              className={clases(estilos.pestana, sel && estilos.pestanaActiva, 'capa-estado')}
              onClick={() => fijarActiva(p.id)}
            >
              <span className={estilos.contenidoPestana}>
                <Icono nombre={p.icono} tamano={24} />
                <span className={estilos.etiquetaPestana}>
                  {p.etiqueta}
                  {p.cuenta !== undefined && <span className={estilos.cuenta}>{p.cuenta}</span>}
                </span>
                <span className={estilos.indicador} aria-hidden="true" />
              </span>
            </button>
          )
        })}
      </div>
      {actual && (
        <div role="tabpanel" id={`panel-${actual.id}`} aria-labelledby={`pestana-${actual.id}`} className={estilos.panel} tabIndex={0}>
          {actual.contenido}
        </div>
      )}
    </div>
  )
}
