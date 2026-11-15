import { condicionesMock } from './condiciones'
import {
  capturarUbicacion,
  dentroDeCaja,
  distanciaKm,
  esErrorGps,
  mensajeErrorGps,
  parsearCoordenadas,
  puntoMasCercano,
  ubicacionManual,
} from './gps'

type Geo = Pick<Geolocation, 'getCurrentPosition'>

const geoOk = (lat: number, lon: number, accuracy = 12): Geo => ({
  getCurrentPosition: (ok) => ok({ coords: { latitude: lat, longitude: lon, accuracy } } as GeolocationPosition),
})
const geoError = (code: number): Geo => ({
  getCurrentPosition: (_ok, err) => err?.({ code } as GeolocationPositionError),
})

describe('capturarUbicacion', () => {
  it('devuelve la ubicacion dentro de la caja', async () => {
    const u = await capturarUbicacion(geoOk(14.08, -87.2))
    expect(u).toEqual({ lat: 14.08, lon: -87.2, precisionM: 12, origen: 'gps' })
  })

  it('mapea los errores del GPS', async () => {
    await expect(capturarUbicacion(geoError(1))).rejects.toThrow('permiso')
    await expect(capturarUbicacion(geoError(2))).rejects.toThrow('posicion')
    await expect(capturarUbicacion(geoError(3))).rejects.toThrow('tiempo')
  })

  it('sin geolocalizacion', async () => {
    await expect(capturarUbicacion(undefined, {})).rejects.toThrow('no_disponible')
  })

  it('fuera de zona, y caja propia', async () => {
    await expect(capturarUbicacion(geoOk(40, -3))).rejects.toThrow('fuera_de_zona')
    const caja = { lat_min: 39, lat_max: 41, lon_min: -4, lon_max: -2 }
    await expect(capturarUbicacion(geoOk(40, -3), { caja })).resolves.toMatchObject({ lat: 40 })
  })

  it('pasa las opciones al navegador', async () => {
    let recibidas: PositionOptions | undefined
    const geo: Geo = {
      getCurrentPosition: (ok, _err, o) => {
        recibidas = o
        ok({ coords: { latitude: 14, longitude: -87, accuracy: 5 } } as GeolocationPosition)
      },
    }
    await capturarUbicacion(geo)
    expect(recibidas).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
    await capturarUbicacion(geo, { tiempoMs: 3000 })
    expect(recibidas?.timeout).toBe(3000)
  })

  it('esErrorGps y mensajes', async () => {
    const e = await capturarUbicacion(geoError(1)).catch((x) => x)
    expect(esErrorGps(e)).toBe(true)
    expect(esErrorGps(new Error('otra cosa'))).toBe(false)
    expect(mensajeErrorGps('permiso')).toMatch(/coordenadas/)
  })
})

describe('parsearCoordenadas', () => {
  it('acepta coma y espacio', () => {
    expect(parsearCoordenadas('14.08, -87.2')).toEqual({ lat: 14.08, lon: -87.2 })
    expect(parsearCoordenadas('14.08 -87.2')).toEqual({ lat: 14.08, lon: -87.2 })
    expect(parsearCoordenadas('  14.08,-87.2 ')).toEqual({ lat: 14.08, lon: -87.2 })
  })
  it('rechaza lo que no son dos numeros', () => {
    expect(parsearCoordenadas('')).toBeNull()
    expect(parsearCoordenadas('hola')).toBeNull()
    expect(parsearCoordenadas('14.08')).toBeNull()
    expect(parsearCoordenadas('14 15 16')).toBeNull()
    expect(parsearCoordenadas('120, -87')).toBeNull()
  })
})

describe('distancias', () => {
  it('Tegucigalpa a San Pedro Sula ronda 180 km', () => {
    const d = distanciaKm({ lat: 14.0723, lon: -87.1921 }, { lat: 15.5, lon: -88.025 })
    expect(d).toBeGreaterThan(165)
    expect(d).toBeLessThan(195)
  })

  it('puntoMasCercano', () => {
    const r = puntoMasCercano(ubicacionManual(14.1, -87.2), condicionesMock.puntos)
    expect(r.punto.id).toBe('francisco_morazan')
    expect(r.distanciaKm).toBeLessThan(10)
  })

  it('dentroDeCaja y ubicacionManual', () => {
    expect(dentroDeCaja(14, -87, condicionesMock.caja)).toBe(true)
    expect(dentroDeCaja(20, -87, condicionesMock.caja)).toBe(false)
    expect(ubicacionManual(14, -87)).toEqual({ lat: 14, lon: -87, precisionM: null, origen: 'manual' })
  })
})
