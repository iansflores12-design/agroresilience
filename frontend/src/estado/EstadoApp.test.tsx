import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CLAVE_ESTADO, ProveedorEstadoApp, useEstadoApp } from './EstadoApp'

const envoltorio = ({ children }: { children: ReactNode }) => <ProveedorEstadoApp>{children}</ProveedorEstadoApp>

describe('EstadoApp', () => {
  beforeEach(() => window.localStorage.clear())

  it('arranca con los valores por defecto', () => {
    const { result } = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(result.current).toMatchObject({ cultivoId: null, zonaId: null, edadSemanas: 0, sonido: true })
  })

  it('elegirCultivo reinicia la edad solo si cambia el cultivo', () => {
    const { result } = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    act(() => result.current.elegirCultivo('a'))
    act(() => result.current.fijarEdad(5))
    act(() => result.current.elegirCultivo('a'))
    expect(result.current.edadSemanas).toBe(5)
    act(() => result.current.elegirCultivo('b'))
    expect(result.current.edadSemanas).toBe(0)
    expect(result.current.cultivoId).toBe('b')
  })

  it('persiste en localStorage y se restaura', () => {
    const primero = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    act(() => {
      primero.result.current.elegirCultivo('maiz')
      primero.result.current.elegirZona('z1')
      primero.result.current.alternarSonido()
    })
    primero.unmount()
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ESTADO)!)).toMatchObject({ cultivoId: 'maiz', zonaId: 'z1', sonido: false })

    const segundo = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(segundo.result.current).toMatchObject({ cultivoId: 'maiz', zonaId: 'z1', sonido: false })
  })

  it('tolera JSON invalido y campos de tipo erroneo', () => {
    window.localStorage.setItem(CLAVE_ESTADO, '{no es json')
    const a = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(a.result.current).toMatchObject({ cultivoId: null, sonido: true })
    a.unmount()

    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ cultivoId: 3, edadSemanas: 'x', sonido: 'si' }))
    const b = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(b.result.current).toMatchObject({ cultivoId: null, edadSemanas: 0, sonido: true })
  })

  it('alternarEnfoque agrega, quita y descarta el mas antiguo al pasar de 2', () => {
    const { result } = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(result.current.enfoques).toEqual([])
    act(() => result.current.alternarEnfoque('agua'))
    act(() => result.current.alternarEnfoque('venta'))
    expect(result.current.enfoques).toEqual(['agua', 'venta'])
    act(() => result.current.alternarEnfoque('tierra'))
    expect(result.current.enfoques).toEqual(['venta', 'tierra'])
    act(() => result.current.alternarEnfoque('venta'))
    expect(result.current.enfoques).toEqual(['tierra'])
  })

  it('lee enfoques de forma tolerante', () => {
    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ enfoques: ['agua', 'x', 3, 'seguro', 'venta'] }))
    const a = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(a.result.current.enfoques).toEqual(['agua', 'seguro'])
    a.unmount()
    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ enfoques: 'agua' }))
    const b = renderHook(() => useEstadoApp(), { wrapper: envoltorio })
    expect(b.result.current.enfoques).toEqual([])
  })

  it('falla con mensaje claro fuera del proveedor', () => {
    expect(() => renderHook(() => useEstadoApp())).toThrow(/ProveedorEstadoApp/)
  })
})
