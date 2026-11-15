import { useCallback, useSyncExternalStore } from 'react'
import { destinos, type Destino } from '../destinos'

// Orden de los destinos que el productor eligio arrastrando. Se guarda en este navegador.
export const CLAVE_ORDEN_NAV = 'agroresilience.nav.orden.v1'
const PREDETERMINADO = destinos.map((d) => d.ruta)
const oyentes = new Set<() => void>()
let enMemoria: string[] = PREDETERMINADO
let ultimoCrudo: string | null | undefined
let ultimoOrden: string[] = PREDETERMINADO

/** Acepta un orden guardado solo si trae exactamente los mismos destinos; si no, el de siempre. */
export function ordenValido(dato: unknown): string[] {
  if (!Array.isArray(dato)) return PREDETERMINADO
  const rutas = dato.filter((x): x is string => typeof x === 'string')
  const iguales = rutas.length === PREDETERMINADO.length && PREDETERMINADO.every((r) => rutas.includes(r))
  return iguales ? rutas : PREDETERMINADO
}

function leer(): string[] {
  let crudo: string | null
  try {
    crudo = window.localStorage.getItem(CLAVE_ORDEN_NAV)
  } catch {
    return enMemoria
  }
  // Misma referencia mientras no cambie lo guardado (useSyncExternalStore lo exige).
  if (crudo === ultimoCrudo) return ultimoOrden
  ultimoCrudo = crudo
  try {
    ultimoOrden = ordenValido(crudo ? JSON.parse(crudo) : null)
  } catch {
    ultimoOrden = PREDETERMINADO
  }
  return ultimoOrden
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  window.addEventListener('storage', avisar)
  return () => {
    oyentes.delete(avisar)
    window.removeEventListener('storage', avisar)
  }
}

function guardar(orden: string[]) {
  enMemoria = orden
  try {
    window.localStorage.setItem(CLAVE_ORDEN_NAV, JSON.stringify(orden))
  } catch {
    // Sin almacenamiento el orden dura lo que dura la pagina.
  }
  oyentes.forEach((avisar) => avisar())
}

/** Mueve `ruta` a la posicion `destino` (0 = primera). */
export function mover(orden: string[], ruta: string, destino: number): string[] {
  const desde = orden.indexOf(ruta)
  if (desde < 0) return orden
  const hasta = Math.max(0, Math.min(orden.length - 1, destino))
  if (desde === hasta) return orden
  const nuevo = orden.filter((r) => r !== ruta)
  nuevo.splice(hasta, 0, ruta)
  return nuevo
}

/** Los destinos en el orden del productor, y la funcion para guardar uno nuevo. */
export function useOrdenNavegacion(): [Destino[], (orden: string[]) => void] {
  const orden = useSyncExternalStore(suscribir, leer, () => PREDETERMINADO)
  const lista = orden.map((r) => destinos.find((d) => d.ruta === r)).filter((d): d is Destino => Boolean(d))
  return [lista, useCallback((o: string[]) => guardar(ordenValido(o)), [])]
}
