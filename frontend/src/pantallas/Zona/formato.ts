const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** "2026-11-12" -> "12 de noviembre de 2026". Devuelve el texto original si no es una fecha valida. */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const mes = MESES[Number(m[2]) - 1]
  if (!mes) return iso
  return `${Number(m[3])} de ${mes} de ${m[1]}`
}

/** "2026-11-12" -> "12 nov" (para las marcas de la grafica). */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const mes = MESES[Number(m[2]) - 1]
  return mes ? `${Number(m[3])} ${mes.slice(0, 3)} ${m[1]}` : iso
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
export function hace(iso: string, hoy: string): string {
  const dias = diasEntre(iso, hoy)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const mes = m ? MESES[Number(m[2]) - 1] : undefined
  const dia = m && mes ? `${Number(m[3])} de ${mes}` : iso
  if (dias <= 0) return `Hoy (${dia})`
  if (dias === 1) return `Ayer (${dia})`
  return `Hace ${dias} días (${dia})`
}

/** Clase de textura segun el triangulo de texturas del USDA (porcentajes de arena, limo y arcilla). */
export function texturaUsda(arena: number, limo: number, arcilla: number): string {
  if (limo + 1.5 * arcilla < 15) return 'Arenosa'
  if (limo + 1.5 * arcilla >= 15 && limo + 2 * arcilla < 30) return 'Franco arenosa'
  if (arcilla >= 7 && arcilla < 20 && arena > 52 && limo + 2 * arcilla >= 30) return 'Franco arenosa'
  if (arcilla < 7 && limo < 50 && limo + 2 * arcilla >= 30) return 'Franco arenosa'
  if (arcilla >= 40 && arena > 45) return 'Arcillosa'
  if (arcilla >= 35 && arena > 45) return 'Arcillo arenosa'
  if (arcilla >= 40 && limo >= 40) return 'Arcillo limosa'
  if (arcilla >= 40) return 'Arcillosa'
  if (arcilla >= 27 && arena > 20 && arena <= 45) return 'Franco arcillosa'
  if (arcilla >= 27 && arena <= 20) return 'Franco arcillo limosa'
  if (arcilla >= 20 && arena > 45 && limo < 28) return 'Franco arcillo arenosa'
  if (limo >= 80 && arcilla < 12) return 'Limosa'
  if (limo >= 50 && (arcilla >= 12 || limo < 80)) return 'Franco limosa'
  return 'Franca'
}

/** Palabra para el pH del suelo. */
export function acidez(ph: number): string {
  if (ph < 5.5) return 'muy ácido'
  if (ph < 6.5) return 'ácido'
  if (ph <= 7.3) return 'casi neutro'
  return 'alcalino'
}
