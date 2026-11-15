// oxlint-disable react/only-export-components -- el contrato de DISENO.md exige proveedor y hook en el mismo modulo
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Idioma } from '../i18n/idiomas'
import { buscarDepartamento, departamentoDeZona } from '../datos/aptitud'
import { zonaDeDepartamento } from '../datos/lugarDepartamento'
import { dentroDeHonduras } from '../lib/decision/escala'
import { OBJETIVOS } from '../lib/decision/parametros'
import type { EntradaDecision, Objetivo, Temporada, Terreno } from '../lib/decision/tipos'
import { configurarSonido } from '../lib/sonido'

export interface EstadoApp {
  cultivoId: string | null
  /** Punto de datos (humedad, lluvia, pronostico) que usa el lugar elegido. */
  zonaId: string | null
  /** Departamento elegido (ISO 3166-2, HN-CH). Null en estados viejos: se toma el de `zonaId`. */
  departamentoId: string | null
  /** Semanas desde la siembra. */
  edadSemanas: number
  sonido: boolean
  /** Respuestas de Gemini Decision. */
  terreno: Terreno | null
  temporada: Temporada | null
  objetivos: Objetivo[]
  /** Ubicacion de la parcela (GPS), redondeada a ~100 m. Null = se usa el lugar elegido. */
  parcela: { lat: number; lon: number } | null
}

export interface Perfil {
  zonaId: string
  terreno: Terreno
  cultivoId: string
  temporada: Temporada
  parcela?: { lat: number; lon: number } | null
  /** Departamento elegido. Si falta, sale de `zonaId`. */
  departamentoId?: string | null
  /** Semanas desde la siembra. Si falta, se conserva (o vuelve a 0 si cambio el cultivo). */
  edadSemanas?: number
  /** Si faltan, se conservan los que ya habia. */
  objetivos?: Objetivo[]
}

interface AccionesEstadoApp {
  /** Reinicia edadSemanas a 0 si cambia el cultivo. */
  elegirCultivo(id: string): void
  elegirZona(id: string): void
  /** Elige el lugar por departamento: usa el punto de datos que le corresponde. */
  elegirDepartamento(id: string): void
  fijarEdad(semanas: number): void
  alternarSonido(): void
  /** Guarda las respuestas del cuestionario de Gemini Decision. */
  fijarPerfil(p: Perfil): void
  /** Cambia solo los datos dados (cultivo y semanas, o lugar y ubicacion) sin pedir el perfil completo. */
  actualizarPerfil(p: Partial<Perfil>): void
  alternarObjetivo(o: Objetivo): void
}

export const CLAVE_ESTADO = 'agroresilience.estado.v1'

const porDefecto: EstadoApp = {
  cultivoId: null,
  zonaId: null,
  departamentoId: null,
  edadSemanas: 0,
  sonido: true,
  terreno: null,
  temporada: null,
  objetivos: [],
  parcela: null,
}

function leerParcela(x: unknown): { lat: number; lon: number } | null {
  if (typeof x !== 'object' || x === null) return null
  const { lat, lon } = x as { lat?: unknown; lon?: unknown }
  return typeof lat === 'number' && typeof lon === 'number' && dentroDeHonduras(lat, lon) ? { lat, lon } : null
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
      departamentoId:
        typeof d.departamentoId === 'string' && buscarDepartamento(d.departamentoId) ? d.departamentoId : null,
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
      parcela: leerParcela(d.parcela),
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
    // Otro lugar elegido a mano: la ubicacion GPS de antes ya no corresponde.
    setEstado((e) => (e.zonaId === id ? e : { ...e, zonaId: id, departamentoId: departamentoDeZona(id), parcela: null }))
  }, [])
  const elegirDepartamento = useCallback((id: string) => {
    const zona = zonaDeDepartamento(id)
    if (!zona) return
    setEstado((e) => (e.departamentoId === id && e.zonaId === zona.id ? e : { ...e, departamentoId: id, zonaId: zona.id, parcela: null }))
  }, [])
  const fijarEdad = useCallback((semanas: number) => {
    setEstado((e) => ({ ...e, edadSemanas: Math.max(0, semanas) }))
  }, [])
  const alternarSonido = useCallback(() => {
    setEstado((e) => ({ ...e, sonido: !e.sonido }))
  }, [])
  const actualizarPerfil = useCallback((p: Partial<Perfil>) => {
    setEstado((e) => {
      const definidos = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Partial<Perfil>
      const siguiente = { ...e, ...definidos }
      // Otro punto de datos sin departamento dicho: el departamento es el del punto.
      if (definidos.zonaId && definidos.zonaId !== e.zonaId && definidos.departamentoId === undefined) {
        siguiente.departamentoId = departamentoDeZona(definidos.zonaId)
      }
      if (definidos.cultivoId && definidos.cultivoId !== e.cultivoId && definidos.edadSemanas === undefined) siguiente.edadSemanas = 0
      return siguiente
    })
  }, [])
  const fijarPerfil = useCallback((p: Perfil) => {
    setEstado((e) => ({
      ...e,
      ...p,
      parcela: p.parcela ?? null,
      departamentoId: p.departamentoId ?? (p.zonaId === e.zonaId && e.departamentoId ? e.departamentoId : departamentoDeZona(p.zonaId)),
      edadSemanas: Math.max(0, p.edadSemanas ?? (e.cultivoId === p.cultivoId ? e.edadSemanas : 0)),
      objetivos: p.objetivos ?? e.objetivos,
    }))
  }, [])
  const alternarObjetivo = useCallback((o: Objetivo) => {
    setEstado((e) => ({
      ...e,
      objetivos: e.objetivos.includes(o) ? e.objetivos.filter((x) => x !== o) : [...e.objetivos, o],
    }))
  }, [])

  const valor = useMemo(
    () => ({ ...estado, elegirCultivo, elegirZona, elegirDepartamento, fijarEdad, alternarSonido, fijarPerfil, actualizarPerfil, alternarObjetivo }),
    [estado, elegirCultivo, elegirZona, elegirDepartamento, fijarEdad, alternarSonido, fijarPerfil, actualizarPerfil, alternarObjetivo],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstadoApp() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useEstadoApp debe usarse dentro de ProveedorEstadoApp')
  return valor
}

/** Entrada completa para Gemini Decision, o null si falta contestar algo. Con `idioma`, los textos salen en ese idioma. */
export function entradaDe(e: EstadoApp, idioma?: Idioma): EntradaDecision | null {
  if (!e.zonaId || !e.cultivoId || !e.terreno || !e.temporada) return null
  return {
    zonaId: e.zonaId, cultivoId: e.cultivoId, terreno: e.terreno, temporada: e.temporada, objetivos: e.objetivos,
    ...(e.parcela ? { parcela: e.parcela } : {}),
    ...(idioma ? { idioma } : {}),
  }
}
