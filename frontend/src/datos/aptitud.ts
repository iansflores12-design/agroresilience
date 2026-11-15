// CONTENIDO ILUSTRATIVO para la interfaz. Pendiente de validacion con el equipo agronomico:
// las condiciones por departamento, los rangos por cultivo, los pesos y los datos de mercado
// son valores de ejemplo. No salen de `data/processed/` y no deben usarse como guia de campo.
// Lo unico real de este modulo son los limites departamentales (departamentos.geo.json).

import { buscarCultivo, type Cultivo } from './cultivos'

/** Condiciones tipicas de un departamento. `id` es el codigo ISO 3166-2 (HN-CH). */
export interface Departamento {
  id: string
  nombre: string
  /** Lluvia de un ano normal, en mm. */
  lluvia: number
  /** Temperatura media, en grados C. */
  temp: number
  /** Altura media sobre el nivel del mar, en m. */
  alt: number
  /** Agua en la tierra, en porcentaje. */
  hum: number
  /** Dias seguidos sin lluvia en la canicula. */
  canicula: number
  ph: number
  corredorSeco: boolean
}

function depto(
  id: string,
  nombre: string,
  lluvia: number,
  temp: number,
  alt: number,
  hum: number,
  canicula: number,
  ph: number,
  corredorSeco = false,
): Departamento {
  return { id, nombre, lluvia, temp, alt, hum, canicula, ph, corredorSeco }
}

export const departamentos: Departamento[] = [
  depto('HN-AT', 'Atlántida', 2800, 26.5, 150, 38, 5, 5.6),
  depto('HN-CH', 'Choluteca', 1650, 28.5, 120, 19, 32, 6.4, true),
  depto('HN-CL', 'Colón', 2500, 26.5, 180, 36, 6, 5.7),
  depto('HN-CM', 'Comayagua', 1200, 23.5, 750, 24, 22, 6.3, true),
  depto('HN-CP', 'Copán', 1600, 21.5, 950, 30, 12, 5.8),
  depto('HN-CR', 'Cortés', 1900, 26.0, 250, 33, 9, 6.2),
  depto('HN-EP', 'El Paraíso', 1150, 22.5, 850, 23, 26, 6.2, true),
  depto('HN-FM', 'Francisco Morazán', 1050, 22.0, 1050, 22, 27, 6.1, true),
  depto('HN-GD', 'Gracias a Dios', 3000, 27.0, 60, 41, 4, 5.2),
  depto('HN-IN', 'Intibucá', 1500, 18.5, 1600, 29, 16, 5.6, true),
  depto('HN-IB', 'Islas de la Bahía', 2400, 27.5, 30, 34, 5, 6.5),
  depto('HN-LP', 'La Paz', 1250, 21.0, 1200, 23, 28, 6.0, true),
  depto('HN-LE', 'Lempira', 1550, 20.5, 1300, 28, 17, 5.7, true),
  depto('HN-OC', 'Ocotepeque', 1450, 20.0, 1350, 27, 15, 5.9),
  depto('HN-OL', 'Olancho', 1400, 24.0, 600, 29, 14, 6.3),
  depto('HN-SB', 'Santa Bárbara', 1800, 23.5, 650, 32, 10, 6.0),
  depto('HN-VA', 'Valle', 1500, 29.0, 80, 18, 35, 6.5, true),
  depto('HN-YO', 'Yoro', 1300, 24.5, 550, 26, 18, 6.2),
]

export function buscarDepartamento(id: string | null | undefined): Departamento | null {
  if (!id) return null
  return departamentos.find((d) => d.id === id) ?? null
}

/** Departamento donde cae cada lugar de `zonas.generado.json`. */
const DEPARTAMENTO_DE_ZONA: Record<string, string> = {
  choluteca: 'HN-CH',
  nacaome: 'HN-VA',
  tegucigalpa: 'HN-FM',
  comayagua: 'HN-CM',
  danli: 'HN-EP',
  juticalpa: 'HN-OL',
  catacamas: 'HN-OL',
  santa_rosa_copan: 'HN-CP',
  la_esperanza: 'HN-IN',
  yoro: 'HN-YO',
  san_pedro_sula: 'HN-CR',
}

export function departamentoDeZona(zonaId: string | null | undefined): string | null {
  if (!zonaId) return null
  return DEPARTAMENTO_DE_ZONA[zonaId] ?? null
}

/** Rango trapezoidal: [minimo, optimo desde, optimo hasta, maximo]. */
type Rango = [number, number, number, number]

