import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CLAVE_CONVERSACION, ProveedorConversacion, useConversacion } from './Conversacion'

const envoltorio = ({ children }: { children: ReactNode }) => <ProveedorConversacion>{children}</ProveedorConversacion>

describe('Conversacion', () => {
  beforeEach(() => window.localStorage.clear())

  it('agrega mensajes con id y fecha, y los devuelve', () => {
    const { result } = renderHook(() => useConversacion(), { wrapper: envoltorio })
    let creado: ReturnType<typeof result.current.agregar>
    act(() => {
      creado = result.current.agregar({ rol: 'usuario', texto: 'hola' })
      result.current.agregar({ rol: 'asistente', texto: 'respuesta' })
    })
    expect(creado!.id).toBeTruthy()
    expect(Number.isNaN(Date.parse(creado!.fecha))).toBe(false)
    expect(result.current.mensajes.map((m) => m.texto)).toEqual(['hola', 'respuesta'])
  })

  it('reemplaza, borra y persiste en el teléfono', () => {
    const { result, unmount } = renderHook(() => useConversacion(), { wrapper: envoltorio })
    act(() => {
      result.current.agregar({ rol: 'usuario', texto: 'a' })
    })
    const copia = result.current.mensajes
    act(() => result.current.borrar())
    expect(result.current.mensajes).toEqual([])
    act(() => result.current.reemplazar(copia))
    expect(result.current.mensajes).toEqual(copia)
    unmount()
    const otra = renderHook(() => useConversacion(), { wrapper: envoltorio })
    expect(otra.result.current.mensajes).toEqual(copia)
  })

  it('tolera JSON invalido o mensajes mal formados', () => {
    window.localStorage.setItem(CLAVE_CONVERSACION, 'xx')
    expect(renderHook(() => useConversacion(), { wrapper: envoltorio }).result.current.mensajes).toEqual([])
    window.localStorage.setItem(CLAVE_CONVERSACION, JSON.stringify({ chats: [{ id: 1 }, 'x', { id: 'c1', mensajes: [{ id: 2 }] }], activoId: 'c1' }))
    expect(renderHook(() => useConversacion(), { wrapper: envoltorio }).result.current.mensajes).toEqual([])
  })

  it('lleva varios chats: crea, nombra con la primera pregunta, renombra, fija arriba y borra', () => {
    const { result } = renderHook(() => useConversacion(), { wrapper: envoltorio })
    let primero = ''
    let segundo = ''
    act(() => {
      primero = result.current.crear()
      result.current.agregar({ rol: 'usuario', texto: '¿Cuándo siembro el frijol?' })
    })
    act(() => {
      segundo = result.current.crear()
    })
    expect(result.current.chats.map((c) => c.titulo).sort()).toEqual(['Chat nuevo', '¿Cuándo siembro el frijol?'])
    expect(result.current.mensajes).toEqual([])

    act(() => result.current.fijar(primero, true))
    expect(result.current.chats[0].id).toBe(primero)
    act(() => result.current.renombrar(segundo, '  Maíz de postrera  '))
    expect(result.current.chats.find((c) => c.id === segundo)?.titulo).toBe('Maíz de postrera')

    const borrado = result.current.chats.find((c) => c.id === primero)!
    act(() => result.current.eliminar(primero))
    expect(result.current.chats.map((c) => c.id)).toEqual([segundo])
    act(() => result.current.restaurar(borrado))
    expect(result.current.chats).toHaveLength(2)
  })
})
