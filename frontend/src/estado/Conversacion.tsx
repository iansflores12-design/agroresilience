// oxlint-disable react/only-export-components -- el contrato de DISENO.md exige proveedor y hook en el mismo modulo
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface MensajeChat {
  id: string
  rol: 'usuario' | 'asistente'
  texto: string
  fecha: string
}

/** Un chat guardado. El título sale de la primera pregunta hasta que el productor le pone uno. */
export interface ChatGuardado {
  id: string
  titulo: string
  /** El productor escribió el título: ya no se cambia solo. */
  tituloPropio: boolean
  fijado: boolean
  mensajes: MensajeChat[]
  actualizado: string
}

interface Guardado {
  chats: ChatGuardado[]
  activoId: string | null
}

interface AccionesChats {
  /** Chats con los fijados primero y, dentro de cada grupo, el más reciente arriba. */
  chats: ChatGuardado[]
  activoId: string | null
  abrir(id: string | null): void
  /** Crea un chat vacío, lo deja activo y devuelve su id. */
  crear(): string
  renombrar(id: string, titulo: string): void
  fijar(id: string, fijado: boolean): void
  eliminar(id: string): void
  /** Devuelve un chat eliminado (para "Deshacer"). */
  restaurar(chat: ChatGuardado): void
  agregarA(id: string | null, m: Omit<MensajeChat, 'id' | 'fecha'>): MensajeChat
  reemplazarEn(id: string | null, mensajes: MensajeChat[]): void
}

export interface ValorConversacion extends AccionesChats {
  /** El chat que se está viendo, o null si todavía no hay ninguno. */
  chat: ChatGuardado | null
  mensajes: MensajeChat[]
  agregar(m: Omit<MensajeChat, 'id' | 'fecha'>): MensajeChat
  reemplazar(mensajes: MensajeChat[]): void
  /** Vacía los mensajes del chat (el chat sigue en la lista). */
  borrar(): void
}

export const CLAVE_CONVERSACION = 'agroresilience.chats.v1'
export const TITULO_NUEVO = 'Chat nuevo'
const LARGO_TITULO = 48

const Contexto = createContext<AccionesChats | null>(null)

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

function leerChat(x: unknown): ChatGuardado | null {
  if (typeof x !== 'object' || x === null) return null
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string' || !Array.isArray(c.mensajes)) return null
  return {
    id: c.id,
    titulo: typeof c.titulo === 'string' && c.titulo.trim() ? c.titulo : TITULO_NUEVO,
    tituloPropio: c.tituloPropio === true,
    fijado: c.fijado === true,
    mensajes: c.mensajes.filter(esMensaje),
    actualizado: typeof c.actualizado === 'string' ? c.actualizado : new Date(0).toISOString(),
  }
}

function leerGuardado(): Guardado {
  try {
    const dato: unknown = JSON.parse(window.localStorage.getItem(CLAVE_CONVERSACION) ?? 'null')
    if (typeof dato !== 'object' || dato === null) return { chats: [], activoId: null }
    const { chats, activoId } = dato as { chats?: unknown; activoId?: unknown }
    const lista = Array.isArray(chats) ? chats.map(leerChat).filter((c): c is ChatGuardado => c !== null) : []
    return { chats: lista, activoId: typeof activoId === 'string' && lista.some((c) => c.id === activoId) ? activoId : null }
  } catch {
    return { chats: [], activoId: null }
  }
}

let contador = 0
function nuevoId(prefijo: string): string {
  contador += 1
  return `${prefijo}${Date.now().toString(36)}-${contador}`
}

/** "¿Cuándo siembro el frijol de postrera en…" */
function tituloDe(pregunta: string): string {
  const limpio = pregunta.replace(/\s+/g, ' ').trim()
  return limpio.length > LARGO_TITULO ? `${limpio.slice(0, LARGO_TITULO).trimEnd()}…` : limpio || TITULO_NUEVO
}

function ordenar(chats: ChatGuardado[]): ChatGuardado[] {
  return [...chats].sort((a, b) => Number(b.fijado) - Number(a.fijado) || b.actualizado.localeCompare(a.actualizado))
}

