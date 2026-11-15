import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BotonIcono } from '../BotonIcono'
import { Chip } from '../Chip'
import { Icono } from '../Icono'
import type { NombreIcono } from '../iconos'
import estilos from './ExplicacionFenomeno.module.css'

export const FENOMENOS = ['nino', 'canicula', 'lluvias', 'huracan'] as const
export type Fenomeno = (typeof FENOMENOS)[number]

export function esFenomeno(x: string): x is Fenomeno {
  return (FENOMENOS as readonly string[]).includes(x)
}

const ICONO: Record<Fenomeno, NombreIcono> = { nino: 'globe', canicula: 'heat', lluvias: 'rainy', huracan: 'cyclone' }

/** Qué capas del dibujo se ven en cada paso (se leen en el CSS con [data-ver~="capa"]). */
export const ESCENAS: Record<Fenomeno, [string, string, string]> = {
  nino: ['mar calor sol nubes', 'sol fuerte suelo grietas plantas marchitas', 'sol suelo plantas gotas'],
  canicula: ['sol nubes suelo plantas', 'sol fuerte suelo grietas plantas marchitas', 'nubes lluvia suelo plantas rastrojo'],
  lluvias: ['nubes oscuras lluvia fuerte suelo plantas', 'nubes oscuras lluvia suelo plantas escorrentia', 'nubes lluvia suelo plantas barreras'],
  huracan: ['mar remolino', 'nubes oscuras remolino viento lluvia fuerte suelo plantas dobladas', 'sol suelo plantas'],
}

/** Icono que acompaña la recomendación (tercer paso). */
const ICONO_CONSEJO: Record<Fenomeno, NombreIcono> = { nino: 'water_drop', canicula: 'calendar_month', lluvias: 'landslide', huracan: 'warning' }

const DURACION_PASO_MS = 5000

const reducido = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** El dibujo animado: una sola escena con capas que se encienden y se mueven segun el paso. */
function Escena({ ver }: { ver: string }) {
  return (
    <svg className={estilos.escena} data-ver={ver} viewBox="0 0 320 180" aria-hidden="true" focusable="false">
      <rect className={estilos.cielo} x="-100" y="-100" width="520" height="380" />
      <g className={`${estilos.capa} ${estilos.sol}`} data-capa="sol">
        <g className={estilos.rayos}>
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="0" y1="-30" x2="0" y2="-40" transform={`rotate(${i * 45})`} />
          ))}
        </g>
        <circle r="20" />
      </g>
      <g className={`${estilos.capa} ${estilos.mar}`} data-capa="mar">
        <rect x="-100" y="120" width="520" height="160" />
        <path className={estilos.ola} d="M0 128 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" />
      </g>
      <ellipse className={`${estilos.capa} ${estilos.calor}`} data-capa="calor" cx="200" cy="146" rx="70" ry="16" />
      <g className={`${estilos.capa} ${estilos.remolino}`} data-capa="remolino">
        <g className={estilos.giro}>
          <path d="M0 0 m-6 0 a6 6 0 1 1 12 0 a14 14 0 1 1 -28 0 a22 22 0 1 1 44 0 a32 32 0 1 1 -64 0" />
        </g>
      </g>
      <g className={`${estilos.capa} ${estilos.nubes}`} data-capa="nubes">
        <path className={estilos.nube} d="M40 52 a14 14 0 0 1 26 -8 a18 18 0 0 1 34 6 a12 12 0 0 1 2 24 h-60 a12 12 0 0 1 -2 -22 z" />
        <path className={`${estilos.nube} ${estilos.nubeDos}`} d="M190 40 a14 14 0 0 1 26 -8 a18 18 0 0 1 34 6 a12 12 0 0 1 2 24 h-60 a12 12 0 0 1 -2 -22 z" />
      </g>
      <g className={`${estilos.capa} ${estilos.lluvia}`} data-capa="lluvia">
        {Array.from({ length: 14 }, (_, i) => (
          <line key={i} x1={44 + i * 18} y1={78 + (i % 3) * 6} x2={40 + i * 18} y2={94 + (i % 3) * 6} style={{ animationDelay: `${(i % 5) * -0.17}s` }} />
        ))}
      </g>
      <g className={`${estilos.capa} ${estilos.viento}`} data-capa="viento">
        <path d="M10 70 h90 a10 10 0 1 0 -10 -10" />
        <path d="M30 100 h120 a8 8 0 1 1 8 8" />
        <path d="M170 84 h110" />
      </g>
      <g className={`${estilos.capa} ${estilos.suelo}`} data-capa="suelo">
        <rect x="-100" y="140" width="520" height="140" />
        <path className={`${estilos.capa} ${estilos.grietas}`} data-capa="grietas" d="M40 150 l10 8 l-6 10 M120 146 l-8 12 l10 8 M210 152 l12 6 l-4 12 M280 148 l-10 10" />
        <path className={`${estilos.capa} ${estilos.rastrojo}`} data-capa="rastrojo" d="M20 141 h60 M100 141 h70 M190 141 h50 M260 141 h50" />
        <path className={`${estilos.capa} ${estilos.escorrentia}`} data-capa="escorrentia" d="M0 150 q40 6 80 0 t80 0 t80 0 t80 0" />
        <g className={`${estilos.capa} ${estilos.barreras}`} data-capa="barreras">
          <rect x="88" y="132" width="10" height="10" rx="3" />
          <rect x="228" y="132" width="10" height="10" rx="3" />
        </g>
      </g>
      <g className={`${estilos.capa} ${estilos.plantas}`} data-capa="plantas">
        {[60, 160, 260].map((x, i) => (
          <g key={x} transform={`translate(${x} 140)`}>
            <g className={estilos.planta} style={{ transitionDelay: `${i * 80}ms` }}>
              <path className={estilos.tallo} d="M0 0 v-34" />
              <path className={estilos.hoja} d="M0 -14 q-16 -4 -18 -16 q14 0 18 12 z" />
              <path className={estilos.hoja} d="M0 -22 q16 -4 18 -16 q-14 0 -18 12 z" />
            </g>
          </g>
        ))}
      </g>
      <g className={`${estilos.capa} ${estilos.gotas}`} data-capa="gotas">
        <path d="M110 120 c0 -8 8 -14 8 -20 c0 6 8 12 8 20 a8 8 0 0 1 -16 0 z" />
        <path d="M210 120 c0 -8 8 -14 8 -20 c0 6 8 12 8 20 a8 8 0 0 1 -16 0 z" />
      </g>
    </svg>
  )
}

