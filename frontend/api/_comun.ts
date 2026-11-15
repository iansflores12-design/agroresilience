// Ayudas compartidas por las funciones de `api/`.

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { leerKharis } from '../src/lib/decision/kharis.js'
import { leerHistorico, recorteHistorico } from '../src/lib/decision/historico.js'
import { decidir } from '../src/lib/decision/motor.js'
import { LUGARES, NOMBRES_PUNTOS } from '../src/lib/decision/parametros.js'
import type { Decision, EntradaDecision } from '../src/lib/decision/tipos.js'
import { preciosDeRegion } from './_precios.js'

/**
 * Lee las salidas de Kharis del disco (vercel.json las incluye con `includeFiles`) y, si no
 * estan, las pide por HTTP al mismo sitio.
 */
async function leerArchivo(url: string): Promise<Response> {
  const ruta = new URL(url).pathname
  const nombre = basename(ruta)
  try {
    const texto = await readFile(join(process.cwd(), 'public', ruta.startsWith('/historico/') ? 'historico' : 'kharis', nombre), 'utf8')
    return new Response(texto, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return fetch(url)
  }
}

export async function decisionPara(entrada: EntradaDecision, urlPeticion: string): Promise<Decision> {
  const base = new URL('/kharis/', urlPeticion).href
  const { indice, punto, escala, distanciaKm } = await leerKharis(base, entrada, leerArchivo)
  // Con parcela la region es la del punto de Kharis mas cercano; sin ella, el lugar elegido.
  const region = entrada.parcela ? NOMBRES_PUNTOS[punto.punto] ?? punto.punto : LUGARES[entrada.zonaId]?.nombre ?? punto.punto
  const [precios, historico] = await Promise.all([
    preciosDeRegion(region),
    leerHistorico(new URL('/historico/', urlPeticion).href, punto.punto, leerArchivo),
  ])
  return decidir(entrada, punto, { fechaBase: indice.fecha_base, modelo: indice.version_modelo, escala, distanciaKm, precios, historico })
}

/**
 * Historico del departamento de la consulta, ya recortado en texto para Gemini. Lee
 * public/historico/<departamento>.json del disco o del mismo sitio; si falta, devuelve ''.
 */
export async function historicoPara(decision: Decision, urlPeticion: string): Promise<string> {
  return recorteHistorico(await leerHistorico(new URL('/historico/', urlPeticion).href, decision.punto.id, leerArchivo), decision)
}

export function json(dato: unknown, estado = 200): Response {
  return new Response(JSON.stringify(dato), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const d: unknown = await request.json()
    return typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : null
  } catch {
    return null
  }
}
