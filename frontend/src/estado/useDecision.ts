import { useEffect, useState } from 'react'
import { pedirDecision } from '../lib/decision/cliente'
import type { Decision, EntradaDecision } from '../lib/decision/tipos'

const cache = new Map<string, Decision>()
const claveDe = (e: EntradaDecision) => JSON.stringify({ ...e, objetivos: [...e.objetivos].sort() })

export type EstadoDecision =
  | { estado: 'sin_datos' }
  | { estado: 'calculando' }
  | { estado: 'listo'; decision: Decision }
  | { estado: 'error' }

/** Gemini Decision para la entrada dada. Recuerda las decisiones ya calculadas en esta pagina. */
export function useDecision(entrada: EntradaDecision | null, intento = 0): EstadoDecision {
  const clave = entrada ? claveDe(entrada) : null
  const [resultado, fijar] = useState<{ clave: string; decision: Decision | null; error: boolean } | null>(null)

  useEffect(() => {
    if (!entrada || !clave || cache.has(clave)) return
    const control = new AbortController()
    pedirDecision(entrada, control.signal).then(
      (d) => {
        cache.set(clave, d)
        fijar({ clave, decision: d, error: false })
      },
      () => {
        if (!control.signal.aborted) fijar({ clave, decision: null, error: true })
      },
    )
    return () => control.abort()
    // `entrada` se representa entera en `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento])

  if (!entrada || !clave) return { estado: 'sin_datos' }
  const guardada = cache.get(clave)
  if (guardada) return { estado: 'listo', decision: guardada }
  if (resultado?.clave === clave && resultado.error) return { estado: 'error' }
  return { estado: 'calculando' }
}

/** Solo para pruebas. */
export function vaciarCacheDecision() {
  cache.clear()
}
