/** Caja de una etiqueta o de un obstaculo, en pixeles. (x, y) es el centro. */
export interface CajaEtiqueta {
  x: number
  y: number
  ancho: number
  alto: number
}

export interface EntradaEtiqueta extends CajaEtiqueta {
  /** Una etiqueta fija no la empujan las demas etiquetas (la del departamento elegido); solo los obstaculos. */
  fija?: boolean
}

const SEPARACION = 4
const RONDAS = 400

function dentro(e: CajaEtiqueta, ancho: number, alto: number): CajaEtiqueta {
  const x = Math.max(e.ancho / 2, Math.min(ancho - e.ancho / 2, e.x))
  const y = Math.max(e.alto / 2, Math.min(alto - e.alto / 2, e.y))
  return { ...e, x, y }
}

/**
 * Acomoda las etiquetas de puntaje para que no se encimen entre si, no tapen los obstaculos
 * (los puntos tocables de los lugares) y no se salgan del mapa. Parte del centro de cada
 * departamento y las va separando por el lado donde el cruce es menor. Es determinista.
 */
export function colocarEtiquetas(
  entradas: EntradaEtiqueta[],
  obstaculos: CajaEtiqueta[],
  ancho: number,
  alto: number,
): { x: number; y: number }[] {
  if (ancho <= 0 || alto <= 0) return entradas.map(({ x, y }) => ({ x, y }))
  const cajas = entradas.map((e) => dentro(e, ancho, alto))

  // Cruce entre dos cajas: positivo en ambos ejes si se encimen.
  const cruce = (a: CajaEtiqueta, b: CajaEtiqueta) => ({
    dx: (a.ancho + b.ancho) / 2 + SEPARACION - Math.abs(a.x - b.x),
    dy: (a.alto + b.alto) / 2 + SEPARACION - Math.abs(a.y - b.y),
  })

  for (let ronda = 0; ronda < RONDAS; ronda++) {
    let movido = false
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i]
        const b = cajas[j]
        const { dx, dy } = cruce(a, b)
        if (dx <= 0 || dy <= 0) continue
        movido = true
        const fijaA = entradas[i].fija
        const fijaB = entradas[j].fija
        if (fijaA && fijaB) continue
        const parteA = fijaA ? 0 : fijaB ? 1 : 0.5
        const parteB = 1 - parteA
        // Se separa por el eje donde falta menos; si estan en el mismo punto, A sube y B baja.
        if (dx < dy) {
          const signo = a.x === b.x ? (i < j ? -1 : 1) : Math.sign(a.x - b.x)
          a.x += signo * dx * parteA
          b.x -= signo * dx * parteB
        } else {
          const signo = a.y === b.y ? (i < j ? -1 : 1) : Math.sign(a.y - b.y)
          a.y += signo * dy * parteA
          b.y -= signo * dy * parteB
        }
      }
      // Los obstaculos no se mueven: toda etiqueta se aparta de ellos, tambien la fija.
      for (const o of obstaculos) {
        const a = cajas[i]
        const { dx, dy } = cruce(a, o)
        if (dx <= 0 || dy <= 0) continue
        movido = true
        if (dx < dy) a.x += (a.x >= o.x ? 1 : -1) * dx
        else a.y += (a.y >= o.y ? 1 : -1) * dy
      }
    }
    for (let i = 0; i < cajas.length; i++) cajas[i] = dentro(cajas[i], ancho, alto)
    if (!movido) break
  }
  return cajas.map(({ x, y }) => ({ x, y }))
}
