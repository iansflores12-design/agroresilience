// Maquina de pasos del flujo de siembra. Logica pura, sin React.
import { buscarCultivo } from '../../datos/cultivos'
import { condicionesMock } from './condiciones'
import { OBJETIVOS, PASOS } from './tipos'
import type { PasoSiembra, RespuestasParciales, RespuestasSiembra } from './tipos'

const TEXTURAS = ['arenoso', 'franco', 'arcilloso']
const PENDIENTES = ['plana', 'ondulada', 'inclinada']
const DRENAJES = ['bueno', 'regular', 'malo']

const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mensaje de error en espanol sencillo, o null si el paso esta bien contestado. */
export function validarPaso(paso: PasoSiembra, r: RespuestasParciales): string | null {
  switch (paso) {
    case 'cultivo':
      return buscarCultivo(r.cultivoId ?? null) ? null : 'Elija un cultivo de la lista.'
    case 'dias': {
      const d = r.diasDesdeSiembra
      if (!esNum(d) || !Number.isInteger(d) || d < 0 || d > 365) return 'Escriba los días como un número entero entre 0 y 365.'
      const c = buscarCultivo(r.cultivoId ?? null)
      if (c && d > c.cicloSemanas * 7 + 30) return 'Ese número de días es mucho para este cultivo. Revise la fecha de siembra.'
      return null
    }
    case 'objetivo':
      return OBJETIVOS.some((o) => o.id === r.objetivo) ? null : 'Elija lo que quiere lograr.'
    case 'terreno': {
      const t = r.terreno
      if (!t) return 'Cuéntenos cómo es su terreno.'
      if (!TEXTURAS.includes(t.textura)) return 'Elija el tipo de tierra.'
      if (!PENDIENTES.includes(t.pendiente)) return 'Elija qué tan inclinado es el terreno.'
      if (!DRENAJES.includes(t.drenaje)) return 'Elija cómo se drena el agua en el terreno.'
      if (typeof t.tieneRiego !== 'boolean') return 'Diga si tiene alguna forma de regar.'
      return null
    }
    case 'ubicacion': {
      const u = r.ubicacion
      if (!u || !esNum(u.lat) || !esNum(u.lon)) return 'Indique su ubicación con el GPS o escribiendo las coordenadas.'
      const c = condicionesMock.caja
      if (u.lat < c.lat_min || u.lat > c.lat_max || u.lon < c.lon_min || u.lon > c.lon_max) {
        return 'La ubicación está fuera de Honduras. Revise las coordenadas.'
      }
      return null
    }
    case 'resultado':
      return null
  }
}

export function siguientePaso(paso: PasoSiembra): PasoSiembra {
  const i = PASOS.indexOf(paso)
  return PASOS[Math.min(i + 1, PASOS.length - 1)]
}

export function pasoAnterior(paso: PasoSiembra): PasoSiembra {
  const i = PASOS.indexOf(paso)
  return PASOS[Math.max(i - 1, 0)]
}

/** Primer paso con respuesta faltante o invalida; 'resultado' si todo esta. */
export function primerPasoIncompleto(r: RespuestasParciales): PasoSiembra {
  for (const p of PASOS) {
    if (p === 'resultado') break
    if (validarPaso(p, r) !== null) return p
  }
  return 'resultado'
}

export function respuestasCompletas(r: RespuestasParciales): r is RespuestasSiembra {
  return primerPasoIncompleto(r) === 'resultado'
}
