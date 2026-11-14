// Sonido y vibracion con WebAudio, sin archivos de audio. El AudioContext se crea de forma
// perezosa en el primer uso (que ocurre tras un gesto del usuario). Si no hay WebAudio
// (jsdom, navegadores antiguos) o el sonido esta apagado, las funciones no hacen nada.

type ConstructorAudio = typeof AudioContext

let activo = true
let contexto: AudioContext | null | undefined
let ultimoTic = 0

/** Maximo de unos 40 tics por segundo. */
const INTERVALO_MIN_TIC_MS = 25

export function configurarSonido(valor: boolean): void {
  activo = valor
}

function obtenerContexto(): AudioContext | null {
  if (!activo) return null
  if (contexto === undefined) {
    try {
      const global = globalThis as typeof globalThis & { webkitAudioContext?: ConstructorAudio }
      const Constructor = global.AudioContext ?? global.webkitAudioContext
      contexto = Constructor ? new Constructor() : null
    } catch {
      contexto = null
    }
  }
  if (contexto && contexto.state === 'suspended') {
    contexto.resume().catch(() => {})
  }
  return contexto
}

interface Nota {
  frecuencia: number
  /** Frecuencia final si la nota se desliza. */
  hasta?: number
  inicio: number
  duracion: number
  volumen: number
  tipo?: OscillatorType
}

function sonarNotas(notas: Nota[]): void {
  const ctx = obtenerContexto()
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    for (const n of notas) {
      const osc = ctx.createOscillator()
      const ganancia = ctx.createGain()
      const ini = t0 + n.inicio
      osc.type = n.tipo ?? 'sine'
      osc.frequency.setValueAtTime(n.frecuencia, ini)
      if (n.hasta) osc.frequency.exponentialRampToValueAtTime(n.hasta, ini + n.duracion)
      ganancia.gain.setValueAtTime(0.0001, ini)
      ganancia.gain.exponentialRampToValueAtTime(n.volumen, ini + 0.004)
      ganancia.gain.exponentialRampToValueAtTime(0.0001, ini + n.duracion)
      osc.connect(ganancia).connect(ctx.destination)
      osc.start(ini)
      osc.stop(ini + n.duracion + 0.02)
    }
  } catch {
    // El sonido es un complemento: nunca debe romper la interfaz.
  }
}

/** Marca de la regla. Mas grave cuando la marca es mayor. */
export function tic(mayor = false): void {
  const ahora = Date.now()
  if (ahora - ultimoTic < INTERVALO_MIN_TIC_MS) return
  ultimoTic = ahora
  sonarNotas([
    {
      frecuencia: mayor ? 900 : 1600,
      inicio: 0,
      duracion: mayor ? 0.035 : 0.02,
      volumen: mayor ? 0.07 : 0.045,
      tipo: 'triangle',
    },
  ])
}

/** Al asentarse el selector: un golpe suave y grave. */
export function asentar(): void {
  sonarNotas([{ frecuencia: 260, hasta: 170, inicio: 0, duracion: 0.12, volumen: 0.09 }])
}

/** Confirmacion: dos notas ascendentes. */
export function confirmar(): void {
  sonarNotas([
    { frecuencia: 660, inicio: 0, duracion: 0.09, volumen: 0.06 },
    { frecuencia: 880, inicio: 0.08, duracion: 0.14, volumen: 0.06 },
  ])
}

export function vibrar(ms: number): void {
  if (!activo) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms)
    }
  } catch {
    // Sin soporte de vibracion.
  }
}