interface Requisitos {
  lluvia: Rango
  temp: Rango
  alt: Rango
  ph: Rango
  /** Que tanto le afecta la canicula: 0 la aguanta, 1 no la aguanta. */
  sensibilidad: number
  /** De 0 a 100: que tan seguro es venderlo a buen precio. */
  mercado: number
  confianza: Confianza
  ventajas: string[]
  riesgos: string[]
  falta: string[]
}

export type Confianza = 'alta' | 'media' | 'baja'

/** Clave = id de `cultivos.ts`. */
const REQUISITOS: Record<string, Requisitos> = {
  maiz: {
    lluvia: [500, 800, 1600, 2500],
    temp: [14, 20, 28, 34],
    alt: [0, 0, 1500, 2400],
    ph: [5.0, 5.8, 7.0, 7.8],
    sensibilidad: 0.8,
    mercado: 70,
    confianza: 'media',
    ventajas: ['Ya conoce la semilla y el manejo', 'Es grano básico para la casa'],
    riesgos: ['Pide mucha agua justo en la canícula', 'Repetirlo cansa la tierra y trae más plagas'],
    falta: ['La fecha real de siembra según las lluvias de su zona'],
  },
  frijol: {
    lluvia: [400, 700, 1500, 2200],
    temp: [12, 17, 25, 30],
    alt: [200, 500, 1700, 2300],
    ph: [5.2, 6.0, 7.0, 7.5],
    sensibilidad: 0.6,
    mercado: 74,
    confianza: 'alta',
    ventajas: ['Crece rápido y escapa a parte de la canícula', 'Deja abono natural en la tierra', 'Da otro grano para la casa'],
    riesgos: ['Una canícula de más de 20 días le quita la ventaja', 'Si la semilla llega tarde, se atrasa la siembra'],
    falta: ['El precio del frijol esta temporada en su mercado'],
  },
  sorgo: {
    lluvia: [350, 500, 1200, 2000],
    temp: [18, 25, 32, 38],
    alt: [0, 0, 900, 1600],
    ph: [5.2, 5.8, 7.5, 8.3],
    sensibilidad: 0.25,
    mercado: 55,
    confianza: 'baja',
    ventajas: ['Es el que mejor aguanta la falta de agua', 'Sirve de comida para los animales'],
    riesgos: ['Hay pocos compradores seguros', 'Vale menos como comida para la casa'],
    falta: ['El precio y los compradores de sorgo en su zona'],
  },
  arroz: {
    lluvia: [1200, 1800, 3000, 4000],
    temp: [20, 24, 30, 35],
    alt: [0, 0, 500, 1000],
    ph: [4.8, 5.5, 6.8, 7.5],
    sensibilidad: 0.9,
    mercado: 65,
    confianza: 'media',
    ventajas: ['Se vende bien donde el agua está asegurada'],
    riesgos: ['Necesita mucha agua y sufre con la canícula', 'Casi no se da sin riego en zonas secas'],
    falta: ['Si hay riego en su parcela'],
  },
  tomate: {
    lluvia: [600, 900, 1500, 2200],
    temp: [15, 20, 27, 32],
    alt: [0, 300, 1500, 2000],
    ph: [5.5, 6.0, 6.8, 7.5],
    sensibilidad: 0.85,
    mercado: 80,
    confianza: 'media',
    ventajas: ['Se vende a buen precio', 'Cambia de familia y corta las plagas del grano'],
    riesgos: ['Necesita riego seguro', 'Pide más cuidado y más gasto'],
    falta: ['Si hay riego en su parcela', 'El precio del tomate en su mercado'],
  },
  'frijol-terciopelo': {
    lluvia: [500, 800, 2500, 3500],
    temp: [18, 22, 30, 35],
    alt: [0, 0, 1400, 1800],
    ph: [4.8, 5.5, 7.0, 7.8],
    sensibilidad: 0.2,
    mercado: 25,
    confianza: 'alta',
    ventajas: ['Cubre y protege la tierra', 'Deja abono natural para lo que siembre después', 'Aguanta bien los días sin lluvia'],
    riesgos: ['No da cosecha para vender ni para comer'],
    falta: ['Si puede dejar la parcela una temporada sin cosecha'],
  },
  // Rangos de Ecocrop (FAO) y de las guias de IHCAFE, FHIA y SAG para Honduras; APROXIMADOS, pendientes
  // de validar con el equipo agronomico. La lluvia es la del ano; el melon se siembra en verano con riego.
  cafe: {
    lluvia: [900, 1400, 2500, 3500],
    temp: [14, 17, 23, 27],
    alt: [400, 900, 1700, 2100],
    ph: [4.5, 5.0, 6.0, 6.8],
    sensibilidad: 0.55,
    mercado: 88,
    confianza: 'media',
    ventajas: ['Se da en las tierras altas y frescas', 'Tiene compradores seguros (IHCAFE y cooperativas)'],
    riesgos: ['Sufre con el calor de las tierras bajas', 'La roya avanza con la humedad'],
    falta: ['La variedad que tiene y la sombra de su finca'],
  },
  platano: {
    lluvia: [900, 1500, 3000, 4500],
    temp: [17, 23, 30, 34],
    alt: [0, 0, 700, 1200],
    ph: [4.5, 5.5, 7.0, 8.0],
    sensibilidad: 0.85,
    mercado: 70,
    confianza: 'media',
    ventajas: ['Se da en tierras bajas, calientes y lluviosas', 'Da cosecha todo el año'],
    riesgos: ['Sufre con la canícula larga', 'Los huracanes lo tumban'],
    falta: ['Si hay agua o riego en el verano'],
  },
  palma: {
    lluvia: [1300, 2000, 3500, 4500],
    temp: [20, 24, 29, 33],
    alt: [0, 0, 350, 700],
    ph: [4.0, 4.8, 6.5, 7.5],
    sensibilidad: 0.8,
    mercado: 78,
    confianza: 'media',
    ventajas: ['Se da en la costa norte, caliente y lluviosa'],
    riesgos: ['No se da en tierras altas ni secas'],
    falta: ['La extractora más cercana y lo que paga'],
  },
  cana: {
    lluvia: [700, 1100, 2000, 3200],
    temp: [17, 22, 30, 35],
    alt: [0, 0, 900, 1500],
    ph: [4.5, 5.5, 7.5, 8.5],
    sensibilidad: 0.5,
    mercado: 75,
    confianza: 'media',
    ventajas: ['Aguanta el calor y algo de sequía'],
    riesgos: ['Rinde menos sin agua en la canícula'],
    falta: ['El contrato con el ingenio más cercano'],
  },
  melon: {
    lluvia: [300, 500, 1800, 2600],
    temp: [18, 22, 30, 35],
    alt: [0, 0, 500, 1000],
    ph: [5.8, 6.2, 7.5, 8.2],
    sensibilidad: 0.6,
    mercado: 72,
    confianza: 'media',
    ventajas: ['Se da en el sur, seco y caliente, con riego'],
    riesgos: ['La mucha lluvia trae hongos'],
    falta: ['Si hay riego en su parcela'],
  },
  tabaco: {
    lluvia: [500, 800, 1500, 2300],
    temp: [16, 20, 27, 32],
    alt: [0, 300, 1200, 1700],
    ph: [5.0, 5.5, 6.5, 7.5],
    sensibilidad: 0.6,
    mercado: 72,
    confianza: 'baja',
    ventajas: ['Se da en los valles templados del oriente (Danlí, Jamastrán)'],
    riesgos: ['La mucha lluvia daña la hoja'],
    falta: ['Un contrato con una fábrica de puros'],
  },
}

