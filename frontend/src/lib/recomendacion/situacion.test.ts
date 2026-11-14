import { buscarCultivo } from '../../datos/cultivos'
import { situacionDe, tipoCambioDe } from './situacion'

const c = (id: string) => buscarCultivo(id)!

describe('situacion', () => {
  it('clasifica el cambio de cultivo', () => {
    expect(tipoCambioDe(c('maiz'), c('maiz'))).toBe('repetir')
    expect(tipoCambioDe(c('maiz'), c('frijol'))).toBe('leguminosa')
    expect(tipoCambioDe(c('maiz'), c('frijol-terciopelo'))).toBe('cobertura')
    expect(tipoCambioDe(c('maiz'), c('tomate'))).toBe('hortaliza')
    expect(tipoCambioDe(c('maiz'), c('sorgo'))).toBe('graminea')
  })

  it('arma la clave de situacion', () => {
    expect(situacionDe('agua', 'cobertura')).toBe('agua.cobertura')
    expect(situacionDe(null, 'repetir')).toBe('general.repetir')
  })
})
