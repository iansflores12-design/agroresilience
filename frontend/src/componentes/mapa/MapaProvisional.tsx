import { useEffect, useMemo, useRef, useState } from 'react'
import { clases } from '../clases'
import { etiquetaLatitud, etiquetaLongitud, nombreCorto } from './formato'
import estilos from './MapaProvisional.module.css'
import type { PropsMapa } from './ContenedorMapa'

/** Margen interior (en %) para que los puntos de los bordes no queden recortados. */
const MARGEN = 9
const RADIO_PUNTO = 7
const ALTO_ETIQUETA = 20
const TAMANO_INICIAL = { ancho: 360, alto: 420 }

interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}
type Lado = 'derecha' | 'izquierda' | 'arriba' | 'abajo'

function seSolapan(a: Rect, b: Rect) {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
}

function rectEtiqueta(lado: Lado, cx: number, cy: number, ancho: number): Rect {
  const sep = RADIO_PUNTO + 4
  switch (lado) {
    case 'derecha':
      return { x: cx + sep, y: cy - ALTO_ETIQUETA / 2, ancho, alto: ALTO_ETIQUETA }
    case 'izquierda':
      return { x: cx - sep - ancho, y: cy - ALTO_ETIQUETA / 2, ancho, alto: ALTO_ETIQUETA }
    case 'arriba':
      return { x: cx - ancho / 2, y: cy - sep - ALTO_ETIQUETA, ancho, alto: ALTO_ETIQUETA }
    case 'abajo':
      return { x: cx - ancho / 2, y: cy + sep, ancho, alto: ALTO_ETIQUETA }
  }
}

/** Mide el contenedor. Sin ResizeObserver (pruebas) usa un tamano por defecto. */
function useTamano(ref: React.RefObject<HTMLDivElement | null>) {
  const [tamano, setTamano] = useState(TAMANO_INICIAL)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setTamano({ ancho: width, alto: height })
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return tamano
}

/**
 * Mapa provisional: reticula de latitud y longitud (una linea por grado) y un punto por zona,
 * ubicado por proyeccion lineal de sus coordenadas dentro de `caja`. No dibuja ningun contorno.
 */
export function MapaProvisional({ zonas, caja, zonaSeleccionadaId, alSeleccionarZona }: PropsMapa) {
  const raiz = useRef<HTMLDivElement>(null)
  const { ancho, alto } = useTamano(raiz)

  const spanLat = caja.lat_max - caja.lat_min
  const spanLon = caja.lon_max - caja.lon_min
  const { x, y } = useMemo(
    () => ({
      x: (lon: number) => MARGEN + ((lon - caja.lon_min) / spanLon) * (100 - 2 * MARGEN),
      y: (lat: number) => MARGEN + ((caja.lat_max - lat) / spanLat) * (100 - 2 * MARGEN),
    }),
    [caja, spanLon, spanLat],
  )

  const lineasLat: number[] = []
  for (let g = Math.ceil(caja.lat_min); g <= Math.floor(caja.lat_max); g++) lineasLat.push(g)
  const lineasLon: number[] = []
  for (let g = Math.ceil(caja.lon_min); g <= Math.floor(caja.lon_max); g++) lineasLon.push(g)

  // Colocacion voraz de etiquetas sin solapes: primero la elegida, luego el resto.
  const lados = useMemo(() => {
    const puntos = zonas.map((z) => ({
      id: z.id,
      cx: (x(z.lon) / 100) * ancho,
      cy: (y(z.lat) / 100) * alto,
      ancho: nombreCorto(z.nombre).length * 6.4 + 14,
    }))
    const ocupados: Rect[] = puntos.map((p) => ({
      x: p.cx - RADIO_PUNTO,
      y: p.cy - RADIO_PUNTO,
      ancho: RADIO_PUNTO * 2,
      alto: RADIO_PUNTO * 2,
    }))
    const resultado = new Map<string, Lado | null>()
    const orden = [...puntos].sort((a, b) => Number(b.id === zonaSeleccionadaId) - Number(a.id === zonaSeleccionadaId))
    for (const p of orden) {
      const candidatos: Lado[] = ['derecha', 'izquierda', 'arriba', 'abajo']
      let elegido: Lado | null = null
      for (const lado of candidatos) {
        const r = rectEtiqueta(lado, p.cx, p.cy, p.ancho)
        const dentro = r.x >= 0 && r.y >= 0 && r.x + r.ancho <= ancho && r.y + r.alto <= alto
        if (dentro && !ocupados.some((o) => seSolapan(o, r))) {
          elegido = lado
          ocupados.push(r)
          break
        }
      }
      // La zona elegida siempre muestra su etiqueta, aunque haya que montarla.
      if (!elegido && p.id === zonaSeleccionadaId) elegido = 'arriba'
      resultado.set(p.id, elegido)
    }
    return resultado
  }, [zonas, x, y, zonaSeleccionadaId, ancho, alto])

  return (
    <div ref={raiz} className={estilos.raiz}>
      <svg className={estilos.reticula} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {lineasLon.map((g) => (
          <line key={`lon${g}`} x1={x(g)} y1={0} x2={x(g)} y2={100} vectorEffect="non-scaling-stroke" />
        ))}
        {lineasLat.map((g) => (
          <line key={`lat${g}`} x1={0} y1={y(g)} x2={100} y2={y(g)} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className={estilos.etiquetasEje} aria-hidden="true">
        {lineasLat.map((g) => (
          <span key={`el${g}`} className={clases(estilos.eje, estilos.ejeLat)} style={{ top: `${y(g)}%` }}>
            {etiquetaLatitud(g)}
          </span>
        ))}
        {lineasLon.map((g) => (
          <span key={`eo${g}`} className={clases(estilos.eje, estilos.ejeLon)} style={{ left: `${x(g)}%` }}>
            {etiquetaLongitud(g)}
          </span>
        ))}
      </div>

      {zonas.map((z) => {
        const elegida = z.id === zonaSeleccionadaId
        const lado = lados.get(z.id) ?? null
        return (
          <button
            key={z.id}
            type="button"
            aria-label={z.nombre}
            aria-pressed={elegida}
            className={clases(estilos.punto, elegida && estilos.elegido, 'capa-estado')}
            style={{ left: `${x(z.lon)}%`, top: `${y(z.lat)}%` }}
            onClick={() => alSeleccionarZona(z.id)}
          >
            <span className={estilos.marca} aria-hidden="true" />
            {lado && (
              <span className={clases(estilos.etiqueta, estilos[lado])} aria-hidden="true">
                {nombreCorto(z.nombre)}
              </span>
            )}
          </button>
        )
      })}

      <p className={estilos.insignia}>Espacio reservado para el componente de mapa</p>
    </div>
  )
}
