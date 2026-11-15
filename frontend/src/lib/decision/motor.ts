// Gemini Decision: compara rotaciones con el pronostico de Kharis, el terreno y los objetivos.
// Es determinista: los mismos datos dan siempre los mismos puntajes. Gemini (el modelo de
// lenguaje) solo explica estos numeros; no los cambia.

import {
  CULTIVOS,
  LUGARES,
  NOMBRE_FACTOR,
  OBJETIVOS,
  ORDEN_TEMPORADAS,
  PESOS_BASE,
  REFUERZO_OBJETIVO,
  TEMPORADAS,
  TERRENOS,
  ratingDePuntaje,
  type ParametrosCultivo,
} from './parametros.js'
import type {
  ClaveFactor,
  Confianza,
  Decision,
  EntradaDecision,
  Evidencia,
  Factor,
  Objetivo,
  PasoPlan,
  PuntoKharis,
  RotacionDecidida,
  SenalKharis,
  Temporada,
  Terreno,
} from './tipos.js'

const limitar = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v))
const redondo = (v: number) => Math.round(v)
const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/* ---------- Lectura del pronostico ---------- */

function fecha(inicio: string, k: number): Date {
  const d = new Date(inicio + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + k)
  return d
}

/** Indices del pronostico que caen en la temporada, ordenados por mes y dia. */
function indicesTemporada(p: PuntoKharis, t: Temporada): { k: number; anio: number }[] {
  const [a, b] = TEMPORADAS[t].meses
  const dias: { k: number; clave: number; anio: number }[] = []
  for (let k = 0; k < p.pronostico.dias; k++) {
    const d = fecha(p.pronostico.inicio, k)
    const m = d.getUTCMonth() + 1
    if (m >= a && m <= b) dias.push({ k, clave: m * 100 + d.getUTCDate(), anio: d.getUTCFullYear() })
  }
  return dias.sort((x, y) => x.clave - y.clave)
}

/** Kc del dia `i` de un ciclo de `n` dias: inicial, subida, medio y bajada (20/30/30/20 %). */
function kcDia(kc: [number, number, number], i: number, n: number): number {
  const f = n <= 1 ? 0 : i / (n - 1)
  if (f < 0.2) return kc[0]
  if (f < 0.5) return kc[0] + ((f - 0.2) / 0.3) * (kc[1] - kc[0])
  if (f < 0.8) return kc[1]
  return kc[1] + ((f - 0.8) / 0.2) * (kc[2] - kc[1])
}

interface Ventana {
  lluvia: number
  etc: number
  diasCalor: number
  probIntensa: number
  anio: string
}

