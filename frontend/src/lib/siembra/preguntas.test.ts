import { PASOS } from './tipos'
import type { RespuestasParciales, RespuestasSiembra } from './tipos'
import { pasoAnterior, primerPasoIncompleto, respuestasCompletas, siguientePaso, validarPaso } from './preguntas'

const completas: RespuestasSiembra = {
  cultivoId: 'maiz',
  diasDesdeSiembra: 60,
  objetivo: 'agua',
  terreno: { textura: 'franco', pendiente: 'plana', drenaje: 'bueno', tieneRiego: true },
  ubicacion: { lat: 14.08, lon: -87.2, precisionM: null, origen: 'manual' },
}

describe('validarPaso', () => {
  it('cultivo', () => {
    expect(validarPaso('cultivo', completas)).toBeNull()
    expect(validarPaso('cultivo', { cultivoId: 'nada' })).not.toBeNull()
    expect(validarPaso('cultivo', {})).not.toBeNull()
  })

  it('dias', () => {
    expect(validarPaso('dias', completas)).toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: 0 })).toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: -1 })).not.toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: 10.5 })).not.toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: 366 })).not.toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: NaN })).not.toBeNull()
    expect(validarPaso('dias', {})).not.toBeNull()
    // maiz: 17 semanas * 7 + 30 = 149
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: 149 })).toBeNull()
    expect(validarPaso('dias', { ...completas, diasDesdeSiembra: 150 })).not.toBeNull()
  })

  it('objetivo', () => {
    expect(validarPaso('objetivo', completas)).toBeNull()
    expect(validarPaso('objetivo', {})).not.toBeNull()
    expect(validarPaso('objetivo', { objetivo: 'x' as never })).not.toBeNull()
  })

  it('terreno', () => {
    expect(validarPaso('terreno', completas)).toBeNull()
    expect(validarPaso('terreno', {})).not.toBeNull()
    const t = completas.terreno
    expect(validarPaso('terreno', { terreno: { ...t, textura: 'roca' as never } })).not.toBeNull()
    expect(validarPaso('terreno', { terreno: { ...t, pendiente: undefined as never } })).not.toBeNull()
    expect(validarPaso('terreno', { terreno: { ...t, drenaje: 'x' as never } })).not.toBeNull()
    expect(validarPaso('terreno', { terreno: { ...t, tieneRiego: undefined as never } })).not.toBeNull()
  })

  it('ubicacion', () => {
    expect(validarPaso('ubicacion', completas)).toBeNull()
    expect(validarPaso('ubicacion', {})).not.toBeNull()
    const u = completas.ubicacion
    expect(validarPaso('ubicacion', { ubicacion: { ...u, lat: 40 } })).not.toBeNull()
    expect(validarPaso('ubicacion', { ubicacion: { ...u, lon: -70 } })).not.toBeNull()
    expect(validarPaso('ubicacion', { ubicacion: { ...u, lat: NaN } })).not.toBeNull()
  })

  it('resultado siempre es null', () => {
    expect(validarPaso('resultado', {})).toBeNull()
  })
})

describe('orden de pasos', () => {
  it('siguiente y anterior', () => {
    expect(siguientePaso('cultivo')).toBe('dias')
    expect(siguientePaso('ubicacion')).toBe('resultado')
    expect(siguientePaso('resultado')).toBe('resultado')
    expect(pasoAnterior('dias')).toBe('cultivo')
    expect(pasoAnterior('cultivo')).toBe('cultivo')
    expect(pasoAnterior('resultado')).toBe('ubicacion')
    expect(PASOS[0]).toBe('cultivo')
  })
})

describe('primerPasoIncompleto', () => {
  it('encuentra el primer paso faltante', () => {
    expect(primerPasoIncompleto({})).toBe('cultivo')
    expect(primerPasoIncompleto({ cultivoId: 'maiz' })).toBe('dias')
    const parcial: RespuestasParciales = { ...completas, ubicacion: undefined }
    expect(primerPasoIncompleto(parcial)).toBe('ubicacion')
    expect(primerPasoIncompleto(completas)).toBe('resultado')
  })

  it('respuestasCompletas', () => {
    expect(respuestasCompletas(completas)).toBe(true)
    expect(respuestasCompletas({ ...completas, objetivo: undefined })).toBe(false)
  })
})
