// Parametros de Gemini Decision.
// Kc, limite de calor y tolerancia de maiz, frijol y sorgo vienen de kharis/config.py (FAO-56).
// Los de arroz, tomate y frijol terciopelo, los valores de mercado y de forraje son
// ILUSTRATIVOS: pendientes de validar con el equipo agronomico.

import type { ClaveFactor, Objetivo, Temporada, Terreno } from './tipos.js'

export interface ParametrosCultivo {
  nombre: string
  familia: 'gramínea' | 'leguminosa' | 'hortaliza' | 'cobertura'
  cicloSemanas: number
  /** Kc inicial, medio y final (FAO-56). */
  kc: [number, number, number]
  /** Temperatura maxima que empieza a danarlo, en grados C. */
  tCalor: number
  /** 0 no aguanta la falta de agua, 1 la aguanta bien. */
  tolerancia: number
  /** Se dana si la tierra se encharca. */
  encharca: boolean
  /** Necesita mucha agua: casi no se da sin riego. */
  riego: boolean
  /** De 0 a 100: que tan seguro es venderlo. */
  mercado: number
  /** De 0 a 100: cuanto sirve de comida para animales. */
  forraje: number
  /** Da cosecha para vender o comer. */
  cosecha: boolean
  beneficios: string[]
  riesgos: string[]
  falta: string[]
}

export const CULTIVOS: Record<string, ParametrosCultivo> = {
  maiz: {
    nombre: 'Maíz', familia: 'gramínea', cicloSemanas: 17, kc: [0.3, 1.2, 0.6], tCalor: 35, tolerancia: 0.45,
    encharca: true, riego: false, mercado: 70, forraje: 55, cosecha: true,
    beneficios: ['Ya conoce la semilla y el manejo', 'Es grano básico para la casa'],
    riesgos: ['Pide mucha agua justo en la floración', 'Repetirlo cansa la tierra y trae más plagas'],
    falta: ['La fecha real de siembra según las lluvias de su zona'],
  },
  frijol: {
    nombre: 'Frijol', familia: 'leguminosa', cicloSemanas: 12, kc: [0.4, 1.15, 0.35], tCalor: 30, tolerancia: 0.35,
    encharca: true, riego: false, mercado: 74, forraje: 25, cosecha: true,
    beneficios: ['Deja abono natural (nitrógeno) en la tierra', 'Crece rápido', 'Da otro grano para la casa'],
    riesgos: ['Sufre con el calor fuerte en la floración', 'Se pudre si la tierra se encharca'],
    falta: ['El precio del frijol esta temporada en su mercado'],
  },
  sorgo: {
    nombre: 'Sorgo (maicillo)', familia: 'gramínea', cicloSemanas: 16, kc: [0.3, 1.0, 0.55], tCalor: 38, tolerancia: 0.8,
    encharca: false, riego: false, mercado: 55, forraje: 90, cosecha: true,
    beneficios: ['Es el que mejor aguanta la falta de agua', 'Sirve de comida para los animales', 'Sus raíces hondas aflojan la tierra'],
    riesgos: ['Hay pocos compradores seguros', 'Es de la misma familia que el maíz: corta poco las plagas del grano'],
    falta: ['El precio y los compradores de sorgo en su zona'],
  },
  arroz: {
    nombre: 'Arroz', familia: 'gramínea', cicloSemanas: 18, kc: [1.05, 1.2, 0.9], tCalor: 35, tolerancia: 0.1,
    encharca: false, riego: true, mercado: 65, forraje: 35, cosecha: true,
    beneficios: ['Se vende bien donde el agua está asegurada', 'Aprovecha los terrenos bajos que se encharcan'],
    riesgos: ['Necesita mucha agua', 'Casi no se da sin riego en zonas secas'],
    falta: ['Si hay riego en su parcela'],
  },
  tomate: {
    nombre: 'Tomate', familia: 'hortaliza', cicloSemanas: 16, kc: [0.6, 1.15, 0.8], tCalor: 32, tolerancia: 0.25,
    encharca: true, riego: true, mercado: 82, forraje: 5, cosecha: true,
    beneficios: ['Se vende a buen precio: ingreso extra', 'Cambia de familia y corta las plagas del grano'],
    riesgos: ['Necesita riego seguro', 'Pide más cuidado y más gasto'],
    falta: ['Si hay riego en su parcela', 'El precio del tomate en su mercado'],
  },
  'frijol-terciopelo': {
    nombre: 'Frijol terciopelo', familia: 'cobertura', cicloSemanas: 20, kc: [0.4, 0.95, 0.8], tCalor: 38, tolerancia: 0.75,
    encharca: false, riego: false, mercado: 20, forraje: 70, cosecha: false,
    beneficios: ['Cubre y protege la tierra de la lluvia fuerte', 'Deja abono natural para lo que siembre después', 'Ahoga las malezas'],
    riesgos: ['No da cosecha para vender ni para comer', 'Hay que cortarlo a tiempo para que no se enrede'],
    falta: ['Si puede dejar la parcela una temporada sin cosecha'],
  },
}

export const ORDEN_TEMPORADAS: Temporada[] = ['primera', 'postrera', 'verano']