function ventana(p: PuntoKharis, t: Temporada, c: ParametrosCultivo, terreno: Terreno): Ventana {
  const dias = indicesTemporada(p, t).slice(0, c.cicloSemanas * 7)
  const ajuste = TERRENOS[terreno].ajusteTemp
  let lluvia = 0
  let etc = 0
  let diasCalor = 0
  let intensa = 0
  const anios = new Map<number, number>()
  dias.forEach(({ k, anio }, i) => {
    lluvia += p.pronostico.PRECTOTCORR.media[k] ?? 0
    etc += (p.fisica.et0[k] ?? 0) * kcDia(c.kc, i, dias.length)
    // El calor dana sobre todo en la floracion: del 40 al 65 % del ciclo.
    const f = dias.length > 1 ? i / (dias.length - 1) : 0
    if (f >= 0.4 && f <= 0.65) {
      const media = (p.pronostico.T2M_MAX.media[k] ?? 0) - ajuste
      const alta = (p.pronostico.T2M_MAX.p90[k] ?? 0) - ajuste
      if (media > c.tCalor) diasCalor += 1
      else if (alta > c.tCalor) diasCalor += 0.5
    }
    intensa += p.fisica.prob_lluvia_intensa[k] ?? 0
    anios.set(anio, (anios.get(anio) ?? 0) + 1)
  })
  const orden = [...anios.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return {
    lluvia,
    etc,
    diasCalor: redondo(diasCalor),
    probIntensa: dias.length ? intensa / dias.length : 0,
    anio: orden.length ? String(orden[0][0]) : '',
  }
}

/** Senal de la temporada mas adelantada (la que es todo pronostico). */
function senal(p: PuntoKharis, clave: string): SenalKharis | null {
  const fila = p.senales[p.senales.length - 1]
  const s = fila?.[clave]
  return s && typeof s === 'object' ? s : null
}

function fraccionPronosticada(p: PuntoKharis): number {
  const fila = p.senales[p.senales.length - 1]
  return fila ? fila.fraccion_pronosticada : 1
}

/* ---------- Candidatos ---------- */

interface Candidato {
  id: string
  actual: boolean
  /** Un cultivo por temporada, empezando en la del productor. Null = tierra sin cultivo. */
  cultivos: (string | null)[]
  icono: string
}

function temporadasDesde(t: Temporada): Temporada[] {
  const i = ORDEN_TEMPORADAS.indexOf(t)
  return [0, 1, 2].map((j) => ORDEN_TEMPORADAS[(i + j) % 3])
}

function candidatos(cultivoId: string): Candidato[] {
  const lista: Candidato[] = [{ id: 'actual', actual: true, cultivos: [cultivoId, cultivoId, null], icono: cultivoId }]
  for (const otro of Object.keys(CULTIVOS)) {
    if (otro === cultivoId) continue
    // El frijol terciopelo dura unas 20 semanas: ocupa dos temporadas.
    const cultivos = otro === 'frijol-terciopelo' ? [cultivoId, otro, otro] : [cultivoId, otro, null]
    lista.push({ id: `${cultivoId}-${otro}`, actual: false, cultivos, icono: otro })
  }
  const leguminosa = cultivoId === 'frijol' ? 'maiz' : 'frijol'
  lista.push({
    id: `${cultivoId}-${leguminosa}-cobertura`,
    actual: false,
    cultivos: [cultivoId, leguminosa, 'frijol-terciopelo'],
    icono: 'frijol-terciopelo',
  })
  return lista
}

function nombreCandidato(c: Candidato): string {
  const nombres = c.cultivos.filter((x, i, a): x is string => x !== null && a.indexOf(x) === i).map((id) => CULTIVOS[id].nombre)
  if (c.actual) return `${nombres[0]} y otra vez ${minus(nombres[0])}`
  if (nombres.length === 2) return `${nombres[0]} y después ${minus(nombres[1])}`
  return `${nombres[0]}, ${minus(nombres[1])} y ${minus(nombres[2])}`
}

/* ---------- Puntaje ---------- */

interface PasoCalculado {
  temporada: Temporada
  cultivoId: string | null
  continua: boolean
  v: Ventana | null
  agua: number | null
  calor: number | null
}

function pesos(objetivos: Objetivo[]): Record<ClaveFactor, number> {
  const crudos = { ...PESOS_BASE }
  for (const o of objetivos) crudos[OBJETIVOS[o].factor] *= REFUERZO_OBJETIVO
  const suma = Object.values(crudos).reduce((s, x) => s + x, 0)
  const salida = {} as Record<ClaveFactor, number>
  for (const k of Object.keys(crudos) as ClaveFactor[]) salida[k] = crudos[k] / suma
  return salida
}

function aguaDelPaso(p: PuntoKharis, t: Temporada, c: ParametrosCultivo, v: Ventana, terreno: Terreno): number {
  const util = v.lluvia * TERRENOS[terreno].lluviaUtil
  const razon = v.etc > 0 ? util / v.etc : 1
  const necesita = c.riego ? 1.3 : 1 - 0.4 * c.tolerancia
  let agua = 100 * limitar(razon / necesita, 0, 1)
  if (c.encharca && TERRENOS[terreno].encharca && razon > 2.2) agua -= 25
  const sensible = 1 - c.tolerancia
  if (t === 'primera') agua -= (senal(p, 'P2')?.probabilidad ?? 0) * sensible * 30
  if (t !== 'verano') agua -= (senal(p, 'P4')?.probabilidad ?? 0) * sensible * 15
  return limitar(agua)
}

function calcularPasos(p: PuntoKharis, e: EntradaDecision, cand: Candidato): PasoCalculado[] {
  const temporadas = temporadasDesde(e.temporada)
  return cand.cultivos.map((id, i) => {
    const t = temporadas[i]
    if (!id) return { temporada: t, cultivoId: null, continua: false, v: null, agua: null, calor: null }
    const continua = i > 0 && cand.cultivos[i - 1] === id && id === 'frijol-terciopelo'
    const c = CULTIVOS[id]
    const v = ventana(p, t, c, e.terreno)
    return {
      temporada: t,
      cultivoId: id,
      continua,
      v,
      agua: aguaDelPaso(p, t, c, v, e.terreno),
      calor: limitar(100 - v.diasCalor * 4),
    }
  })
}

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

function factoresDe(p: PuntoKharis, e: EntradaDecision, pasos: PasoCalculado[]): Record<ClaveFactor, number> {
  const conCultivo = pasos.filter((x) => x.cultivoId !== null)
  const desnudas = pasos.length - conCultivo.length
  const ids = conCultivo.map((x) => x.cultivoId as string)
  const unicos = [...new Set(ids)]
  const fam = (id: string) => CULTIVOS[id].familia
  const leguminosas = unicos.filter((id) => fam(id) === 'leguminosa' || fam(id) === 'cobertura').length
  const coberturas = conCultivo.filter((x) => fam(x.cultivoId as string) === 'cobertura').length

  // Plagas: cada cambio de cultivo en el ciclo del ano (el ultimo vuelve al primero).
  const cambios: number[] = []
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i]
    const b = ids[(i + 1) % ids.length]
    if (ids.length < 2) break
    if (a === b && fam(a) === 'cobertura') continue
    cambios.push(a === b ? 10 : fam(a) === fam(b) ? 45 : 90)
  }
  const plagas = cambios.length ? media(cambios) : 10

  let suelo = 45 + Math.min(leguminosas, 2) * 18 + (coberturas > 0 ? 18 : 0) - desnudas * 12
  if (unicos.length >= 2 && new Set(unicos.map(fam)).size >= 2) suelo += 10
  if (ids.some((id, i) => i > 0 && id === ids[i - 1] && fam(id) !== 'cobertura')) suelo -= 22
  if (unicos.includes('sorgo')) suelo += 6

  const terreno = TERRENOS[e.terreno]
  const extremos = senal(p, 'P7')?.probabilidad ?? 0
  const erosion = 100 - terreno.erosion * (desnudas * 28 + extremos * 20) + (coberturas > 0 ? 15 * terreno.erosion : 0)

  // Una cosecha que se pierde por falta de agua no se vende.
  const cosechas = conCultivo.filter((x) => CULTIVOS[x.cultivoId as string].cosecha)
  const ventaPasos = cosechas.map((x) => CULTIVOS[x.cultivoId as string].mercado * Math.sqrt((x.agua ?? 0) / 100))
  const distintas = new Set(cosechas.map((x) => x.cultivoId)).size
  const venta = media(ventaPasos) + 8 * Math.max(0, distintas - 1)

  const forraje = Math.max(0, ...conCultivo.map((x) => CULTIVOS[x.cultivoId as string].forraje * Math.sqrt((x.agua ?? 0) / 100)))

  return {
    agua: media(conCultivo.filter((x) => !x.continua).map((x) => x.agua ?? 0)),
    calor: media(conCultivo.filter((x) => !x.continua).map((x) => x.calor ?? 0)),
    suelo: limitar(suelo),
    erosion: limitar(erosion),
    venta: limitar(venta),
    forraje: limitar(forraje),
    plagas: limitar(plagas),
    nitrogeno: leguminosas === 0 ? 15 : leguminosas === 1 ? 75 : 95,
  }
}

