// Lectura de las salidas web de Kharis (contrato kharis.web.v1, 04_GUIA_SITIO.md).

import { LUGARES } from './parametros.js'
import type { IndiceKharis, PuntoKharis } from './tipos.js'

type Fetch = (url: string) => Promise<Response>

export class ErrorKharis extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorKharis'
  }
}

async function leerJson<T>(f: Fetch, url: string): Promise<T> {
  const r = await f(url)
  // Vercel devuelve index.html con 200 si el archivo no existe: hay que comprobar el tipo.
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new ErrorKharis('Kharis: falta ' + url)
  return (await r.json()) as T
}

const cacheIndice = new Map<string, Promise<IndiceKharis>>()
const cachePuntos = new Map<string, Promise<PuntoKharis>>()

/** Lee el indice y el punto de un lugar del sitio. `base` termina en "/kharis/". */
export async function leerKharis(base: string, zonaId: string, f: Fetch = fetch): Promise<{ indice: IndiceKharis; punto: PuntoKharis }> {
  const lugar = LUGARES[zonaId]
  if (!lugar) throw new ErrorKharis('Lugar sin punto de Kharis: ' + zonaId)
  let indice = cacheIndice.get(base)
  if (!indice) {
    indice = leerJson<IndiceKharis>(f, base + 'indice.json')
    cacheIndice.set(base, indice)
    indice.catch(() => cacheIndice.delete(base))
  }
  const i = await indice
  const entrada = i.puntos.find((p) => p.punto === lugar.punto)
  if (!entrada) throw new ErrorKharis('Kharis no tiene el punto ' + lugar.punto)
  const clave = base + entrada.archivo
  let punto = cachePuntos.get(clave)
  if (!punto) {
    punto = leerJson<PuntoKharis>(f, clave)
    cachePuntos.set(clave, punto)
    punto.catch(() => cachePuntos.delete(clave))
  }
  return { indice: i, punto: await punto }
}
