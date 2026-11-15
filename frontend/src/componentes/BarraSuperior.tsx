import { useTranslation } from 'react-i18next'
import { useEstadoApp } from '../estado/EstadoApp'
import { BotonIcono } from './BotonIcono'
import estilos from './BarraSuperior.module.css'
import { Icono } from './Icono'
import { SelectorIdioma } from './SelectorIdioma'
import { TiraContexto } from './TiraContexto'

export function BarraSuperior() {
  const { sonido, alternarSonido } = useEstadoApp()
  const { t } = useTranslation()

  return (
    <header className={estilos.barra}>
      <div className={estilos.marca}>
        <span className={estilos.logo} aria-hidden="true">
          <Icono nombre="grass" relleno tamano={24} />
        </span>
        <p className={estilos.nombre}>{t('app.nombre')}</p>
      </div>
      <TiraContexto />
      <div className={estilos.acciones}>
        <SelectorIdioma />
        <BotonIcono
          icono={sonido ? 'volume_up' : 'volume_off'}
          etiqueta={sonido ? t('barra.silenciar') : t('barra.activarSonido')}
          variante="tonal"
          onClick={alternarSonido}
        />
      </div>
    </header>
  )
}
