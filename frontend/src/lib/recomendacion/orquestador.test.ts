import type { ContextoChat } from '../chat/tipos'
import type { PeticionExplicacion } from './clienteDecision'
import {
  crearOrquestador,
  LIMITE_DECISION_MS,
  LIMITE_EXPLICACION_MS,
  separarExplicacion,
  type DepsOrquestador,
  type EntradaRecomendacion,
  type EventoRecomendacion,
} from './orquestador'
import type { CandidatoDecision } from './tipos'

const zeros = { seco: 0, normal: 0, lluvioso: 0 }
function candidato(id: string, total: number): CandidatoDecision {
  return { id, nombre: id, actual: id === 'a', total, porEscenario: zeros, partes: [], tipoCambio: 'repetir' }
}
const contexto = { vista: 'cultivos' } as ContextoChat
const entrada: EntradaRecomendacion = {
  candidatos: [candidato('a', 59), candidato('b', 70), candidato('c', 68)],
  enfoques: ['agua'],
  escenario: 'normal',
  contexto,
  perspectiva: null,
  armarPreset: (d) => `PRESET:${d.rotacionId}`,
}

/** Promesa que se resuelve o rechaza a mano. */
function pendiente<T>() {
  let ok!: (v: T) => void
  let fallo!: (e: unknown) => void
  const promesa = new Promise<T>((a, b) => {
    ok = a
    fallo = b
  })
  return { promesa, ok, fallo }
}

function armar(extra: Partial<DepsOrquestador> = {}) {
  const eventos: EventoRecomendacion[] = []
  const decision = pendiente<unknown>()
  const explicacion = pendiente<string>()
  const peticiones: PeticionExplicacion[] = []
  const deps: DepsOrquestador = {
    demo: false,
    pedirDecision: () => decision.promesa,
    pedirExplicacion: (p) => {
      peticiones.push(p)
      return explicacion.promesa
    },
    ...extra,
  }
  const orq = crearOrquestador(deps, (e) => eventos.push(e))
  const tipos = () => eventos.map((e) => e.tipo)
  return { orq, eventos, decision, explicacion, peticiones, tipos }
}

const vaciar = () => vi.advanceTimersByTimeAsync(0)

