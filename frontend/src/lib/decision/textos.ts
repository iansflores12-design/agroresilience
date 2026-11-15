// Resumen rapido (sin Gemini) e instrucciones para Gemini. Lo usan el navegador y la API.
// Los textos salen de `src/i18n/recursos/` en el idioma de la consulta (por defecto, español).

import type { TFunction } from 'i18next'
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

/**
 * Id especial de consulta: el analisis y el chat hablan de las tres mejores rotaciones juntas,
 * no de una sola. Lo usan la pantalla Plan, /api/analisis y /api/chat.
 */
export const TOP3 = 'top3'

/** Las tres primeras del ranking (o menos, si se compararon menos). */
export function tresMejores(d: Decision): RotacionDecidida[] {
  return d.rotaciones.slice(0, 3)
}

const cuidado = (t: TFunction, riesgo: string | undefined) => {
  const r = riesgo?.replace(/\.?$/, '.')
  return r ? t('resumenRapido.cuidado', { riesgo: `${r.charAt(0).toLowerCase()}${r.slice(1)}` }) : null
}

/** Resumen del top 3 si Gemini tarda mas del limite o falla. Sale solo de la decision. */
function resumenTop3(t: TFunction, d: Decision): string {
  const tres = tresMejores(d)
  if (!tres.length) return ''
  const mejores = tres.map((r, i) => t('respaldo.top3Item', { n: i + 1, nombre: r.nombre, puntaje: r.puntaje })).join('; ')
  const partes = [t('respaldo.top3', { lugar: d.punto.nombre, lista: mejores })]
  partes.push(...tres[0].razones.slice(0, 2).map((x) => x.texto))
  const aviso = cuidado(t, tres[0].riesgos[0])
  if (aviso) partes.push(aviso)
  return partes.join(' ')
}

/** Resumen que se muestra si Gemini tarda mas del limite o falla. Sale solo de la decision. */
export function resumenRapido(d: Decision, id: string): string {
  const t = traductor(d.entrada.idioma)
  if (id === TOP3) return resumenTop3(t, d)
  const r = buscarRotacion(d, id)
  if (!r) return ''
  const mejor = buscarRotacion(d, d.mejorId)
  const partes: string[] = []
  partes.push(t('resumenRapido.puntaje', { nombre: r.nombre, puntaje: r.puntaje, rating: t(`rating.${r.rating}`).toLowerCase(), lugar: d.punto.nombre }))
  if (r.mejor) partes.push(t('resumenRapido.esLaMejor'))
  else if (mejor) partes.push(t('resumenRapido.laMejor', { nombre: mejor.nombre.toLowerCase(), puntaje: mejor.puntaje }))
  partes.push(...r.razones.slice(0, 3).map((x) => x.texto))
  const aviso = cuidado(t, r.riesgos[0])
  if (aviso) partes.push(aviso)
  return partes.join(' ')
}

/**
 * Respuesta preparada de antemano para el chat, por si Gemini no contesta. Sale solo de la
 * decisión: según de qué trate la pregunta, cuenta el agua, lo que falta para empezar, los
 * riesgos o las razones. `id` es una rotación o TOP3 (entonces se habla de la mejor).
 * Las palabras que se buscan en la pregunta dependen del idioma (`respaldo.re*`).
 */
export function respuestaRapida(d: Decision, id: string, pregunta: string): string {
  const r = id === TOP3 ? tresMejores(d)[0] : buscarRotacion(d, id)
  if (!r) return resumenRapido(d, id)
  const t = traductor(d.entrada.idioma)
  const trata = (clave: string) => new RegExp(t(`respaldo.${clave}`)).test(pregunta.toLowerCase())
  const temporada = (x: string) => t(`temporadas.${x}.nombre`)
  const partes: string[] = []
  if (trata('reAgua')) {
    for (const x of r.pasos) {
      if (x.cultivoId && x.lluviaMm !== null && x.aguaPideMm !== null) {
        partes.push(
          t('respaldo.agua', {
            temporada: temporada(x.temporada),
            cultivo: x.nombre.toLowerCase(),
            lluvia: x.lluviaMm,
            pide: x.aguaPideMm,
            alcanza: t(x.lluviaMm >= x.aguaPideMm ? 'respaldo.alcanza' : 'respaldo.noAlcanza'),
          }),
        )
      }
    }
    if (!partes.length) partes.push(t('respaldo.sinLluvia'))
  } else if (trata('reEmpezar')) {
    const pasos = r.pasos.map((x) => t('respaldo.calendarioPaso', { temporada: temporada(x.temporada), meses: x.meses.toLowerCase(), cultivo: x.nombre.toLowerCase() }))
    partes.push(t('respaldo.calendario', { lista: pasos.join('; ') }))
    if (r.faltaSaber.length) partes.push(t('respaldo.antes', { lista: r.faltaSaber.join('; ').replace(/\.?$/, '.') }))
  } else if (trata('reRiesgo')) {
    partes.push(...(r.riesgos.length ? r.riesgos : [t('respaldo.sinRiesgos')]))
  } else {
    partes.push(t('respaldo.puntaje', { nombre: r.nombre, puntaje: r.puntaje, lugar: d.punto.nombre }), ...r.razones.slice(0, 3).map((x) => x.texto))
    const otra = d.rotaciones.find((x) => x.id !== r.id)
    if (otra) partes.push(t('respaldo.siguiente', { nombre: otra.nombre.toLowerCase(), puntaje: otra.puntaje }))
  }
  const aviso = cuidado(t, r.riesgos[0])
  if (aviso && !partes.some((x) => r.riesgos.includes(x))) partes.push(aviso)
  return t('respaldo.prefijo', { texto: partes.join(' ') })
}

