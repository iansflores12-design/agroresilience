// Ayudas compartidas por las funciones de `api/`.

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { leerKharis } from '../src/lib/decision/kharis.js'
import { decidir } from '../src/lib/decision/motor.js'
import type { Decision, EntradaDecision } from '../src/lib/decision/tipos.js'

/**
 * Lee las salidas de Kharis del disco (vercel.json las incluye con `includeFiles`) y, si no
 * estan, las pide por HTTP al mismo sitio.
 */
async function leerArchivo(url: string): Promise<Response> {
  const nombre = basename(new URL(url).pathname)
  try {
    const texto = await readFile(join(process.cwd(), 'public', 'kharis', nombre), 'utf8')
    return new Response(texto, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return fetch(url)
  }
}

export async function decisionPara(entrada: EntradaDecision, urlPeticion: string): Promise<Decision> {
  const base = new URL('/kharis/', urlPeticion).href
  const { indice, punto, escala, distanciaKm } = await leerKharis(base, entrada, leerArchivo)
  return decidir(entrada, punto, { fechaBase: indice.fecha_base, modelo: indice.version_modelo, escala, distanciaKm })
}

/**
 * Preflight CORS de la app nativa de Android (corre desde https://localhost). Las cabeceras de
 * las respuestas normales las pone vercel.json.
 */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://localhost',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
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