export const TEMPORADAS: Record<Temporada, { nombre: string; meses: [number, number]; texto: string }> = {
  primera: { nombre: 'Primera', meses: [5, 8], texto: 'Mayo a agosto' },
  postrera: { nombre: 'Postrera', meses: [9, 12], texto: 'Septiembre a diciembre' },
  verano: { nombre: 'Verano', meses: [1, 4], texto: 'Enero a abril' },
}

export interface EfectoTerreno {
  nombre: string
  descripcion: string
  /** Parte de la lluvia que se queda en la tierra. */
  lluviaUtil: number
  /** Grados que se restan a la maxima (la altura refresca). */
  ajusteTemp: number
  /** De 0 a 1: que tanto se lava la tierra si queda desnuda. */
  erosion: number
  /** Se junta el agua. */
  encharca: boolean
}

export const TERRENOS: Record<Terreno, EfectoTerreno> = {
  plano: { nombre: 'Plano', descripcion: 'Parejo, sin pendiente', lluviaUtil: 0.8, ajusteTemp: 0, erosion: 0.2, encharca: false },
  elevado: { nombre: 'Elevado', descripcion: 'En lo alto, de montaña', lluviaUtil: 0.7, ajusteTemp: 1.5, erosion: 0.6, encharca: false },
  bajo: { nombre: 'Bajo', descripcion: 'Junto al río o donde se junta el agua', lluviaUtil: 0.95, ajusteTemp: 0, erosion: 0.25, encharca: true },
  ondulado: { nombre: 'Ondulado', descripcion: 'Con lomas o en ladera', lluviaUtil: 0.65, ajusteTemp: 0.5, erosion: 0.85, encharca: false },
}

export const OBJETIVOS: Record<Objetivo, { nombre: string; factor: ClaveFactor; descripcion: string }> = {
  agua: { nombre: 'Ahorrar agua', factor: 'agua', descripcion: 'Que la lluvia alcance sin regar' },
  suelo: { nombre: 'Mejorar la tierra', factor: 'suelo', descripcion: 'Más materia orgánica y tierra viva' },
  erosion: { nombre: 'Frenar la erosión', factor: 'erosion', descripcion: 'Que la lluvia no se lleve la tierra' },
  ingreso: { nombre: 'Ganar más', factor: 'venta', descripcion: 'Una cosecha extra para vender' },
  forraje: { nombre: 'Comida para animales', factor: 'forraje', descripcion: 'Pasto y rastrojo para el ganado' },
  nitrogeno: { nombre: 'Abono natural', factor: 'nitrogeno', descripcion: 'Plantas que dejan nitrógeno' },
  plagas: { nombre: 'Cortar plagas', factor: 'plagas', descripcion: 'Cambiar de familia para cortar su ciclo' },
}

/** Pesos base de cada parte del puntaje. Suman 1. */
export const PESOS_BASE: Record<ClaveFactor, number> = {
  agua: 0.25, calor: 0.15, suelo: 0.12, erosion: 0.1, venta: 0.15, plagas: 0.08, nitrogeno: 0.08, forraje: 0.07,
}

/** Un objetivo elegido multiplica el peso de su parte por este valor. */
export const REFUERZO_OBJETIVO = 3

export const NOMBRE_FACTOR: Record<ClaveFactor, string> = {
  agua: 'Agua de lluvia', calor: 'Calor', suelo: 'Salud de la tierra', erosion: 'Contra la erosión',
  venta: 'Venta', forraje: 'Forraje', plagas: 'Corta plagas', nitrogeno: 'Abono natural',
}

/** De 80 para arriba alta; de 65 a 79 buena; de 50 a 64 intermedia; menos, baja. */
export function ratingDePuntaje(p: number): 'alta' | 'buena' | 'intermedia' | 'baja' {
  if (p >= 80) return 'alta'
  if (p >= 65) return 'buena'
  if (p >= 50) return 'intermedia'
  return 'baja'
}

export const PALABRA_RATING = { alta: 'Alta', buena: 'Buena', intermedia: 'Intermedia', baja: 'Baja' } as const

/** Lugares del sitio y su punto en Kharis (04_GUIA_SITIO.md, paso 4). */
export const LUGARES: Record<string, { nombre: string; punto: string }> = {
  choluteca: { nombre: 'Choluteca', punto: 'choluteca' },
  nacaome: { nombre: 'Nacaome', punto: 'nacaome' },
  tegucigalpa: { nombre: 'Tegucigalpa', punto: 'tegucigalpa' },
  comayagua: { nombre: 'Comayagua', punto: 'comayagua' },
  danli: { nombre: 'Danlí', punto: 'danli' },
  juticalpa: { nombre: 'Juticalpa', punto: 'juticalpa' },
  catacamas: { nombre: 'Catacamas', punto: 'catacamas' },
  santa_rosa_copan: { nombre: 'Santa Rosa de Copán', punto: 'santa_rosa' },
  la_esperanza: { nombre: 'La Esperanza', punto: 'la_esperanza' },
  yoro: { nombre: 'Yoro', punto: 'yoro' },
  san_pedro_sula: { nombre: 'San Pedro Sula', punto: 'sula' },
}
