import { colocarEtiquetas, type CajaEtiqueta, type EntradaEtiqueta } from './colocarEtiquetas'

const encima = (a: CajaEtiqueta, b: CajaEtiqueta) =>
  Math.abs(a.x - b.x) < (a.ancho + b.ancho) / 2 && Math.abs(a.y - b.y) < (a.alto + b.alto) / 2

describe('colocarEtiquetas', () => {
  it('separa etiquetas que caen en el mismo punto y las deja dentro del mapa', () => {
    const entradas: EntradaEtiqueta[] = Array.from({ length: 10 }, (_, i) => ({
      x: 100 + (i % 3) * 5,
      y: 80 + (i % 2) * 4,
      ancho: 36,
      alto: 26,
    }))
    const pos = colocarEtiquetas(entradas, [], 340, 300)
    const cajas = pos.map((p) => ({ ...p, ancho: 36, alto: 26 }))
    for (let i = 0; i < cajas.length; i++) {
      expect(cajas[i].x).toBeGreaterThanOrEqual(18)
      expect(cajas[i].x).toBeLessThanOrEqual(340 - 18)
      expect(cajas[i].y).toBeGreaterThanOrEqual(13)
      expect(cajas[i].y).toBeLessThanOrEqual(300 - 13)
      for (let j = i + 1; j < cajas.length; j++) expect(encima(cajas[i], cajas[j])).toBe(false)
    }
  })

  it('no mueve la etiqueta fija y aparta a las demas de ella y de los puntos de los lugares', () => {
    const fija: EntradaEtiqueta = { x: 100, y: 100, ancho: 90, alto: 48, fija: true }
    const otra: EntradaEtiqueta = { x: 110, y: 105, ancho: 36, alto: 26 }
    const lugar: CajaEtiqueta = { x: 200, y: 200, ancho: 28, alto: 28 }
    const sobreLugar: EntradaEtiqueta = { x: 200, y: 202, ancho: 36, alto: 26 }
    const [a, b, c] = colocarEtiquetas([fija, otra, sobreLugar], [lugar], 340, 300)
    expect(a).toEqual({ x: 100, y: 100 })
    expect(encima({ ...a, ancho: 90, alto: 48 }, { ...b, ancho: 36, alto: 26 })).toBe(false)
    expect(encima({ ...c, ancho: 36, alto: 26 }, lugar)).toBe(false)
  })

  it('es determinista y no toca nada si el mapa no tiene tamano', () => {
    const e: EntradaEtiqueta[] = [
      { x: 10, y: 10, ancho: 30, alto: 20 },
      { x: 12, y: 11, ancho: 30, alto: 20 },
    ]
    expect(colocarEtiquetas(e, [], 200, 200)).toEqual(colocarEtiquetas(e, [], 200, 200))
    expect(colocarEtiquetas(e, [], 0, 0)).toEqual([
      { x: 10, y: 10 },
      { x: 12, y: 11 },
    ])
  })
})
