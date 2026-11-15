// Capas del mapa: el fondo (simple, relieve o satelite) y una capa de datos de satelite encima.
// Ninguna pide clave. Probadas el 15-11-2026:
// - Relieve y satelite: teselas de Esri (World_Topo_Map y World_Imagery).
// - Datos: NASA GIBS (WMTS en EPSG:3857). "default" en la fecha trae lo mas reciente de cada capa.
//   El nivel de GoogleMapsCompatible es el zoom maximo que sirve cada una; mas cerca se estira.
import type { NombreIcono } from '../iconos'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
const gibs = (capa: string, nivel: number) => `${GIBS}/${capa}/default/default/GoogleMapsCompatible_Level${nivel}/{z}/{y}/{x}.png`

export type CapaBase = 'simple' | 'relieve' | 'satelite'
export type CapaDatos = 'lluvia' | 'humedad' | 'vegetacion' | 'calor'

export interface DefBase {
  nombre: string
  icono: NombreIcono
  /** Null: sin teselas, solo los limites (carga igual con conexion lenta). */
  url: string | null
  credito: string | null
}

export const BASES: Record<CapaBase, DefBase> = {
  simple: { nombre: 'Simple', icono: 'map', url: null, credito: null },
  relieve: { nombre: 'Relieve', icono: 'landscape', url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, credito: 'Relieve: Esri y colaboradores' },
  satelite: { nombre: 'Satélite', icono: 'layers', url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, credito: 'Imagen de satélite: Esri, Maxar y Earthstar Geographics' },
}

export interface DefDatos {
  nombre: string
  icono: NombreIcono
  url: string
  zoomNativo: number
  /** Que muestra y de cuando es, en una linea. */
  descripcion: string
  /** Colores de la capa, de menos a mas (tomados de las teselas reales), y lo que significan los extremos. */
  colores: string[]
  menos: string
  mas: string
  credito: string
}

export const DATOS: Record<CapaDatos, DefDatos> = {
  lluvia: {
    nombre: 'Lluvia',
    icono: 'rainy',
    url: gibs('IMERG_Precipitation_Rate', 6),
    zoomNativo: 6,
    descripcion: 'Dónde está lloviendo ahora',
    colores: ['#3cb043', '#ffe600', '#ff8c00', '#e60000'],
    menos: 'Poca',
    mas: 'Fuerte',
    credito: 'Lluvia: NASA GPM IMERG',
  },
  humedad: {
    nombre: 'Agua en la tierra',
    icono: 'water_drop',
    url: gibs('SMAP_L4_Analyzed_Surface_Soil_Moisture', 6),
    zoomNativo: 6,
    descripcion: 'Qué tan mojada está la tierra hoy',
    colores: ['#c8c800', '#3fa53f', '#35d0d0', '#1030e0'],
    menos: 'Seca',
    mas: 'Mojada',
    credito: 'Humedad del suelo: NASA SMAP',
  },
  vegetacion: {
    nombre: 'Verdor',
    icono: 'grass',
    url: gibs('MODIS_Terra_NDVI_8Day', 9),
    zoomNativo: 9,
    descripcion: 'Qué tan verde está el campo (últimos 8 días)',
    colores: ['#d9c9b8', '#9bc468', '#0b6b1d'],
    menos: 'Poco',
    mas: 'Mucho',
    credito: 'Vegetación: NASA MODIS',
  },
  calor: {
    nombre: 'Calor',
    icono: 'thermostat',
    url: gibs('MODIS_Terra_L3_Land_Surface_Temp_8Day_Day', 7),
    zoomNativo: 7,
    descripcion: 'Qué tan caliente está la tierra de día (últimos 8 días)',
    colores: ['#9be000', '#ffff00', '#ff9900', '#e60000'],
    menos: 'Fresca',
    mas: 'Caliente',
    credito: 'Temperatura del suelo: NASA MODIS',
  },
}

export const ORDEN_BASES: CapaBase[] = ['simple', 'relieve', 'satelite']
export const ORDEN_DATOS: CapaDatos[] = ['lluvia', 'humedad', 'vegetacion', 'calor']