/** Hay puntaje para este cultivo. */
export function tieneAptitud(cultivoId: string | null | undefined): cultivoId is string {
  return Boolean(cultivoId && REQUISITOS[cultivoId] && buscarCultivo(cultivoId))
}

export type Escenario = 'normal' | 'seco' | 'lluvioso'

/** Multiplicadores que cada tipo de ano aplica a las condiciones tipicas. */
export const escenarios: Record<Escenario, { nombre: string; lluvia: number; hum: number; canicula: number }> = {
  seco: { nombre: 'Año seco', lluvia: 0.72, hum: 0.8, canicula: 1.4 },
  normal: { nombre: 'Año normal', lluvia: 1, hum: 1, canicula: 1 },
  lluvioso: { nombre: 'Año lluvioso', lluvia: 1.25, hum: 1.15, canicula: 0.6 },
}

export type ClaveFactor = 'agua' | 'clima' | 'altitud' | 'suelo' | 'sequia'

/** Partes del puntaje. Los pesos suman 1. `limite` completa "Lo que mas le cuesta: ...". */
export const factores: { clave: ClaveFactor; nombre: string; peso: number; limite: string }[] = [
  { clave: 'agua', nombre: 'Lluvia', peso: 0.2, limite: 'la lluvia que cae no es la que pide el cultivo' },
  { clave: 'clima', nombre: 'Calor', peso: 0.2, limite: 'hace más calor o más frío del que le gusta al cultivo' },
  { clave: 'altitud', nombre: 'Altura del terreno', peso: 0.1, limite: 'la altura del terreno no es la mejor para el cultivo' },
  { clave: 'suelo', nombre: 'Tierra', peso: 0.15, limite: 'la tierra guarda poca agua o no es la que le gusta al cultivo' },
  { clave: 'sequia', nombre: 'Aguante a la canícula', peso: 0.35, limite: 'la canícula es larga y este cultivo la aguanta mal' },
]

