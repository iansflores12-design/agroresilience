import type { FeatureCollection, MultiPolygon } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useImperativeHandle, useRef } from 'react'
import insigniaSvg from '@material-symbols/svg-400/rounded/workspace_premium.svg?raw'
import { buscarDepartamento, palabraNivel, ranking, type Nivel } from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import limitesJson from '../../datos/departamentos.geo.json'
import { colocarEtiquetas, type EntradaEtiqueta } from './colocarEtiquetas'
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
  /** Acerca y centra el mapa en un departamento (codigo ISO, por ejemplo HN-CH). */
  irADepartamento(id: string): void
}

/** Lo que pide pintar cada puntaje: se guarda para volver a acomodarlos al acercar o cambiar el tamano. */
interface Etiqueta {
  id: string
  nombre: string
  total: number
  nivel: Nivel
  /** 1, 2 o 3 si esta entre los tres mejores. */
  posicion: number | null
  elegido: boolean
}

interface Interno {
  mapa: L.Map
  departamentos: Map<string, L.Path>
  lugares: Map<string, L.Marker>
  /** Centro de cada departamento, donde va su puntaje. */
  centros: Map<string, L.LatLng>
  etiquetas: Map<string, L.Marker>
  /** Linea y punto que unen un puntaje alejado de su centro con su departamento. */
  guias: Map<string, L.LayerGroup>
  pedidas: Etiqueta[]
  /** Lugar elegido: su nombre sale en una etiqueta encima del punto y los puntajes se apartan de ella. */
  lugarElegido: { lat: number; lon: number } | null
  verTodo(): void
  marcarMovido(): void
  recolocar(): void
}

// Tamano aproximado de una etiqueta, solo para cuando el navegador no puede medirla.
const ETIQUETA_BASE = { ancho: 36, alto: 26 }
const INSIGNIA_ALTO = 22
const NOMBRE_ALTO = 22
const LUGAR_ZONA = 28
/** Si el puntaje queda a mas de esto de su centro, se dibuja una guia hasta el departamento. */
const DISTANCIA_GUIA = 22

/** Centro del poligono mas grande de un departamento (los de islas tienen varios). */
function centroDe(rasgo: { geometry: MultiPolygon }): L.LatLng {
  let mejor: number[][] = []
  let areaMejor = -1
  for (const poligono of rasgo.geometry.coordinates) {
    const anillo = poligono[0]
    const lons = anillo.map((c) => c[0])
    const lats = anillo.map((c) => c[1])
    const area = (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats))
    if (area > areaMejor) {
      areaMejor = area
      mejor = anillo
    }
  }
  // Centroide del anillo (formula del area con signo).
  let area2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < mejor.length - 1; i++) {
    const [x0, y0] = mejor[i]
    const [x1, y1] = mejor[i + 1]
    const f = x0 * y1 - x1 * y0
    area2 += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(area2) < 1e-9) return L.latLng(mejor[0][1], mejor[0][0])
  return L.latLng(cy / (3 * area2), cx / (3 * area2))
}

