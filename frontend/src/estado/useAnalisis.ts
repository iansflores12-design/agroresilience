import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { traductor } from '../i18n/traductor'
import { pedirAnalisis } from '../lib/decision/cliente'
import { LIMITE_MS, estadoInicial, transicion, type EstadoAnalisis } from '../lib/decision/estadoAnalisis'
import { analisisGuardado, claveAnalisis, gastarUno, guardarAnalisis, quedanHoy } from '../lib/decision/memoria'
import type { EntradaDecision } from '../lib/decision/tipos'

type Pedir = typeof pedirAnalisis

/**
 * Corre el analisis de Gemini para una rotacion siguiendo la linea de tiempo de
 * `estadoAnalisis.ts`. `reintentar` vuelve a empezar desde los pasos en vivo.
 */
export function useAnalisis(
  entrada: EntradaDecision | null,
  rotacionId: string | null,
  fechaBase: string | null,
  pedir: Pedir = pedirAnalisis,
): EstadoAnalisis & { reintentar: () => void } {
  const [estado, despachar] = useReducer(transicion, estadoInicial)
  const [intento, fijarIntento] = useState(0)
  const pedirActual = useRef(pedir)
  pedirActual.current = pedir

  const clave = entrada && rotacionId && fechaBase ? claveAnalisis(entrada, rotacionId, fechaBase) : null

  useEffect(() => {
    if (!entrada || !rotacionId || !clave) return
    const guardado = analisisGuardado(clave)
    if (guardado) {
      despachar({ tipo: 'guardado', texto: guardado })
      return
    }
    despachar({ tipo: 'reinicio' })
    despachar({ tipo: 'paso', id: 'inicio', texto: traductor(entrada.idioma)('analisis.preparando') })
    if (quedanHoy() <= 0) {
      despachar({ tipo: 'error', causa: 'cuota_local' })
      return
    }

    const control = new AbortController()
    const limite = window.setTimeout(() => despachar({ tipo: 'limite' }), LIMITE_MS)
    let texto = ''
    let fallo = false
    pedirActual
      .current(
        entrada,
        rotacionId,
        (ev) => {
          if (control.signal.aborted) return
          if (ev.tipo === 'texto') texto += ev.delta
          if (ev.tipo === 'error') fallo = true
          if (ev.tipo === 'fin' && !fallo && texto.trim()) {
            gastarUno()
            guardarAnalisis(clave, texto)
          }
          despachar(ev)
        },
        control.signal,
      )
      .catch(() => {
        if (!control.signal.aborted) despachar({ tipo: 'error', causa: 'red' })
      })
      .finally(() => window.clearTimeout(limite))

    return () => {
      control.abort()
      window.clearTimeout(limite)
    }
    // `entrada` y `rotacionId` estan representados en `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento])

  const reintentar = useCallback(() => fijarIntento((i) => i + 1), [])
  return { ...estado, reintentar }
}
