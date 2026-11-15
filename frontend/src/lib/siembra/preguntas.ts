// Maquina de pasos del flujo de siembra. Logica pura, sin React.
import { buscarCultivo } from '../../datos/cultivos'
import { traductor } from '../../i18n/traductor'
import { condicionesMock } from './condiciones'
import { OBJETIVOS, PASOS } from './tipos'
import type { PasoSiembra, RespuestasParciales, RespuestasSiembra } from './tipos'

const TEXTURAS = ['arenoso', 'franco', 'arcilloso']
const PENDIENTES = ['plana', 'ondulada', 'inclinada']
const DRENAJES = ['bueno', 'regular', 'malo']

const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mensaje de error sencillo (en el idioma dado; por defecto, español), o null si el paso esta bien contestado. */
export function validarPaso(paso: PasoSiembra, r: RespuestasParciales, idioma?: string | null): string | null {
  const t = traductor(idioma)
  const m = (clave: string) => t(`siembra.validar.${clave}`)
  switch (paso) {
    case 'cultivo':
      return buscarCultivo(r.cultivoId ?? null) ? null : m('cultivo')
    case 'dias': {
      const d = r.diasDesdeSiembra
      if (!esNum(d) || !Number.isInteger(d) || d < 0 || d > 365) return m('dias')
      const c = buscarCultivo(r.cultivoId ?? null)
      if (c && d > c.cicloSemanas * 7 + 30) return m('diasMuchos')
      return null
    }
    case 'objetivo':
      return OBJETIVOS.some((o) => o.id === r.objetivo) ? null : m('objetivo')
    case 'terreno': {
      const t = r.terreno
      if (!t) return m('terreno')
      if (!TEXTURAS.includes(t.textura)) return m('textura')
      if (!PENDIENTES.includes(t.pendiente)) return m('pendiente')
      if (!DRENAJES.includes(t.drenaje)) return m('drenaje')
      if (typeof t.tieneRiego !== 'boolean') return m('riego')
      return null
    }
    case 'ubicacion': {
      const u = r.ubicacion
      if (!u || !esNum(u.lat) || !esNum(u.lon)) return m('ubicacion')
      const c = condicionesMock.caja
      if (u.lat < c.lat_min || u.lat > c.lat_max || u.lon < c.lon_min || u.lon > c.lon_max) {
        return m('fuera')
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