function htmlEtiqueta(e: Etiqueta): string {
  const insignia = e.posicion
    ? `<span class="${estilos.insignia}" data-posicion="${e.posicion}">${insigniaSvg}<span>${e.posicion}</span></span>`
    : ''
  const nombre = e.elegido ? `<span class="${estilos.nombreDepto}">${e.nombre}</span>` : ''
  return `<span class="${estilos.etiqueta}" data-departamento="${e.id}" data-nivel="${e.nivel}"${
    e.elegido ? ' data-elegido="true"' : ''
  } aria-hidden="true">${insignia}<span class="${estilos.numero}">${e.total}</span>${nombre}</span>`
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
 * da el cultivo elegido y lleva su puntaje escrito encima, siempre visible. Cada lugar con datos
 * es un punto.
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

    // Los puntajes van debajo de los puntos de los lugares y nunca reciben toques.
    const panel = mapa.createPane('puntajes')
    panel.style.zIndex = '590'

    let movido = false
    let zoomCompleto = mapa.getZoom()
    const verTodo = () => {
      movido = false
      const { x, y } = mapa.getSize()
      if (x > 0 && y > 0) mapa.fitBounds(honduras, { animate: false })
      zoomCompleto = mapa.getZoom()
      interno.current?.recolocar()
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
    const centros = new Map<string, L.LatLng>()
    L.geoJSON(limites, {
      onEachFeature: (rasgo, capa) => {
        departamentos.set(rasgo.properties.id, capa as L.Path)
        centros.set(rasgo.properties.id, centroDe(rasgo as { geometry: MultiPolygon }))
      },
    }).addTo(mapa)
    departamentos.forEach((capa, id) => {
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

    const etiquetas = new Map<string, L.Marker>()
    const actual: Interno = {
      mapa,
      departamentos,
      lugares,
      centros,
      etiquetas,
      guias: new Map(),
      pedidas: [],
      lugarElegido: null,
      verTodo,
      marcarMovido: () => {
        movido = true
      },
      recolocar: () => {
        if (actual.pedidas.length === 0) return
        const { x: ancho, y: alto } = mapa.getSize()
        const entradas: EntradaEtiqueta[] = actual.pedidas.map((e) => {
          const centro = mapa.latLngToContainerPoint(centros.get(e.id)!)
          const dentro = etiquetas.get(e.id)?.getElement()?.firstElementChild as HTMLElement | null | undefined
          const estimado = {
            ancho: ETIQUETA_BASE.ancho + (e.elegido ? Math.max(0, e.nombre.length * 8 - 20) : 0),
            alto: ETIQUETA_BASE.alto + (e.posicion ? INSIGNIA_ALTO : 0) + (e.elegido ? NOMBRE_ALTO : 0),
          }
          return {
            x: centro.x,
            y: centro.y,
            ancho: dentro?.offsetWidth || estimado.ancho,
            alto: dentro?.offsetHeight || estimado.alto,
            fija: e.elegido,
          }
        })
        const obstaculos = zonas.map((z) => {
          const p = mapa.latLngToContainerPoint([z.lat, z.lon])
          return { x: p.x, y: p.y, ancho: LUGAR_ZONA, alto: LUGAR_ZONA }
        })
        if (actual.lugarElegido) {
          // El nombre del lugar elegido flota encima de su punto.
          const p = mapa.latLngToContainerPoint([actual.lugarElegido.lat, actual.lugarElegido.lon])
          obstaculos.push({ x: p.x, y: p.y - 26, ancho: 110, alto: 28 })
        }
        const finales = colocarEtiquetas(entradas, obstaculos, ancho, alto)
        actual.pedidas.forEach((e, i) => {
          const centro = centros.get(e.id)!
          const destino = mapa.containerPointToLatLng(L.point(finales[i].x, finales[i].y))
          etiquetas.get(e.id)?.setLatLng(destino)
          // Si el puntaje quedo lejos de su departamento, una guia los une.
          const lejos = Math.hypot(finales[i].x - entradas[i].x, finales[i].y - entradas[i].y) > DISTANCIA_GUIA
          let guia = actual.guias.get(e.id)
          if (!lejos) {
            guia?.remove()
            actual.guias.delete(e.id)
            return
          }
          if (!guia) {
            guia = L.layerGroup([
              L.polyline([centro, destino], { pane: 'puntajes', interactive: false, className: estilos.guia }),
              L.circleMarker(centro, { pane: 'puntajes', interactive: false, radius: 4, className: estilos.guiaPunto }),
            ]).addTo(mapa)
            actual.guias.set(e.id, guia)
          } else {
            ;(guia.getLayers()[0] as L.Polyline).setLatLngs([centro, destino])
          }
        })
      },
    }
    // Al acercar o cambiar el tamano, los puntajes se acomodan de nuevo.
    mapa.on('zoomend resize', () => actual.recolocar())

    interno.current = actual
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

    const orden = ranking(cultivoId, escenario)
    const mejores = new Map(orden.slice(0, 3).map((p, i) => [p.id, i + 1]))
    const pedidas: Etiqueta[] = []

    actual.departamentos.forEach((capa, id) => {
      const puesto = puestos.get(id)
      const nivel = puesto?.nivel ?? 'sin'
      const nombre = buscarDepartamento(id)?.nombre ?? id
      if (puesto) {
        pedidas.push({
          id,
          nombre,
          total: puesto.total,
          nivel: puesto.nivel,
          posicion: mejores.get(id) ?? null,
          elegido: id === departamentoId,
        })
      }
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
      if (id === departamentoId) capa.bringToFront()
    })

    // Puntajes escritos sobre cada departamento. Sin cultivo no hay ninguno.
    const pedidasPorId = new Set(pedidas.map((e) => e.id))
    actual.etiquetas.forEach((marcador, id) => {
      if (pedidasPorId.has(id)) return
      marcador.remove()
      actual.etiquetas.delete(id)
    })
    for (const e of pedidas) {
      let marcador = actual.etiquetas.get(e.id)
      const icono = L.divIcon({ className: estilos.capaEtiqueta, html: htmlEtiqueta(e), iconSize: [0, 0] })
      if (marcador) marcador.setIcon(icono)
      else {
        marcador = L.marker(actual.centros.get(e.id)!, { icon: icono, pane: 'puntajes', interactive: false, keyboard: false })
        marcador.addTo(actual.mapa)
        actual.etiquetas.set(e.id, marcador)
      }
      marcador.setZIndexOffset(e.elegido ? 200 : e.posicion ? 100 : 0)
    }
    const lugar = zonas.find((z) => z.id === zonaSeleccionadaId)
    actual.lugarElegido = lugar ? { lat: lugar.lat, lon: lugar.lon } : null
    actual.pedidas = pedidas
    // Las guias de antes se borran para que no queden puntajes que ya no existen.
    if (pedidas.length === 0) {
      actual.guias.forEach((g) => g.remove())
      actual.guias.clear()
    }
    actual.recolocar()

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
        interno.current?.marcarMovido()
        mapa?.setView([lat, lon], Math.max(mapa.getZoom(), 8.5))
      },
      irADepartamento: (id) => {
        const actual = interno.current
        const capa = actual?.departamentos.get(id) as L.Polygon | undefined
        if (!actual || !capa) return
        const { x, y } = actual.mapa.getSize()
        if (!(x > 0 && y > 0)) return
        actual.marcarMovido()
        const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        actual.mapa.fitBounds(capa.getBounds(), { maxZoom: 8.5, padding: [32, 32], animate: !sinMovimiento })
      },
    }),
    [],
  )

  return <div ref={raiz} className={estilos.raiz} />
}
