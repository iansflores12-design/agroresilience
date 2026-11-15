import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { aptitud, buscarDepartamento, tieneAptitud, type ClaveFactor } from '../../datos/aptitud'
import type { Zona } from '../../datos/zonas'
import { detectarAnio } from '../mapa/escenario'
import { ICONO_CULTIVO } from '../decision/visual'
import { Icono } from '../Icono'
import type { TemaExplicacion } from './ExplicacionFenomeno'
import estilos from './temasLugar.module.css'

type Textura = 'arcillosa' | 'arenosa' | 'franca'
type Acidez = 'acida' | 'neutra' | 'alcalina'
type Piso = 'alto' | 'medio' | 'bajo'

export function textura(s: { arena_pct: number; arcilla_pct: number }): Textura {
  if (s.arcilla_pct >= 35) return 'arcillosa'
  if (s.arena_pct >= 55) return 'arenosa'
  return 'franca'
}

export function acidez(ph: number): Acidez {
  return ph < 5.5 ? 'acida' : ph > 7.3 ? 'alcalina' : 'neutra'
}

export function piso(alt: number): Piso {
  return alt >= 1000 ? 'alto' : alt >= 400 ? 'medio' : 'bajo'
}

const redondo = (x: number) => Math.round(x)
const v = (x: Record<string, string | number>) => x as CSSProperties

/* ---------- Escenas ---------- */

function EscenaTierra({ paso, suelo }: { paso: number; suelo: NonNullable<Zona['suelo']> }) {
  const { t } = useTranslation()
  const partes = [
    { clave: 'arena', pct: suelo.arena_pct },
    { clave: 'limo', pct: suelo.limo_pct },
    { clave: 'arcilla', pct: suelo.arcilla_pct },
  ] as const
  const tipo = textura(suelo)
  // Que tan hondo llega el agua en el dibujo: rapido en arena, lento en arcilla.
  const hondo = Math.max(0.25, Math.min(0.95, 0.3 + suelo.arena_pct / 100 - suelo.arcilla_pct / 200))
  const marca = Math.max(0, Math.min(1, (suelo.ph - 4) / 5))
  return (
    <div className={estilos.escena} data-paso={paso} aria-hidden="true">
      {paso === 0 && (
        <div className={estilos.capas}>
          {partes.map((p, i) => (
            <div key={p.clave} className={estilos.fila} style={v({ '--i': i })}>
              <span className={estilos.etiqueta}>{t(`explica.tierra.${p.clave}`)}</span>
              <span className={estilos.barra} data-parte={p.clave}>
                <span style={v({ '--valor': p.pct / 100 })} />
              </span>
              <span className={estilos.cifra}>{redondo(p.pct)} %</span>
            </div>
          ))}
        </div>
      )}
      {paso === 1 && (
        <div className={estilos.perfil} data-textura={tipo}>
          <span className={estilos.charco} />
          <span className={estilos.frente} style={v({ '--hondo': hondo })} />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={estilos.gota} style={v({ '--i': i, '--hondo': hondo })} />
          ))}
        </div>
      )}
      {paso === 2 && (
        <div className={estilos.escalaPh}>
          <span className={estilos.degradado}>
            <span className={estilos.marcaPh} style={v({ '--pos': marca })}>
              {suelo.ph.toFixed(1)}
            </span>
          </span>
          <span className={estilos.extremos}>
            <span>{t('explica.tierra.escalaAcido')}</span>
            <span>{t('explica.tierra.escalaNeutro')}</span>
            <span>{t('explica.tierra.escalaAlcalino')}</span>
          </span>
        </div>
      )}
    </div>
  )
}

const ALT_MAX = 2400
const CULTIVOS_POR_PISO: { id: string; alt: number }[] = [
  { id: 'palma', alt: 150 },
  { id: 'melon', alt: 250 },
  { id: 'maiz', alt: 700 },
  { id: 'tabaco', alt: 900 },
  { id: 'frijol', alt: 1200 },
  { id: 'cafe', alt: 1450 },
]

function EscenaAltura({ paso, alt, temp }: { paso: number; alt: number; temp: number }) {
  const y = (m: number) => 170 - (m / ALT_MAX) * 150
  return (
    <div className={estilos.escena} data-paso={paso} aria-hidden="true">
      <svg className={estilos.montana} viewBox="0 0 320 180" preserveAspectRatio="none">
        <path className={estilos.cerro} d="M-10 180 L-10 165 Q60 160 110 120 Q150 85 175 40 Q190 25 205 45 Q240 95 280 125 Q310 145 330 150 L330 180 Z" />
        <line className={estilos.nivel} x1="0" x2="320" y1={y(alt)} y2={y(alt)} />
      </svg>
      <span className={estilos.punto} style={v({ '--y': y(alt) / 180 })}>
        <span>{redondo(alt).toLocaleString('es')} m</span>
        {paso >= 1 && <span className={estilos.grados}>{temp.toFixed(1)} °C</span>}
      </span>
      {paso >= 1 && <span className={estilos.termometro} />}
      {paso === 2 &&
        CULTIVOS_POR_PISO.map((c, i) => (
          <span key={c.id} className={estilos.cultivoPiso} style={v({ '--y': y(c.alt) / 180, '--x': 0.08 + i * 0.15, '--i': i })}>
            <Icono nombre={ICONO_CULTIVO[c.id] ?? 'grass'} tamano={20} />
          </span>
        ))}
    </div>
  )
}

