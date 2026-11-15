// Instancia de i18next del navegador: React + deteccion de idioma.
// Orden: ?lang=pt en la URL, lo guardado en localStorage y, si no hay nada, el idioma del navegador.

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next, useTranslation } from 'react-i18next'
import { CLAVE_IDIOMA, IDIOMAS, LOCALE, normalizarIdioma, type Idioma } from './idiomas'
import { opcionesBase } from './traductor'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...opcionesBase,
    initAsync: false,
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: CLAVE_IDIOMA,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  })

function aplicarAlDocumento(lng: string | undefined) {
  if (typeof document !== 'undefined') document.documentElement.lang = normalizarIdioma(lng)
}
aplicarAlDocumento(i18n.resolvedLanguage ?? i18n.language)
i18n.on('languageChanged', aplicarAlDocumento)

/** Idioma actual de la pagina, siempre uno de IDIOMAS. */
export function useIdioma(): Idioma {
  const { i18n: instancia } = useTranslation()
  return normalizarIdioma(instancia.resolvedLanguage ?? instancia.language)
}

/** Configuracion regional para `toLocaleString` segun el idioma actual. */
export function useLocale(): string {
  return LOCALE[useIdioma()]
}

export function cambiarIdioma(idioma: Idioma) {
  return i18n.changeLanguage(idioma)
}

export { IDIOMAS, type Idioma }
export default i18n
