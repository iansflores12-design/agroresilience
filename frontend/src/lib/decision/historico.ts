// Recorte del historico 1981-hoy de cada departamento para Gemini.
// Los datos salen de scripts/historico_cultivos.py (public/historico/<departamento>.json): cada cultivo
// simulado ano por ano con el clima real (balance de agua FAO-56, rendimiento FAO-33, calor en floracion)
// y agrupado por fase de El Nino. Aqui se deja solo lo que sirve para la consulta: el departamento, las
// temporadas de las rotaciones, los cultivos que se comparan y los de exportacion de la zona.

import type { Decision } from './tipos.js'

/** Departamento de cada punto de Kharis (config/zonas.json). */
export const DEPARTAMENTO_DE_PUNTO: Record<string, string> = {
  comayagua: 'comayagua', choluteca: 'choluteca', danli: 'el_paraiso', juticalpa: 'olancho', sula: 'cortes', olanchito: 'yoro',
  santa_rosa: 'copan', la_esperanza: 'intibuca', la_ceiba: 'atlantida', trujillo: 'colon', tegucigalpa: 'francisco_morazan',
  puerto_lempira: 'gracias_a_dios', roatan: 'islas_de_la_bahia', la_paz: 'la_paz', gracias: 'lempira', ocotepeque: 'ocotepeque',
  santa_barbara: 'santa_barbara', nacaome: 'valle', marcala: 'la_paz', copan_ruinas: 'copan', siguatepeque: 'comayagua',
  lago_yojoa: 'cortes', el_progreso: 'yoro', tela: 'atlantida', tocoa: 'colon', catacamas: 'olancho', yoro: 'yoro',
  san_marcos_colon: 'choluteca', zamorano: 'el_paraiso', brus_laguna: 'gracias_a_dios',
}

export type Fase = 'nino' | 'neutro' | 'nina'

export interface Resumen {
  n: number
  mediana: number
  buenos: number
  fracasos: number
  peor: number
  peor_rel: number
}

export interface HistoricoCultivo extends Partial<Record<Fase, Resumen>> {
  todo: Resumen
  ultimos10: Resumen
  calor_mediana: number
  riego_mediana_mm: number
  solo_con_riego: boolean
  zona_tradicional: boolean | null
}

export interface HistoricoTemporada {
  siembra_mediana: string | null
  lluvia_mediana_mm: number
  cultivos: Record<string, HistoricoCultivo>
  mejor_cultivo_secano_veces?: Record<string, number>
  anios_extremos?: {
    peores: { anio: number; enso: string; maiz_rel: number; mejor: string }[]
    mejores: { anio: number; enso: string; maiz_rel: number; mejor: string }[]
  }
}

export interface HistoricoDepartamento {
  departamento: string
  punto_clima: string
  periodo: string
  fuente_lluvia: string | null
  temporadas: Partial<Record<'primera' | 'postrera' | 'verano' | 'anual', HistoricoTemporada>>
  mercado_exportacion: Record<string, { usd_2024_millones: number; pct_exportaciones_2024: number; usd_prom_2015_2024_millones: number; usd_prom_2005_2014_millones: number }>
  enso_actual: { trimestre: string; oni: number; fase: Fase }
}

const NOMBRE: Record<string, string> = {
  maiz: 'Maíz', frijol: 'Frijol', sorgo: 'Sorgo', arroz: 'Arroz', tomate: 'Tomate', melon: 'Melón', chile: 'Chile dulce',
  tabaco: 'Tabaco', cafe: 'Café', palma: 'Palma aceitera', banano: 'Banano', cana: 'Caña de azúcar', cacao: 'Cacao',
}
const FASE: Record<Fase, string> = { nino: 'El Niño', neutro: 'neutrales', nina: 'La Niña' }
const TEMPORADA: Record<string, string> = { primera: 'Primera', postrera: 'Postrera', verano: 'Verano (diciembre a abril)', anual: 'Todo el año (permanente)' }
const EXPORTACION = ['cafe', 'palma', 'banano', 'cana', 'cacao', 'melon', 'chile', 'tabaco']

/** Lee el historico del departamento de un punto de Kharis. `base` termina en "/historico/". Sin archivo, null. */
export async function leerHistorico(base: string, puntoId: string, f: (url: string) => Promise<Response> = fetch): Promise<HistoricoDepartamento | null> {
  const depto = DEPARTAMENTO_DE_PUNTO[puntoId]
  if (!depto) return null
  try {
    const r = await f(`${base}${depto}.json`)
    return r.ok ? ((await r.json()) as HistoricoDepartamento) : null
  } catch {
    return null
  }
}

export function departamentoDe(puntoId: string): string | null {
  return DEPARTAMENTO_DE_PUNTO[puntoId] ?? null
}