export type Nivel = 'buena' | 'regular' | 'dificil'

export const palabraNivel: Record<Nivel, string> = { buena: 'Buena', regular: 'Regular', dificil: 'Difícil' }

/** De 80 para arriba es buena; de 65 a 79, regular; menos de 65, dificil. */
export function nivelDePuntaje(total: number): Nivel {
  if (total >= 80) return 'buena'
  if (total >= 65) return 'regular'
  return 'dificil'
}

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function trapecio(v: number, [a, b, c, d]: Rango): number {
  if (v < a || v > d) return 0
  if (v < b) return (v - a) / (b - a)
  if (v <= c) return 1
  return (d - v) / (d - c)
}

/** Condiciones del departamento ajustadas al tipo de ano. */
export function condiciones(d: Departamento, escenario: Escenario): Departamento {
  const e = escenarios[escenario]
  return { ...d, lluvia: d.lluvia * e.lluvia, hum: d.hum * e.hum, canicula: d.canicula * e.canicula }
}

interface Puntaje {
  total: number
  partes: Record<ClaveFactor, number>
}

function puntaje(d: Departamento, cultivoId: string, escenario: Escenario): Puntaje {
  const c = condiciones(d, escenario)
  const r = REQUISITOS[cultivoId]
  const partes: Record<ClaveFactor, number> = {
    agua: 100 * trapecio(c.lluvia, r.lluvia),
    clima: 100 * trapecio(c.temp, r.temp),
    altitud: 100 * trapecio(c.alt, r.alt),
    suelo: 60 * trapecio(c.ph, r.ph) + 40 * limitar((c.hum - 10) / 25, 0, 1),
    sequia: 100 - limitar(c.canicula * r.sensibilidad * 2.2, 0, 100),
  }
  const total = Math.round(factores.reduce((s, f) => s + f.peso * partes[f.clave], 0))
  return { total, partes }
}

export interface PuestoDepartamento {
  id: string
  nombre: string
  total: number
  nivel: Nivel
}

/** Los 18 departamentos, del mejor al peor para el cultivo. Vacio si el cultivo no tiene puntaje. */
export function ranking(cultivoId: string | null, escenario: Escenario): PuestoDepartamento[] {
  if (!tieneAptitud(cultivoId)) return []
  return departamentos
    .map((d) => {
      const total = puntaje(d, cultivoId, escenario).total
      return { id: d.id, nombre: d.nombre, total, nivel: nivelDePuntaje(total) }
    })
    .sort((a, b) => b.total - a.total)
}

export interface ParteAptitud {
  clave: string
  /** De donde sale la parte: el puntaje del departamento o el de la rotacion (para traducir su nombre). */
  grupo?: 'factor' | 'rotacion'
  nombre: string
  peso: number
  valor: number
}

export interface Aptitud {
  departamento: Departamento
  total: number
  nivel: Nivel
  puesto: number
  de: number
  partes: ParteAptitud[]
  /** Frase que completa "Lo que mas le cuesta: ...". */
  limite: string
  /** Parte que mas limita (para traducir `limite`). */
  claveLimite: ClaveFactor
}

/** Que tan bien se da un cultivo en un departamento, o null si falta alguno de los dos. */
export function aptitud(departamentoId: string | null, cultivoId: string | null, escenario: Escenario): Aptitud | null {
  const d = buscarDepartamento(departamentoId)
  if (!d || !tieneAptitud(cultivoId)) return null
  const p = puntaje(d, cultivoId, escenario)
  const orden = ranking(cultivoId, escenario)
  const peor = factores.reduce((m, f) => (p.partes[f.clave] < p.partes[m.clave] ? f : m))
  return {
    departamento: d,
    total: p.total,
    nivel: nivelDePuntaje(p.total),
    puesto: orden.findIndex((x) => x.id === d.id) + 1,
    de: orden.length,
    partes: factores.map((f) => ({ clave: f.clave, grupo: 'factor' as const, nombre: f.nombre, peso: f.peso, valor: Math.round(p.partes[f.clave]) })),
    limite: peor.limite,
    claveLimite: peor.clave,
  }
}

