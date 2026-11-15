// Lectura de las salidas web de Kharis (contrato kharis.web.v1, 04_GUIA_SITIO.md) y del ajuste a escala de
// parcela (kharis.escala_fina.v1).

import { puntoMasCercano } from './escala.js'
import { LUGARES } from './parametros.js'
import type { EntradaDecision, EscalaFina, IndiceKharis, PuntoKharis } from './tipos.js'

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

const cache = new Map<string, Promise<unknown>>()

function leerGuardado<T>(f: Fetch, url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined
  if (!p) {
    p = leerJson<T>(f, url)
    cache.set(url, p)
    p.catch(() => cache.delete(url))
  }
  return p
}

export interface LecturaKharis {
  indice: IndiceKharis
  punto: PuntoKharis
  /** Solo con parcela: malla de altura y coeficientes, y la distancia al punto usado. */
  escala: EscalaFina | null
  distanciaKm: number
}

/**
 * Lee el indice y el punto de Kharis de una consulta. Con parcela se usa el mas cercano de los 30 puntos;
 * sin ella, el punto del lugar del sitio. `base` termina en "/kharis/".
 */
export async function leerKharis(base: string, entrada: Pick<EntradaDecision, 'zonaId' | 'parcela'>, f: Fetch = fetch): Promise<LecturaKharis> {
  const indice = await leerGuardado<IndiceKharis>(f, base + 'indice.json')
  let archivo: string
  let distancia = 0
  if (entrada.parcela) {
    const cerca = puntoMasCercano(indice, entrada.parcela)
    archivo = cerca.entrada.archivo
    distancia = cerca.distanciaKm
  } else {
    const lugar = LUGARES[entrada.zonaId]
    if (!lugar) throw new ErrorKharis('Lugar sin punto de Kharis: ' + entrada.zonaId)
    const e = indice.puntos.find((p) => p.punto === lugar.punto)
    if (!e) throw new ErrorKharis('Kharis no tiene el punto ' + lugar.punto)
    archivo = e.archivo
  }
  const [punto, escala] = await Promise.all([
    leerGuardado<PuntoKharis>(f, base + archivo),
    entrada.parcela ? leerGuardado<EscalaFina>(f, base + 'escala_fina.json').catch(() => null) : Promise.resolve(null),
  ])
  return { indice, punto, escala, distanciaKm: distancia }
}
