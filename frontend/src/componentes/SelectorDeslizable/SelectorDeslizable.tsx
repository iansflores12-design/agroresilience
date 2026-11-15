import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { asentar, tic, vibrar } from '../../lib/sonido'
import { BotonIcono } from '../BotonIcono'
import estilos from './SelectorDeslizable.module.css'

export interface PropsSelectorDeslizable {
  etiqueta: string
  valor: number
  min: number
  max: number
  /** Distancia entre marcas. Por defecto 1. */
  paso?: number
  /** Cada cuantas unidades hay una marca mayor con numero. Por defecto 4. */
  marcaMayorCada?: number
  unidad: string
  alCambiar(valor: number): void
  alSoltar?(valor: number): void
  /** Texto para aria-valuetext. Por defecto "<valor> <unidad>". */
  textoValor?(valor: number): string
}

/** Separacion entre marcas, en px. */
const PASO_PX = 18
/** Movimiento minimo para considerar que hubo arrastre y no un toque. */
const UMBRAL_ARRASTRE = 4
/** Rigidez y amortiguacion del resorte de ajuste (unidades por segundo). */
const RIGIDEZ = 220
const AMORTIGUACION = 2 * Math.sqrt(RIGIDEZ) * 0.8
/** Friccion de la inercia (1/s) y velocidad por debajo de la cual se ajusta (px/s). */
const FRICCION = 5
const VELOCIDAD_AJUSTE = 120
const VELOCIDAD_MAX = 4000
/** Distancia de rueda que equivale a un paso. */
const RUEDA_POR_PASO = 40
const DIM_ELASTICA = 56

