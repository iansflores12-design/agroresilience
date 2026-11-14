// oxlint-disable react/only-export-components -- el contrato de DISENO.md exige proveedor y hook en el mismo modulo
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface MensajeChat {
  id: string
  rol: 'usuario' | 'asistente'
  texto: string
  fecha: string
  /** De donde viene el mensaje: texto guardado, asistente o la persona. Opcional: lo guardado antes no lo trae. */
  origen?: 'preset' | 'asistente' | 'usuario'
}

interface ValorConversacion {
  mensajes: MensajeChat[]
  agregar(m: Omit<MensajeChat, 'id' | 'fecha'>): MensajeChat
  reemplazar(mensajes: MensajeChat[]): void
  borrar(): void
}

export const CLAVE_CONVERSACION = 'agroresilience.conversacion.v1'

const Contexto = createContext<ValorConversacion | null>(null)

function esMensaje(x: unknown): x is MensajeChat {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    (m.rol === 'usuario' || m.rol === 'asistente') &&
    typeof m.texto === 'string' &&
    typeof m.fecha === 'string'
  )
}

const ORIGENES: readonly string[] = ['preset', 'asistente', 'usuario']

/** Lectura tolerante: un origen desconocido se descarta, el mensaje se conserva. */
function normalizar(m: MensajeChat): MensajeChat {
  const { origen, ...resto } = m
  return typeof origen === 'string' && ORIGENES.includes(origen) ? { ...resto, origen } : resto
}

function leerConversacionGuardada(): MensajeChat[] {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_CONVERSACION)
    if (!crudo) return []
    const dato: unknown = JSON.parse(crudo)
    return Array.isArray(dato) ? dato.filter(esMensaje).map(normalizar) : []
  } catch {
    return []
  }
}

let contador = 0
function nuevoId(): string {
  contador += 1
  return `m${Date.now().toString(36)}-${contador}`
}

export function ProveedorConversacion({ children }: { children: ReactNode }) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(leerConversacionGuardada)
  const actual = useRef(mensajes)

  useEffect(() => {
    actual.current = mensajes
    try {
      window.sessionStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(mensajes))
    } catch {
      // Sin sessionStorage: la conversacion vive solo en memoria.
    }
  }, [mensajes])

  const agregar = useCallback((m: Omit<MensajeChat, 'id' | 'fecha'>) => {
    const nuevo: MensajeChat = { ...m, id: nuevoId(), fecha: new Date().toISOString() }
    actual.current = [...actual.current, nuevo]
    setMensajes(actual.current)
    return nuevo
  }, [])
  const reemplazar = useCallback((lista: MensajeChat[]) => {
    actual.current = lista
    setMensajes(lista)
  }, [])
  const borrar = useCallback(() => {
    actual.current = []
    setMensajes([])
  }, [])

  const valor = useMemo(
    () => ({ mensajes, agregar, reemplazar, borrar }),
    [mensajes, agregar, reemplazar, borrar],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useConversacion() {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useConversacion debe usarse dentro de ProveedorConversacion')
  return valor
}
