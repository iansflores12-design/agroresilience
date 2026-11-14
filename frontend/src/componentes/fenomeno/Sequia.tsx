import { useEffect, useRef, useState } from 'react'
import { estadoHumedad, type Zona } from '../../datos/zonas'
import { Boton } from '../Boton'
import { Chip } from '../Chip'
import type { NombreIcono } from '../iconos'
import { Medidor } from '../Medidor'
import { nivelDePercentil } from '../nivelMedidor'
import { SelectorDeslizable } from '../SelectorDeslizable/SelectorDeslizable'
import { Tarjeta } from '../Tarjeta'
import { crearEscena, type Escena } from './escena'
import estilos from './Sequia.module.css'
import {
  cultivoDibujado,
  nivelDeIntensidad,
  PALABRAS_NIVEL,
  PASOS,
  textoFenomeno,
  valorDeHoy,
  type ZonaEscena,
} from './textos'

/** Segundos que tarda "Ver cómo avanza" en recorrer todo el deslizador. */
const SEGUNDOS_RECORRIDO = 12

const ZONAS: { id: ZonaEscena; nombre: string; icono: NombreIcono }[] = [
  { id: 'cielo', nombre: 'Cielo', icono: 'wb_sunny' },
  { id: 'suelo', nombre: 'Suelo', icono: 'landscape' },
  { id: 'raices', nombre: 'Raíces', icono: 'psychiatry' },
  { id: 'cultivo', nombre: 'Cultivo', icono: 'grass' },
  { id: 'rio', nombre: 'Río', icono: 'water_drop' },
]

