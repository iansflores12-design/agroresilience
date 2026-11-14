// oxlint-disable react/only-export-components -- el contrato de DISENO.md exige proveedor y hook en el mismo modulo
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { configurarSonido } from '../lib/sonido'
import type { Enfoque } from '../lib/recomendacion/tipos'

export interface EstadoApp {
  cultivoId: string | null
  zonaId: string | null
  /** Semanas desde la siembra. */
  edadSemanas: number
  sonido: boolean
  /** Lo que mas le importa al productor, maximo 2. */
  enfoques: Enfoque[]
}

interface AccionesEstadoApp {
  /** Reinicia edadSemanas a 0 si cambia el cultivo. */
  elegirCultivo(id: string): void
  elegirZona(id: string): void
  fijarEdad(semanas: number): void
  alternarSonido(): void
  /** Quita el enfoque si estaba; si no, lo agrega y descarta el mas antiguo si pasan de 2. */
  alternarEnfoque(id: Enfoque): void
}

export const CLAVE_ESTADO = 'agroresilience.estado.v1'

const porDefecto: EstadoApp = { cultivoId: null, zonaId: null, edadSemanas: 0, sonido: true, enfoques: [] }

const ENFOQUES_VALIDOS: readonly string[] = ['agua', 'seguro', 'tierra', 'venta']
const MAX_ENFOQUES = 2

const Contexto = createContext<(EstadoApp & AccionesEstadoApp) | null>(null)

/** Lee el estado guardado. Tolera almacenamiento ausente, JSON invalido y campos de tipo erroneo. */
function leerEstadoGuardado(): EstadoApp {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ESTADO)
    if (!crudo) return porDefecto
    const dato: unknown = JSON.parse(crudo)
    if (typeof dato !== 'object' || dato === null) return porDefecto
    const d = dato as Record<string, unknown>
    return {
      cultivoId: typeof d.cultivoId === 'string' ? d.cultivoId : null,
      zonaId: typeof d.zonaId === 'string' ? d.zonaId : null,
      edadSemanas:
        typeof d.edadSemanas === 'number' && Number.isFinite(d.edadSemanas) && d.edadSemanas >= 0
          ? d.edadSemanas
          : 0,
      sonido: typeof d.sonido === 'boolean' ? d.sonido : true,
      enfoques: Array.isArray(d.enfoques)
        ? [...new Set(d.enfoques.filter((x): x is Enfoque => typeof x === 'string' && ENFOQUES_VALIDOS.includes(x)))].slice(0, MAX_ENFOQUES)
        : [],
    }
  } catch {
    return porDefecto
  }
}

export function ProveedorEstadoApp({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoApp>(leerEstadoGuardado)

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado))
    } catch {
      // Almacenamiento lleno o bloqueado: la app sigue funcionando en memoria.
    }
  }, [estado])

  useEffect(() => {
    configurarSonido(estado.sonido)
  }, [estado.sonido])

  const elegirCultivo = useCallback((id: string) => {
    setEstado((e) => (e.cultivoId === id ? e : { ...e, cultivoId: id, edadSemanas: 0 }))
  }, [])
  const elegirZona = useCallback((id: string) => {
    setEstado((e) => (e.zonaId === id ? e : { ...e, zonaId: id }))
  }, [])
  const fijarEdad = useCallback((semanas: number) => {
    setEstado((e) => ({ ...e, edadSemanas: Math.max(0, semanas) }))
  }, [])
  const alternarSonido = useCallback(() => {
    setEstado((e) => ({ ...e, sonido: !e.sonido }))
  }, [])
  const alternarEnfoque = useCallback((id: Enfoque) => {
    setEstado((e) => ({
      ...e,
      enfoques: e.enfoques.includes(id) ? e.enfoques.filter((x) => x !== id) : [...e.enfoques, id].slice(-MAX_ENFOQUES),
    }))
  }, [])

  const valor = useMemo(
    () => ({ ...estado, elegirCultivo, elegirZona, fijarEdad, alternarSonido, alternarEnfoque }),
    [estado, elegirCultivo, elegirZona, fijarEdad, alternarSonido, alternarEnfoque],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstadoApp() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useEstadoApp debe usarse dentro de ProveedorEstadoApp')
  return valor
}
