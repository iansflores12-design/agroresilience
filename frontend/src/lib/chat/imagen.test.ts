import { medidasAjustadas, partirDataUrl, recortarImagenes } from './imagen'

describe('fotos del chat', () => {
  it('reduce el lado mayor a 1024 sin deformar ni agrandar', () => {
    expect(medidasAjustadas(4000, 3000)).toEqual({ ancho: 1024, alto: 768 })
    expect(medidasAjustadas(1500, 3000)).toEqual({ ancho: 512, alto: 1024 })
    expect(medidasAjustadas(800, 600)).toEqual({ ancho: 800, alto: 600 })
  })

  it('separa el data URL en tipo y base64', () => {
    expect(partirDataUrl('data:image/jpeg;base64,QUJD')).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' })
    expect(partirDataUrl('data:text/plain;base64,QUJD')).toBeNull()
  })

  it('solo deja las dos ultimas fotos', () => {
    const r = recortarImagenes([{ imagen: 'a' }, { imagen: 'b' }, { texto: 'x' }, { imagen: 'c' }] as { imagen?: string; texto?: string }[])
    expect(r.map((m) => m.imagen)).toEqual([undefined, 'b', undefined, 'c'])
  })
})