function lineaCultivo(id: string, c: HistoricoCultivo, fase: Fase, permanente = false): string {
  const nombre = NOMBRE[id] ?? id
  const f = c[fase]
  const partes: string[] = []
  if (f && f.n >= 3) {
    partes.push(
      `en años ${FASE[fase]} (${f.n}): mediana ${f.mediana} % del potencial, buen año ${f.buenos} de ${f.n}, fracaso ${f.fracasos} de ${f.n}, peor ${f.peor} (${f.peor_rel} %)`,
    )
  } else {
    partes.push(`pocos años ${FASE[fase]} para comparar`)
  }
  const t = c.todo
  partes.push(`todos los años (${t.n}): mediana ${t.mediana} %, buen año ${t.buenos} de ${t.n}, fracaso ${t.fracasos} de ${t.n}`)
  partes.push(`últimos 10 años: mediana ${c.ultimos10.mediana} %, fracaso ${c.ultimos10.fracasos} de ${c.ultimos10.n}`)
  if (c.solo_con_riego) partes.push(`solo con riego: le faltan ${c.riego_mediana_mm} mm que hay que regar (mediana)`)
  else if (permanente && c.riego_mediana_mm > 0)
    partes.push(`calculado sin riego: le faltan ${c.riego_mediana_mm} mm al año (mediana); donde se riega, el agua deja de limitar`)
  if (c.calor_mediana > 0) partes.push(`días de calor dañino (mediana): ${c.calor_mediana}`)
  if (c.zona_tradicional === false) partes.push('no es zona tradicional de este cultivo')
  return `- ${nombre}: ${partes.join('; ')}.`
}

/**
 * Texto corto para Gemini con el historico recortado a la consulta. `extra` agrega cultivos que el
 * productor menciona aunque no esten en el ranking. Si no hay historico, devuelve ''.
 */
export function recorteHistorico(h: HistoricoDepartamento | null, d: Decision, extra: string[] = []): string {
  if (!h) return ''
  const fase = h.enso_actual.fase
  const top = d.rotaciones.slice(0, 3)
  const temporadas = new Set<string>([d.entrada.temporada])
  const cultivos = new Set<string>([d.entrada.cultivoId, ...extra])
  for (const r of top) {
    for (const p of r.pasos) {
      temporadas.add(p.temporada)
      if (p.cultivoId) cultivos.add(p.cultivoId)
    }
  }
  const lineas = [
    `Historial de ${h.departamento}, ${h.periodo} (cada cultivo simulado año por año con la lluvia y el calor reales del departamento; rendimiento en % del que daría sin falta de agua ni calor; buen año = 70 % o más; fracaso = menos de 40 %). El clima es de una celda de unos 50 km: en fincas de altura (por ejemplo café) hace menos calor del que aquí se cuenta.`,
    `El Niño / La Niña: el último dato (${h.enso_actual.trimestre}) es ONI ${h.enso_actual.oni}, fase ${FASE[fase]}. Se comparan los años con esa misma fase; si el pronóstico de NOAA anuncia un cambio de fase antes de la siembra, la comparación cambia.`,
  ]
  for (const temp of ['primera', 'postrera', 'verano'] as const) {
    if (!temporadas.has(temp)) continue
    const t = h.temporadas[temp]
    if (!t) continue
    const ids = Object.keys(t.cultivos).filter((id) => cultivos.has(id))
    if (!ids.length) continue
    lineas.push('', `${TEMPORADA[temp]}: siembra típica ${t.siembra_mediana ?? 'sin dato'}, lluvia del ciclo (mediana) ${t.lluvia_mediana_mm} mm.`)
    lineas.push(...ids.map((id) => lineaCultivo(id, t.cultivos[id], fase)))
    if (t.mejor_cultivo_secano_veces) {
      const veces = Object.entries(t.mejor_cultivo_secano_veces).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
      lineas.push(`- Sin riego, el que mejor rindió cada año: ${veces.map(([id, n]) => `${NOMBRE[id] ?? id} ${n} veces`).join(', ')}.`)
    }
    if (t.anios_extremos) {
      const peores = t.anios_extremos.peores.map((x) => `${x.anio} (${FASE[x.enso as Fase] ?? x.enso}, maíz ${x.maiz_rel} %, salvó más el ${(NOMBRE[x.mejor] ?? x.mejor).toLowerCase()})`)
      lineas.push(`- Peores años: ${peores.join('; ')}.`)
    }
  }
  // Cultivos de exportacion que ya se siembran en el departamento.
  const exp: string[] = []
  for (const id of EXPORTACION) {
    const temp = (['anual', 'verano', 'postrera', 'primera'] as const).find((x) => h.temporadas[x]?.cultivos[id])
    if (!temp) continue
    const c = h.temporadas[temp]!.cultivos[id]
    if (!c.zona_tradicional && !cultivos.has(id)) continue
    const m = h.mercado_exportacion[id]
    const mercado = m ? ` Exportación nacional: ${m.usd_2024_millones} millones de dólares en 2024 (${m.pct_exportaciones_2024} % de lo que exporta Honduras; promedio 2015-2024: ${m.usd_prom_2015_2024_millones}).` : ''
    exp.push(`${lineaCultivo(id, c, fase, temp === 'anual').replace(/\.$/, '')} [${TEMPORADA[temp]}].${mercado}`)
  }
  if (exp.length) lineas.push('', 'Cultivos de exportación de la zona (Atlas de Complejidad Económica, Harvard):', ...exp)
  return lineas.join('\n')
}
