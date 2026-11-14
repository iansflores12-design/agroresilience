import datosGenerados from './zonas.generado.json'

export interface HumedadZona {
  valor: number
  fecha: string
  unidad: 'm3/m3'
  serie: [string, number][]
  normal: number | null
  anomalia: number | null
  percentil: number | null
  muestras: number
}

export interface Zona {
  id: string
  nombre: string
  lat: number
  lon: number
  humedad: HumedadZona | null
  lluvia30d: { valor_mm: number; hasta: string; normal_mm: number | null } | null
  temperatura: { valor_c: number; hasta: string } | null
  suelo: { arena_pct: number; limo_pct: number; arcilla_pct: number; ph: number } | null
}

export interface DatosZonas {
  generado: string
  fuentes: Record<string, string>
  caja: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
  zonas: Zona[]
}

const datos = datosGenerados as unknown as DatosZonas

export const zonas: Zona[] = datos.zonas
export const cajaHonduras: DatosZonas['caja'] = datos.caja
export const fuentes: DatosZonas['fuentes'] = datos.fuentes
export const fechaGeneracion: string = datos.generado

export function buscarZona(id: string | null): Zona | null {
  if (!id) return null
  return zonas.find((z) => z.id === id) ?? null
}

/** Humedad del suelo como porcentaje volumetrico con un decimal, o null si no hay lectura. */
export function humedadPorcentaje(zona: Zona): number | null {
  if (!zona.humedad) return null
  return Math.round(zona.humedad.valor * 1000) / 10
}

export type EstadoHumedad =
  | 'Más seca de lo normal'
  | 'Dentro de lo normal'
  | 'Más húmeda de lo normal'
  | 'Sin referencia histórica'

/** Compara con lo normal para esa zona y epoca usando el percentil. */
export function estadoHumedad(zona: Zona): EstadoHumedad {
  const p = zona.humedad?.percentil
  if (p === null || p === undefined) return 'Sin referencia histórica'
  if (p < 20) return 'Más seca de lo normal'
  if (p > 80) return 'Más húmeda de lo normal'
  return 'Dentro de lo normal'
}
