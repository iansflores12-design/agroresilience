import { describe, expect, it } from 'vitest'
import { zonas } from './zonas'
import {
  escenarioMasProbable,
  frasePerspectiva,
  oni,
  perspectiva,
  perspectivaDe,
} from './perspectiva'

const todas = perspectiva.temporadas.flatMap((t) => t.zonas.map((z) => ({ t, z })))
const usable = perspectiva.temporadas[0].zonas.find((z) => z.usable)
const noUsable = perspectiva.temporadas[0].zonas.find((z) => !z.usable)

describe('perspectiva.generado.json', () => {
  it('tiene dos temporadas con una entrada por zona conocida', () => {
    expect(perspectiva.temporadas).toHaveLength(2)
    for (const t of perspectiva.temporadas) {
      expect(t.zonas.map((z) => z.id).sort()).toEqual(zonas.map((z) => z.id).sort())
    }
  })

  it('las probabilidades suman 1 y los conteos suman los analogos', () => {
    for (const { z } of todas) {
      const suma = z.prob.seco + z.prob.normal + z.prob.lluvioso
      expect(Math.abs(suma - 1)).toBeLessThanOrEqual(0.02)
      const n = z.conteo.seco + z.conteo.normal + z.conteo.lluvioso
      expect(n).toBe(perspectiva.metodo.k)
      expect(z.aniosParecidos).toHaveLength(perspectiva.metodo.k)
    }
  })

  it('la canicula solo existe en la primera', () => {
    for (const { t, z } of todas) {
      if (t.tipo === 'primera') expect(z.canicula).not.toBeNull()
      else expect(z.canicula).toBeNull()
    }
  })

  it('el ONI tiene fase coherente con su valor', () => {
    const esperada = oni.valor >= 0.5 ? 'nino' : oni.valor <= -0.5 ? 'nina' : 'neutral'
    expect(oni.fase).toBe(esperada)
  })
})

describe('lectura', () => {
  it('perspectivaDe devuelve la proxima temporada', () => {
    const r = perspectivaDe(perspectiva.temporadas[0].zonas[0].id)
    expect(r?.temporada).toBe(perspectiva.temporadas[0].nombre)
  })

  it('zona inexistente o nula devuelve null', () => {
    for (const id of ['no_existe', null]) {
      expect(perspectivaDe(id)).toBeNull()
      expect(escenarioMasProbable(id)).toBeNull()
      expect(frasePerspectiva(id)).toBeNull()
    }
  })

  it('no usable: sin escenario y con frase de incertidumbre', () => {
    if (!noUsable) return
    expect(escenarioMasProbable(noUsable.id)).toBeNull()
    expect(frasePerspectiva(noUsable.id)).toBe(
      'Este año no hay una señal clara: puede venir seco, normal o lluvioso.',
    )
  })

  it('usable: escenario y frase con conteo de la clase mas frecuente', () => {
    if (!usable) return
    const clase = escenarioMasProbable(usable.id)
    expect(clase).not.toBeNull()
    const frase = frasePerspectiva(usable.id) ?? ''
    expect(frase).toMatch(/^De 10 años parecidos a este, \d+ fueron? /)
    expect(frase).toContain(String(usable.conteo[clase!]))
  })
})