/* ---------- Textos ---------- */

function articulo(id: string): string {
  return CULTIVOS[id].nombre.startsWith('Frijol terciopelo') ? 'el frijol terciopelo' : `el ${minus(CULTIVOS[id].nombre)}`
}

function pasoPlan(x: PasoCalculado): PasoPlan {
  const t = TEMPORADAS[x.temporada]
  if (!x.cultivoId) {
    return { cultivoId: null, nombre: 'Tierra sin cultivo', temporada: x.temporada, meses: t.texto, lluviaMm: null, aguaPideMm: null, diasCalor: null }
  }
  return {
    cultivoId: x.cultivoId,
    nombre: x.continua ? `${CULTIVOS[x.cultivoId].nombre} (sigue)` : CULTIVOS[x.cultivoId].nombre,
    temporada: x.temporada,
    meses: t.texto,
    lluviaMm: x.v ? redondo(x.v.lluvia) : null,
    aguaPideMm: x.v ? redondo(x.v.etc) : null,
    diasCalor: x.v ? x.v.diasCalor : null,
  }
}

function evidenciaDe(p: PuntoKharis, e: EntradaDecision, pasos: PasoCalculado[]): Evidencia[] {
  const lista: Evidencia[] = []
  for (const x of pasos) {
    if (!x.cultivoId || !x.v || x.continua) continue
    const c = CULTIVOS[x.cultivoId]
    lista.push({
      texto: `${TEMPORADAS[x.temporada].nombre} ${x.v.anio}: lluvia prevista ${redondo(x.v.lluvia)} mm; ${articulo(x.cultivoId)} pide unos ${redondo(x.v.etc)} mm.`,
      fuente: 'Kharis, media del conjunto; agua del cultivo con Kc FAO-56',
    })
    lista.push({
      texto: `${TEMPORADAS[x.temporada].nombre}: ${x.v.diasCalor} días con máxima sobre ${c.tCalor} °C en la floración ${articulo(x.cultivoId).replace(/^el /, 'del ')}.`,
      fuente: 'Kharis, temperatura máxima prevista (media y p90)',
    })
  }
  const p2 = senal(p, 'P2')
  if (p2) lista.push({ texto: `Probabilidad de una canícula larga: ${redondo(p2.probabilidad * 100)} %.`, fuente: 'Kharis, señal P2' })
  const p7 = senal(p, 'P7')
  if (p7) lista.push({ texto: `Probabilidad de lluvias o vientos extremos: ${redondo(p7.probabilidad * 100)} %.`, fuente: 'Kharis, señal P7' })
  const p8 = senal(p, 'P8')
  if (p8) lista.push({ texto: `Parecido con un año de El Niño: ${redondo(p8.probabilidad * 100)} % de los escenarios.`, fuente: 'Kharis, señal P8' })
  const t = TERRENOS[e.terreno]
  lista.push({
    texto: `Terreno ${minus(t.nombre)}: se aprovecha cerca de ${redondo(t.lluviaUtil * 100)} % de la lluvia.`,
    fuente: 'Supuesto del modelo, a validar en campo',
  })
  return lista
}

