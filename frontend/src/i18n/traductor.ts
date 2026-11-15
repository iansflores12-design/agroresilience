// Traductor sin React ni DOM, para el motor de decision, los textos de Gemini y las funciones de
// `api/`. Usa una instancia propia de i18next por idioma (no depende del idioma de la pagina).

import i18next, { type TFunction } from 'i18next'
import { IDIOMAS, IDIOMA_BASE, normalizarIdioma, type Idioma } from './idiomas.js'
import en from './recursos/en.js'
import es from './recursos/es.js'
import pt from './recursos/pt.js'

export const recursos = {
  es: { translation: es },
  pt: { translation: pt },
  en: { translation: en },
} as const

/** Opciones comunes a todas las instancias de i18next. */
export const opcionesBase = {
  resources: recursos,
  fallbackLng: IDIOMA_BASE,
  supportedLngs: [...IDIOMAS],
  // Los textos se muestran como texto plano (React ya escapa); no hace falta escapar HTML.
  interpolation: { escapeValue: false },
  returnNull: false,
} as const

const traductores = new Map<Idioma, TFunction>()

/** Funcion `t` para un idioma. Se crea una vez y se reutiliza. */
export function traductor(idioma?: string | null): TFunction {
  const lng = normalizarIdioma(idioma)
  let t = traductores.get(lng)
  if (!t) {
    const instancia = i18next.createInstance()
    void instancia.init({ ...opcionesBase, lng, initAsync: false })
    t = instancia.t
    traductores.set(lng, t)
  }
  return t
}

/** Lista de textos (`returnObjects`). */
export function lista(t: TFunction, clave: string): string[] {
  const valor = t(clave, { returnObjects: true }) as unknown
  return Array.isArray(valor) ? (valor as string[]) : []
}

export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