/** Lo que el motor sabe de una rotacion: calendario, partes del puntaje, razones y evidencia. */
function detalleRotacion(t: TFunction, r: RotacionDecidida): string[] {
  return [
    t('gemini.calendario') + r.pasos.map((p) => `${t(`temporadas.${p.temporada}.nombre`)} (${p.meses}): ${p.nombre}`).join('; '),
    t('gemini.partes') + r.factores.map((f) => `${f.nombre} ${f.valor} (${t('gemini.peso')} ${f.peso})`).join(', '),
    t('gemini.porQue') + r.razones.map((x) => x.texto).join(' '),
    t('gemini.evidencia') + r.evidencia.map((x) => `${x.texto} [${x.fuente}]`).join(' '),
    t('gemini.riesgos') + r.riesgos.join(' '),
    t('gemini.falta') + r.faltaSaber.join('; '),
    t('gemini.confianza', { confianza: t(`confianza.${r.confianza}`) }),
  ]
}

/** Datos de la consulta en texto plano, para que Gemini no tenga que adivinar nada. */
export function datosParaGemini(d: Decision, id: string): string {
  const t = traductor(d.entrada.idioma)
  const r = buscarRotacion(d, id)
  const e = d.entrada
  const lineas = [
    t('gemini.lugar', { lugar: d.punto.nombre, punto: d.punto.id, modelo: d.punto.modelo, fecha: d.punto.fechaBase }),
    t('gemini.terreno', { nombre: t(`terrenos.${e.terreno}.nombre`), descripcion: t(`terrenos.${e.terreno}.descripcion`) }),
    t('gemini.cultivoActual', { cultivo: t(`cultivos.${e.cultivoId}.nombre`), temporada: t(`temporadas.${e.temporada}.nombre`), meses: t(`temporadas.${e.temporada}.texto`) }),
    t('gemini.objetivos', { lista: e.objetivos.length ? e.objetivos.map((o) => t(`objetivos.${o}.nombre`)).join(', ') : t('gemini.noEligio') }),
    '',
    t('gemini.ranking'),
    ...d.rotaciones.map(
      (x, i) => `${i + 1}. ${x.nombre} [${x.id}]: ${x.puntaje} (${t(`rating.${x.rating}`)})${x.actual ? t('gemini.loQueHaceHoy') : ''}`,
    ),
  ]
  if (id === TOP3) {
    lineas.push('', t('geminiTop3.consulta'))
    tresMejores(d).forEach((x, i) =>
      lineas.push('', t('geminiTop3.puesto', { n: i + 1, nombre: x.nombre, id: x.id, puntaje: x.puntaje }), ...detalleRotacion(t, x)),
    )
  } else if (r) {
    lineas.push('', t('gemini.consultada', { nombre: r.nombre, id: r.id }), ...detalleRotacion(t, r))
  }
  lineas.push('', t('gemini.avisos') + d.avisos.join(' '))
  return lineas.join('\n')
}

/** Instrucciones de sistema para Gemini en el idioma de la consulta. */
export function instruccionesGemini(idioma?: string | null): string {
  return traductor(idioma)('gemini.instrucciones')
}

/** Lo que se le pide a Gemini segun la consulta: una rotacion o las tres mejores. */
export function pedidoPara(id: string, idioma?: string | null): string {
  return traductor(idioma)(id === TOP3 ? 'geminiTop3.pedido' : 'gemini.pedidoAnalisis')
}

/** Versiones en español, como antes de la traduccion. */
export const INSTRUCCIONES_GEMINI = instruccionesGemini('es')
export const PEDIDO_ANALISIS = pedidoPara('', 'es')
export const PEDIDO_TOP3 = pedidoPara(TOP3, 'es')
