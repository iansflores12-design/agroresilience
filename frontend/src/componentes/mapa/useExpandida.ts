import { useSyncExternalStore } from 'react'

const CONSULTA = '(min-width: 840px)'

function suscribir(avisar: () => void) {
  const lista = window.matchMedia?.(CONSULTA)
  lista?.addEventListener?.('change', avisar)
  return () => lista?.removeEventListener?.('change', avisar)
}

/** Verdadero en pantalla expandida (840 px o mas), donde la lista de departamentos va siempre abierta. */
export function useExpandida(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia?.(CONSULTA).matches ?? false,
    () => false,
  )
}
