import { useSyncExternalStore } from 'react'
import { escenarios, type Escenario } from '../../datos/aptitud'

// Tipo de ano elegido para el puntaje. Se comparte entre pantallas y dura lo que dura la sesion.
const CLAVE = 'agroresilience.escenario.v1'
const oyentes = new Set<() => void>()
let enMemoria: Escenario = 'normal'

function leer(): Escenario {
  try {
    const guardado = window.sessionStorage.getItem(CLAVE)
    return guardado && guardado in escenarios ? (guardado as Escenario) : 'normal'
  } catch {
    return enMemoria
  }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  return () => {
    oyentes.delete(avisar)
  }
}

function fijar(escenario: Escenario) {
  enMemoria = escenario
  try {
    window.sessionStorage.setItem(CLAVE, escenario)
  } catch {
    // Sin almacenamiento el valor queda en memoria.
  }
  oyentes.forEach((avisar) => avisar())
}

export function useEscenario(): [Escenario, (escenario: Escenario) => void] {
  return [useSyncExternalStore(suscribir, leer, () => 'normal' as Escenario), fijar]
}
