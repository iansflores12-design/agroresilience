// Orquestador de la recomendacion: logica pura (sin React), con relojes y peticiones inyectables.
// Capas: motor (instantaneo) -> decision de Gemini (hasta LIMITE_DECISION_MS) -> explicacion (hasta
// LIMITE_EXPLICACION_MS, si no llega se muestra el texto guardado). Ambos limites cuentan desde el toque.
import type { Escenario } from '../../datos/aptitud'
import type { ContextoChat } from '../chat/tipos'
import type { PeticionDecision, PeticionExplicacion } from './clienteDecision'
import { decisionDelMotor, validarDecision } from './motor'
import type { CandidatoDecision, Decision, Enfoque, PerspectivaResumen } from './tipos'

/** Tiempo maximo, desde el toque, para esperar la decision de Gemini. Si no llega, gana el motor. */
export const LIMITE_DECISION_MS = 2500
/** Tiempo maximo, desde el toque, para esperar la explicacion antes de mostrar el texto guardado. */
export const LIMITE_EXPLICACION_MS = 6000

export type MotivoPreset = 'tarde' | 'error' | 'demo'
export type CausaError = 'demo' | 'sin_conexion'

export type EventoRecomendacion =
  /** `definitiva: false` es el ganador provisional del motor; la decision final llega con `true`. */
  | { tipo: 'decision'; decision: Decision; definitiva: boolean }
  | { tipo: 'mostrarPreset'; texto: string; motivo: MotivoPreset }
  | { tipo: 'mostrarExplicacion'; texto: string }
  /** Solo el detalle de una explicacion que llego despues del texto guardado. */
  | { tipo: 'seguimiento'; texto: string }
  | { tipo: 'error'; causa: CausaError }

export interface EntradaRecomendacion {
  candidatos: CandidatoDecision[]
  enfoques: Enfoque[]
  escenario: Escenario
  contexto: ContextoChat
  perspectiva: PerspectivaResumen | null
  /** Arma el texto guardado para la decision final. */
  armarPreset(decision: Decision): string
}

