import { act, renderHook } from '@testing-library/react'
import type { EventoServidor } from '../lib/decision/cliente'
import { LIMITE_MS, estadoInicial, transicion } from '../lib/decision/estadoAnalisis'
import { CUOTA_DIARIA, usadosHoy } from '../lib/decision/memoria'
import type { EntradaDecision } from '../lib/decision/tipos'
import { useAnalisis } from './useAnalisis'

const entrada: EntradaDecision = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: [] }

/** Servidor falso: el test decide cuando llega cada evento. */
function servidorFalso() {
  let emitir: (e: EventoServidor) => void = () => {}
  let terminar: () => void = () => {}
  const pedir = vi.fn((_e: EntradaDecision, _r: string, alEvento: (e: EventoServidor) => void) => {
    emitir = alEvento
    return new Promise<void>((ok) => {
      terminar = ok
    })
  })
  return {
    pedir,
    emitir: (e: EventoServidor) => act(() => emitir(e)),
    terminar: () => act(async () => terminar()),
  }
}

describe('transicion (linea de tiempo)', () => {
  it('rapido: el texto antes del limite pasa a escribiendo y luego a listo sin aviso', () => {
    let e = transicion(estadoInicial, { tipo: 'texto', delta: 'Hola' })
    expect(e.fase).toBe('escribiendo')
    e = transicion(e, { tipo: 'limite' })
    expect(e.fase).toBe('escribiendo')
    e = transicion(e, { tipo: 'fin' })
    expect(e).toMatchObject({ fase: 'listo', llegoTarde: false, texto: 'Hola' })
  })

  it('lento: al limite muestra el resumen; el texto tardio no lo tapa; al terminar avisa', () => {
    let e = transicion(estadoInicial, { tipo: 'limite' })
    expect(e.fase).toBe('resumen')
    e = transicion(e, { tipo: 'texto', delta: 'Tarde' })
    expect(e.fase).toBe('resumen')
    e = transicion(e, { tipo: 'fin' })
    expect(e).toMatchObject({ fase: 'listo', llegoTarde: true, texto: 'Tarde' })
  })

  it('falla: queda en fallo con su causa', () => {
    const e = transicion(transicion(estadoInicial, { tipo: 'limite' }), { tipo: 'error', causa: 'cuota' })
    expect(e).toMatchObject({ fase: 'fallo', causa: 'cuota' })
  })

  it('fin sin texto cuenta como fallo', () => {
    expect(transicion(estadoInicial, { tipo: 'fin' })).toMatchObject({ fase: 'fallo', causa: 'servidor' })
  })
})

describe('useAnalisis', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('lento: resumen a los 6 s, analisis listo despues, gasta una consulta y la guarda', async () => {
    const s = servidorFalso()
    const { result, unmount } = renderHook(() => useAnalisis(entrada, 'maiz-frijol', '2026-11-10', s.pedir))
    s.emitir({ tipo: 'paso', id: 'datos', texto: 'Leyendo' })
    expect(result.current.fase).toBe('pasos')
    act(() => vi.advanceTimersByTime(LIMITE_MS))
    expect(result.current.fase).toBe('resumen')
    s.emitir({ tipo: 'texto', delta: 'Análisis completo' })
    s.emitir({ tipo: 'fin' })
    await s.terminar()
    expect(result.current).toMatchObject({ fase: 'listo', llegoTarde: true, texto: 'Análisis completo' })
    expect(usadosHoy()).toBe(1)
    unmount()

    // La segunda vez sale de la memoria: no llama al servidor ni gasta cuota.
    const otro = servidorFalso()
    const r2 = renderHook(() => useAnalisis(entrada, 'maiz-frijol', '2026-11-10', otro.pedir))
    expect(r2.result.current).toMatchObject({ fase: 'listo', guardado: true, texto: 'Análisis completo' })
    expect(otro.pedir).not.toHaveBeenCalled()
    expect(usadosHoy()).toBe(1)
  })

  it('un intento fallido no gasta cuota y reintentar vuelve a pedir', async () => {
    const s = servidorFalso()
    const { result } = renderHook(() => useAnalisis(entrada, 'maiz-sorgo', '2026-11-10', s.pedir))
    s.emitir({ tipo: 'error', causa: 'cuota' })
    await s.terminar()
    expect(result.current).toMatchObject({ fase: 'fallo', causa: 'cuota' })
    expect(usadosHoy()).toBe(0)
    act(() => result.current.reintentar())
    expect(s.pedir).toHaveBeenCalledTimes(2)
    expect(result.current.fase).toBe('pasos')
  })

  it('sin cuota del dia no llama al servidor', () => {
    window.localStorage.setItem(
      'agroresilience.analisis.cuota.v1',
      JSON.stringify({ dia: new Date().toISOString().slice(0, 10), usados: CUOTA_DIARIA }),
    )
    const s = servidorFalso()
    const { result } = renderHook(() => useAnalisis(entrada, 'maiz-tomate', '2026-11-10', s.pedir))
    expect(result.current).toMatchObject({ fase: 'fallo', causa: 'cuota_local' })
    expect(s.pedir).not.toHaveBeenCalled()
  })
})
