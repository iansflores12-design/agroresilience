// Idiomas de la aplicacion. Este modulo no usa el DOM: lo comparten el navegador y `api/`.

export const IDIOMAS = ['es', 'pt', 'en'] as const
export type Idioma = (typeof IDIOMAS)[number]

export const IDIOMA_BASE: Idioma = 'es'

/** Clave de localStorage donde se recuerda el idioma elegido. */
export const CLAVE_IDIOMA = 'agroresilience.idioma'

/** Configuracion regional para numeros (separador de miles, decimales). */
export const LOCALE: Record<Idioma, string> = { es: 'es-HN', pt: 'pt-BR', en: 'en-US' }

export function esIdioma(x: unknown): x is Idioma {
  return typeof x === 'string' && (IDIOMAS as readonly string[]).includes(x)
}

/** "pt-BR" -> "pt"; cualquier otro valor -> idioma base. */
export function normalizarIdioma(x: unknown): Idioma {
  if (typeof x !== 'string') return IDIOMA_BASE
  const corto = x.toLowerCase().split(/[-_]/)[0]
  return esIdioma(corto) ? corto : IDIOMA_BASE
}