function razonFactor(clave: ClaveFactor, e: EntradaDecision, pasos: PasoCalculado[], cand: Candidato): string | null {
  const nuevo = pasos.find((x, i) => i > 0 && x.cultivoId && x.cultivoId !== e.cultivoId && !x.continua)
  const nombreNuevo = nuevo?.cultivoId ? articulo(nuevo.cultivoId) : null
  switch (clave) {
    case 'agua': {
      const x = nuevo ?? pasos.find((y) => y.cultivoId)
      if (!x?.v || !x.cultivoId) return null
      const pct = x.v.etc > 0 ? redondo((100 * x.v.lluvia * TERRENOS[e.terreno].lluviaUtil) / x.v.etc) : 100
      return `En ${minus(TEMPORADAS[x.temporada].nombre)} la lluvia prevista cubre cerca de ${Math.min(pct, 999)} % del agua que pide ${articulo(x.cultivoId)}.`
    }
    case 'calor':
      return 'Casi no le tocan días de calor dañino en las fechas de siembra.'
    case 'suelo':
      return nombreNuevo ? `Con ${nombreNuevo} la tierra gana materia orgánica y no se cansa.` : null
    case 'erosion':
      return cand.cultivos.every((c) => c !== null)
        ? `La tierra no queda desnuda en todo el año: protege su terreno ${minus(TERRENOS[e.terreno].nombre)} de la lluvia fuerte.`
        : null
    case 'venta':
      return nombreNuevo && nuevo?.cultivoId && CULTIVOS[nuevo.cultivoId].cosecha ? `Suma una cosecha de ${minus(CULTIVOS[nuevo.cultivoId].nombre)} para vender.` : null
    case 'forraje':
      return nombreNuevo && nuevo?.cultivoId && CULTIVOS[nuevo.cultivoId].forraje >= 50 ? `${nombreNuevo.charAt(0).toUpperCase()}${nombreNuevo.slice(1)} sirve de comida para los animales.` : null
    case 'plagas':
      return nombreNuevo ? `Pasar ${nombreNuevo.replace(/^el /, 'al ')} corta el ciclo de las plagas del ${minus(CULTIVOS[e.cultivoId].nombre)}.` : null
    case 'nitrogeno':
      return nombreNuevo ? 'Deja abono natural: las leguminosas fijan nitrógeno del aire.' : null
  }
}

