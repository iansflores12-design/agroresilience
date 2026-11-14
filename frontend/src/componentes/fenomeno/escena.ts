// Dibujo imperativo de la escena de la sequia (cielo, suelo, raices, rio, maiz y frijol).
// Portado de la animacion entregada por el usuario, simplificado: sin trigo, estrellas, panel,
// puntos numerados ni foco circular. Los colores salen de variables CSS que define
// Sequia.module.css sobre el <svg>: --e-fondo, --e-suelo, --e-trazo, --e-suave, --e-agua.
// Este archivo no usa React: recibe el <svg> y devuelve un objeto con metodos.

import type { CultivoDibujado, ZonaEscena } from './textos'

const NS = 'http://www.w3.org/2000/svg'
const ANCHO = 1200
const ALTO = 700
/** Linea del suelo (y del horizonte) en coordenadas de la escena. */
const Y_SUELO = 432
const X_FRIJOL = 520
const X_MAIZ = 800

/** Cajas de camara [centroX, centroY, ancho, alto] por zona. */
const CAJAS: Record<ZonaEscena, [number, number, number, number]> = {
  cielo: [640, 150, 1000, 330],
  suelo: [700, 445, 800, 330],
  raices: [680, 590, 900, 340],
  cultivo: [660, 290, 600, 340],
  rio: [150, 470, 440, 250],
}

export interface ParametrosCuadro {
  /** Segundos desde el cuadro anterior (se limita a 0.05). */
  dt: number
  /** Tiempo absoluto en segundos, para el viento y las nubes. */
  tm: number
  /** Intensidad de la sequia, de 0 (normal) a 1 (muy seca). */
  t: number
  /** Falso con movimiento reducido: sin viento, nubes, particulas ni giro, y la camara salta. */
  animar: boolean
}

export interface Escena {
  /** Avisa el tamano en px del lienzo para encuadrar la camara. */
  redimensionar(ancho: number, alto: number): void
  enfocar(zona: ZonaEscena): void
  /** Cultivo a resaltar; null no resalta ninguno. */
  resaltar(cultivo: CultivoDibujado | null): void
  cuadro(p: ParametrosCuadro): void
  /** Quita todo lo dibujado dentro del <svg>. */
  limpiar(): void
}

// ---------- utilidades ----------
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const suave = (a: number, b: number, x: number) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const f = (n: number) => n.toFixed(1)

type Atributos = Record<string, string | number>

/** Crea un elemento SVG. fill y stroke van por estilo para aceptar var(--...). */
function el<K extends keyof SVGElementTagNameMap>(
  etiqueta: K,
  atributos: Atributos,
  padre?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, etiqueta)
  for (const k in atributos) {
    if (k === 'fill' || k === 'stroke') e.style.setProperty(k, String(atributos[k]))
    else e.setAttribute(k, String(atributos[k]))
  }
  padre?.appendChild(e)
  return e
}

/** Generador pseudoaleatorio con semilla (el dibujo es siempre el mismo). */
function rng(semilla: number) {
  let s = semilla
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Punto = [number, number]
const cuad = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, s: number): Punto => {
  const u = 1 - s
  return [u * u * x0 + 2 * u * s * x1 + s * s * x2, u * u * y0 + 2 * u * s * y1 + s * s * y2]
}
const cubica = (p0: Punto, p1: Punto, p2: Punto, p3: Punto, s: number): Punto => {
  const u = 1 - s
  return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * s * p1[i] + 3 * u * s * s * p2[i] + s * s * s * p3[i]) as Punto
}

/** Hoja: curva desde (x,y) con angulo ang, que se curva `curl` radianes a lo largo. */
function hoja(x: number, y: number, ang: number, largo: number, ancho: number, curl: number): string {
  const N = 12
  const izq: string[] = []
  const der: string[] = []
  let px = x
  let py = y
  let a = ang
  const seg = largo / N
  for (let i = 0; i <= N; i++) {
    const s = i / N
    const w = (ancho * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.02)), 0.65)) / 2
    const nx = -Math.sin(a)
    const ny = Math.cos(a)
    izq.push(`${f(px + nx * w)},${f(py + ny * w)}`)
    der.push(`${f(px - nx * w)},${f(py - ny * w)}`)
    px += Math.cos(a) * seg
    py += Math.sin(a) * seg
    a += curl / N
  }
  return 'M' + izq.join('L') + 'L' + der.reverse().join('L') + 'Z'
}

