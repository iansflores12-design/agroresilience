import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { Escenario } from '../../datos/aptitud'
import type { DatosZonas, Zona } from '../../datos/zonas'
import estilos from './ContenedorMapa.module.css'
import { MapaHonduras, type ControlMapa } from './MapaHonduras'

export interface PropsMapa {
  zonas: Zona[]
  caja: DatosZonas['caja']
  zonaSeleccionadaId: string | null
  cultivoId: string | null
  alSeleccionarZona(id: string): void
  /** Departamento marcado (codigo ISO, por ejemplo HN-CH). */
  departamentoId?: string | null
  /** Si se da, los departamentos se pueden tocar y elegir con el teclado. */
  alSeleccionarDepartamento?(id: string): void
  /** Tipo de ano con el que se calcula el puntaje. Por defecto, normal. */
  escenario?: Escenario
  /** Para acercar, alejar o centrar el mapa desde los botones de la pantalla. */
  ref?: Ref<ControlMapa>
}

/**
 * Da al mapa su tamano, su forma (--forma-xl-mas), el recorte y el fondo. El mapa llena el
 * 100 % del contenedor: el alto lo decide quien lo usa.
 */
export function ContenedorMapa(props: PropsMapa) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('mapa.region')} className={estilos.contenedor}>
      <MapaHonduras {...props} />
    </section>
  )
}