function riesgosDe(pasos: PasoCalculado[], e: EntradaDecision): string[] {
  const lista: string[] = []
  for (const x of pasos) {
    if (!x.cultivoId || x.continua) continue
    const c = CULTIVOS[x.cultivoId]
    const temporada = minus(TEMPORADAS[x.temporada].nombre)
    if ((x.agua ?? 100) < 40) lista.push(`En ${temporada} la lluvia prevista no alcanza para ${articulo(x.cultivoId)}: sin riego se puede perder.`)
    if ((x.v?.diasCalor ?? 0) >= 6) lista.push(`En ${temporada} hay ${x.v?.diasCalor} días de calor fuerte en la floración ${articulo(x.cultivoId).replace(/^el /, 'del ')}.`)
    if (c.encharca && TERRENOS[e.terreno].encharca && x.temporada !== 'verano') lista.push(`En terreno bajo ${articulo(x.cultivoId)} sufre si se encharca.`)
  }
  if (pasos.some((x) => x.cultivoId === null) && TERRENOS[e.terreno].erosion >= 0.6) {
    lista.push('La tierra queda desnuda una temporada y en su terreno la lluvia se la puede llevar.')
  }
  return lista
}

/* ---------- Decision ---------- */

export interface MetaKharis {
  fechaBase: string
  modelo: string
}

