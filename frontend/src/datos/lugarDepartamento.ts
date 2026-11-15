// Elegir el lugar por departamento (18) en vez de por municipio. Los datos de humedad, lluvia y el
// pronostico siguen saliendo de los 11 puntos de `zonas.generado.json`: cada departamento usa el
// punto que cae dentro de el o, si no tiene, el mas cercano a su centro.

import limitesJson from './departamentos.geo.json'
import { departamentoDeZona, departamentos } from './aptitud'
import { zonas, type Zona } from './zonas'

type Anillo = [number, number][]
interface Rasgo {
  properties: { id: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

const rasgos = (limitesJson as unknown as { features: Rasgo[] }).features

function poligonos(r: Rasgo): Anillo[][] {
  return r.geometry.type === 'Polygon' ? [r.geometry.coordinates as Anillo[]] : (r.geometry.coordinates as Anillo[][])
}

/** Punto dentro de un anillo (lon, lat), por cruce de rayos. */
function dentroDeAnillo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

/** El departamento donde cae un punto (por ejemplo, el GPS de la parcela); null si cae fuera. */
export function departamentoEnPunto(lat: number, lon: number): string | null {
  for (const r of rasgos) {
    for (const [exterior, ...huecos] of poligonos(r)) {
      if (dentroDeAnillo(lon, lat, exterior) && !huecos.some((h) => dentroDeAnillo(lon, lat, h))) return r.properties.id
    }
  }
  return null
}

/** Centro aproximado (promedio de los vertices del poligono mas grande). */
const CENTROS = new Map<string, { lat: number; lon: number }>(
  rasgos.map((r) => {
    const mayor = poligonos(r).reduce((a, b) => (b[0].length > a[0].length ? b : a))[0]
    const lon = mayor.reduce((s, p) => s + p[0], 0) / mayor.length
    const lat = mayor.reduce((s, p) => s + p[1], 0) / mayor.length
    return [r.properties.id, { lat, lon }]
  }),
)

export function centroDepartamento(id: string): { lat: number; lon: number } | null {
  return CENTROS.get(id) ?? null
}

const distancia2 = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2

/** El punto de datos que representa a un departamento: el que cae dentro, o el mas cercano a su centro. */
export function zonaDeDepartamento(id: string, lista: Zona[] = zonas): Zona | null {
  const centro = centroDepartamento(id)
  const propias = lista.filter((z) => departamentoDeZona(z.id) === id)
  const candidatas = propias.length ? propias : lista
  if (!centro) return propias[0] ?? null
  return candidatas.reduce<Zona | null>((a, b) => (!a || distancia2(b, centro) < distancia2(a, centro) ? b : a), null)
}

/** Los 18 departamentos en orden alfabetico, con el punto de datos que usa cada uno. */
export function departamentosConDatos(locale = 'es'): { id: string; nombre: string; zona: Zona | null; propia: boolean }[] {
  return [...departamentos]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, locale))
    .map((d) => {
      const zona = zonaDeDepartamento(d.id)
      return { id: d.id, nombre: d.nombre, zona, propia: Boolean(zona && departamentoDeZona(zona.id) === d.id) }
    })
}

/** El departamento elegido; en estados guardados antes de elegir por departamento, el del punto de datos. */
export function departamentoElegido(e: { departamentoId: string | null; zonaId: string | null }): string | null {
  return e.departamentoId ?? departamentoDeZona(e.zonaId)
}
