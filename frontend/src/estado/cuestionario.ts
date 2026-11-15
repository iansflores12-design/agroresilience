import { useEffect, useSyncExternalStore } from 'react'

// Cuantas pantallas muestran ahora una pregunta del cuestionario. Mientras haya alguna, la barra
// superior esconde los chips de cultivo y lugar: esas preguntas ya se contestan en la encuesta.
let abiertos = 0
const oyentes = new Set<() => void>()

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

function mover(paso: number) {
  abiertos += paso
  oyentes.forEach((o) => o())
}

/** Avisa que esta pantalla esta mostrando el cuestionario (completo o una sola pregunta). */
export function useMarcarCuestionario(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    mover(1)
    return () => mover(-1)
  }, [activo])
}

/** True mientras alguna pantalla muestra el cuestionario. */
export function useEnCuestionario(): boolean {
  return useSyncExternalStore(suscribir, () => abiertos > 0)
}
