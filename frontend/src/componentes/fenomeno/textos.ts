// Textos de la explicacion de la sequia: 5 zonas x 3 niveles. Una frase corta, de usted, sin jerga.
// "Cultivo" cambia segun el cultivo elegido (maiz, frijol) o muestra los dos si no hay uno dibujable.

import type { Zona } from '../../datos/zonas'

/** Posiciones del deslizador: 0 a PASOS equivale a intensidad 0 a 1. */
export const PASOS = 20

/** Posicion del deslizador que corresponde a la humedad de hoy, o null si no hay dato. */
export function valorDeHoy(zona: Zona | null): number | null {
  const p = zona?.humedad?.percentil
  if (p === null || p === undefined) return null
  const t = p >= 40 ? 0 : p >= 20 ? 0.35 : 0.7
  return Math.round(t * PASOS)
}

export type ZonaEscena = 'cielo' | 'suelo' | 'raices' | 'cultivo' | 'rio'
export type NivelSequia = 0 | 1 | 2
export type CultivoDibujado = 'maiz' | 'frijol'

export const ZONAS_ESCENA: ZonaEscena[] = ['cielo', 'suelo', 'raices', 'cultivo', 'rio']

/** Palabras de estado, de menos a mas sequia. */
export const PALABRAS_NIVEL = ['Normal', 'Seca', 'Muy seca'] as const

/** Nivel a partir de la intensidad continua (0 a 1). */
export function nivelDeIntensidad(t: number): NivelSequia {
  return t < 0.3 ? 0 : t < 0.62 ? 1 : 2
}

type Tres = [string, string, string]

const BASE: Record<Exclude<ZonaEscena, 'cultivo'>, Tres> = {
  cielo: [
    'Hay nubes y llueve lo normal: el aire húmedo sube y se vuelve lluvia.',
    'Salen menos nubes y el sol pega más fuerte: la lluvia tarda en llegar.',
    'Semanas sin nubes, con calor y viento seco: el aire se lleva el agua de la tierra.',
  ],
  suelo: [
    'La tierra guarda agua: se ve oscura y fresca al tocarla.',
    'La capa de arriba ya se secó y el agua queda cada día más hondo.',
    'La tierra se raja y se hace polvo: el viento se lleva lo más fértil.',
  ],
  raices: [
    'Todas las raíces alcanzan tierra mojada y la planta toma lo que necesita.',
    'Las raíces cortas se quedan en tierra seca: la planta debe buscar más hondo.',
    'Solo las raíces más largas alcanzan algo de agua, y cada vez está más lejos.',
  ],
  rio: [
    'El río lleva buen caudal y también moja la tierra de sus orillas.',
    'El río baja y su agua se calienta: ya cuesta sacarla para regar.',
    'El río se seca y deja el fondo rajado: las tomas de agua quedan en seco.',
  ],
}

const CULTIVO: Record<CultivoDibujado | 'ambos', Tres> = {
  maiz: [
    'El maíz tiene las hojas abiertas, y la espiga y los pelos de la mazorca salen a tiempo.',
    'Las hojas del maíz se enrollan con el calor y los pelos de la mazorca se atrasan.',
    'El maíz da mazorcas chicas, con huecos o vacías: sin agua en la floración no cuaja el grano.',
  ],
  frijol: [
    'El frijol florece bien y cada flor puede volverse vaina.',
    'Con calor y poca agua, las hojas del frijol se voltean y las flores se caen.',
    'El frijol se marchita y suelta las vainas tiernas: la planta se salva, pero se pierde la cosecha.',
  ],
  ambos: [
    'El maíz y el frijol tienen hojas verdes y flores firmes.',
    'El maíz enrolla las hojas y el frijol tira las flores: los dos sufren con poca agua.',
    'Sin agua, el maíz da mazorcas vacías y el frijol suelta las vainas.',
  ],
}

/** Cultivo de la app que la escena sabe dibujar, o null si no es maiz ni frijol. */
export function cultivoDibujado(cultivoId: string | null): CultivoDibujado | null {
  return cultivoId === 'maiz' || cultivoId === 'frijol' ? cultivoId : null
}

export function textoFenomeno(zona: ZonaEscena, nivel: NivelSequia, cultivoId: string | null): string {
  if (zona === 'cultivo') return CULTIVO[cultivoDibujado(cultivoId) ?? 'ambos'][nivel]
  return BASE[zona][nivel]
}

/** Todos los textos posibles (para pruebas). */
export function todosLosTextos(): string[] {
  return [...Object.values(BASE).flat(), ...Object.values(CULTIVO).flat()]
}
