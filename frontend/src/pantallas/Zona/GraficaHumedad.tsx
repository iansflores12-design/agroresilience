import { decimal, diasEntre, fechaCorta, fechaLarga, marcaDia } from './formato'
import estilos from './GraficaHumedad.module.css'

/** Mas de estos dias entre dos lecturas: la linea se corta en vez de unirlas. */
export const MAX_HUECO_DIAS = 5

export interface PropsGraficaHumedad {
  /** Serie [fecha ISO, humedad en m3/m3], ordenada por fecha. */
  serie: [string, number][]
  /** Normal para la epoca en m3/m3. */
  normal: number | null
}

const PADDING = 6

/** Grafica de linea de la humedad (en %) con la normal punteada. SVG propio, sin librerias. */
export function GraficaHumedad({ serie, normal }: PropsGraficaHumedad) {
  const puntos = serie
    .map(([fecha, v]) => ({ fecha, t: marcaDia(fecha), pct: v * 100 }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.pct))
    .sort((a, b) => a.t - b.t)
  if (puntos.length === 0) return <p className="tipo-nota">Sin lectura: la serie de los últimos 120 días está vacía.</p>

  const normalPct = normal === null ? null : normal * 100
  const valores = puntos.map((p) => p.pct).concat(normalPct === null ? [] : [normalPct])
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rangoV = max - min || 1
  const t0 = puntos[0].t
  const t1 = puntos[puntos.length - 1].t
  const rangoT = t1 - t0 || 1

  const px = (t: number) => (puntos.length === 1 ? 50 : ((t - t0) / rangoT) * 100)
  const py = (v: number) => 100 - PADDING - ((v - min) / rangoV) * (100 - 2 * PADDING)
  const f = (n: number) => n.toFixed(2)

  // Un trazo por tramo continuo: si hay mas de MAX_HUECO_DIAS entre dos lecturas, se corta.
  let d = ''
  puntos.forEach((p, i) => {
    const previo = puntos[i - 1]
    const unido = previo && diasEntre(previo.fecha, p.fecha) <= MAX_HUECO_DIAS
    const sigue = puntos[i + 1] && diasEntre(p.fecha, puntos[i + 1].fecha) <= MAX_HUECO_DIAS
    if (unido) d += `L${f(px(p.t))} ${f(py(p.pct))}`
    else d += `M${f(px(p.t))} ${f(py(p.pct))}${sigue ? '' : 'l0.01 0'}`
  })

  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  const resumen =
    `Humedad del suelo, ${puntos.length} lecturas del ${fechaLarga(primero.fecha)} al ${fechaLarga(ultimo.fecha)}: ` +
    `pasó de ${decimal(primero.pct)} % a ${decimal(ultimo.pct)} %, con mínimo de ${decimal(Math.min(...puntos.map((p) => p.pct)))} % ` +
    `y máximo de ${decimal(Math.max(...puntos.map((p) => p.pct)))} %` +
    (normalPct === null ? '. Sin normal histórica.' : `. La normal para la época es ${decimal(normalPct)} %.`)

  return (
    <div className={estilos.grafica} role="img" aria-label={resumen}>
      <div className={estilos.ejeY} aria-hidden="true">
        <span>{decimal(max)} %</span>
        <span>{decimal(min)} %</span>
      </div>
      <div className={estilos.area} aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={estilos.svg} focusable="false">
          {normalPct !== null && (
            <line
              className={estilos.normal}
              x1={0}
              x2={100}
              y1={py(normalPct)}
              y2={py(normalPct)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path className={estilos.linea} d={d} vectorEffect="non-scaling-stroke" />
        </svg>
        {normalPct !== null && (
          <span className={estilos.etiquetaNormal} style={{ top: `${py(normalPct)}%` }}>
            Normal {decimal(normalPct)} %
          </span>
        )}
        <span className={estilos.ultimo} style={{ left: `${px(ultimo.t)}%`, top: `${py(ultimo.pct)}%` }} />
      </div>
      <div className={estilos.ejeX} aria-hidden="true">
        <span>{fechaCorta(primero.fecha)}</span>
        <span>{fechaCorta(ultimo.fecha)}</span>
      </div>
    </div>
  )
}
