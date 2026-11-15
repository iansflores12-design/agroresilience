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

/** Resumen que se muestra si Gemini tarda mas del limite o falla. Sale solo de la decision. */
export function resumenRapido(d: Decision, id: string): string {
  const r = buscarRotacion(d, id)
  if (!r) return ''
  const mejor = buscarRotacion(d, d.mejorId)
  const partes: string[] = []
  partes.push(`${r.nombre}: ${r.puntaje} de 100 (${PALABRA_RATING[r.rating].toLowerCase()}) en ${d.punto.nombre}.`)
  if (r.mejor) partes.push('Es la mejor de las opciones comparadas para su parcela.')
  else if (mejor) partes.push(`La mejor opción es ${mejor.nombre.toLowerCase()}, con ${mejor.puntaje}.`)
  partes.push(...r.razones.slice(0, 3).map((x) => x.texto))
  const riesgo = r.riesgos[0]?.replace(/\.?$/, '.')
  if (riesgo) partes.push(`Tenga cuidado: ${riesgo.charAt(0).toLowerCase()}${riesgo.slice(1)}`)
  return partes.join(' ')
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
  if (r) {
    lineas.push(
      '',
      `Rotación consultada: ${r.nombre} [${r.id}]`,
      'Calendario: ' + r.pasos.map((p) => `${TEMPORADAS[p.temporada].nombre} (${p.meses}): ${p.nombre}`).join('; '),
      'Partes del puntaje: ' + r.factores.map((f) => `${f.nombre} ${f.valor} (peso ${f.peso})`).join(', '),
      'Por qué: ' + r.razones.map((x) => x.texto).join(' '),
      'Evidencia del motor: ' + r.evidencia.map((x) => `${x.texto} [${x.fuente}]`).join(' '),
      'Riesgos: ' + r.riesgos.join(' '),
      'Falta saber: ' + r.faltaSaber.join('; '),
      `Confianza: ${r.confianza}.`,
    )
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
