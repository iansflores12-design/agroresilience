// Cuota diaria de analisis a fondo y memoria de los analisis ya hechos (localStorage).
// Solo cuenta un analisis que termino bien: un intento fallido no gasta cuota.

import type { EntradaDecision } from './tipos'

export const CUOTA_DIARIA = 15
const CLAVE_CUOTA = 'agroresilience.analisis.cuota.v1'
const CLAVE_MEMORIA = 'agroresilience.analisis.memoria.v1'
const MAX_GUARDADOS = 30

const hoy = () => new Date().toISOString().slice(0, 10)

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento: la cuota y la memoria viven solo en esta pagina.
  }
}

export function usadosHoy(): number {
  const c = leer<{ dia?: string; usados?: number }>(CLAVE_CUOTA, {})
  return c.dia === hoy() && typeof c.usados === 'number' ? c.usados : 0
}

export function quedanHoy(): number {
  return Math.max(0, CUOTA_DIARIA - usadosHoy())
}

export function gastarUno() {
  escribir(CLAVE_CUOTA, { dia: hoy(), usados: usadosHoy() + 1 })
}

export function claveAnalisis(entrada: EntradaDecision, rotacionId: string, fechaBase: string): string {
  const objetivos = [...entrada.objetivos].sort().join(',')
  const parcela = entrada.parcela ? `${entrada.parcela.lat},${entrada.parcela.lon}` : ''
  // En español la clave queda como antes, para no perder los analisis ya guardados.
  const idioma = entrada.idioma && entrada.idioma !== 'es' ? [entrada.idioma] : []
  // Con cosechas reportadas el puntaje cambia: el analisis guardado de antes ya no sirve.
  const cosechas = entrada.cosechas?.length ? [entrada.cosechas.map((c) => `${c.cultivoId}.${c.temporada}.${c.anio}.${c.resultado}`).sort().join(',')] : []
  return [entrada.zonaId, parcela, entrada.terreno, entrada.cultivoId, entrada.temporada, objetivos, rotacionId, fechaBase, ...idioma, ...cosechas].join('|')
}

export function analisisGuardado(clave: string): string | null {
  const m = leer<Record<string, string>>(CLAVE_MEMORIA, {})
  return typeof m[clave] === 'string' ? m[clave] : null
}

export function guardarAnalisis(clave: string, texto: string) {
  const m = leer<Record<string, string>>(CLAVE_MEMORIA, {})
  delete m[clave]
  m[clave] = texto
  const claves = Object.keys(m)
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_GUARDADOS))) delete m[k]
  escribir(CLAVE_MEMORIA, m)
}
