import type { NombreIcono } from './componentes/iconos'

export type Vista = 'cultivos' | 'mapa' | 'zona' | 'chat'

export interface Destino {
  ruta: string
  vista: Vista
  etiqueta: string
  icono: NombreIcono
}

/** Los cuatro destinos de la aplicacion (DISENO.md, seccion 3). */
export const destinos: Destino[] = [
  { ruta: '/', vista: 'cultivos', etiqueta: 'Cultivo', icono: 'grass' },
  { ruta: '/mapa', vista: 'mapa', etiqueta: 'Mapa', icono: 'map' },
  { ruta: '/zona', vista: 'zona', etiqueta: 'Tierra', icono: 'water_drop' },
  { ruta: '/chat', vista: 'chat', etiqueta: 'Preguntar', icono: 'forum' },
]

export function destinoActual(pathname: string): Destino | undefined {
  return destinos.find((d) => (d.ruta === '/' ? pathname === '/' : pathname.startsWith(d.ruta)))
}