function movimientoReducido(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Explicacion grafica de la sequia: escena dibujada, un deslizador de intensidad y una frase
 * que cambia con la zona y el nivel. El dibujo vive en escena.ts; aqui solo hay el bucle.
 */
export function Sequia({ zona, cultivoId }: { zona: Zona | null; cultivoId: string | null }) {
  const hoy = valorDeHoy(zona)
  const inicial = hoy ?? 0
  const [reducir] = useState(movimientoReducido)
  const [valor, setValor] = useState(inicial)
  const [zonaEscena, setZonaEscena] = useState<ZonaEscena>('cielo')
  const [jugando, setJugando] = useState(false)
  const [idZona, setIdZona] = useState(zona?.id ?? null)
  // Al cambiar de zona, el deslizador vuelve a "hoy" de la nueva zona.
  if ((zona?.id ?? null) !== idZona) {
    setIdZona(zona?.id ?? null)
    setValor(inicial)
    setJugando(false)
  }

  const svgRef = useRef<SVGSVGElement>(null)
  const escenaRef = useRef<Escena | null>(null)
  // Estado que lee el bucle sin re-renderizar: intensidad actual y objetivo (0 a 1).
  const ctl = useRef({ t: inicial / PASOS, objetivo: inicial / PASOS, jugando: false, tope: 1 })
  const dibujarRef = useRef<() => void>(() => {})
  const cultivo = cultivoDibujado(cultivoId)

  // Escena y bucle: un solo requestAnimationFrame, pausado si no se ve la escena o la pestana.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const escena = crearEscena(svg)
    escenaRef.current = escena
    let raf = 0
    let visible = true
    let previo = 0

    const medir = () => {
      const r = svg.getBoundingClientRect()
      escena.redimensionar(r.width, r.height)
    }
    medir()

    const bucle = (ahora: number) => {
      raf = 0
      const c = ctl.current
      const dt = Math.min(0.05, (ahora - previo) / 1000)
      previo = ahora
      if (c.jugando) {
        c.objetivo = Math.min(c.tope, c.objetivo + dt / SEGUNDOS_RECORRIDO)
        const v = Math.round(c.objetivo * PASOS)
        setValor((anterior) => (anterior === v ? anterior : v))
        if (c.objetivo >= c.tope) {
          c.jugando = false
          setJugando(false)
        }
      }
      c.t += (c.objetivo - c.t) * (1 - Math.pow(0.02, dt))
      escena.cuadro({ dt, tm: ahora / 1000, t: c.t, animar: true })
      arrancar()
    }
    function arrancar() {
      if (raf || reducir || !visible || document.hidden) return
      previo = performance.now()
      raf = requestAnimationFrame(bucle)
    }
    const parar = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    // Con movimiento reducido no hay bucle: se dibuja un cuadro cuando algo cambia.
    dibujarRef.current = () => {
      ctl.current.t = ctl.current.objetivo
      escena.cuadro({ dt: 0, tm: 0, t: ctl.current.t, animar: false })
    }

    const alVisibilidad = () => (document.hidden ? parar() : arrancar())
    document.addEventListener('visibilitychange', alVisibilidad)
    const observador =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entradas) => {
            visible = entradas[entradas.length - 1].isIntersecting
            if (visible) arrancar()
            else parar()
          })
    observador?.observe(svg)
    const tamano =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            medir()
            if (reducir) dibujarRef.current()
          })
    tamano?.observe(svg)

    // Primer cuadro inmediato (la camara no se desliza desde cero) y arranque del bucle.
    escena.cuadro({ dt: 0, tm: 0, t: ctl.current.t, animar: false })
    arrancar()

    return () => {
      parar()
      document.removeEventListener('visibilitychange', alVisibilidad)
      observador?.disconnect()
      tamano?.disconnect()
      escena.limpiar()
      escenaRef.current = null
      dibujarRef.current = () => {}
    }
  }, [reducir])

  useEffect(() => {
    escenaRef.current?.enfocar(zonaEscena)
    if (reducir) dibujarRef.current()
  }, [zonaEscena, reducir])

  useEffect(() => {
    escenaRef.current?.resaltar(cultivo)
    if (reducir) dibujarRef.current()
  }, [cultivo, reducir])

  // El deslizador manda sobre el objetivo salvo mientras la animacion avanza sola.
  useEffect(() => {
    ctl.current.jugando = jugando
    if (!jugando) ctl.current.objetivo = valor / PASOS
    if (reducir) dibujarRef.current()
  }, [valor, jugando, reducir])

  // Sin movimiento reducido y sin dato de hoy, la escena avanza sola un rato para mostrar de que va.
  const sinDatoAlMontar = useRef(hoy === null)
  useEffect(() => {
    if (reducir || !sinDatoAlMontar.current) return
    const id = window.setTimeout(() => {
      if (ctl.current.objetivo !== 0) return
      ctl.current.tope = 0.72
      setJugando(true)
    }, 1200)
    return () => window.clearTimeout(id)
  }, [reducir])

  const nivel = nivelDeIntensidad(valor / PASOS)
  const texto = textoFenomeno(zonaEscena, nivel, cultivoId)

  const alternarJuego = () => {
    if (jugando) {
      setJugando(false)
      return
    }
    ctl.current.tope = 1
    if (ctl.current.objetivo >= 0.95) {
      ctl.current.objetivo = 0
      setValor(0)
    }
    setJugando(true)
  }

  const alCambiar = (v: number) => {
    setJugando(false)
    setValor(v)
  }

  return (
    <div className={estilos.raiz} data-fenomeno-nivel={nivel}>
      <div className={estilos.lienzo}>
        <svg
          ref={svgRef}
          className={estilos.escena}
          role="img"
          aria-label="Dibujo de un campo con maíz y frijol, el cielo, el suelo, las raíces y un río, que cambia según cuánta sequía haya"
        />
      </div>

      <div className={estilos.control}>
        {zona && hoy !== null && (
          <div className={estilos['linea-hoy']}>
            <span>Así está {zona.nombre} hoy</span>
            <Medidor nivel={nivelDePercentil(zona.humedad?.percentil)} />
            <span className="tipo-nota">{estadoHumedad(zona)}</span>
          </div>
        )}
        <div className={estilos.palabras}>
          <p className={estilos.pregunta}>¿Cuánta sequía?</p>
          {hoy !== null && valor === hoy && <span className={estilos.hoy}>Hoy</span>}
          <span className={estilos.palabra}>{PALABRAS_NIVEL[nivel]}</span>
        </div>
        <SelectorDeslizable
          etiqueta="Cuánta sequía"
          valor={valor}
          min={0}
          max={PASOS}
          marcaMayorCada={0}
          unidad="de 20"
          alCambiar={alCambiar}
          textoValor={(v) => PALABRAS_NIVEL[nivelDeIntensidad(v / PASOS)]}
        />
        <div className={estilos.acciones}>
          {!reducir && (
            <Boton variante="tonal" icono={jugando ? 'pause' : 'play_arrow'} onClick={alternarJuego}>
              {jugando ? 'Pausar' : 'Ver cómo avanza'}
            </Boton>
          )}
          {hoy !== null && valor !== hoy && (
            <Boton variante="texto" icono="undo" onClick={() => alCambiar(hoy)}>
              Volver a hoy
            </Boton>
          )}
        </div>
      </div>

      <div role="group" aria-label="Qué mirar" className={estilos.zonas}>
        {ZONAS.map((z) => (
          <Chip
            key={z.id}
            variante="filtro"
            icono={z.icono}
            seleccionado={z.id === zonaEscena}
            onClick={() => setZonaEscena(z.id)}
          >
            {z.nombre}
          </Chip>
        ))}
      </div>

      <Tarjeta>
        <p className={estilos.texto} aria-live="polite">
          {texto}
        </p>
        <p className={estilos.pie}>Dibujo de ejemplo: las cifras no son mediciones.</p>
      </Tarjeta>
    </div>
  )
}
