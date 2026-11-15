import type { FeatureCollection, MultiPolygon } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { buscarDepartamento, palabraNivel, ranking } from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import limitesJson from '../../datos/departamentos.geo.json'
import type { PropsMapa } from './ContenedorMapa'
import { nombreCorto } from './formato'
import estilos from './MapaHonduras.module.css'

// Limites de geoBoundaries (OpenStreetMap, licencia ODbL), simplificados para pesar poco.
const limites = limitesJson as unknown as FeatureCollection<MultiPolygon, { id: string }>

/** Acciones que la pantalla puede pedirle al mapa desde sus propios botones. */
export interface ControlMapa {
  acercar(): void
  alejar(): void
  verTodo(): void
  irA(lat: number, lon: number): void
}

interface Interno {
  mapa: L.Map
  departamentos: Map<string, L.Path>
  lugares: Map<string, L.Marker>
  verTodo(): void
}

/** Si un lugar cae sobre el centro del departamento, corre el puntaje para que el punto no lo tape. */
function lejosDeLosLugares(centro: L.LatLng, zonas: PropsMapa['zonas']): L.PointExpression {
  let cerca: { dx: number; dy: number; d: number } | null = null
  for (const z of zonas) {
    const dx = centro.lng - z.lon
    const dy = z.lat - centro.lat // en pantalla, el norte queda arriba
    const d = Math.hypot(dx, dy)
    if (d < 0.3 && (!cerca || d < cerca.d)) cerca = { dx, dy, d }
  }
  if (!cerca) return [0, 0]
  if (cerca.d < 0.02) return [0, 24]
  return [Math.round((cerca.dx / cerca.d) * 24), Math.round((cerca.dy / cerca.d) * 24)]
}

function alActivar(el: Element, accion: () => void) {
  el.addEventListener('keydown', (evento) => {
    const tecla = (evento as KeyboardEvent).key
    if (tecla !== 'Enter' && tecla !== ' ') return
    evento.preventDefault()
    accion()
  })
}

/**
 * Honduras por departamento, con Leaflet y sin teselas de fondo: solo se dibujan los limites,
 * asi el mapa carga igual con conexion lenta. Cada departamento se pinta segun que tan bien se
 * da el cultivo elegido; al tocar uno aparece su puntaje encima. Cada lugar con datos es un punto.
 */