describe('orquestador', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('las constantes de limite son 2500 y 6000 ms', () => {
    expect(LIMITE_DECISION_MS).toBe(2500)
    expect(LIMITE_EXPLICACION_MS).toBe(6000)
  })

  it('decision a tiempo: elige la de Gemini y pide la explicacion con ella', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    expect(t.eventos[0]).toMatchObject({ tipo: 'decision', definitiva: false, decision: { rotacionId: 'b', origen: 'motor' } })
    await vi.advanceTimersByTimeAsync(1000)
    t.decision.ok({ rotacionId: 'c', enfoquePrincipal: 'agua', aviso: 'canicula' })
    await vaciar()
    expect(t.eventos[1]).toMatchObject({ tipo: 'decision', definitiva: true, decision: { rotacionId: 'c', origen: 'gemini', aviso: 'canicula' } })
    expect(t.peticiones).toHaveLength(1)
    expect(t.peticiones[0].decision.rotacionId).toBe('c')
    expect(t.peticiones[0].preset).toBe('PRESET:c')
  })

  it('decision tarde: gana el motor y la tardia se ignora', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    await vi.advanceTimersByTimeAsync(LIMITE_DECISION_MS)
    expect(t.eventos[1]).toMatchObject({ tipo: 'decision', definitiva: true, decision: { rotacionId: 'b', origen: 'motor' } })
    expect(t.peticiones).toHaveLength(1)
    t.decision.ok({ rotacionId: 'c', enfoquePrincipal: null, aviso: 'ninguno' })
    await vi.advanceTimersByTimeAsync(500)
    expect(t.tipos().filter((x) => x === 'decision')).toHaveLength(2)
    expect(t.peticiones).toHaveLength(1)
  })

  it('decision invalida (fuera de la lista o muy abajo): gana el motor', async () => {
    for (const respuesta of [{ rotacionId: 'zzz' }, { rotacionId: 'a' }, 'basura', null]) {
      const t = armar()
      t.orq.iniciar(entrada)
      t.decision.ok(respuesta)
      await vaciar()
      expect(t.eventos[1]).toMatchObject({ definitiva: true, decision: { rotacionId: 'b', origen: 'motor' } })
    }
  })

  it('decision que falla: gana el motor sin mostrar error', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    t.decision.fallo(new Error('red'))
    await vaciar()
    expect(t.eventos[1]).toMatchObject({ definitiva: true, decision: { origen: 'motor' } })
    expect(t.tipos()).not.toContain('error')
  })

  it('explicacion antes de 6 s: muestra el texto completo y no el preset', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    t.decision.ok({ rotacionId: 'b', enfoquePrincipal: 'agua', aviso: 'ninguno' })
    await vi.advanceTimersByTimeAsync(3000)
    t.explicacion.ok('Resumen corto.\n---\nDetalle largo.\n¿Quiere saber más?')
    await vaciar()
    expect(t.eventos.at(-1)).toEqual({ tipo: 'mostrarExplicacion', texto: 'Resumen corto.\n\nDetalle largo.\n¿Quiere saber más?' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.tipos()).not.toContain('mostrarPreset')
    expect(t.tipos()).not.toContain('seguimiento')
  })

  it('explicacion despues de 6 s: preset y luego solo el detalle, sin repetir el resumen', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    t.decision.ok({ rotacionId: 'b', enfoquePrincipal: 'agua', aviso: 'ninguno' })
    await vi.advanceTimersByTimeAsync(LIMITE_EXPLICACION_MS - 1)
    expect(t.tipos()).not.toContain('mostrarPreset')
    await vi.advanceTimersByTimeAsync(1)
    expect(t.eventos.at(-1)).toEqual({ tipo: 'mostrarPreset', texto: 'PRESET:b', motivo: 'tarde' })
    t.explicacion.ok('Resumen repetido.\n---\nSolo esto sigue.')
    await vaciar()
    expect(t.eventos.at(-1)).toEqual({ tipo: 'seguimiento', texto: 'Solo esto sigue.' })
    expect(JSON.stringify(t.eventos)).not.toContain('Resumen repetido')
    expect(t.tipos()).not.toContain('error')
  })

  it('explicacion sin linea ---: tarde se agrega completa; a tiempo se muestra tal cual', async () => {
    const tarde = armar()
    tarde.orq.iniciar(entrada)
    tarde.decision.ok({ rotacionId: 'b', enfoquePrincipal: null, aviso: 'ninguno' })
    await vi.advanceTimersByTimeAsync(LIMITE_EXPLICACION_MS)
    tarde.explicacion.ok('Texto entero sin separador.')
    await vaciar()
    expect(tarde.eventos.at(-1)).toEqual({ tipo: 'seguimiento', texto: 'Texto entero sin separador.' })

    const aTiempo = armar()
    aTiempo.orq.iniciar(entrada)
    aTiempo.decision.ok({ rotacionId: 'b', enfoquePrincipal: null, aviso: 'ninguno' })
    await vaciar()
    aTiempo.explicacion.ok('Texto entero sin separador.')
    await vaciar()
    expect(aTiempo.eventos.at(-1)).toEqual({ tipo: 'mostrarExplicacion', texto: 'Texto entero sin separador.' })
  })

  it('sin red: preset de inmediato y un solo aviso', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    t.decision.fallo(new TypeError('Failed to fetch'))
    await vaciar()
    t.explicacion.fallo(new TypeError('Failed to fetch'))
    await vaciar()
    expect(t.eventos.at(-2)).toEqual({ tipo: 'mostrarPreset', texto: 'PRESET:b', motivo: 'error' })
    expect(t.eventos.at(-1)).toEqual({ tipo: 'error', causa: 'sin_conexion' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.tipos().filter((x) => x === 'error')).toHaveLength(1)
    expect(t.tipos().filter((x) => x === 'mostrarPreset')).toHaveLength(1)
  })

  it('explicacion vacia cuenta como fallo', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    t.decision.ok({ rotacionId: 'b', enfoquePrincipal: null, aviso: 'ninguno' })
    await vaciar()
    t.explicacion.ok('   ')
    await vaciar()
    expect(t.tipos().slice(-2)).toEqual(['mostrarPreset', 'error'])
  })

  it('modo demo: motor, preset y aviso, sin pedir nada', async () => {
    const pedirDecision = vi.fn()
    const pedirExplicacion = vi.fn()
    const t = armar({ demo: true, pedirDecision, pedirExplicacion })
    t.orq.iniciar(entrada)
    await vaciar()
    expect(t.eventos).toEqual([
      { tipo: 'decision', decision: { rotacionId: 'b', enfoquePrincipal: 'agua', aviso: 'ninguno', origen: 'motor' }, definitiva: true },
      { tipo: 'mostrarPreset', texto: 'PRESET:b', motivo: 'demo' },
      { tipo: 'error', causa: 'demo' },
    ])
    expect(pedirDecision).not.toHaveBeenCalled()
    expect(pedirExplicacion).not.toHaveBeenCalled()
  })

  it('cancelar a media espera: no se emite nada despues y se abortan las peticiones', async () => {
    const senales: AbortSignal[] = []
    const t = armar({
      pedirDecision: (_p, s) => {
        senales.push(s)
        return t.decision.promesa
      },
      pedirExplicacion: (_p, s) => {
        senales.push(s)
        return t.explicacion.promesa
      },
    })
    t.orq.iniciar(entrada)
    t.decision.ok({ rotacionId: 'c', enfoquePrincipal: null, aviso: 'ninguno' })
    await vaciar()
    const antes = t.eventos.length
    t.orq.cancelar()
    expect(senales.every((s) => s.aborted)).toBe(true)
    t.explicacion.ok('Tarde\n---\nDetalle')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.eventos).toHaveLength(antes)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancelar antes de que llegue la decision tampoco emite nada', async () => {
    const t = armar()
    t.orq.iniciar(entrada)
    const antes = t.eventos.length
    t.orq.cancelar()
    t.decision.ok({ rotacionId: 'c', enfoquePrincipal: null, aviso: 'ninguno' })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.eventos).toHaveLength(antes)
    expect(t.peticiones).toHaveLength(0)
  })

  it('dos pulsaciones seguidas: solo cuenta la ultima', async () => {
    const decisiones: ReturnType<typeof pendiente<unknown>>[] = []
    const explicaciones: ReturnType<typeof pendiente<string>>[] = []
    const eventos: EventoRecomendacion[] = []
    const orq = crearOrquestador(
      {
        demo: false,
        pedirDecision: () => {
          const p = pendiente<unknown>()
          decisiones.push(p)
          return p.promesa
        },
        pedirExplicacion: () => {
          const p = pendiente<string>()
          explicaciones.push(p)
          return p.promesa
        },
      },
      (e) => eventos.push(e),
    )
    orq.iniciar({ ...entrada, armarPreset: () => 'PRIMERA' })
    await vi.advanceTimersByTimeAsync(1000)
    orq.iniciar({ ...entrada, armarPreset: () => 'SEGUNDA' })
    decisiones[0].ok({ rotacionId: 'c', enfoquePrincipal: null, aviso: 'ninguno' })
    await vaciar()
    expect(explicaciones).toHaveLength(0)
    decisiones[1].ok({ rotacionId: 'b', enfoquePrincipal: null, aviso: 'ninguno' })
    await vaciar()
    expect(explicaciones).toHaveLength(1)
    // El reloj de 6 s cuenta desde la segunda pulsacion.
    await vi.advanceTimersByTimeAsync(LIMITE_EXPLICACION_MS - 1)
    expect(eventos.filter((e) => e.tipo === 'mostrarPreset')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(eventos.filter((e) => e.tipo === 'mostrarPreset')).toEqual([{ tipo: 'mostrarPreset', texto: 'SEGUNDA', motivo: 'tarde' }])
    expect(JSON.stringify(eventos)).not.toContain('PRIMERA')
  })

  it('los limites se pueden configurar', async () => {
    const t = armar({ limiteDecisionMs: 100, limiteExplicacionMs: 200 })
    t.orq.iniciar(entrada)
    await vi.advanceTimersByTimeAsync(100)
    expect(t.eventos[1]).toMatchObject({ definitiva: true })
    await vi.advanceTimersByTimeAsync(100)
    expect(t.eventos.at(-1)).toMatchObject({ tipo: 'mostrarPreset', motivo: 'tarde' })
  })
})

describe('separarExplicacion', () => {
  it('parte por la linea que solo trae ---', () => {
    expect(separarExplicacion('A\n---\nB')).toEqual({ resumen: 'A', detalle: 'B' })
    expect(separarExplicacion('A con --- dentro\nB')).toEqual({ resumen: 'A con --- dentro\nB', detalle: null })
  })
})
