// oxlint-disable react/only-export-components -- el contrato de DISENO.md exige proveedor y hook en el mismo modulo
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { OBJETIVOS } from '../lib/decision/parametros'
import type { EntradaDecision, Objetivo, Temporada, Terreno } from '../lib/decision/tipos'
import { configurarSonido } from '../lib/sonido'

export interface EstadoApp {
  cultivoId: string | null
  zonaId: string | null
  /** Semanas desde la siembra. */
  edadSemanas: number
  sonido: boolean
  /** Respuestas de Gemini Decision. */
  terreno: Terreno | null
  temporada: Temporada | null
  objetivos: Objetivo[]
}

export interface Perfil {
  zonaId: string
  terreno: Terreno
  cultivoId: string
  temporada: Temporada
}

interface AccionesEstadoApp {
  /** Reinicia edadSemanas a 0 si cambia el cultivo. */
  elegirCultivo(id: string): void
  elegirZona(id: string): void
  fijarEdad(semanas: number): void
  alternarSonido(): void
  /** Guarda las respuestas del cuestionario de Gemini Decision. */
  fijarPerfil(p: Perfil): void
  alternarObjetivo(o: Objetivo): void
}

export const CLAVE_ESTADO = 'agroresilience.estado.v1'

const porDefecto: EstadoApp = {
  cultivoId: null,
  zonaId: null,
  edadSemanas: 0,
  sonido: true,
  terreno: null,
  temporada: null,
  objetivos: [],
}

const TERRENOS: Terreno[] = ['plano', 'elevado', 'bajo', 'ondulado']
const TEMPORADAS: Temporada[] = ['primera', 'postrera', 'verano']

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
      terreno: TERRENOS.includes(d.terreno as Terreno) ? (d.terreno as Terreno) : null,
      temporada: TEMPORADAS.includes(d.temporada as Temporada) ? (d.temporada as Temporada) : null,
      objetivos: Array.isArray(d.objetivos)
        ? d.objetivos.filter((o): o is Objetivo => typeof o === 'string' && o in OBJETIVOS)
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
  const fijarPerfil = useCallback((p: Perfil) => {
    setEstado((e) => ({
      ...e,
      ...p,
      edadSemanas: e.cultivoId === p.cultivoId ? e.edadSemanas : 0,
    }))
  }, [])
  const alternarObjetivo = useCallback((o: Objetivo) => {
    setEstado((e) => ({
      ...e,
      objetivos: e.objetivos.includes(o) ? e.objetivos.filter((x) => x !== o) : [...e.objetivos, o],
    }))
  }, [])

  const valor = useMemo(
    () => ({ ...estado, elegirCultivo, elegirZona, fijarEdad, alternarSonido, fijarPerfil, alternarObjetivo }),
    [estado, elegirCultivo, elegirZona, fijarEdad, alternarSonido, fijarPerfil, alternarObjetivo],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstadoApp() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useEstadoApp debe usarse dentro de ProveedorEstadoApp')
  return valor
}

/** Entrada completa para Gemini Decision, o null si falta contestar algo. */
export function entradaDe(e: EstadoApp): EntradaDecision | null {
  if (!e.zonaId || !e.cultivoId || !e.terreno || !e.temporada) return null
  return { zonaId: e.zonaId, cultivoId: e.cultivoId, terreno: e.terreno, temporada: e.temporada, objetivos: e.objetivos }
}