export interface Reloj {
  setTimeout(accion: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

export interface DepsOrquestador {
  /** Sin backend: gana el motor y se muestra el texto guardado, sin pedir nada. */
  demo: boolean
  pedirDecision(peticion: PeticionDecision, signal: AbortSignal): Promise<unknown>
  /** Devuelve el texto completo de la explicacion (resumen, linea `---`, detalle). */
  pedirExplicacion(peticion: PeticionExplicacion, signal: AbortSignal): Promise<string>
  reloj?: Reloj
  limiteDecisionMs?: number
  limiteExplicacionMs?: number
}

const relojReal: Reloj = {
  setTimeout: (accion, ms) => globalThis.setTimeout(accion, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

/** Separa el texto de Gemini en resumen y detalle por la linea que solo trae `---`. */
export function separarExplicacion(texto: string): { resumen: string; detalle: string | null } {
  const corte = /^[ \t]*-{3,}[ \t]*$/m.exec(texto)
  if (!corte) return { resumen: texto.trim(), detalle: null }
  return {
    resumen: texto.slice(0, corte.index).trim(),
    detalle: texto.slice(corte.index + corte[0].length).trim(),
  }
}

function textoCompleto(texto: string): string {
  const { resumen, detalle } = separarExplicacion(texto)
  return [resumen, detalle].filter(Boolean).join('\n\n')
}

export interface Orquestador {
  /** Empieza una recomendacion; cancela la anterior si seguia en curso. */
  iniciar(entrada: EntradaRecomendacion): void
  /** Aborta peticiones y temporizadores; despues no se emite nada. */
  cancelar(): void
}

export function crearOrquestador(deps: DepsOrquestador, emitir: (evento: EventoRecomendacion) => void): Orquestador {
  let actual: { vivo: boolean; cancelar: () => void } | null = null

  function cancelar() {
    actual?.cancelar()
    actual = null
  }

  function iniciar(entrada: EntradaRecomendacion) {
    cancelar()
    if (entrada.candidatos.length === 0) return

    const reloj = deps.reloj ?? relojReal
    const control = new AbortController()
    const controlDecision = new AbortController()
    const temporizadores = new Set<unknown>()
    const corrida = {
      vivo: true,
      cancelar: () => {
        corrida.vivo = false
        control.abort()
        controlDecision.abort()
        temporizadores.forEach((t) => reloj.clearTimeout(t))
        temporizadores.clear()
      },
    }
    actual = corrida

    const emitirVivo = (evento: EventoRecomendacion) => {
      if (corrida.vivo) emitir(evento)
    }
    const programar = (accion: () => void, ms: number) => {
      const id = reloj.setTimeout(() => {
        temporizadores.delete(id)
        if (corrida.vivo) accion()
      }, ms)
      temporizadores.add(id)
      return id
    }
    const quitar = (id: unknown) => {
      reloj.clearTimeout(id)
      temporizadores.delete(id)
    }

    const motor = decisionDelMotor(entrada.candidatos, entrada.enfoques)

    if (deps.demo) {
      emitirVivo({ tipo: 'decision', decision: motor, definitiva: true })
      emitirVivo({ tipo: 'mostrarPreset', texto: entrada.armarPreset(motor), motivo: 'demo' })
      emitirVivo({ tipo: 'error', causa: 'demo' })
      return
    }

    const base: PeticionDecision = {
      contexto: entrada.contexto,
      enfoques: entrada.enfoques,
      escenario: entrada.escenario,
      candidatos: entrada.candidatos,
      perspectiva: entrada.perspectiva,
    }

    let definitiva: Decision | null = null
    let preset = ''
    let presetMostrado = false
    let textoMostrado = false
    let errorEmitido = false

    const mostrarPreset = (motivo: MotivoPreset) => {
      if (presetMostrado || textoMostrado) return
      presetMostrado = true
      emitirVivo({ tipo: 'mostrarPreset', texto: preset || entrada.armarPreset(definitiva ?? motor), motivo })
    }

    const avisarError = () => {
      if (errorEmitido) return
      errorEmitido = true
      emitirVivo({ tipo: 'error', causa: 'sin_conexion' })
    }

    emitirVivo({ tipo: 'decision', decision: motor, definitiva: false })

    const idLimiteExplicacion = programar(() => {
      if (!definitiva) resolver(motor)
      mostrarPreset('tarde')
    }, deps.limiteExplicacionMs ?? LIMITE_EXPLICACION_MS)

    const alLlegarTexto = (texto: string) => {
      if (!corrida.vivo) return
      if (texto.trim() === '') {
        alFallar()
        return
      }
      if (presetMostrado) {
        // Llego despues del texto guardado: solo el detalle, para no repetir el resumen.
        const { resumen, detalle } = separarExplicacion(texto)
        const seguimiento = detalle === null ? resumen : detalle
        if (seguimiento) emitirVivo({ tipo: 'seguimiento', texto: seguimiento })
        return
      }
      quitar(idLimiteExplicacion)
      textoMostrado = true
      emitirVivo({ tipo: 'mostrarExplicacion', texto: textoCompleto(texto) })
    }

    function alFallar() {
      if (!corrida.vivo) return
      quitar(idLimiteExplicacion)
      mostrarPreset('error')
      avisarError()
    }

    function resolver(decision: Decision) {
      if (definitiva || !corrida.vivo) return
      definitiva = decision
      quitar(idLimiteDecision)
      controlDecision.abort()
      emitirVivo({ tipo: 'decision', decision, definitiva: true })
      preset = entrada.armarPreset(decision)
      const peticion: PeticionExplicacion = {
        ...base,
        decision: { rotacionId: decision.rotacionId, enfoquePrincipal: decision.enfoquePrincipal, aviso: decision.aviso, origen: decision.origen },
        preset,
      }
      void (async () => deps.pedirExplicacion(peticion, control.signal))().then(alLlegarTexto, alFallar)
    }

    const idLimiteDecision = programar(() => resolver(motor), deps.limiteDecisionMs ?? LIMITE_DECISION_MS)

    void (async () => deps.pedirDecision(base, controlDecision.signal))().then(
      (respuesta) => {
        if (definitiva || !corrida.vivo) return
        resolver(validarDecision(respuesta, entrada.candidatos, entrada.enfoques))
      },
      () => {
        if (definitiva || !corrida.vivo) return
        resolver(motor)
      },
    )
  }

  return { iniciar, cancelar }
}
