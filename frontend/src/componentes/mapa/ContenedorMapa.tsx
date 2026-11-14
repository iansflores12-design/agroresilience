import type { DatosZonas, Zona } from '../../datos/zonas'
import estilos from './ContenedorMapa.module.css'
import { MapaProvisional } from './MapaProvisional'

export interface PropsMapa {
  zonas: Zona[]
  caja: DatosZonas['caja']
  zonaSeleccionadaId: string | null
  cultivoId: string | null
  alSeleccionarZona(id: string): void
}

/**
 * PLACEHOLDER(mapa): para integrar el mapa real, sustituir `MapaProvisional` por el componente
 * definitivo, que recibe exactamente las mismas `PropsMapa`. Este contenedor ya da el tamano, la
 * forma (--forma-xl-mas), el recorte y el fondo: el mapa real solo tiene que llenar el 100 % del
 * contenedor y llamar a `alSeleccionarZona` al elegir una zona.
 */
export function ContenedorMapa(props: PropsMapa) {
  return (
    <section data-placeholder="mapa" aria-label="Mapa" className={estilos.contenedor}>
      <MapaProvisional {...props} />
    </section>
  )
}