/** Hoja que cae hacia abajo segun hacia donde apunte. */
const hojaCaida = (x: number, y: number, ang: number, largo: number, ancho: number, mag: number) =>
  hoja(x, y, ang, largo, ancho, (Math.cos(ang) >= 0 ? 1 : -1) * mag)

/** Elipse rotada como path. */
function elipse(cx: number, cy: number, rx: number, ry: number, a: number): string {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const d = (a * 180) / Math.PI
  const x1 = cx - rx * c
  const y1 = cy - rx * s
  const x2 = cx + rx * c
  const y2 = cy + rx * s
  return `M${f(x1)},${f(y1)}A${f(rx)},${f(ry)} ${f(d)} 0 1 ${f(x2)},${f(y2)}A${f(rx)},${f(ry)} ${f(d)} 0 1 ${f(x1)},${f(y1)}Z`
}

const viento = (tm: number) => Math.sin(tm * 1.1) * 0.6 + Math.sin(tm * 2.3 + 0.7) * 0.25 + Math.sin(tm * 0.37) * 0.4

interface Raiz {
  e: SVGPathElement
  base: number
}
interface Punta {
  x: number
  y: number
  e: SVGCircleElement
}
interface Particula {
  e: SVGCircleElement
  on: boolean
  x: number
  y: number
  vx: number
  vy: number
  vida: number
  max: number
  op: number
  g: number
}

let contadorEscenas = 0

