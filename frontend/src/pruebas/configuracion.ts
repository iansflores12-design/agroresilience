import '@testing-library/jest-dom/vitest'
import i18n from '../i18n'

// Las pruebas se escriben en español: cada una empieza en el idioma base (jsdom dice en-US).
await i18n.changeLanguage('es')
beforeEach(async () => {
  await i18n.changeLanguage('es')
})

// jsdom no implementa matchMedia (lo usa Sileo para el tema del Toaster).
if (!window.matchMedia) {
  window.matchMedia = (consulta: string): MediaQueryList =>
    ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom no implementa createSVGRect; Leaflet lo consulta al cargar para decidir si dibuja en SVG.
if (!('createSVGRect' in SVGSVGElement.prototype)) {
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGRect', { value: () => ({}) })
}
