// Busca en la web los precios de cada cultivo en la region de la consulta (Gemini con Google Search)
// y los entrega a Gemini Decision. Si no hay clave, falla o tarda, la decision sigue con la
// referencia nacional. Lo que llega de la web son datos: solo se aceptan numeros dentro de un rango
// creible y textos cortos.

import { CULTIVOS } from '../src/lib/decision/parametros.js'
import { PRECIOS_REFERENCIA, precioCreible, preciosDeReferencia, type PreciosRegion } from '../src/lib/decision/precios.js'
import { geminiConFuentes, hayClave } from './_gemini.js'

const VIGENCIA_MS = 12 * 60 * 60 * 1000
/** Una busqueda fallida se reintenta pronto. */
const VIGENCIA_FALLO_MS = 10 * 60 * 1000
const ESPERA_MS = Number(process.env.PRECIOS_ESPERA_MS) || 25_000

const guardados = new Map<string, { vence: number; promesa: Promise<PreciosRegion> }>()

const SISTEMA = `Eres un asistente que busca precios agrícolas de Honduras. Usa la búsqueda de Google y responde SOLO con JSON, sin texto antes ni después.
Fuentes preferidas: SIMPAH (FHIA y SAG), IHMA, OBSAN-UNAH y prensa hondureña (La Prensa, El Heraldo, La Tribuna).
No inventes: si no encuentras el precio de un cultivo en la región ni en su mercado más cercano, déjalo fuera.`

function pedido(region: string, hoy: string): string {
  const lista = Object.entries(PRECIOS_REFERENCIA)
    .map(([id, r]) => `- "${id}": ${r.nivel}`)
    .join('\n')
  return `Hoy es ${hoy}. Busca el precio más reciente de estos cultivos en ${region}, Honduras, o en el mercado mayorista más cercano donde venden los productores de esa región:
${lista}

Pasa cada precio a lempiras por quintal de 100 libras (una carga son 200 libras; una medida son 5 libras).
Responde con este JSON:
{"precios":[{"cultivo":"maiz","lempiras_qq":0,"mercado":"ciudad o mercado","fecha":"AAAA-MM-DD","fuente":"quién lo publica"}]}`
}

const corto = (x: unknown, largo: number): string =>
  typeof x === 'string' ? x.replace(/[\s<>`]+/g, ' ').trim().slice(0, largo) : ''

function leer(texto: string): Record<string, unknown>[] {
  const a = texto.indexOf('{')
  const b = texto.lastIndexOf('}')
  if (a < 0 || b <= a) return []
  try {
    const dato = JSON.parse(texto.slice(a, b + 1)) as { precios?: unknown }
    return Array.isArray(dato.precios) ? dato.precios.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []
  } catch {
    return []
  }
}

async function buscar(region: string): Promise<PreciosRegion> {
  const hoy = new Date().toISOString().slice(0, 10)
  const salida = preciosDeReferencia(region, hoy)
  const r = await geminiConFuentes({
    sistema: SISTEMA,
    mensajes: [{ rol: 'user', texto: pedido(region, hoy) }],
    busqueda: true,
    temperatura: 0,
    signal: AbortSignal.timeout(ESPERA_MS),
  })
  for (const x of leer(r.texto)) {
    const id = corto(x.cultivo, 30)
    const valor = Number(x.lempiras_qq)
    if (!CULTIVOS[id] || !precioCreible(id, valor)) continue
    const fecha = corto(x.fecha, 10)
    salida.cultivos[id] = {
      lempirasQq: Math.round(valor),
      mercado: corto(x.mercado, 60) || region,
      fecha: /^\d{4}(-\d{2}){0,2}$/.test(fecha) ? fecha : '',
      fuente: corto(x.fuente, 80) || 'Búsqueda en la web',
    }
  }
  if (Object.keys(salida.cultivos).length) {
    salida.origen = 'busqueda'
    salida.fuentes = r.fuentes.slice(0, 6)
  }
  return salida
}

/** Precios de la region, guardados 12 horas. Nunca falla: sin busqueda devuelve la referencia. */
export function preciosDeRegion(region: string): Promise<PreciosRegion> {
  if (!hayClave()) return Promise.resolve(preciosDeReferencia(region))
  const ahora = Date.now()
  const previo = guardados.get(region)
  if (previo && previo.vence > ahora) return previo.promesa
  const entrada = {
    vence: ahora + VIGENCIA_MS,
    promesa: buscar(region).catch((e) => {
      console.error(`[precios] ${region}: ${String(e)}`)
      return preciosDeReferencia(region)
    }),
  }
  guardados.set(region, entrada)
  void entrada.promesa.then((p) => {
    if (p.origen === 'referencia') entrada.vence = Date.now() + VIGENCIA_FALLO_MS
  })
  return entrada.promesa
}
