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
