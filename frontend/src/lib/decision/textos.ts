// Resumen rapido (sin Gemini) e instrucciones para Gemini. Lo usan el navegador y la API.

import { CULTIVOS, OBJETIVOS, PALABRA_RATING, TEMPORADAS, TERRENOS } from './parametros.js'
import type { Decision, RotacionDecidida } from './tipos.js'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-11-10" -> "10 de noviembre" */
export function fechaEnPalabras(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${d} de ${MESES[m - 1]}` : iso
}

export function buscarRotacion(d: Decision, id: string): RotacionDecidida | null {
  return d.rotaciones.find((r) => r.id === id) ?? null
}

/**
 * Id especial de consulta: el analisis y el chat hablan de las tres mejores rotaciones juntas,
 * no de una sola. Lo usan la pantalla Plan, /api/analisis y /api/chat.
 */
export const TOP3 = 'top3'

/** Las tres primeras del ranking (o menos, si se compararon menos). */
export function tresMejores(d: Decision): RotacionDecidida[] {
  return d.rotaciones.slice(0, 3)
}

const cuidado = (riesgo: string | undefined) => {
  const r = riesgo?.replace(/\.?$/, '.')
  return r ? `Tenga cuidado: ${r.charAt(0).toLowerCase()}${r.slice(1)}` : null
}

/** Resumen del top 3 si Gemini tarda mas del limite o falla. Sale solo de la decision. */
function resumenTop3(d: Decision): string {
  const tres = tresMejores(d)
  if (!tres.length) return ''
  const lista = tres.map((r, i) => `${i + 1}) ${r.nombre}, ${r.puntaje} de 100`).join('; ')
  const partes = [`Las mejores para su parcela en ${d.punto.nombre}: ${lista}.`]
  partes.push(...tres[0].razones.slice(0, 2).map((x) => x.texto))
  const aviso = cuidado(tres[0].riesgos[0])
  if (aviso) partes.push(aviso)
  return partes.join(' ')
}

/** Resumen que se muestra si Gemini tarda mas del limite o falla. Sale solo de la decision. */
export function resumenRapido(d: Decision, id: string): string {
  if (id === TOP3) return resumenTop3(d)
  const r = buscarRotacion(d, id)
  if (!r) return ''
  const mejor = buscarRotacion(d, d.mejorId)
  const partes: string[] = []
  partes.push(`${r.nombre}: ${r.puntaje} de 100 (${PALABRA_RATING[r.rating].toLowerCase()}) en ${d.punto.nombre}.`)
  if (r.mejor) partes.push('Es la mejor de las opciones comparadas para su parcela.')
  else if (mejor) partes.push(`La mejor opción es ${mejor.nombre.toLowerCase()}, con ${mejor.puntaje}.`)
  partes.push(...r.razones.slice(0, 3).map((x) => x.texto))
  const aviso = cuidado(r.riesgos[0])
  if (aviso) partes.push(aviso)
  return partes.join(' ')
}

/**
 * Respuesta preparada de antemano para el chat, por si Gemini no contesta. Sale solo de la
 * decisión: según de qué trate la pregunta, cuenta el agua, lo que falta para empezar, los
 * riesgos o las razones. `id` es una rotación o TOP3 (entonces se habla de la mejor).
 */
export function respuestaRapida(d: Decision, id: string, pregunta: string): string {
  const r = id === TOP3 ? tresMejores(d)[0] : buscarRotacion(d, id)
  if (!r) return resumenRapido(d, id)
  const p = pregunta.toLowerCase()
  const partes: string[] = []
  if (/lluev|lluvia|agua|sec[ao]|riego|regar/.test(p)) {
    for (const x of r.pasos) {
      if (x.cultivoId && x.lluviaMm !== null && x.aguaPideMm !== null) {
        const alcanza = x.lluviaMm >= x.aguaPideMm ? 'alcanza' : 'no alcanza sin riego'
        partes.push(`${TEMPORADAS[x.temporada].nombre}, ${x.nombre.toLowerCase()}: se prevén ${x.lluviaMm} mm de lluvia y pide ${x.aguaPideMm} mm, ${alcanza}.`)
      }
    }
    if (!partes.length) partes.push('El motor no tiene la lluvia prevista para esta rotación.')
  } else if (/necesit|empez|preparar|falta|primero/.test(p)) {
    partes.push('Calendario: ' + r.pasos.map((x) => `${TEMPORADAS[x.temporada].nombre} (${x.meses.toLowerCase()}), ${x.nombre.toLowerCase()}`).join('; ') + '.')
    if (r.faltaSaber.length) partes.push('Antes de empezar revise con su técnico: ' + r.faltaSaber.join('; ').replace(/\.?$/, '.'))
  } else if (/riesgo|cuidado|peligro|plaga|perder/.test(p)) {
    partes.push(...(r.riesgos.length ? r.riesgos : ['El motor no encontró riesgos especiales en esta rotación.']))
  } else {
    partes.push(`${r.nombre}: ${r.puntaje} de 100 en ${d.punto.nombre}.`, ...r.razones.slice(0, 3).map((x) => x.texto))
    const otra = d.rotaciones.find((x) => x.id !== r.id)
    if (otra) partes.push(`La siguiente opción es ${otra.nombre.toLowerCase()}, con ${otra.puntaje}.`)
  }
  const aviso = cuidado(r.riesgos[0])
  if (aviso && !partes.some((x) => r.riesgos.includes(x))) partes.push(aviso)
  return `Resumen rápido, sin Gemini. ${partes.join(' ')}`
}

/** Lo que el motor sabe de una rotacion: calendario, partes del puntaje, razones y evidencia. */
function detalleRotacion(r: RotacionDecidida): string[] {
  return [
    'Calendario: ' + r.pasos.map((p) => `${TEMPORADAS[p.temporada].nombre} (${p.meses}): ${p.nombre}`).join('; '),
    'Partes del puntaje: ' + r.factores.map((f) => `${f.nombre} ${f.valor} (peso ${f.peso})`).join(', '),
    'Por qué: ' + r.razones.map((x) => x.texto).join(' '),
    'Evidencia del motor: ' + r.evidencia.map((x) => `${x.texto} [${x.fuente}]`).join(' '),
    'Riesgos: ' + r.riesgos.join(' '),
    'Falta saber: ' + r.faltaSaber.join('; '),
    `Confianza: ${r.confianza}.`,
  ]
}

/** Datos de la consulta en texto plano, para que Gemini no tenga que adivinar nada. */
export function datosParaGemini(d: Decision, id: string): string {
  const r = buscarRotacion(d, id)
  const e = d.entrada
  const lineas = [
    `Lugar: ${d.punto.nombre} (punto Kharis ${d.punto.id}, modelo ${d.punto.modelo}, datos observados hasta ${d.punto.fechaBase}).`,
    `Terreno: ${TERRENOS[e.terreno].nombre} (${TERRENOS[e.terreno].descripcion}).`,
    `Cultivo actual: ${CULTIVOS[e.cultivoId].nombre}, sembrado en ${TEMPORADAS[e.temporada].nombre} (${TEMPORADAS[e.temporada].texto}).`,
    `Objetivos del productor: ${e.objetivos.length ? e.objetivos.map((o) => OBJETIVOS[o].nombre).join(', ') : 'no eligió'}.`,
    '',
    'Ranking de Gemini Decision (puntaje de 0 a 100, ya calculado; no lo cambies):',
    ...d.rotaciones.map((x, i) => `${i + 1}. ${x.nombre} [${x.id}]: ${x.puntaje} (${PALABRA_RATING[x.rating]})${x.actual ? ' (lo que hace hoy)' : ''}`),
  ]
  if (id === TOP3) {
    lineas.push('', 'Consulta: por qué estas tres rotaciones quedaron arriba, según el clima de la zona.')
    tresMejores(d).forEach((x, i) => lineas.push('', `Puesto ${i + 1}: ${x.nombre} [${x.id}], ${x.puntaje} de 100`, ...detalleRotacion(x)))
  } else if (r) {
    lineas.push('', `Rotación consultada: ${r.nombre} [${r.id}]`, ...detalleRotacion(r))
  }
  lineas.push('', 'Avisos: ' + d.avisos.join(' '))
  return lineas.join('\n')
}

export const INSTRUCCIONES_GEMINI = `Eres el asistente agrícola de AgroResilience para productores de Honduras.
Escribes en español sencillo, con frases cortas, para personas que leen con esfuerzo. Usa "usted".
Reglas:
- Usa SOLO los datos que te doy. Los puntajes ya están calculados por Gemini Decision: no los cambies ni inventes otros números.
- No inventes precios, dosis, variedades ni fechas exactas de lluvia.
- Explica términos técnicos con palabras de todos los días (por ejemplo, evapotranspiración = el agua que la planta y la tierra pierden al aire).
- Recuerda que es una ayuda: la decisión es del productor y de su técnico local.
- Sin emojis. Sin tablas. Texto plano con títulos cortos en líneas propias, sin símbolos de Markdown.`

export const PEDIDO_ANALISIS = `Haz el análisis a fondo de la rotación consultada en este orden, con un título corto por parte:
Por qué se recomienda (o no), comparada con lo que hace hoy y con la mejor opción.
Qué dicen los datos (lluvia, agua que pide cada cultivo, calor, señales del motor).
Beneficios para la tierra y para su bolsillo.
Riesgos y qué revisar con su técnico.
Lo que falta saber.
Máximo 250 palabras.`

export const PEDIDO_TOP3 = `Explica por qué estas tres rotaciones quedaron arriba para esta parcela, según el clima de su zona. En este orden, con un título corto por parte:
El clima de su zona en esta temporada (lluvia, calor, agua que pide cada cultivo, señales del motor).
Por qué la primera es la mejor.
Qué ofrecen la segunda y la tercera, y en qué se quedan atrás.
Qué revisar con su técnico.
Máximo 220 palabras.`

/** Lo que se le pide a Gemini segun la consulta: una rotacion o las tres mejores. */
export function pedidoPara(id: string): string {
  return id === TOP3 ? PEDIDO_TOP3 : PEDIDO_ANALISIS
}