const ORDEN_FACTORES: ClaveFactor[] = ['agua', 'clima', 'altitud', 'suelo', 'sequia']

function EscenaCultivo({ paso, partes, fuerte, debil }: { paso: number; partes: Record<string, number>; fuerte: string; debil: string }) {
  const { t } = useTranslation()
  return (
    <div className={estilos.escena} data-paso={paso} aria-hidden="true">
      <div className={estilos.capas}>
        {ORDEN_FACTORES.map((k, i) => {
          const resaltado = paso === 1 ? k === fuerte : paso === 2 ? k === debil : true
          return (
            <div key={k} className={estilos.fila} style={v({ '--i': i })} data-apagado={!resaltado || undefined}>
              <span className={estilos.etiqueta}>{t(`aptitud.factores.${k}.nombre`)}</span>
              <span className={estilos.barra} data-parte={paso === 2 && k === debil ? 'debil' : 'factor'}>
                <span style={v({ '--valor': (partes[k] ?? 0) / 100 })} />
              </span>
              <span className={estilos.cifra}>{redondo(partes[k] ?? 0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Temas ---------- */

/**
 * Explicaciones del lugar elegido, con sus datos reales: el porqué del cultivo en ese departamento,
 * la tierra (textura y pH) y la altura. Van antes de los fenómenos del clima.
 */
export function useTemasLugar({ zona, departamentoId, cultivoId }: { zona: Zona | null; departamentoId: string | null; cultivoId: string | null }): TemaExplicacion[] {
  const { t } = useTranslation()
  return useMemo(() => {
    const temas: TemaExplicacion[] = []
    const d = buscarDepartamento(departamentoId)
    if (!d) return temas
    const lugar = d.nombre

    if (tieneAptitud(cultivoId)) {
      const r = aptitud(d.id, cultivoId, detectarAnio(zona).escenario)
      if (r) {
        const partes = Object.fromEntries(r.partes.map((p) => [p.clave, p.valor]))
        const fuerte = r.partes.reduce((a, b) => (b.valor > a.valor ? b : a))
        temas.push({
          id: 'cultivo',
          nombre: t('explica.cultivo.nombre', { el: t(`cultivos.${cultivoId}.el`) }),
          icono: ICONO_CULTIVO[cultivoId] ?? 'grass',
          pasos: [
            t('explica.cultivo.p1', { cultivo: t(`cultivos.${cultivoId}.nombre`), lugar, total: r.total, nivel: t(`aptitud.niveles.${r.nivel}`).toLowerCase() }),
            t('explica.cultivo.p2', { factor: t(`aptitud.factores.${fuerte.clave}.nombre`).toLowerCase(), valor: fuerte.valor }),
            t('explica.cultivo.p3', { limite: t(`aptitud.factores.${r.claveLimite}.limite`) }),
          ],
          escena: (p) => <EscenaCultivo paso={p} partes={partes} fuerte={fuerte.clave} debil={r.claveLimite} />,
        })
      }
    }

    const suelo = zona?.suelo
    if (suelo) {
      const tipo = textura(suelo)
      temas.push({
        id: 'tierra',
        nombre: t('explica.tierra.nombre'),
        icono: 'landscape',
        pasos: [
          t('explica.tierra.p1', {
            lugar,
            arcilla: redondo(suelo.arcilla_pct),
            limo: redondo(suelo.limo_pct),
            arena: redondo(suelo.arena_pct),
            textura: t(`explica.tierra.texturas.${tipo}`),
          }),
          t(`explica.tierra.${tipo}`),
          t(`explica.tierra.${acidez(suelo.ph)}`, { ph: suelo.ph.toFixed(1) }),
        ],
        escena: (p) => <EscenaTierra paso={p} suelo={suelo} />,
        consejo: 'compost',
      })
    }

    temas.push({
      id: 'altura',
      nombre: t('explica.altura.nombre'),
      icono: 'mountain_flag',
      pasos: [
        t('explica.altura.p1', { lugar, alt: redondo(d.alt).toLocaleString('es') }),
        t('explica.altura.p2', { temp: d.temp.toFixed(1) }),
        t(`explica.altura.${piso(d.alt)}`),
      ],
      escena: (p) => <EscenaAltura paso={p} alt={d.alt} temp={d.temp} />,
    })
    return temas
  }, [t, zona, departamentoId, cultivoId])
}
