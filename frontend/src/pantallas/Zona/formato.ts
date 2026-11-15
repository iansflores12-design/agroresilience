import type { Zona } from '../../datos/zonas'
import { lista, traductor } from '../../i18n/traductor'

// Todas las funciones aceptan el idioma; sin el, escriben en español.

function partes(iso: string, idioma?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const mes = lista(traductor(idioma), 'fechas.meses')[Number(m[2]) - 1]
  return mes ? { dia: Number(m[3]), mes, anio: m[1] } : null
}

/** "2026-11-12" -> "12 de noviembre de 2026". Devuelve el texto original si no es una fecha valida. */
export function fechaLarga(iso: string, idioma?: string | null): string {
  const f = partes(iso, idioma)
  return f ? traductor(idioma)('fechas.larga', f) : iso
}

/** "2026-11-12" -> "12 nov 2026" (para las marcas de la grafica). */
export function fechaCorta(iso: string, idioma?: string | null): string {
  const f = partes(iso, idioma)
  return f ? traductor(idioma)('fechas.corta', { ...f, mes: f.mes.slice(0, 3) }) : iso
}

const MS_DIA = 86_400_000

/** Instante UTC de una fecha ISO (solo dia). NaN si no es valida. */
export function marcaDia(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN
}

/** Dias enteros entre dos fechas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((marcaDia(b) - marcaDia(a)) / MS_DIA)
}

export function decimal(valor: number, cifras = 1): string {
  return valor.toFixed(cifras)
}

/** "Hace 2 días (12 de noviembre)", "Hoy" o "Ayer". `hoy` es la fecha ISO de referencia. */
export function hace(iso: string, hoy: string, idioma?: string | null): string {
  const t = traductor(idioma)
  const dias = diasEntre(iso, hoy)
  const f = partes(iso, idioma)
  const fecha = f ? t('fechas.diaMes', f) : iso
  if (dias <= 0) return t('fechas.hoy', { fecha })
  if (dias === 1) return t('fechas.ayer', { fecha })
  return t('fechas.haceDias', { dias, fecha })
}

type Textura =
  | 'arenosa' | 'francoArenosa' | 'arcillosa' | 'arcilloArenosa' | 'arcilloLimosa' | 'francoArcillosa'
  | 'francoArcilloLimosa' | 'francoArcilloArenosa' | 'limosa' | 'francoLimosa' | 'franca'

function claseTextura(arena: number, limo: number, arcilla: number): Textura {
  if (limo + 1.5 * arcilla < 15) return 'arenosa'
  if (limo + 1.5 * arcilla >= 15 && limo + 2 * arcilla < 30) return 'francoArenosa'
  if (arcilla >= 7 && arcilla < 20 && arena > 52 && limo + 2 * arcilla >= 30) return 'francoArenosa'
  if (arcilla < 7 && limo < 50 && limo + 2 * arcilla >= 30) return 'francoArenosa'
  if (arcilla >= 40 && arena > 45) return 'arcillosa'
  if (arcilla >= 35 && arena > 45) return 'arcilloArenosa'
  if (arcilla >= 40 && limo >= 40) return 'arcilloLimosa'
  if (arcilla >= 40) return 'arcillosa'
  if (arcilla >= 27 && arena > 20 && arena <= 45) return 'francoArcillosa'
  if (arcilla >= 27 && arena <= 20) return 'francoArcilloLimosa'
  if (arcilla >= 20 && arena > 45 && limo < 28) return 'francoArcilloArenosa'
  if (limo >= 80 && arcilla < 12) return 'limosa'
  if (limo >= 50 && (arcilla >= 12 || limo < 80)) return 'francoLimosa'
  return 'franca'
}

/** Clase de textura segun el triangulo de texturas del USDA (porcentajes de arena, limo y arcilla). */
export function texturaUsda(arena: number, limo: number, arcilla: number, idioma?: string | null): string {
  return traductor(idioma)(`zona.texturas.${claseTextura(arena, limo, arcilla)}`)
}

/** Palabra para el pH del suelo. */
export function acidez(ph: number, idioma?: string | null): string {
  const clave = ph < 5.5 ? 'muyAcido' : ph < 6.5 ? 'acido' : ph <= 7.3 ? 'neutro' : 'alcalino'
  return traductor(idioma)(`zona.acidez.${clave}`)
}

/** Clave de traduccion del estado de la humedad frente a lo normal (`zona.estado.*`, `zona.frase.*`). */
export function claveEstadoHumedad(zona: Zona): 'seca' | 'normal' | 'humeda' | 'sin' {
  const p = zona.humedad?.percentil
  if (p === null || p === undefined) return 'sin'
  if (p < 20) return 'seca'
  if (p > 80) return 'humeda'
  return 'normal'
}