export function decidir(e: EntradaDecision, p: PuntoKharis, meta: MetaKharis): Decision {
  const w = pesos(e.objetivos)
  const claves = Object.keys(PESOS_BASE) as ClaveFactor[]

  const calculadas = candidatos(e.cultivoId).map((cand) => {
    const pasos = calcularPasos(p, e, cand)
    const valores = factoresDe(p, e, pasos)
    let puntaje = claves.reduce((s, k) => s + w[k] * valores[k], 0)
    const inviable = pasos.some((x) => x.cultivoId && CULTIVOS[x.cultivoId].cosecha && (x.agua ?? 100) < 30)
    if (inviable) puntaje = Math.min(puntaje, 58)
    return { cand, pasos, valores, puntaje: redondo(puntaje), inviable }
  })

  const actual = calculadas.find((x) => x.cand.actual)!
  const ordenadas = [...calculadas].sort((a, b) => b.puntaje - a.puntaje || Number(a.cand.actual) - Number(b.cand.actual))
  const mejor = ordenadas[0]

  const rotaciones: RotacionDecidida[] = ordenadas.map((x) => {
    const factores: Factor[] = claves.map((k) => ({ clave: k, nombre: NOMBRE_FACTOR[k], peso: Math.round(w[k] * 100) / 100, valor: redondo(x.valores[k]) }))
    const diferencia = x.puntaje - actual.puntaje

    // Por que: las partes que mas suben el puntaje frente a lo que hace hoy.
    const aporte = claves
      .map((k) => ({ k, d: w[k] * (x.valores[k] - actual.valores[k]) }))
      .filter((a) => x.cand.actual || a.d > 0.4)
      .sort((a, b) => (x.cand.actual ? w[b.k] * x.valores[b.k] - w[a.k] * x.valores[a.k] : b.d - a.d))
    const razones: string[] = []
    if (x.cand.actual) razones.push('Es lo que hace hoy: sirve para comparar las otras opciones.')
    else if (diferencia > 0) razones.push(`Saca ${diferencia} puntos más que lo que hace hoy.`)
    else if (diferencia < 0) razones.push(`Saca ${-diferencia} puntos menos que lo que hace hoy.`)
    for (const a of aporte) {
      const r = razonFactor(a.k, e, x.pasos, x.cand)
      if (r && !razones.includes(r)) razones.push(r)
      if (razones.length >= 4) break
    }
    const cumplidos = e.objetivos.filter((o) => x.valores[OBJETIVOS[o].factor] >= 70).map((o) => minus(OBJETIVOS[o].nombre))
    if (cumplidos.length) razones.push(`Va con lo que usted quiere: ${cumplidos.join(', ')}.`)

    const usados = [...new Set(x.pasos.map((y) => y.cultivoId).filter((y): y is string => y !== null))]
    const nuevos = usados.filter((id) => id !== e.cultivoId)
    const beneficios = (x.cand.actual ? CULTIVOS[e.cultivoId].beneficios : nuevos.flatMap((id) => CULTIVOS[id].beneficios)).slice(0, 4)
    const riesgos = [...riesgosDe(x.pasos, e), ...usados.flatMap((id) => CULTIVOS[id].riesgos)]
    const faltaSaber = [...new Set([...usados.flatMap((id) => CULTIVOS[id].falta), 'Cómo le fue en su parcela en años pasados'])]
    const confianza: Confianza = x.inviable || usados.some((id) => CULTIVOS[id].riego) ? 'baja' : 'media'

    return {
      id: x.cand.id,
      nombre: nombreCandidato(x.cand),
      cultivoIcono: x.cand.icono,
      actual: x.cand.actual,
      mejor: x === mejor,
      puntaje: x.puntaje,
      rating: ratingDePuntaje(x.puntaje),
      diferencia,
      confianza,
      pasos: x.pasos.map(pasoPlan),
      factores,
      razones,
      beneficios,
      riesgos: [...new Set(riesgos)].slice(0, 5),
      faltaSaber: faltaSaber.slice(0, 4),
      evidencia: evidenciaDe(p, e, x.pasos),
    }
  })

  const lugar = LUGARES[e.zonaId]
  return {
    version: 'gemini-decision.v1',
    entrada: e,
    punto: {
      id: p.punto,
      nombre: lugar?.nombre ?? p.punto,
      fechaBase: meta.fechaBase,
      modelo: meta.modelo,
      fraccionPronosticada: fraccionPronosticada(p),
    },
    rotaciones,
    mejorId: mejor.cand.id,
    avisos: [
      'Más allá de dos meses el pronóstico se parece al clima normal del lugar: sirve para la temporada, no para un día exacto.',
      'Los precios, el forraje y los datos de arroz, tomate y frijol terciopelo son de referencia y faltan validar.',
      'Es una ayuda para pensar: la decisión final es suya y de su técnico.',
    ],
  }
}

/* ---------- Validacion de la entrada (para la API) ---------- */

const TERRENOS_VALIDOS: Terreno[] = ['plano', 'elevado', 'bajo', 'ondulado']
const TEMPORADAS_VALIDAS: Temporada[] = ['primera', 'postrera', 'verano']

export function validarEntrada(x: unknown): EntradaDecision | null {
  if (typeof x !== 'object' || x === null) return null
  const d = x as Record<string, unknown>
  if (typeof d.zonaId !== 'string' || !LUGARES[d.zonaId]) return null
  if (typeof d.cultivoId !== 'string' || !CULTIVOS[d.cultivoId]) return null
  if (!TERRENOS_VALIDOS.includes(d.terreno as Terreno)) return null
  if (!TEMPORADAS_VALIDAS.includes(d.temporada as Temporada)) return null
  const objetivos = Array.isArray(d.objetivos)
    ? [...new Set(d.objetivos.filter((o): o is Objetivo => typeof o === 'string' && o in OBJETIVOS))]
    : []
  return {
    zonaId: d.zonaId,
    cultivoId: d.cultivoId,
    terreno: d.terreno as Terreno,
    temporada: d.temporada as Temporada,
    objetivos,
  }
}
