/** Une nombres de clase ignorando los valores falsos. */
export function clases(...partes: (string | false | null | undefined)[]): string {
  return partes.filter(Boolean).join(' ')
}
