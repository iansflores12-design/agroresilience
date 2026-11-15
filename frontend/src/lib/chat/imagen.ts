/** Lado mayor de la foto que se manda a Gemini: suficiente para ver hojas y plagas, liviana para el celular. */
export const LADO_MAXIMO = 1024
const CALIDAD = 0.8

/** Medidas que caben en `lado` sin deformar la foto; nunca la agranda. */
export function medidasAjustadas(ancho: number, alto: number, lado = LADO_MAXIMO): { ancho: number; alto: number } {
  const escala = Math.min(1, lado / Math.max(ancho, alto, 1))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

/** Separa un data URL de imagen en tipo y base64 (lo que Gemini pide como inlineData). */
export function partirDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url)
  return m ? { mimeType: m[1], data: m[2] } : null
}

function cargar(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((listo, fallo) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      listo(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      fallo(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

/** Reduce la foto a ~1024 px y la convierte en JPEG (data URL). */
export async function comprimirImagen(archivo: Blob, lado = LADO_MAXIMO): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('No es una imagen')
  const img = await cargar(archivo)
  const { ancho, alto } = medidasAjustadas(img.naturalWidth, img.naturalHeight, lado)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Sin lienzo')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(img, 0, 0, ancho, alto)
  return lienzo.toDataURL('image/jpeg', CALIDAD)
}

/** Solo las ultimas fotos viajan a la API; las anteriores se quitan para no cargar de mas el pedido. */
export function recortarImagenes<T extends { imagen?: string }>(mensajes: T[], maximo = 2): T[] {
  let vistas = 0
  return [...mensajes].reverse().map((m) => {
    if (!m.imagen) return m
    vistas += 1
    if (vistas <= maximo) return m
    const { imagen: _quitada, ...resto } = m
    return resto as T
  }).reverse()
}