export function MapaHonduras({
  zonas,
  caja,
  zonaSeleccionadaId,
  cultivoId,
  alSeleccionarZona,
  departamentoId = null,
  alSeleccionarDepartamento,
  escenario = 'normal',
  enfocar = false,
  ref,
}: PropsMapa) {
  const raiz = useRef<HTMLDivElement>(null)
  const interno = useRef<Interno | null>(null)
  const acciones = useRef({ alSeleccionarZona, alSeleccionarDepartamento })
  const seEligenDepartamentos = Boolean(alSeleccionarDepartamento)

  useEffect(() => {
    acciones.current = { alSeleccionarZona, alSeleccionarDepartamento }
  })

  // Crea el mapa una sola vez; lo que cambia con la seleccion se pinta en el efecto de abajo.
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const honduras = L.latLngBounds([caja.lat_min, caja.lon_min], [caja.lat_max, caja.lon_max])
    const mapa = L.map(el, {
      center: honduras.getCenter(),
      zoom: 7,
      zoomSnap: 0.25,
      zoomDelta: 0.75,
      minZoom: 5.5,
      maxZoom: 10,
      maxBounds: honduras.pad(0.5),
      zoomControl: false,
      attributionControl: false,
      // La rueda y el dedo mueven la pagina, no el mapa (ver `alAcercar`).
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
    })

    let movido = false
    let zoomCompleto = mapa.getZoom()
    const verTodo = () => {
      movido = false
      const { x, y } = mapa.getSize()
      if (x > 0 && y > 0) mapa.fitBounds(honduras, { animate: false })
      zoomCompleto = mapa.getZoom()
    }
    // En telefono, arrastrar solo mueve el mapa cuando esta acercado; si no, desplaza la pagina.
    const alAcercar = () => {
      if (!L.Browser.mobile) return
      if (mapa.getZoom() > zoomCompleto + 0.1) mapa.dragging.enable()
      else mapa.dragging.disable()
    }
    mapa.on('zoomend', alAcercar)
    mapa.on('dragstart', () => {
      movido = true
    })

    const departamentos = new Map<string, L.Path>()
    L.geoJSON(limites, {
      onEachFeature: (rasgo, capa) => {
        departamentos.set(rasgo.properties.id, capa as L.Path)
      },
    }).addTo(mapa)
    departamentos.forEach((capa, id) => {
      capa.bindTooltip('', {
        permanent: true,
        direction: 'center',
        className: estilos.puntaje,
        offset: lejosDeLosLugares((capa as L.Polygon).getCenter(), zonas),
      })
      if (!seEligenDepartamentos) return
      const elegir = () => acciones.current.alSeleccionarDepartamento?.(id)
      capa.on('click', elegir)
      const trazo = capa.getElement()
      if (!trazo) return
      trazo.setAttribute('role', 'button')
      trazo.setAttribute('tabindex', '0')
      alActivar(trazo, elegir)
    })

    const lugares = new Map<string, L.Marker>()
    for (const zona of zonas) {
      const marcador = L.marker([zona.lat, zona.lon], {
        icon: L.divIcon({ className: estilos.lugar, html: '<span></span>', iconSize: [48, 48] }),
        keyboard: false,
      }).addTo(mapa)
      const boton = marcador.getElement()
      if (boton) {
        const elegir = () => acciones.current.alSeleccionarZona(zona.id)
        boton.setAttribute('role', 'button')
        boton.setAttribute('tabindex', '0')
        boton.setAttribute('aria-label', zona.nombre)
        boton.addEventListener('click', elegir)
        alActivar(boton, elegir)
      }
      lugares.set(zona.id, marcador)
    }

    verTodo()
    const observador =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            mapa.invalidateSize({ animate: false })
            if (!movido) verTodo()
          })
    observador?.observe(el)

    interno.current = { mapa, departamentos, lugares, verTodo }
    return () => {
      observador?.disconnect()
      interno.current = null
      mapa.remove()
    }
  }, [zonas, caja, seEligenDepartamentos])

  // Pinta la seleccion: color y puntaje de cada departamento, y el lugar elegido.
  useEffect(() => {
    const actual = interno.current
    if (!actual) return
    const puestos = new Map(ranking(cultivoId, escenario).map((p) => [p.id, p]))
    const cultivo = buscarCultivo(cultivoId)

    actual.departamentos.forEach((capa, id) => {
      const puesto = puestos.get(id)
      const nivel = puesto?.nivel ?? 'sin'
      const nombre = buscarDepartamento(id)?.nombre ?? id
      // El puntaje solo se ve sobre el departamento elegido. Se oculta con `hidden` porque
      // Leaflet no vuelve a pintar una etiqueta cuando su contenido queda vacio.
      if (puesto) capa.setTooltipContent(String(puesto.total))
      capa.getTooltip()?.getElement()?.toggleAttribute('hidden', !puesto || id !== departamentoId)
      const trazo = capa.getElement()
      if (!trazo) return
      trazo.setAttribute('data-nivel', nivel)
      trazo.setAttribute(
        'aria-label',
        puesto && cultivo
          ? `Departamento de ${nombre}: ${palabraNivel[puesto.nivel].toLowerCase()} para ${cultivo.nombre.toLowerCase()}, ${puesto.total} de 100`
          : `Departamento de ${nombre}`,
      )
      if (seEligenDepartamentos) trazo.setAttribute('aria-pressed', String(id === departamentoId))
      trazo.toggleAttribute('data-elegido', id === departamentoId)
      if (id === departamentoId) capa.bringToFront()
    })

    actual.lugares.forEach((marcador, id) => {
      const elegido = id === zonaSeleccionadaId
      marcador.getElement()?.setAttribute('aria-pressed', String(elegido))
      marcador.setZIndexOffset(elegido ? 1000 : 0)
      marcador.unbindTooltip()
      const zona = zonas.find((z) => z.id === id)
      if (elegido && zona) {
        marcador.bindTooltip(nombreCorto(zona.nombre), {
          permanent: true,
          direction: 'top',
          offset: [0, -12],
          className: estilos.nombreLugar,
        })
      }
    })
  }, [cultivoId, escenario, departamentoId, zonaSeleccionadaId, zonas, caja, seEligenDepartamentos])

  useImperativeHandle(
    ref,
    () => ({
      acercar: () => interno.current?.mapa.zoomIn(),
      alejar: () => interno.current?.mapa.zoomOut(),
      verTodo: () => interno.current?.verTodo(),
      irA: (lat, lon) => {
        const mapa = interno.current?.mapa
        mapa?.setView([lat, lon], Math.max(mapa.getZoom(), 8.5))
      },
    }),
    [],
  )

  return <div ref={raiz} className={estilos.raiz} data-enfoque={enfocar && departamentoId ? '' : undefined} />
}
