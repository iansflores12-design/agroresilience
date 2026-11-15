import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { IDIOMAS, cambiarIdioma, useIdioma } from '../i18n'
import { esIdioma } from '../i18n/idiomas'
import { clases } from './clases'
import { Icono } from './Icono'
import estilos from './SelectorIdioma.module.css'

/** Elige el idioma de la aplicacion. Cada idioma se escribe en su propia lengua. */
export function SelectorIdioma({ className }: { className?: string }) {
  const { t } = useTranslation()
  const idioma = useIdioma()
  const id = useId()
  return (
    <div className={clases(estilos.selector, className)}>
      <label htmlFor={id} className="solo-lectores">
        {t('app.idioma')}
      </label>
      <Icono nombre="translate" tamano={20} className={estilos.icono} />
      {/* Lo que se ve: el nombre del idioma (o su codigo en el telefono). El select va encima, invisible,
          asi el boton mide siempre lo mismo y la lista sigue siendo la nativa de cada telefono. */}
      <span className={estilos.visible} aria-hidden="true">
        <span className={estilos.nombre}>{t(`app.idiomas.${idioma}`)}</span>
        <span className={estilos.codigo}>{idioma.toUpperCase()}</span>
      </span>
      <select
        id={id}
        className={estilos.lista}
        value={idioma}
        onChange={(e) => {
          if (esIdioma(e.target.value)) void cambiarIdioma(e.target.value)
        }}
      >
        {IDIOMAS.map((i) => (
          <option key={i} value={i} lang={i}>
            {t(`app.idiomas.${i}`)}
          </option>
        ))}
      </select>
      <Icono nombre="expand_more" tamano={20} className={estilos.flecha} />
    </div>
  )
}