/* ---------- Rotaciones de primera a postrera ---------- */

const partesRotacion = [
  { clave: 'agua', nombre: 'Agua', peso: 0.3 },
  { clave: 'suelo', nombre: 'Tierra', peso: 0.25 },
  { clave: 'clima', nombre: 'Clima', peso: 0.25 },
  { clave: 'venta', nombre: 'Venta', peso: 0.2 },
] as const

function cuidadoDeLaTierra(primera: Cultivo, postrera: Cultivo): number {
  if (primera.id === postrera.id) return 40
  if (postrera.familia === 'cobertura') return 94
  if (postrera.familia === 'leguminosa') return 88
  if (primera.familia === 'leguminosa' || primera.familia === 'cobertura') return 82
  if (primera.familia !== postrera.familia) return 70
  return 60
}

export interface PasoSiembra {
  temporada: 'primera' | 'postrera'
  meses: string
  cultivo: Cultivo
}

export interface RotacionPuntuada {
  /** Id del cultivo de postrera. */
  id: string
  nombre: string
  /** Es repetir el mismo cultivo: lo que el productor hace hoy. */
  actual: boolean
  mejor: boolean
  total: number
  nivel: Nivel
  /** Puntos de diferencia frente a repetir el cultivo. */
  diferencia: number
  confianza: Confianza
  partes: ParteAptitud[]
  fuerte: ParteAptitud
  debil: ParteAptitud
  pasos: PasoSiembra[]
  ventajas: string[]
  riesgos: string[]
  falta: string[]
}

/**
 * Que sembrar de postrera despues del cultivo elegido, en un departamento. Devuelve primero
 * repetir el mismo cultivo y despues las otras opciones, de la mejor a la peor.
 */
export function rotacionesPara(departamentoId: string | null, cultivoId: string | null, escenario: Escenario): RotacionPuntuada[] {
  const d = buscarDepartamento(departamentoId)
  const primera = buscarCultivo(cultivoId)
  // Un cultivo permanente no tiene "que sembrar de postrera": ocupa la tierra todo el ano.
  if (!d || !primera || primera.perenne || !tieneAptitud(cultivoId)) return []

  const lista = Object.keys(REQUISITOS).flatMap((id) => {
    const postrera = buscarCultivo(id)
    if (!postrera || postrera.perenne) return []
    const r = REQUISITOS[id]
    const p = puntaje(d, id, escenario)
    const actual = id === primera.id
    const valores = {
      agua: (p.partes.agua + p.partes.sequia) / 2,
      suelo: limitar(0.7 * cuidadoDeLaTierra(primera, postrera) + 0.3 * p.partes.suelo, 0, 100),
      clima: p.total,
      venta: limitar(r.mercado + (actual ? 0 : 8), 0, 100),
    }
    const partes: ParteAptitud[] = partesRotacion.map((f) => ({ ...f, grupo: 'rotacion' as const, valor: Math.round(valores[f.clave]) }))
    const total = Math.round(partesRotacion.reduce((s, f) => s + f.peso * valores[f.clave], 0))
    const rotacion: RotacionPuntuada = {
      id,
      nombre: actual
        ? `${primera.nombre} y otra vez ${primera.nombre.toLowerCase()}`
        : `${primera.nombre} y después ${postrera.nombre.toLowerCase()}`,
      actual,
      mejor: false,
      total,
      nivel: nivelDePuntaje(total),
      diferencia: 0,
      confianza: r.confianza,
      partes,
      fuerte: partes.reduce((m, f) => (f.valor > m.valor ? f : m)),
      debil: partes.reduce((m, f) => (f.valor < m.valor ? f : m)),
      pasos: [
        { temporada: 'primera', meses: 'Mayo a agosto', cultivo: primera },
        { temporada: 'postrera', meses: 'Septiembre a diciembre', cultivo: postrera },
      ],
      ventajas: r.ventajas,
      riesgos: r.riesgos,
      falta: r.falta,
    }
    return [rotacion]
  })

  const propia = lista.find((r) => r.actual)
  if (!propia) return []
  const maximo = Math.max(...lista.map((r) => r.total))
  for (const r of lista) {
    r.diferencia = r.total - propia.total
    r.mejor = r.total === maximo
  }
  return [propia, ...lista.filter((r) => !r.actual).sort((a, b) => b.total - a.total)]
}
