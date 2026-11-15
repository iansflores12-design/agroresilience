// GPS y utilidades de ubicacion. Logica pura, sin React.
import { traductor } from '../../i18n/traductor'
import { condicionesMock } from './condiciones'
import type { CondicionesArchivo, ErrorGps, PuntoCondiciones, Ubicacion } from './tipos'

type Caja = CondicionesArchivo['caja']

const ERRORES: ErrorGps[] = ['no_disponible', 'permiso', 'tiempo', 'fuera_de_zona', 'posicion']

export function esErrorGps(e: unknown): e is Error & { message: ErrorGps } {
  return e instanceof Error && (ERRORES as string[]).includes(e.message)
}

/** Mensaje del error de GPS en el idioma dado (por defecto, español). */
export function mensajeErrorGps(e: ErrorGps, idioma?: string | null): string {
  return traductor(idioma)(`siembra.gps.${e}`)
}

export function dentroDeCaja(lat: number, lon: number, caja: Caja): boolean {
  return lat >= caja.lat_min && lat <= caja.lat_max && lon >= caja.lon_min && lon <= caja.lon_max
}

export function capturarUbicacion(
  geo: Pick<Geolocation, 'getCurrentPosition'> | undefined = globalThis.navigator?.geolocation,
  opciones: { tiempoMs?: number; caja?: Caja } = {},
): Promise<Ubicacion> {
  const caja = opciones.caja ?? condicionesMock.caja
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(new Error('no_disponible'))
      return
    }
    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (!dentroDeCaja(latitude, longitude, caja)) {
          reject(new Error('fuera_de_zona'))
          return
        }
        resolve({ lat: latitude, lon: longitude, precisionM: Number.isFinite(accuracy) ? accuracy : null, origen: 'gps' })
      },
      (err) => {
        const codigo: ErrorGps = err.code === 1 ? 'permiso' : err.code === 3 ? 'tiempo' : 'posicion'
        reject(new Error(codigo))
      },
      { enableHighAccuracy: true, timeout: opciones.tiempoMs ?? 15000, maximumAge: 60000 },
    )
  })
}

export function ubicacionManual(lat: number, lon: number): Ubicacion {
  return { lat, lon, precisionM: null, origen: 'manual' }
}

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Punto mas cercano a la ubicacion. Empate: el primero de la lista. */
export function puntoMasCercano(
  u: { lat: number; lon: number },
  puntos: PuntoCondiciones[],
): { punto: PuntoCondiciones; distanciaKm: number } {
  let mejor = puntos[0]
  let dMejor = distanciaKm(u, mejor)
  for (const p of puntos.slice(1)) {
    const d = distanciaKm(u, p)
    if (d < dMejor) {
      mejor = p
      dMejor = d
    }
  }
  return { punto: mejor, distanciaKm: dMejor }
}

/** Acepta "14.08, -87.2" y "14.08 -87.2". null si no son dos numeros dentro de rango de coordenadas. */
export function parsearCoordenadas(texto: string): { lat: number; lon: number } | null {
  const partes = texto.trim().split(/[\s,;]+/).filter(Boolean)
  if (partes.length !== 2) return null
  const [lat, lon] = partes.map((p) => Number(p.replace(',', '.')))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}