export function ProveedorConversacion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Guardado>(leerGuardado)
  const actual = useRef(estado)

  const fijarEstado = useCallback((siguiente: Guardado) => {
    actual.current = siguiente
    setEstado(siguiente)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(estado))
    } catch {
      // Sin almacenamiento: los chats viven solo en memoria.
    }
  }, [estado])

  const cambiar = useCallback(
    (id: string, cambio: (c: ChatGuardado) => ChatGuardado) => {
      const e = actual.current
      fijarEstado({ ...e, chats: e.chats.map((c) => (c.id === id ? cambio(c) : c)) })
    },
    [fijarEstado],
  )

  const crear = useCallback(() => {
    const e = actual.current
    const chat: ChatGuardado = {
      id: nuevoId('c'),
      titulo: TITULO_NUEVO,
      tituloPropio: false,
      fijado: false,
      mensajes: [],
      actualizado: new Date().toISOString(),
    }
    fijarEstado({ chats: [...e.chats, chat], activoId: chat.id })
    return chat.id
  }, [fijarEstado])

  const abrir = useCallback(
    (id: string | null) => {
      const e = actual.current
      if (e.activoId !== id && (id === null || e.chats.some((c) => c.id === id))) fijarEstado({ ...e, activoId: id })
    },
    [fijarEstado],
  )

  const renombrar = useCallback(
    (id: string, titulo: string) => {
      const limpio = titulo.replace(/\s+/g, ' ').trim()
      if (limpio) cambiar(id, (c) => ({ ...c, titulo: limpio.slice(0, 80), tituloPropio: true }))
    },
    [cambiar],
  )
  const fijar = useCallback((id: string, fijado: boolean) => cambiar(id, (c) => ({ ...c, fijado })), [cambiar])

  const eliminar = useCallback(
    (id: string) => {
      const e = actual.current
      fijarEstado({ chats: e.chats.filter((c) => c.id !== id), activoId: e.activoId === id ? null : e.activoId })
    },
    [fijarEstado],
  )
  const restaurar = useCallback(
    (chat: ChatGuardado) => {
      const e = actual.current
      if (!e.chats.some((c) => c.id === chat.id)) fijarEstado({ ...e, chats: [...e.chats, chat] })
    },
    [fijarEstado],
  )

  const agregarA = useCallback(
    (id: string | null, m: Omit<MensajeChat, 'id' | 'fecha'>) => {
      const destino = id ?? actual.current.activoId ?? crear()
      const nuevo: MensajeChat = { ...m, id: nuevoId('m'), fecha: new Date().toISOString() }
      cambiar(destino, (c) => ({
        ...c,
        mensajes: [...c.mensajes, nuevo],
        actualizado: nuevo.fecha,
        // El primer mensaje del productor le da nombre al chat.
        titulo: !c.tituloPropio && m.rol === 'usuario' && !c.mensajes.some((x) => x.rol === 'usuario') ? tituloDe(m.texto) : c.titulo,
      }))
      return nuevo
    },
    [cambiar, crear],
  )
  const reemplazarEn = useCallback(
    (id: string | null, mensajes: MensajeChat[]) => {
      const destino = id ?? actual.current.activoId
      if (destino) cambiar(destino, (c) => ({ ...c, mensajes }))
    },
    [cambiar],
  )

  const valor = useMemo<AccionesChats>(
    () => ({
      chats: ordenar(estado.chats),
      activoId: estado.activoId,
      abrir,
      crear,
      renombrar,
      fijar,
      eliminar,
      restaurar,
      agregarA,
      reemplazarEn,
    }),
    [estado, abrir, crear, renombrar, fijar, eliminar, restaurar, agregarA, reemplazarEn],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/**
 * Los chats y, además, la conversación de uno: el de `id` o, si no se da, el activo. Escribir
 * sin chat activo crea uno.
 */
export function useConversacion(id?: string): ValorConversacion {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useConversacion debe usarse dentro de ProveedorConversacion')
  const { chats, activoId, agregarA, reemplazarEn } = valor
  const chatId = id ?? activoId
  const chat = chats.find((c) => c.id === chatId) ?? null
  const agregar = useCallback((m: Omit<MensajeChat, 'id' | 'fecha'>) => agregarA(id ?? null, m), [agregarA, id])
  const reemplazar = useCallback((lista: MensajeChat[]) => reemplazarEn(id ?? null, lista), [reemplazarEn, id])
  const borrar = useCallback(() => reemplazarEn(id ?? null, []), [reemplazarEn, id])
  return useMemo(
    () => ({ ...valor, chat, mensajes: chat?.mensajes ?? SIN_MENSAJES, agregar, reemplazar, borrar }),
    [valor, chat, agregar, reemplazar, borrar],
  )
}

const SIN_MENSAJES: MensajeChat[] = []
