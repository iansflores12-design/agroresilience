import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CLAVE_CONVERSACION, ProveedorConversacion, useConversacion } from './Conversacion'

const envoltorio = ({ children }: { children: ReactNode }) => <ProveedorConversacion>{children}</ProveedorConversacion>

describe('Conversacion', () => {
  beforeEach(() => window.sessionStorage.clear())

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

  it('reemplaza, borra y persiste en sessionStorage', () => {
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
    window.sessionStorage.setItem(CLAVE_CONVERSACION, 'xx')
    expect(renderHook(() => useConversacion(), { wrapper: envoltorio }).result.current.mensajes).toEqual([])
    window.sessionStorage.setItem(CLAVE_CONVERSACION, JSON.stringify([{ id: 1 }, 'x']))
    expect(renderHook(() => useConversacion(), { wrapper: envoltorio }).result.current.mensajes).toEqual([])
  })
})
