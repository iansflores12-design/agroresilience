import { describe, expect, it } from 'vitest'
import { apkDe } from './DescargaAndroid'

const base = 'https://github.com/iansflores12-design/agroresilience/releases/download/v1'

describe('apkDe', () => {
  it('toma el primer .apk del release y redondea su peso', () => {
    const release = {
      assets: [
        { name: 'notas.txt', browser_download_url: `${base}/notas.txt`, size: 10 },
        { name: 'AgroResilience.APK', browser_download_url: `${base}/AgroResilience.APK`, size: 7_500_000 },
      ],
    }
    expect(apkDe(release)).toEqual({ url: `${base}/AgroResilience.APK`, mb: 7 })
  })

  it('no ofrece nada si el release no trae un .apk', () => {
    expect(apkDe({ assets: [{ name: 'notas.txt', browser_download_url: `${base}/notas.txt` }] })).toBeNull()
    expect(apkDe({})).toBeNull()
    expect(apkDe(null)).toBeNull()
  })

  it('descarta un .apk que no sale del repositorio', () => {
    expect(apkDe({ assets: [{ name: 'a.apk', browser_download_url: 'https://otro.example/a.apk', size: 1 }] })).toBeNull()
  })
})