function limitar(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

/** Resistencia elastica: pasado el extremo, el desplazamiento rinde cada vez menos. */
function elastico(crudo: number, maximo: number): number {
  if (crudo < 0) return -excedente(-crudo)
  if (crudo > maximo) return maximo + excedente(crudo - maximo)
  return crudo
}

function excedente(o: number): number {
  return DIM_ELASTICA * (1 - 1 / ((0.55 * o) / DIM_ELASTICA + 1))
}

function movimientoReducido(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

interface Muestra {
  t: number
  x: number
}

interface Arrastre {
  id: number
  x0: number
  pos0: number
  movido: boolean
  muestras: Muestra[]
}

/**
 * Regla horizontal que se desliza bajo una aguja fija al centro (DISENO.md, seccion 7).
 * El valor es controlado: `valor` manda cuando no hay interaccion en curso.
 */
export function SelectorDeslizable({
  etiqueta,
  valor,
  min,
  max,
  paso = 1,
  marcaMayorCada = 4,
  unidad,
  alCambiar,
  alSoltar,
  textoValor,
}: PropsSelectorDeslizable) {
  const { t } = useTranslation()
  const total = Math.max(0, Math.round((max - min) / paso))
  const raiz = useRef<HTMLDivElement>(null)
  const regla = useRef<HTMLDivElement>(null)
  const props = useRef({ alCambiar, alSoltar, min, paso, total, marcaMayorCada })
  // Estado mutable del motor: posicion en px, indice de marca actual y objetivo, animacion y arrastre.
  const motor = useRef({
    pos: 0,
    idx: 0,
    objetivo: 0,
    animando: false,
    raf: 0,
    arrastre: null as Arrastre | null,
    rueda: 0,
  })

  useLayoutEffect(() => {
    props.current = { alCambiar, alSoltar, min, paso, total, marcaMayorCada }
  })

  const ponerPx = useCallback((px: number) => {
    motor.current.pos = px
    if (regla.current) regla.current.style.transform = `translate3d(${-px}px, 0, 0)`
  }, [])

  const emitir = useCallback((idx: number) => {
    const { min: m, paso: p, marcaMayorCada: mayor } = props.current
    const v = m + idx * p
    tic(mayor > 0 && v % mayor === 0)
    vibrar(3)
    props.current.alCambiar(v)
  }, [])

  /** Mueve la regla y emite un cambio por cada marca cruzada. */
  const mover = useCallback(
    (px: number) => {
      const s = motor.current
      ponerPx(px)
      const idx = limitar(Math.round(px / PASO_PX), 0, props.current.total)
      const dir = idx > s.idx ? 1 : -1
      while (s.idx !== idx) {
        s.idx += dir
        emitir(s.idx)
      }
    },
    [ponerPx, emitir],
  )

  const parar = useCallback(() => {
    cancelAnimationFrame(motor.current.raf)
    motor.current.animando = false
  }, [])

  const terminar = useCallback(() => {
    const s = motor.current
    s.animando = false
    s.objetivo = s.idx
    asentar()
    props.current.alSoltar?.(props.current.min + s.idx * props.current.paso)
  }, [])

  /** Salto directo (movimiento reducido): un solo cambio al valor final. */
  const saltarA = useCallback(
    (idx: number) => {
      const s = motor.current
      parar()
      ponerPx(idx * PASO_PX)
      if (idx !== s.idx) {
        s.idx = idx
        emitir(idx)
      }
      terminar()
    },
    [parar, ponerPx, emitir, terminar],
  )

  /** Inercia con la velocidad dada (px/s) y, al frenar, resorte a la marca mas cercana. */
  const correr = useCallback(
    (velocidad: number, objetivoIdx: number | null) => {
      parar()
      const s = motor.current
      s.animando = true
      let v = limitar(velocidad, -VELOCIDAD_MAX, VELOCIDAD_MAX)
      let objetivo = objetivoIdx
      let ultimo = performance.now()
      const cuadro = (t: number) => {
        const dt = limitar((t - ultimo) / 1000, 0, 0.032)
        ultimo = t
        const maxPx = props.current.total * PASO_PX
        let x = s.pos
        if (objetivo === null) {
          x += v * dt
          v *= Math.exp(-FRICCION * dt)
          const fuera = x < 0 || x > maxPx
          if (fuera) objetivo = x < 0 ? 0 : props.current.total
          else if (Math.abs(v) < VELOCIDAD_AJUSTE) objetivo = limitar(Math.round(x / PASO_PX), 0, props.current.total)
        } else {
          const destino = objetivo * PASO_PX
          const n = Math.max(1, Math.ceil(dt * 240))
          const h = dt / n
          for (let i = 0; i < n; i++) {
            v += (-RIGIDEZ * (x - destino) - AMORTIGUACION * v) * h
            x += v * h
          }
          if (Math.abs(x - destino) < 0.3 && Math.abs(v) < 10) {
            mover(destino)
            terminar()
            return
          }
        }
        mover(x)
        s.raf = requestAnimationFrame(cuadro)
      }
      s.raf = requestAnimationFrame(cuadro)
    },
    [parar, mover, terminar],
  )

  /** Lleva la regla a una marca: con resorte, o de golpe si se pidio movimiento reducido. */
  const irA = useCallback(
    (destino: number) => {
      const s = motor.current
      const idx = limitar(destino, 0, props.current.total)
      if (idx === s.objetivo && !s.animando && s.pos === idx * PASO_PX) return
      s.objetivo = idx
      if (movimientoReducido()) saltarA(idx)
      else correr(0, idx)
    },
    [saltarA, correr],
  )

  // Sincroniza la regla con `valor` cuando no hay arrastre ni animacion propia.
  useLayoutEffect(() => {
    const s = motor.current
    if (s.animando || s.arrastre) return
    const idx = limitar(Math.round((valor - min) / paso), 0, total)
    s.idx = idx
    s.objetivo = idx
    ponerPx(idx * PASO_PX)
  }, [valor, min, paso, total, ponerPx])

  useEffect(() => parar, [parar])

  // La rueda necesita un oyente no pasivo para poder cancelar el desplazamiento de la pagina.
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const alRueda = (e: WheelEvent) => {
      const s = motor.current
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      const haciaMas = delta > 0
      const limite = haciaMas ? s.objetivo >= props.current.total : s.objetivo <= 0
      if (limite) return
      e.preventDefault()
      s.rueda += delta
      const pasos = Math.trunc(s.rueda / RUEDA_POR_PASO)
      if (pasos !== 0) {
        s.rueda -= pasos * RUEDA_POR_PASO
        irA(s.objetivo + pasos)
      }
    }
    el.addEventListener('wheel', alRueda, { passive: false })
    return () => el.removeEventListener('wheel', alRueda)
  }, [irA])

  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const s = motor.current
    parar()
    s.arrastre = { id: e.pointerId, x0: e.clientX, pos0: s.pos, movido: false, muestras: [{ t: e.timeStamp, x: s.pos }] }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Sin captura de puntero (entornos de prueba): el arrastre sigue funcionando.
    }
  }

  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const s = motor.current
    const a = s.arrastre
    if (!a || a.id !== e.pointerId) return
    const dx = e.clientX - a.x0
    if (!a.movido && Math.abs(dx) > UMBRAL_ARRASTRE) a.movido = true
    if (!a.movido) return
    mover(elastico(a.pos0 - dx, props.current.total * PASO_PX))
    a.muestras.push({ t: e.timeStamp, x: s.pos })
    if (a.muestras.length > 6) a.muestras.shift()
  }

  const alSoltarPuntero = (e: PointerEvent<HTMLDivElement>, cancelado: boolean) => {
    const s = motor.current
    const a = s.arrastre
    if (!a || a.id !== e.pointerId) return
    s.arrastre = null
    if (!a.movido) {
      if (cancelado) return irA(s.idx)
      // Toque sin arrastre: lleva la marca tocada al centro.
      const caja = e.currentTarget.getBoundingClientRect()
      const objetivoPx = s.pos + (e.clientX - (caja.left + caja.width / 2))
      return irA(Math.round(objetivoPx / PASO_PX))
    }
    if (movimientoReducido()) return saltarA(limitar(Math.round(s.pos / PASO_PX), 0, props.current.total))
    // Velocidad de los ultimos 100 ms; si el dedo se detuvo antes de soltar, no hay inercia.
    const ultima = a.muestras[a.muestras.length - 1]
    const util = a.muestras.filter((m) => ultima.t - m.t <= 100)
    const primera = util[0]
    let v = 0
    if (primera && ultima.t > primera.t && e.timeStamp - ultima.t < 80) {
      v = ((ultima.x - primera.x) / (ultima.t - primera.t)) * 1000
    }
    s.objetivo = s.idx
    correr(v, null)
  }

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = motor.current
    const salto = Math.max(1, Math.round(marcaMayorCada / paso))
    let destino: number
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        destino = s.objetivo + 1
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        destino = s.objetivo - 1
        break
      case 'PageUp':
        destino = s.objetivo + salto
        break
      case 'PageDown':
        destino = s.objetivo - salto
        break
      case 'Home':
        destino = 0
        break
      case 'End':
        destino = total
        break
      default:
        return
    }
    e.preventDefault()
    irA(destino)
  }

  const idxValor = limitar(Math.round((valor - min) / paso), 0, total)
  const valorActual = min + idxValor * paso
  const marcas = Array.from({ length: total + 1 }, (_, i) => {
    const v = min + i * paso
    return { i, v, mayor: marcaMayorCada > 0 && v % marcaMayorCada === 0 }
  })

  return (
    <div className={estilos.conjunto}>
      <BotonIcono
        icono="remove"
        etiqueta={t('selector.disminuir', { etiqueta: etiqueta.toLowerCase() })}
        variante="tonal"
        disabled={idxValor <= 0}
        onClick={() => irA(motor.current.objetivo - 1)}
      />
      <div
        ref={raiz}
        className={estilos.raiz}
        role="slider"
        tabIndex={0}
        aria-label={etiqueta}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valorActual}
        aria-valuetext={textoValor ? textoValor(valorActual) : `${valorActual} ${unidad}`}
        onKeyDown={alTeclear}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={(e) => alSoltarPuntero(e, false)}
        onPointerCancel={(e) => alSoltarPuntero(e, true)}
      >
        <div className={estilos.ventana} aria-hidden="true">
          <div ref={regla} className={estilos.regla}>
            {marcas.map((m) => (
              <span
                key={m.i}
                className={m.mayor ? `${estilos.marca} ${estilos.mayor}` : estilos.marca}
                style={{ left: `${m.i * PASO_PX}px` }}
              >
                {m.mayor && <span className={estilos.numero}>{m.v}</span>}
              </span>
            ))}
          </div>
        </div>
        <span className={estilos.aguja} aria-hidden="true" />
      </div>
      <BotonIcono
        icono="add"
        etiqueta={t('selector.aumentar', { etiqueta: etiqueta.toLowerCase() })}
        variante="tonal"
        disabled={idxValor >= total}
        onClick={() => irA(motor.current.objetivo + 1)}
      />
    </div>
  )
}
