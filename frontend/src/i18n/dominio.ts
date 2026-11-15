// Ayudas para traducir datos del dominio (cultivos, etapas, partes del puntaje) que viven en
// `datos/` en español. Los datos no cambian: se traducen al mostrarlos, por su id.

import type { TFunction } from 'i18next'
import type { ParteAptitud, RotacionPuntuada } from '../datos/aptitud'
import type { EtapaCultivo } from '../datos/cultivos'
import { lista, minuscula } from './traductor'

export function nombreCultivo(t: TFunction, id: string): string {
  return t(`cultivos.${id}.nombre`)
}

export function nombreEtapa(t: TFunction, cultivoId: string, etapa: EtapaCultivo): string {
  return t(`cultivos.${cultivoId}.etapas.${etapa.id}`, { defaultValue: etapa.nombre })
}

/** Nombre de una parte del puntaje del mapa (del departamento o de la rotacion). */
export function nombreParte(t: TFunction, p: ParteAptitud): string {
  return p.grupo === 'rotacion'
    ? t(`aptitud.partesRotacion.${p.clave}`, { defaultValue: p.nombre })
    : t(`aptitud.factores.${p.clave}.nombre`, { defaultValue: p.nombre })
}

/** "Maíz y después frijol" para las rotaciones de primera a postrera del mapa. */
export function nombreRotacionMapa(t: TFunction, r: RotacionPuntuada): string {
  const primera = nombreCultivo(t, r.pasos[0].cultivo.id)
  const postrera = nombreCultivo(t, r.pasos[1]?.cultivo.id ?? r.id)
  return r.actual
    ? t('motor.nombreActual', { a: primera, b: minuscula(primera) })
    : t('motor.nombreDos', { a: primera, b: minuscula(postrera) })
}

/** Ventajas, riesgos y lo que falta saber de un cultivo en el mapa. */
export function textosAptitud(t: TFunction, cultivoId: string) {
  return {
    ventajas: lista(t, `cultivos.${cultivoId}.aptitud.ventajas`),
    riesgos: lista(t, `cultivos.${cultivoId}.aptitud.riesgos`),
    falta: lista(t, `cultivos.${cultivoId}.aptitud.falta`),
  }
}
