// Capas del mapa: el fondo (simple, relieve o satelite) y una capa de datos de satelite encima.
// Ninguna pide clave. Probadas el 15-11-2026:
// - Relieve y satelite: teselas de Esri (World_Topo_Map y World_Imagery).
// - Datos: NASA GIBS (WMTS en EPSG:3857). "default" en la fecha trae lo mas reciente de cada capa.
//   El nivel de GoogleMapsCompatible es el zoom maximo que sirve cada una; mas cerca se estira.
// Los textos (nombre, que muestra, extremos de la leyenda y credito) van en i18n: mapa.capas.bases.<id> y
// mapa.capas.datos.<id>.
import type { NombreIcono } from '../iconos'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
const gibs = (capa: string, nivel: number) => `${GIBS}/${capa}/default/default/GoogleMapsCompatible_Level${nivel}/{z}/{y}/{x}.png`

export type CapaBase = 'simple' | 'relieve' | 'satelite'
export type CapaDatos = 'lluvia' | 'humedad' | 'vegetacion' | 'calor'

export interface DefBase {
  icono: NombreIcono
  /** Null: sin teselas, solo los limites (carga igual con conexion lenta). Sin teselas tampoco hay credito. */
  url: string | null
}

export const BASES: Record<CapaBase, DefBase> = {
  simple: { icono: 'map', url: null },
  relieve: { icono: 'landscape', url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}` },
  satelite: { icono: 'layers', url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}` },
}

export interface DefDatos {
  icono: NombreIcono
  url: string
  zoomNativo: number
  /** Colores de la capa, de menos a mas (tomados de las teselas reales). */
  colores: string[]
}

export const DATOS: Record<CapaDatos, DefDatos> = {
  lluvia: {
    icono: 'rainy',
    url: gibs('IMERG_Precipitation_Rate', 6),
    zoomNativo: 6,
    colores: ['#3cb043', '#ffe600', '#ff8c00', '#e60000'],
  },
  humedad: {
    icono: 'water_drop',
    url: gibs('SMAP_L4_Analyzed_Surface_Soil_Moisture', 6),
    zoomNativo: 6,
    colores: ['#c8c800', '#3fa53f', '#35d0d0', '#1030e0'],
  },
  vegetacion: {
    icono: 'grass',
    url: gibs('MODIS_Terra_NDVI_8Day', 9),
    zoomNativo: 9,
    colores: ['#d9c9b8', '#9bc468', '#0b6b1d'],
  },
  calor: {
    icono: 'thermostat',
    url: gibs('MODIS_Terra_L3_Land_Surface_Temp_8Day_Day', 7),
    zoomNativo: 7,
    colores: ['#9be000', '#ffff00', '#ff9900', '#e60000'],
  },
}

export const ORDEN_BASES: CapaBase[] = ['simple', 'relieve', 'satelite']
export const ORDEN_DATOS: CapaDatos[] = ['lluvia', 'humedad', 'vegetacion', 'calor']
