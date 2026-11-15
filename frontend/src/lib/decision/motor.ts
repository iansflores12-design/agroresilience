// Gemini Decision: compara rotaciones con el pronostico de Kharis, el terreno y los objetivos.
// Es determinista: los mismos datos dan siempre los mismos puntajes. Los precios de la region
// (precios.ts) entran como dato y mueven la parte de venta; Gemini (el modelo de lenguaje) solo
// explica estos numeros, no los cambia.

import type { TFunction } from 'i18next'
import { esIdioma, LOCALE, normalizarIdioma } from '../../i18n/idiomas.js'
import { lista as listaT, mayuscula, traductor } from '../../i18n/traductor.js'
import { ajustarAParcela, dentroDeHonduras } from './escala.js'
import {
  CULTIVOS,
  LUGARES,
  NOMBRES_PUNTOS,
  OBJETIVOS,
  ORDEN_TEMPORADAS,
  PESOS_BASE,
  REFUERZO_OBJETIVO,
  TEMPORADAS,
  TERRENOS,
  ratingDePuntaje,
  type ParametrosCultivo,
} from './parametros.js'
import { PRECIOS_REFERENCIA, ajustePorPrecio, fechaCorta, lempiras, type PreciosRegion } from './precios.js'
import type {
  ClaveFactor,
  Confianza,
  Decision,
  EntradaDecision,
  EscalaFina,
  Evidencia,
  Factor,
  InfoParcela,
  Objetivo,
  PasoPlan,
  PuntoKharis,
  Razon,
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

function ventana(p: PuntoKharis, t: Temporada, c: ParametrosCultivo, ajuste: number): Ventana {
  const dias = indicesTemporada(p, t).slice(0, c.cicloSemanas * 7)
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

function nombreCandidato(t: TFunction, c: Candidato): string {
  const nombres = c.cultivos.filter((x, i, a): x is string => x !== null && a.indexOf(x) === i).map((id) => nombre(t, id))
  if (c.actual) return t('motor.nombreActual', { a: nombres[0], b: minus(nombres[0]) })
  if (nombres.length === 2) return t('motor.nombreDos', { a: nombres[0], b: minus(nombres[1]) })
  return t('motor.nombreTres', { a: nombres[0], b: minus(nombres[1]), c: minus(nombres[2]) })
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

function calcularPasos(p: PuntoKharis, e: EntradaDecision, cand: Candidato, ajusteTemp: number): PasoCalculado[] {
  const temporadas = temporadasDesde(e.temporada)
  return cand.cultivos.map((id, i) => {
    const t = temporadas[i]
    if (!id) return { temporada: t, cultivoId: null, continua: false, v: null, agua: null, calor: null }
    const continua = i > 0 && cand.cultivos[i - 1] === id && id === 'frijol-terciopelo'
    const c = CULTIVOS[id]
    const v = ventana(p, t, c, ajusteTemp)
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

function factoresDe(p: PuntoKharis, e: EntradaDecision, pasos: PasoCalculado[], precios?: PreciosRegion | null): Record<ClaveFactor, number> {
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

  // Una cosecha que se pierde por falta de agua no se vende. El precio de la region sube o baja el mercado.
  const cosechas = conCultivo.filter((x) => CULTIVOS[x.cultivoId as string].cosecha)
  const mercado = (id: string) => limitar(CULTIVOS[id].mercado + ajustePorPrecio(id, precios))
  const ventaPasos = cosechas.map((x) => mercado(x.cultivoId as string) * Math.sqrt((x.agua ?? 0) / 100))
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

// Los textos salen de `src/i18n/recursos/` en el idioma de la entrada (por defecto, español).

const nombre = (t: TFunction, id: string) => t(`cultivos.${id}.nombre`)
/** Si el "falta saber" numero i del cultivo es su precio: se mira en el texto base, que va en el mismo orden en cada idioma. */
const esFaltaPrecio = (id: string, i: number) => /precio/i.test(CULTIVOS[id].falta[i] ?? '')
const el = (t: TFunction, id: string) => t(`cultivos.${id}.el`)
const del = (t: TFunction, id: string) => t(`cultivos.${id}.del`)
const nombreTemporada = (t: TFunction, x: Temporada) => t(`temporadas.${x}.nombre`)
const nombreTerreno = (t: TFunction, x: Terreno) => t(`terrenos.${x}.nombre`)

function pasoPlan(t: TFunction, x: PasoCalculado): PasoPlan {
  const meses = t(`temporadas.${x.temporada}.texto`)
  if (!x.cultivoId) {
    return { cultivoId: null, nombre: t('motor.sinCultivo'), temporada: x.temporada, meses, lluviaMm: null, aguaPideMm: null, diasCalor: null }
  }
  return {
    cultivoId: x.cultivoId,
    nombre: x.continua ? t('motor.sigue', { nombre: nombre(t, x.cultivoId) }) : nombre(t, x.cultivoId),
    ...(x.continua ? { continua: true } : {}),
    temporada: x.temporada,
    meses,
    lluviaMm: x.v ? redondo(x.v.lluvia) : null,
    aguaPideMm: x.v ? redondo(x.v.etc) : null,
    diasCalor: x.v ? x.v.diasCalor : null,
  }
}

/** El precio con el que se califico la venta de cada cultivo que se cosecha. */
function evidenciaPrecios(t: TFunction, pasos: PasoCalculado[], precios?: PreciosRegion | null): Evidencia[] {
  const ids = [...new Set(pasos.map((x) => x.cultivoId).filter((id): id is string => id !== null && CULTIVOS[id].cosecha))]
  const lista: Evidencia[] = []
  for (const id of ids) {
    const ref = PRECIOS_REFERENCIA[id]
    if (!ref) continue
    const del = t('motor.precios.del', { cultivo: minus(nombre(t, id)) })
    const local = precios?.cultivos[id]
    if (!local) {
      lista.push({
        texto: t('motor.precios.referencia', { del, precio: lempiras(ref.lempirasQq), mercado: ref.mercado, fecha: fechaCorta(ref.fecha) }),
        fuente: ref.fuente,
      })
      continue
    }
    const puntos = ajustePorPrecio(id, precios)
    const efecto = puntos > 0 ? t('motor.precios.suma', { n: puntos }) : puntos < 0 ? t('motor.precios.resta', { n: -puntos }) : t('motor.precios.igual')
    lista.push({
      texto: t('motor.precios.local', {
        del,
        mercado: local.mercado,
        precio: lempiras(local.lempirasQq),
        fecha: local.fecha ? ` (${fechaCorta(local.fecha)})` : '',
        referencia: lempiras(ref.lempirasQq),
        efecto,
      }),
      fuente: t('motor.precios.fuente', { fuente: local.fuente, fecha: fechaCorta(precios?.consultado ?? '') }),
    })
  }
  return lista
}

function evidenciaDe(t: TFunction, p: PuntoKharis, e: EntradaDecision, pasos: PasoCalculado[]): Evidencia[] {
  const lista: Evidencia[] = []
  for (const x of pasos) {
    if (!x.cultivoId || !x.v || x.continua) continue
    const c = CULTIVOS[x.cultivoId]
    const temporada = nombreTemporada(t, x.temporada)
    lista.push({
      texto: t('motor.evidencia.lluvia', { temporada, anio: x.v.anio, lluvia: redondo(x.v.lluvia), el: el(t, x.cultivoId), etc: redondo(x.v.etc) }),
      fuente: t('motor.evidencia.lluviaFuente'),
    })
    lista.push({
      texto: t('motor.evidencia.calor', { temporada, dias: x.v.diasCalor, limite: c.tCalor, del: del(t, x.cultivoId) }),
      fuente: t('motor.evidencia.calorFuente'),
    })
  }
  for (const clave of ['P2', 'P7', 'P8'] as const) {
    const s = senal(p, clave)
    if (s) {
      lista.push({
        texto: t(`motor.evidencia.${clave.toLowerCase()}`, { pct: redondo(s.probabilidad * 100) }),
        fuente: t('motor.evidencia.senalFuente', { senal: clave }),
      })
    }
  }
  lista.push({
    texto: t('motor.evidencia.terreno', { terreno: minus(nombreTerreno(t, e.terreno)), pct: redondo(TERRENOS[e.terreno].lluviaUtil * 100) }),
    fuente: t('motor.evidencia.terrenoFuente'),
  })
  return lista
}

function razonFactor(t: TFunction, clave: ClaveFactor, e: EntradaDecision, pasos: PasoCalculado[], cand: Candidato, precios?: PreciosRegion | null): string | null {
  const nuevo = pasos.find((x, i) => i > 0 && x.cultivoId && x.cultivoId !== e.cultivoId && !x.continua)
  const idNuevo = nuevo?.cultivoId ?? null
  switch (clave) {
    case 'agua': {
      const x = nuevo ?? pasos.find((y) => y.cultivoId)
      if (!x?.v || !x.cultivoId) return null
      const pct = x.v.etc > 0 ? redondo((100 * x.v.lluvia * TERRENOS[e.terreno].lluviaUtil) / x.v.etc) : 100
      return t('motor.razones.agua', { temporada: minus(nombreTemporada(t, x.temporada)), pct: Math.min(pct, 999), el: el(t, x.cultivoId) })
    }
    case 'calor':
      return t('motor.razones.calor')
    case 'suelo':
      return idNuevo ? t('motor.razones.suelo', { el: el(t, idNuevo) }) : null
    case 'erosion':
      return cand.cultivos.every((c) => c !== null) ? t('motor.razones.erosion', { terreno: minus(nombreTerreno(t, e.terreno)) }) : null
    case 'venta': {
      const local = idNuevo ? precios?.cultivos[idNuevo] : undefined
      if (idNuevo && local && CULTIVOS[idNuevo].cosecha && ajustePorPrecio(idNuevo, precios) > 0) {
        return t('motor.razones.ventaPrecio', { cultivo: minus(nombre(t, idNuevo)), mercado: local.mercado, precio: lempiras(local.lempirasQq) })
      }
      return idNuevo && CULTIVOS[idNuevo].cosecha ? t('motor.razones.venta', { cultivo: minus(nombre(t, idNuevo)) }) : null
    }
    case 'forraje':
      return idNuevo && CULTIVOS[idNuevo].forraje >= 50 ? t('motor.razones.forraje', { el: mayuscula(el(t, idNuevo)) }) : null
    case 'plagas':
      return idNuevo ? t('motor.razones.plagas', { al: t(`cultivos.${idNuevo}.al`), delActual: del(t, e.cultivoId) }) : null
    case 'nitrogeno':
      return idNuevo ? t('motor.razones.nitrogeno') : null
  }
}

function riesgosDe(t: TFunction, pasos: PasoCalculado[], e: EntradaDecision): string[] {
  const lista: string[] = []
  for (const x of pasos) {
    if (!x.cultivoId || x.continua) continue
    const c = CULTIVOS[x.cultivoId]
    const temporada = minus(nombreTemporada(t, x.temporada))
    if ((x.agua ?? 100) < 40) lista.push(t('motor.riesgos.sinAgua', { temporada, el: el(t, x.cultivoId) }))
    if ((x.v?.diasCalor ?? 0) >= 6) lista.push(t('motor.riesgos.calor', { temporada, dias: x.v?.diasCalor, del: del(t, x.cultivoId) }))
    if (c.encharca && TERRENOS[e.terreno].encharca && x.temporada !== 'verano') lista.push(t('motor.riesgos.encharca', { el: el(t, x.cultivoId) }))
  }
  if (pasos.some((x) => x.cultivoId === null) && TERRENOS[e.terreno].erosion >= 0.6) {
    lista.push(t('motor.riesgos.desnuda'))
  }
  return lista
}

/* ---------- Decision ---------- */

export interface MetaKharis {
  fechaBase: string
  modelo: string
  /** Con parcela: malla de altura y coeficientes validados, y la distancia al punto de Kharis usado. */
  escala?: EscalaFina | null
  distanciaKm?: number
  /** Precios de la region (api/_precios.ts). Sin ellos la venta usa solo la referencia nacional. */
  precios?: PreciosRegion | null
}

export function decidir(e: EntradaDecision, pKharis: PuntoKharis, meta: MetaKharis): Decision {
  const t = traductor(e.idioma)
  const w = pesos(e.objetivos)
  const claves = Object.keys(PESOS_BASE) as ClaveFactor[]

  // Escala de parcela: el punto se ajusta a la altura real de la parcela (solo lo validado).
  let p = pKharis
  let parcela: InfoParcela | undefined
  if (e.parcela && meta.escala) {
    const r = ajustarAParcela(pKharis, meta.escala, e.parcela, NOMBRES_PUNTOS[pKharis.punto] ?? pKharis.punto, meta.distanciaKm ?? 0)
    p = r.punto
    parcela = r.info
  }
  // Con la altura real ya no hace falta suponer el calor por el tipo de terreno.
  const ajusteTemp = parcela && parcela.alturaM !== null ? 0 : TERRENOS[e.terreno].ajusteTemp

  const calculadas = candidatos(e.cultivoId).map((cand) => {
    const pasos = calcularPasos(p, e, cand, ajusteTemp)
    const valores = factoresDe(p, e, pasos, meta.precios)
    let puntaje = claves.reduce((s, k) => s + w[k] * valores[k], 0)
    const inviable = pasos.some((x) => x.cultivoId && CULTIVOS[x.cultivoId].cosecha && (x.agua ?? 100) < 30)
    if (inviable) puntaje = Math.min(puntaje, 58)
    return { cand, pasos, valores, puntaje: redondo(puntaje), inviable }
  })

  const actual = calculadas.find((x) => x.cand.actual)!
  const ordenadas = [...calculadas].sort((a, b) => b.puntaje - a.puntaje || Number(a.cand.actual) - Number(b.cand.actual))
  const mejor = ordenadas[0]

  const rotaciones: RotacionDecidida[] = ordenadas.map((x) => {
    const factores: Factor[] = claves.map((k) => ({
      clave: k,
      nombre: t(`factores.${k}`),
      peso: Math.round(w[k] * 100) / 100,
      valor: redondo(x.valores[k]),
      objetivo: e.objetivos.some((o) => OBJETIVOS[o].factor === k),
    }))
    const diferencia = x.puntaje - actual.puntaje

    // Por que: las partes que mas suben el puntaje frente a lo que hace hoy.
    const aporte = claves
      .map((k) => ({ k, d: w[k] * (x.valores[k] - actual.valores[k]) }))
      .filter((a) => x.cand.actual || a.d > 0.4)
      .sort((a, b) => (x.cand.actual ? w[b.k] * x.valores[b.k] - w[a.k] * x.valores[a.k] : b.d - a.d))
    const razones: Razon[] = []
    if (x.cand.actual) razones.push({ tipo: 'actual', texto: t('motor.razones.actual') })
    else if (diferencia > 0) razones.push({ tipo: 'comparacion', texto: t('motor.razones.mas', { n: diferencia }) })
    else if (diferencia < 0) razones.push({ tipo: 'comparacion', texto: t('motor.razones.menos', { n: -diferencia }) })
    for (const a of aporte) {
      const texto = razonFactor(t, a.k, e, x.pasos, x.cand, meta.precios)
      if (texto && !razones.some((r) => r.texto === texto)) razones.push({ tipo: a.k, texto })
      if (razones.length >= 4) break
    }
    const cumplidos = e.objetivos.filter((o) => x.valores[OBJETIVOS[o].factor] >= 70).map((o) => minus(t(`objetivos.${o}.nombre`)))
    if (cumplidos.length) razones.push({ tipo: 'objetivos', texto: t('motor.razones.objetivos', { lista: cumplidos.join(', ') }) })

    const usados = [...new Set(x.pasos.map((y) => y.cultivoId).filter((y): y is string => y !== null))]
    const nuevos = usados.filter((id) => id !== e.cultivoId)
    const textos = (id: string, clave: 'beneficios' | 'riesgos' | 'falta') => listaT(t, `cultivos.${id}.${clave}`)
    const beneficios = (x.cand.actual ? textos(e.cultivoId, 'beneficios') : nuevos.flatMap((id) => textos(id, 'beneficios'))).slice(0, 4)
    const riesgos = [...riesgosDe(t, x.pasos, e), ...usados.flatMap((id) => textos(id, 'riesgos'))]
    // Si ya se hallo el precio de la region, deja de ser algo que falta saber (cada "falta" de precio va primero).
    const faltan = usados.flatMap((id) => textos(id, 'falta').filter((_, i) => !(meta.precios?.cultivos[id] && esFaltaPrecio(id, i))))
    const faltaSaber = [...new Set([...faltan, t('motor.faltaPasado')])]
    const confianza: Confianza = x.inviable || usados.some((id) => CULTIVOS[id].riego) ? 'baja' : 'media'

    return {
      id: x.cand.id,
      nombre: nombreCandidato(t, x.cand),
      cultivoIcono: x.cand.icono,
      actual: x.cand.actual,
      mejor: x === mejor,
      puntaje: x.puntaje,
      rating: ratingDePuntaje(x.puntaje),
      diferencia,
      confianza,
      pasos: x.pasos.map((y) => pasoPlan(t, y)),
      factores,
      razones,
      beneficios,
      riesgos: [...new Set(riesgos)].slice(0, 5),
      faltaSaber: faltaSaber.slice(0, 4),
      evidencia: [
        ...(parcela ? evidenciaParcela(t, LOCALE[normalizarIdioma(e.idioma)], parcela) : []),
        ...evidenciaDe(t, p, e, x.pasos),
        ...evidenciaPrecios(t, x.pasos, meta.precios),
      ],
    }
  })

  const lugar = LUGARES[e.zonaId]
  return {
    version: 'gemini-decision.v1',
    entrada: e,
    punto: {
      id: p.punto,
      nombre: parcela ? t('motor.puntoParcela', { lugar: parcela.puntoNombre }) : lugar?.nombre ?? p.punto,
      fechaBase: meta.fechaBase,
      modelo: meta.modelo,
      fraccionPronosticada: fraccionPronosticada(p),
      ...(parcela ? { parcela } : {}),
    },
    rotaciones,
    mejorId: mejor.cand.id,
    ...(meta.precios ? { precios: meta.precios } : {}),
    avisos: listaT(t, 'motor.avisos').map((a, i) =>
      i === 1 && meta.precios?.origen === 'busqueda' ? t('motor.precios.avisoBusqueda', { region: meta.precios.region }) : a,
    ),
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
  const salida: EntradaDecision = {
    zonaId: d.zonaId,
    cultivoId: d.cultivoId,
    terreno: d.terreno as Terreno,
    temporada: d.temporada as Temporada,
    objetivos,
  }
  if (esIdioma(d.idioma)) salida.idioma = d.idioma
  const pc = d.parcela as { lat?: unknown; lon?: unknown } | undefined
  if (pc && typeof pc === 'object') {
    const lat = Number(pc.lat)
    const lon = Number(pc.lon)
    if (!dentroDeHonduras(lat, lon)) return null
    // 3 decimales (~100 m): suficiente para la malla de 2 km y no guarda la ubicacion exacta.
    salida.parcela = { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 }
  }
  return salida
}

/* ---------- Escala de parcela ---------- */

function evidenciaParcela(t: TFunction, locale: string, i: InfoParcela): Evidencia[] {
  const lista: Evidencia[] = [
    {
      texto: i.alturaM === null
        ? t('motor.parcela.sinAltura', { punto: i.puntoNombre, km: i.distanciaKm })
        : t('motor.parcela.conAltura', {
            altura: Math.round(i.alturaM).toLocaleString(locale),
            punto: i.puntoNombre,
            km: i.distanciaKm,
            alturaCelda: i.alturaCeldaM.toLocaleString(locale),
          }),
      fuente: t('motor.parcela.alturaFuente'),
    },
  ]
  if (i.alturaM !== null && (i.cambioTmin !== 0 || i.cambioEt0Pct !== 0)) {
    const grados = (x: number, f: string, c: string) =>
      t('motor.parcela.grados', { n: Math.abs(x).toLocaleString(locale), palabra: t(`motor.parcela.${x <= 0 ? f : c}`) })
    lista.push({
      texto: t('motor.parcela.ajuste', {
        noches: grados(i.cambioTmin, 'frescas', 'calidas'),
        dia: grados(i.cambioTmedia, 'fresco', 'calido'),
        pct: Math.abs(i.cambioEt0Pct),
        agua: t(i.cambioEt0Pct <= 0 ? 'motor.parcela.menosAgua' : 'motor.parcela.masAgua'),
      }),
      fuente: t('motor.parcela.ajusteFuente'),
    })
  }
  return lista
}
