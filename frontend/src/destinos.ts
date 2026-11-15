import type { NombreIcono } from './componentes/iconos'

export type Vista = 'cultivos' | 'mapa' | 'zona' | 'chat'

export interface Destino {
  ruta: string
  vista: Vista
  /** Clave de traduccion de la etiqueta (i18n). */
  etiqueta: string
  icono: NombreIcono
}

/** Los cuatro destinos de la aplicacion (DISENO.md, seccion 3). */
export const destinos: Destino[] = [
  { ruta: '/', vista: 'cultivos', etiqueta: 'nav.plan', icono: 'grass' },
  { ruta: '/mapa', vista: 'mapa', etiqueta: 'nav.mapa', icono: 'map' },
  { ruta: '/zona', vista: 'zona', etiqueta: 'nav.tierra', icono: 'water_drop' },
  { ruta: '/chat', vista: 'chat', etiqueta: 'nav.preguntar', icono: 'forum' },
]

export function destinoActual(pathname: string): Destino | undefined {
  // El detalle de una rotacion es parte de Plan.
  return destinos.find((d) => (d.ruta === '/' ? pathname === '/' || pathname.startsWith('/rotacion/') : pathname.startsWith(d.ruta)))
}
