// Resumen rapido (sin Gemini) e instrucciones para Gemini. Lo usan el navegador y la API.
// Los textos salen de `src/i18n/recursos/` en el idioma de la consulta (por defecto, español).

import { lista, traductor } from '../../i18n/traductor.js'
import type { Decision, RotacionDecidida } from './tipos.js'

/** "2026-11-10" -> "10 de noviembre" (o "November 10", "10 de novembro"). */
export function fechaEnPalabras(iso: string, idioma?: string | null): string {
  const t = traductor(idioma)
  const [, m, d] = iso.split('-').map(Number)
  const mes = lista(t, 'fechas.meses')[m - 1]
  return mes && d ? t('fechas.diaMes', { dia: d, mes }) : iso
}

export function buscarRotacion(d: Decision, id: string): RotacionDecidida | null {
  return d.rotaciones.find((r) => r.id === id) ?? null
}

/** Resumen que se muestra si Gemini tarda mas del limite o falla. Sale solo de la decision. */
export function resumenRapido(d: Decision, id: string): string {
  const r = buscarRotacion(d, id)
  if (!r) return ''
  const t = traductor(d.entrada.idioma)
  const mejor = buscarRotacion(d, d.mejorId)
  const partes: string[] = []
  partes.push(t('resumenRapido.puntaje', { nombre: r.nombre, puntaje: r.puntaje, rating: t(`rating.${r.rating}`).toLowerCase(), lugar: d.punto.nombre }))
  if (r.mejor) partes.push(t('resumenRapido.esLaMejor'))
  else if (mejor) partes.push(t('resumenRapido.laMejor', { nombre: mejor.nombre.toLowerCase(), puntaje: mejor.puntaje }))
  partes.push(...r.razones.slice(0, 3).map((x) => x.texto))
  const riesgo = r.riesgos[0]?.replace(/\.?$/, '.')
  if (riesgo) partes.push(t('resumenRapido.cuidado', { riesgo: `${riesgo.charAt(0).toLowerCase()}${riesgo.slice(1)}` }))
  return partes.join(' ')
}

/** Datos de la consulta en texto plano, para que Gemini no tenga que adivinar nada. */
export function datosParaGemini(d: Decision, id: string): string {
  const t = traductor(d.entrada.idioma)
  const r = buscarRotacion(d, id)
  const e = d.entrada
  const temporada = (x: string) => t(`temporadas.${x}.nombre`)
  const lineas = [
    t('gemini.lugar', { lugar: d.punto.nombre, punto: d.punto.id, modelo: d.punto.modelo, fecha: d.punto.fechaBase }),
    t('gemini.terreno', { nombre: t(`terrenos.${e.terreno}.nombre`), descripcion: t(`terrenos.${e.terreno}.descripcion`) }),
    t('gemini.cultivoActual', { cultivo: t(`cultivos.${e.cultivoId}.nombre`), temporada: temporada(e.temporada), meses: t(`temporadas.${e.temporada}.texto`) }),
    t('gemini.objetivos', { lista: e.objetivos.length ? e.objetivos.map((o) => t(`objetivos.${o}.nombre`)).join(', ') : t('gemini.noEligio') }),
    '',
    t('gemini.ranking'),
    ...d.rotaciones.map(
      (x, i) => `${i + 1}. ${x.nombre} [${x.id}]: ${x.puntaje} (${t(`rating.${x.rating}`)})${x.actual ? t('gemini.loQueHaceHoy') : ''}`,
    ),
  ]
  if (r) {
    lineas.push(
      '',
      t('gemini.consultada', { nombre: r.nombre, id: r.id }),
      t('gemini.calendario') + r.pasos.map((p) => `${temporada(p.temporada)} (${p.meses}): ${p.nombre}`).join('; '),
      t('gemini.partes') + r.factores.map((f) => `${f.nombre} ${f.valor} (${t('gemini.peso')} ${f.peso})`).join(', '),
      t('gemini.porQue') + r.razones.map((x) => x.texto).join(' '),
      t('gemini.evidencia') + r.evidencia.map((x) => `${x.texto} [${x.fuente}]`).join(' '),
      t('gemini.riesgos') + r.riesgos.join(' '),
      t('gemini.falta') + r.faltaSaber.join('; '),
      t('gemini.confianza', { confianza: t(`confianza.${r.confianza}`) }),
    )
  }
  lineas.push('', t('gemini.avisos') + d.avisos.join(' '))
  return lineas.join('\n')
}

/** Instrucciones de sistema para Gemini en el idioma de la consulta. */
export function instruccionesGemini(idioma?: string | null): string {
  return traductor(idioma)('gemini.instrucciones')
}

/** Lo que se le pide a Gemini para el analisis a fondo. */
export function pedidoAnalisis(idioma?: string | null): string {
  return traductor(idioma)('gemini.pedidoAnalisis')
}

/** Version en español, como antes de la traduccion. */
export const INSTRUCCIONES_GEMINI = instruccionesGemini('es')
export const PEDIDO_ANALISIS = pedidoAnalisis('es')