export interface PropsExplicacion {
  /** Fenómeno con el que empieza. Por defecto El Niño. */
  inicial?: Fenomeno
  /** Oculta los chips para elegir otro fenómeno (en el chat se muestra solo el que pidió el asistente). */
  fijo?: boolean
}

/**
 * Explicación gráfica de un fenómeno del clima en tres pasos: qué es, cómo afecta al cultivo y qué
 * hacer. Los pasos avanzan solos; con movimiento reducido no avanzan ni se animan.
 */
export function ExplicacionFenomeno({ inicial = 'nino', fijo = false }: PropsExplicacion) {
  const { t } = useTranslation()
  const id = useId()
  const [fenomeno, fijarFenomeno] = useState<Fenomeno>(inicial)
  const [paso, fijarPaso] = useState(0)
  const [pausado, fijarPausado] = useState(reducido)
  const pasos = t(`fenomeno.${fenomeno}.pasos`, { returnObjects: true }) as string[]
  const total = pasos.length

  useEffect(() => {
    if (pausado || paso >= total - 1) return
    const reloj = window.setTimeout(() => fijarPaso((p) => p + 1), DURACION_PASO_MS)
    return () => window.clearTimeout(reloj)
  }, [pausado, paso, total])

  function elegir(f: Fenomeno) {
    fijarFenomeno(f)
    fijarPaso(0)
  }
  const ir = (p: number) => {
    fijarPaso(Math.max(0, Math.min(total - 1, p)))
    fijarPausado(true)
  }
  const terminado = paso === total - 1

  return (
    <div className={estilos.explicacion} data-fenomeno={fenomeno}>
      {!fijo && (
        <div className={estilos.selector} role="group" aria-label={t('fenomeno.elegir')}>
          {FENOMENOS.map((f) => (
            <Chip key={f} variante="filtro" icono={ICONO[f]} seleccionado={f === fenomeno} onClick={() => elegir(f)}>
              {t(`fenomeno.${f}.nombre`)}
            </Chip>
          ))}
        </div>
      )}
      <div className={estilos.lienzo}>
        <Escena ver={ESCENAS[fenomeno][paso]} />
        {terminado && (
          <span className={estilos.insignia} aria-hidden="true">
            <Icono nombre={ICONO_CONSEJO[fenomeno]} tamano={28} />
          </span>
        )}
      </div>
      <div className={estilos.pie}>
        <div className={estilos.progreso} aria-hidden="true">
          {pasos.map((_, i) => (
            <span key={`${fenomeno}-${i}`} className={estilos.marca} data-estado={i < paso ? 'hecho' : i === paso ? (pausado ? 'quieto' : 'activo') : 'pendiente'} />
          ))}
        </div>
        <p className={estilos.contador} id={`${id}-paso`}>
          {fijo ? `${t(`fenomeno.${fenomeno}.nombre`)} · ` : ''}
          {t('fenomeno.paso', { n: paso + 1, total })}
        </p>
        <p key={`${fenomeno}-${paso}`} className={estilos.texto} aria-live="polite">
          {pasos[paso]}
        </p>
        <div className={estilos.controles}>
          <BotonIcono icono="arrow_back" etiqueta={t('fenomeno.anterior')} disabled={paso === 0} onClick={() => ir(paso - 1)} />
          {terminado ? (
            <BotonIcono
              icono="replay"
              etiqueta={t('fenomeno.repetir')}
              variante="tonal"
              onClick={() => {
                fijarPaso(0)
                fijarPausado(reducido())
              }}
            />
          ) : (
            <BotonIcono
              icono={pausado ? 'play_arrow' : 'pause'}
              etiqueta={pausado ? t('fenomeno.seguir') : t('fenomeno.pausar')}
              variante="tonal"
              onClick={() => fijarPausado((p) => !p)}
            />
          )}
          <BotonIcono icono="arrow_forward" etiqueta={t('fenomeno.siguiente')} disabled={terminado} onClick={() => ir(paso + 1)} />
        </div>
      </div>
    </div>
  )
}