export function crearEscena(svg: SVGSVGElement): Escena {
  const id = `esc${++contadorEscenas}`
  svg.replaceChildren()
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`)
  svg.setAttribute('preserveAspectRatio', 'none')

  // Definiciones: tramas y recorte del rio.
  const defs = el('defs', {}, svg)
  const trama = el('pattern', { id: `${id}-agua`, width: 12, height: 6, patternUnits: 'userSpaceOnUse' }, defs)
  el('path', { d: 'M0,3 L8,3', stroke: 'var(--e-agua)', 'stroke-width': 1.6 }, trama)
  const recorte = el('clipPath', { id: `${id}-rio` }, defs)
  el('path', { d: 'M18,432 C62,434 80,514 140,514 C200,514 220,434 264,432 Z' }, recorte)

  const capa = (padre: Element = svg, atributos: Atributos = {}) => el('g', atributos, padre)

  // ---------- cielo ----------
  el('rect', { x: -5000, y: -5000, width: 11000, height: 11000, fill: 'var(--e-fondo)' }, svg)
  const sol = capa(svg, { fill: 'none', stroke: 'var(--e-trazo)' })
  const rayos = capa(sol)
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6
    el(
      'line',
      {
        x1: 1010 + Math.cos(a) * 62,
        y1: 110 + Math.sin(a) * 62,
        x2: 1010 + Math.cos(a) * 90,
        y2: 110 + Math.sin(a) * 90,
        stroke: 'var(--e-trazo)',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      },
      rayos,
    )
  }
  const nucleoSol = el('circle', { cx: 1010, cy: 110, r: 44, fill: 'var(--e-fondo)', stroke: 'var(--e-trazo)', 'stroke-width': 3 }, sol)

  const grupoNubes = capa()
  const nubes = [
    [230, 95, 1.1],
    [420, 62, 0.9],
    [560, 125, 1.2],
    [330, 150, 0.7],
  ].map(([x, y, s]) => {
    const g = capa(grupoNubes)
    el(
      'path',
      {
        d: 'M-52,30 A22,22 0 0 1 -44,-8 A30,30 0 0 1 6,-30 A27,27 0 0 1 52,-22 A22,22 0 0 1 82,8 A15,15 0 0 1 76,30 Z',
        transform: `scale(${s})`,
        fill: 'var(--e-fondo)',
        stroke: 'var(--e-trazo)',
        'stroke-width': 2.5,
      },
      g,
    )
    return { g, x, y }
  })

  // ---------- colinas y suelo ----------
  el(
    'path',
    {
      d: 'M-5000,432 L-400,432 L-200,330 L40,372 L230,300 L420,360 L620,290 L820,350 L1020,300 L1220,350 L1400,320 L1600,432 L6000,432',
      fill: 'var(--e-fondo)',
      stroke: 'var(--e-suave)',
      'stroke-width': 1.5,
    },
    svg,
  )
  el(
    'path',
    {
      d: 'M-5000,432 L-300,432 C-100,400 100,380 300,398 C480,414 620,370 800,384 C980,398 1100,370 1300,392 C1450,408 1500,420 1600,432 L6000,432',
      fill: 'var(--e-fondo)',
      stroke: 'var(--e-suave)',
      'stroke-width': 2,
    },
    svg,
  )
  el('rect', { x: -5000, y: Y_SUELO, width: 11000, height: 11000, fill: 'var(--e-suelo)' }, svg)

  // Gotitas de humedad: solo se ven por encima del frente de sequedad.
  const grupoHumedad = capa()
  const humedad: { y: number; e: SVGCircleElement }[] = []
  {
    const r = rng(11)
    for (let i = 0; i < 150; i++) {
      const x = 280 + r() * 940
      const y = 448 + r() * 250
      humedad.push({ y, e: el('circle', { cx: x, cy: y, r: 2 + r() * 2, fill: 'var(--e-agua)' }, grupoHumedad) })
    }
  }

  // ---------- raices (una capa por cultivo, para poder resaltarlas) ----------
  const grupoRaices: Record<CultivoDibujado, SVGGElement> = { frijol: capa(), maiz: capa() }
  const raices: Record<CultivoDibujado, Raiz[]> = { frijol: [], maiz: [] }
  const puntas: Record<CultivoDibujado, Punta[]> = { frijol: [], maiz: [] }
  const grupoPuntas: Record<CultivoDibujado, SVGGElement> = {
    frijol: capa(grupoRaices.frijol),
    maiz: capa(grupoRaices.maiz),
  }

  function generarRaices(cultivo: CultivoDibujado, x0: number, prof: number, n: number, abre: number, grosor: number, semilla: number) {
    const r = rng(semilla)
    const g = grupoRaices[cultivo]
    const nuevaRaiz = (d: string, base: number) => {
      const e = el('path', { d, fill: 'none', stroke: 'var(--e-suave)', 'stroke-width': base, 'stroke-linecap': 'round' }, g)
      g.insertBefore(e, grupoPuntas[cultivo])
      raices[cultivo].push({ e, base })
    }
    for (let i = 0; i < n; i++) {
      let x = x0 + (r() - 0.5) * 12
      let y = 434
      let a = Math.PI / 2 + (r() - 0.5) * abre * 2
      const L = prof * (0.55 + r() * 0.45)
      const N = 14
      let d = `M${f(x)},${y}`
      for (let s = 0; s < N; s++) {
        a += (r() - 0.5) * 0.35
        a = a * 0.9 + (Math.PI / 2) * 0.1
        x += (Math.cos(a) * L) / N
        y += (Math.sin(a) * L) / N
        d += `L${f(x)},${f(y)}`
        if (s > 2 && r() < 0.32) {
          let bx = x
          let by = y
          let ba = a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6)
          const bl = 8 + L * 0.22 * r()
          let bd = `M${f(bx)},${f(by)}`
          for (let k = 0; k < 5; k++) {
            ba += (r() - 0.5) * 0.4
            bx += (Math.cos(ba) * bl) / 5
            by += (Math.sin(ba) * bl) / 5
            bd += `L${f(bx)},${f(by)}`
          }
          nuevaRaiz(bd, grosor * 0.5)
          puntas[cultivo].push({ x: bx, y: by, e: null as unknown as SVGCircleElement })
        }
      }
      nuevaRaiz(d, grosor)
      puntas[cultivo].push({ x, y, e: null as unknown as SVGCircleElement })
    }
  }
  generarRaices('frijol', X_FRIJOL, 120, 1, 0.08, 3, 41) // frijol: raiz principal corta
  generarRaices('frijol', X_FRIJOL, 70, 8, 1.25, 2.2, 42) //   y laterales superficiales
  generarRaices('maiz', X_MAIZ, 205, 16, 0.75, 2.8, 51) // maiz: fibrosas y hondas
  for (const c of ['frijol', 'maiz'] as const) {
    for (const p of puntas[c]) {
      p.e = el('circle', { cx: p.x, cy: p.y, r: 4, stroke: 'var(--e-agua)', 'stroke-width': 2.5 }, grupoPuntas[c])
    }
  }

  // ---------- grietas del suelo ----------
  const grietas = capa(svg, { opacity: 0 })
  {
    const r = rng(21)
    let x = 290
    while (x < 1200) {
      const d = 14 + r() * 42
      const w = 2 + r() * 4
      el(
        'path',
        { d: `M${f(x - w)},429L${f(x + w)},429L${f(x + (r() - 0.5) * 6)},${f(430 + d)}Z`, fill: 'var(--e-fondo)', stroke: 'var(--e-trazo)', 'stroke-width': 1.5 },
        grietas,
      )
      x += 22 + r() * 40
    }
  }
  // Linea del horizonte, con el hueco del rio.
  el('path', { d: 'M-5000,432 L18,432 M264,432 L6000,432', stroke: 'var(--e-trazo)', 'stroke-width': 2.5, fill: 'none' }, svg)

  // ---------- rio ----------
  const grupoRio = capa()
  el(
    'path',
    { d: 'M18,432 C62,434 80,514 140,514 C200,514 220,434 264,432', fill: 'var(--e-fondo)', stroke: 'var(--e-trazo)', 'stroke-width': 2.5 },
    grupoRio,
  )
  const recortado = capa(grupoRio, { 'clip-path': `url(#${id}-rio)` })
  const agua = el('rect', { x: 0, y: 436, width: 300, height: 200, fill: `url(#${id}-agua)` }, recortado)
  const lineaAgua = el('line', { x1: 0, x2: 300, y1: 436, y2: 436, stroke: 'var(--e-agua)', 'stroke-width': 3 }, recortado)
  const grietasLecho = capa(recortado, { opacity: 0, fill: 'none', stroke: 'var(--e-trazo)', 'stroke-width': 1.5 })
  {
    let d = ''
    const r = rng(5)
    for (let i = 0; i < 9; i++) {
      let x = 60 + i * 20
      let y = 505 + r() * 8
      d += `M${f(x)},${f(y)}`
      for (let k = 0; k < 3; k++) {
        x += 6 + r() * 8
        y += (r() - 0.5) * 10
        d += `L${f(x)},${f(y)}`
      }
    }
    el('path', { d }, grietasLecho)
  }

  // Pasto de fondo.
  const pasto = el('path', { fill: 'none', stroke: 'var(--e-suave)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, svg)
  {
    let d = ''
    const r = rng(3)
    for (let x = 286; x < 1200; x += 13) {
      const h = 8 + r() * 7
      d += `M${x},430l-3,${-h}M${x},430l0,${-h - 3}M${x},430l3,${-h}`
    }
    pasto.setAttribute('d', d)
  }

  // ---------- plantas ----------
  const grupoPlantas = capa(svg, { 'stroke-linejoin': 'round' })
  const frijol = capa(grupoPlantas)
  const maiz = capa(grupoPlantas)
  const P = {
    bSt: el('path', { fill: 'none', 'stroke-linecap': 'round' }, frijol),
    bPdO: el('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-width': 7 }, frijol),
    bPd: el('path', { fill: 'none', stroke: 'var(--e-fondo)', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, frijol),
    bLv: el('path', { fill: 'var(--e-fondo)' }, frijol),
    bFl: el('path', { fill: 'var(--e-agua)', stroke: 'none' }, frijol),
    cStO: el('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-width': 11 }, maiz),
    cSt: el('path', { fill: 'none', stroke: 'var(--e-fondo)', 'stroke-width': 8, 'stroke-linecap': 'round' }, maiz),
    cLv: el('path', { fill: 'var(--e-fondo)' }, maiz),
    cEar: el('path', { fill: 'var(--e-fondo)' }, maiz),
    cSk: el('path', { fill: 'none', 'stroke-linecap': 'round' }, maiz),
    cTs: el('path', { fill: 'none', 'stroke-linecap': 'round' }, maiz),
  }
  // Los trazos que escalan con la camara (tallos, vainas) no usan vector-effect; ver Sequia.module.css.
  for (const k of ['bPdO', 'bPd', 'cStO', 'cSt'] as const) P[k].setAttribute('data-escala', '1')

  // Pesos de trazo [base, normal/resaltado/atenuado] de los trazos finos.
  const FINOS: [SVGPathElement, number][] = [
    [P.bSt, 1.5],
    [P.bLv, 1.3],
    [P.cLv, 1.3],
    [P.cEar, 1.3],
    [P.cSk, 1],
    [P.cTs, 1.3],
  ]

  // ---------- calor, particulas ----------
  const grupoParticulas = capa()
  const reserva: Particula[] = []
  for (let i = 0; i < 120; i++) {
    reserva.push({ e: el('circle', { r: 0, cx: 0, cy: 0 }, grupoParticulas), on: false, x: 0, y: 0, vx: 0, vy: 0, vida: 0, max: 1, op: 1, g: 0 })
  }
  const activas: Particula[] = []
  function emitir(x: number, y: number, vx: number, vy: number, max: number, r: number, color: string, op: number) {
    const p = reserva.find((q) => !q.on)
    if (!p) return
    Object.assign(p, { on: true, x, y, vx, vy, vida: 0, max, op, g: 0 })
    p.e.setAttribute('r', String(r))
    p.e.style.setProperty('fill', color)
    activas.push(p)
  }
  const acum = { lluvia: 0, polvo: 0 }

  // ---------- estado ----------
  let ancho = 800
  let alto = 450
  let zona: ZonaEscena = 'cielo'
  let resaltado: CultivoDibujado | null = null
  let sucio = true
  let ultimaT = -1
  let primera = true
  let VB = { x: 0, y: 0, w: ANCHO, h: ALTO }
  let VT = { ...VB }

  function encuadrar(): { x: number; y: number; w: number; h: number } {
    const A = Math.max(0.3, ancho / Math.max(1, alto))
    const [cx, cy, bw, bh] = CAJAS[zona]
    let w = bw
    let h = bh
    if (w / h > A) h = w / A
    else w = h * A
    return { x: cx - w / 2, y: cy - h / 2, w, h }
  }

  // Estilo de cada cultivo segun el resalte: trazo mas fuerte o atenuado.
  function aplicarResalte() {
    const estado = (c: CultivoDibujado) => (resaltado === null ? 'normal' : resaltado === c ? 'resaltado' : 'atenuado')
    const factor = { normal: 1.7, resaltado: 2.6, atenuado: 1.4 }
    for (const c of ['frijol', 'maiz'] as const) {
      const e = estado(c)
      const g = c === 'frijol' ? frijol : maiz
      const opacidad = e === 'atenuado' ? 0.35 : 1
      g.setAttribute('data-estado', e)
      g.setAttribute('opacity', String(opacidad))
      grupoRaices[c].setAttribute('opacity', String(opacidad))
      for (const r of raices[c]) r.e.setAttribute('stroke-width', f(r.base * (e === 'resaltado' ? 1.5 : 1)))
    }
    for (const [p, base] of FINOS) {
      const c: CultivoDibujado = frijol.contains(p) ? 'frijol' : 'maiz'
      p.setAttribute('stroke-width', f(base * factor[estado(c)]))
    }
  }

  // Colores y estados que dependen de la intensidad (se pintan solo cuando t cambia).
  function pintar(t: number) {
    const salud = 100 - 45 * suave(0.15, 1, t)
    const G = `color-mix(in srgb, var(--e-trazo) ${salud.toFixed(0)}%, var(--e-fondo))`
    const roto = t > 0.55 ? `${f(16 - 8 * suave(0.55, 1, t))} ${f(2 + 3 * suave(0.55, 1, t))}` : 'none'
    nucleoSol.setAttribute('r', f(44 + 14 * t))
    grietas.setAttribute('opacity', suave(0.35, 0.8, t).toFixed(2))
    grietasLecho.setAttribute('opacity', suave(0.68, 0.95, t).toFixed(2))
    const wy = 436 + 70 * t
    agua.setAttribute('y', f(wy))
    lineaAgua.setAttribute('y1', f(wy))
    lineaAgua.setAttribute('y2', f(wy))
    const frente = 436 + 250 * t
    for (const m of humedad) m.e.setAttribute('opacity', (limitar((m.y - frente) / 22, 0, 1) * 0.9).toFixed(2))
    const rc = `color-mix(in srgb, var(--e-suave) ${(100 - 35 * t).toFixed(0)}%, var(--e-fondo))`
    for (const c of ['frijol', 'maiz'] as const) {
      for (const r of raices[c]) r.e.style.setProperty('stroke', rc)
      for (const p of puntas[c]) p.e.style.setProperty('fill', p.y > frente ? 'var(--e-agua)' : 'var(--e-fondo)')
    }
    for (const n of nubes) n.g.setAttribute('opacity', (1 - suave(0.08, 0.55, t)).toFixed(2))
    pasto.setAttribute('opacity', (0.8 - 0.4 * t).toFixed(2))
    for (const k of ['bSt', 'bLv', 'bPdO', 'cStO', 'cLv', 'cEar', 'cSk', 'cTs'] as const) P[k].style.setProperty('stroke', G)
    P.bLv.setAttribute('stroke-dasharray', roto)
    P.cLv.setAttribute('stroke-dasharray', roto)
    P.bFl.setAttribute('opacity', (1 - suave(0.2, 0.58, t)).toFixed(2))
  }

  // Frijol: tallo, hojas, vainas y flores. Devuelve nada; escribe en los paths.
  function dibujarFrijol(t: number, tm: number) {
    const X = X_FRIJOL
    const Y = Y_SUELO
    const sw = viento(tm) * 0.6
    const H = 128 * (1 - 0.2 * t)
    const p0: Punto = [X, Y]
    const p1: Punto = [X - 9, Y - H * 0.35]
    const p2: Punto = [X + 11, Y - H * 0.7]
    const p3: Punto = [X + 2 + sw * 5, Y - H]
    let st = `M${p0}C${p1} ${p2} ${f(p3[0])},${f(p3[1])}`
    let lv = ''
    let pd = ''
    let fl = ''
    const nodos: [number, number][] = [
      [0.3, -1],
      [0.6, 1],
      [0.97, 0],
    ]
    const vainas = Math.round(4 * (1 - suave(0.35, 0.85, t)))
    let n = 0
    nodos.forEach(([s, lado], j) => {
      const nd = cubica(p0, p1, p2, p3, s)
      const sd = lado || (j % 2 ? 1 : -1)
      const a0 = lado === 0 ? -Math.PI / 2 + sw * 0.15 + 0.25 * t : -Math.PI / 2 + sd * (0.75 + 0.75 * t) + sw * 0.12
      const pl = lado === 0 ? 14 : 28
      const px = nd[0] + Math.cos(a0) * pl
      const py = nd[1] + Math.sin(a0) * pl
      st += `M${f(nd[0])},${f(nd[1])}L${f(px)},${f(py)}`
      for (const da of [0, -0.95, 0.95]) lv += hojaCaida(px, py, a0 + da, 37 * (1 - 0.14 * t), 25 * (1 - 0.58 * t), 0.25 + 1.4 * t)
      if (j >= 1) {
        for (const ps of [-1, 1]) {
          if (n++ < vainas) {
            const ox = nd[0] + ps * 4
            const oy = nd[1] + 6
            pd += `M${f(ox)},${f(oy)}Q${f(ox + ps * 11)},${f(oy + 8)} ${f(ox + ps * 8)},${f(oy + 25)}`
          }
        }
        const fx = nd[0] - sd * 10
        const fy = nd[1] - 4
        for (const [dx, dy] of [[0, 0], [5, -4], [-4, -5]]) fl += elipse(fx + dx, fy + dy, 4.4, 3.2, 0.6)
      }
    })
    P.bSt.setAttribute('d', st)
    P.bLv.setAttribute('d', lv)
    P.bPd.setAttribute('d', pd || 'M0,0')
    P.bPdO.setAttribute('d', pd || 'M0,0')
    P.bFl.setAttribute('d', fl)
  }

  // Maiz: tallo, hojas, mazorca con pelos y espiga.
  function dibujarMaiz(t: number, tm: number) {
    const X = X_MAIZ
    const Y = Y_SUELO
    const sw = viento(tm) * (0.6 + 0.5 * t)
    const H = 282 * (1 - 0.1 * t)
    const cima: Punto = [X + sw * 10, Y - H]
    const ctrl: Punto = [X + 4 + sw * 5, Y - H * 0.5]
    let lv = ''
    for (let k = 0; k < 7; k++) {
      const s = 0.13 + k * 0.115
      const lado = k % 2 ? 1 : -1
      const p = cuad(X, Y, ctrl[0], ctrl[1], cima[0], cima[1], s)
      const elv = 0.98 - 0.38 * t + sw * 0.04 * lado
      lv += hoja(p[0], p[1], lado > 0 ? -elv : Math.PI + elv, 142 - k * 9, 17 * (1 - 0.66 * t), lado * (1.55 + 1.05 * t))
    }
    const nd = cuad(X, Y, ctrl[0], ctrl[1], cima[0], cima[1], 0.42)
    const ea = -Math.PI / 2 + 0.5
    const er = 27 * (1 - 0.36 * t)
    const ecx = nd[0] + Math.cos(ea) * er + 5
    const ecy = nd[1] + Math.sin(ea) * er + 2
    const mazorca =
      elipse(ecx, ecy, er, 9 * (1 - 0.32 * t), ea) +
      `M${f(nd[0])},${f(nd[1])}Q${f(ecx - 6)},${f(ecy + 14)} ${f(ecx + Math.cos(ea) * er * 0.6)},${f(ecy + Math.sin(ea) * er * 0.6)}L${f(nd[0] + 3)},${f(nd[1] - 2)}Z`
    const tx = ecx + Math.cos(ea) * er
    const ty = ecy + Math.sin(ea) * er
    const sl = 22 * (1 - suave(0.25, 0.85, t))
    let pelos = ''
    if (sl > 1) {
      for (let i = -2; i <= 2; i++) {
        const a = ea + i * 0.22
        pelos += `M${f(tx)},${f(ty)}Q${f(tx + Math.cos(a) * sl * 0.6)},${f(ty + Math.sin(a) * sl * 0.6 - 2)} ${f(tx + Math.cos(a + 0.35) * sl)},${f(ty + Math.sin(a + 0.35) * sl + 4)}`
      }
    }
    let espiga = `M${f(cima[0])},${f(cima[1])}l${f(sw * 2)},-26`
    for (let i = 0; i < 6; i++) {
      const lado = i % 2 ? 1 : -1
      const a = -Math.PI / 2 + lado * (0.45 + i * 0.12) + sw * 0.05
      const l = 30 - i * 1.5
      const sx = cima[0] + sw * 0.5
      const sy = cima[1] - 6 - i * 3.5
      espiga += `M${f(sx)},${f(sy)}Q${f(sx + Math.cos(a) * l * 0.5)},${f(sy + Math.sin(a) * l * 0.5)} ${f(sx + Math.cos(a + lado * 0.7) * l)},${f(sy + Math.sin(a + lado * 0.7) * l + 6)}`
    }
    const tallo = `M${X},${Y}Q${f(ctrl[0])},${f(ctrl[1])} ${f(cima[0])},${f(cima[1])}`
    P.cSt.setAttribute('d', tallo)
    P.cStO.setAttribute('d', tallo)
    P.cLv.setAttribute('d', lv)
    P.cEar.setAttribute('d', mazorca)
    P.cSk.setAttribute('d', pelos || 'M0,0')
    P.cTs.setAttribute('d', espiga)
  }

  return {
    redimensionar(w, h) {
      if (w > 0 && h > 0) {
        ancho = w
        alto = h
        VT = encuadrar()
      }
    },
    enfocar(z) {
      zona = z
      VT = encuadrar()
    },
    resaltar(c) {
      resaltado = c
      aplicarResalte()
    },
    cuadro({ dt, tm, t, animar }) {
      const d = Math.min(0.05, Math.max(0, dt))
      if (sucio) {
        aplicarResalte()
        ultimaT = -1
        sucio = false
      }
      if (Math.abs(t - ultimaT) > 0.0008) {
        ultimaT = t
        pintar(t)
      }
      // Camara: se desliza hacia la caja de la zona; sin animar, salta.
      if (animar && !primera) {
        const k = 1 - Math.pow(0.004, d)
        VB = {
          x: VB.x + (VT.x - VB.x) * k,
          y: VB.y + (VT.y - VB.y) * k,
          w: VB.w + (VT.w - VB.w) * k,
          h: VB.h + (VT.h - VB.h) * k,
        }
      } else {
        VB = { ...VT }
        primera = false
      }
      svg.setAttribute('viewBox', `${f(VB.x)} ${f(VB.y)} ${f(VB.w)} ${f(VB.h)}`)

      const tv = animar ? tm : 0
      dibujarFrijol(t, tv)
      dibujarMaiz(t, tv)
      for (const n of nubes) {
        const deriva = animar ? Math.sin(tm * 0.12 + nubes.indexOf(n)) * 18 : 0
        n.g.setAttribute('transform', `translate(${f(n.x + deriva + 60 * suave(0.1, 0.6, t))},${n.y})`)
      }
      if (animar) rayos.setAttribute('transform', `rotate(${f(tm * 9)} 1010 110)`)
      else rayos.removeAttribute('transform')

      // Particulas: lluvia al inicio, polvo al final. Sin animar no hay ninguna.
      if (animar) {
        acum.lluvia += (1 - suave(0.03, 0.18, t)) * 50 * d
        while (acum.lluvia > 1) {
          acum.lluvia--
          emitir(160 + Math.random() * 460, 150 + Math.random() * 30, -20, 420, 0.75, 2.2, 'var(--e-agua)', 0.8)
        }
        acum.polvo += suave(0.6, 0.95, t) * 16 * d
        while (acum.polvo > 1) {
          acum.polvo--
          emitir(260 + Math.random() * 300, 400 + Math.random() * 30, 90 + Math.random() * 60, -6 - Math.random() * 10, 6, 2 + Math.random() * 2, 'var(--e-suave)', 0.6)
        }
      }
      for (let i = activas.length - 1; i >= 0; i--) {
        const p = activas[i]
        p.vida += d
        p.x += p.vx * d
        p.y += p.vy * d
        if (!animar || p.vida >= p.max || (p.vy > 300 && p.y > 436)) {
          p.on = false
          p.e.setAttribute('r', '0')
          activas.splice(i, 1)
          continue
        }
        const a = p.vida / p.max
        p.e.setAttribute('cx', f(p.x))
        p.e.setAttribute('cy', f(p.y))
        p.e.setAttribute('opacity', (p.op * Math.min(1, a * 6) * (1 - a)).toFixed(2))
      }
    },
    limpiar() {
      svg.replaceChildren()
    },
  }
}
