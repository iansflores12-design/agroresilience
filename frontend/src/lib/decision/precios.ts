// Precios por region para Gemini Decision. Este modulo no usa el DOM ni la red: lo comparten el
// navegador y las funciones de `api/`. La busqueda en vivo esta en `api/_precios.ts`.
//
// Referencia nacional (revisada el 15-11-2026), en lempiras por quintal de 100 lb:
// - Maiz blanco L770 y frijol rojo L2,000: SIMPAH, reporte diario de granos basicos SPSMC_GB No. 149,
//   mercado Medina-Concepcion de San Pedro Sula, 24-08-2026 (cargas de 200 lb a L1,540 y L4,000).
//   https://fhia.org.hn/wp-content/uploads/2.3._reporte_diario_precios_granos_medina_concepcion.pdf
// - Arroz en granza L545: precio de garantia del convenio arrocero (ver parametros.ts).
// - Tomate L1,250: L10 a L15 la libra en San Pedro Sula (La Prensa, 2026). Muy variable.
// - Sorgo L1,600: L16 la libra al detalle en agosto de 2026 (monitoreo de granos basicos OBSAN-UNAH
//   con datos de SIMPAH). Es precio al consumidor, APROXIMADO como referencia.

export interface PrecioCultivo {
  /** Lempiras por quintal de 100 lb. */
  lempirasQq: number
  /** Mercado o plaza del precio. */
  mercado: string
  /** Fecha del precio, AAAA-MM-DD o AAAA-MM. */
  fecha: string
  fuente: string
}

export interface PreciosRegion {
  region: string
  /** `busqueda`: precios de la region encontrados en la web. `referencia`: solo la tabla nacional. */
  origen: 'busqueda' | 'referencia'
  /** Dia en que se consultaron, AAAA-MM-DD. */
  consultado: string
  /** Solo los cultivos con precio de la region. */
  cultivos: Record<string, PrecioCultivo>
  /** Paginas que uso la busqueda. */
  fuentes: { titulo: string; url: string }[]
}

export interface PrecioReferencia extends PrecioCultivo {
  /** Como se le pide el precio a la busqueda, para comparar lo mismo con lo mismo. */
  nivel: string
}

export const PRECIOS_REFERENCIA: Record<string, PrecioReferencia> = {
  maiz: { lempirasQq: 770, mercado: 'San Pedro Sula', fecha: '2026-08-24', fuente: 'SIMPAH, reporte diario de granos básicos', nivel: 'maíz blanco al por mayor' },
  frijol: { lempirasQq: 2000, mercado: 'San Pedro Sula', fecha: '2026-08-24', fuente: 'SIMPAH, reporte diario de granos básicos', nivel: 'frijol rojo al por mayor' },
  arroz: { lempirasQq: 545, mercado: 'Honduras', fecha: '2026', fuente: 'Precio de garantía del convenio arrocero', nivel: 'arroz en granza pagado al productor' },
  tomate: { lempirasQq: 1250, mercado: 'San Pedro Sula', fecha: '2026', fuente: 'La Prensa, mercados de San Pedro Sula', nivel: 'tomate al por mayor' },
  sorgo: { lempirasQq: 1600, mercado: 'Tegucigalpa', fecha: '2026-08', fuente: 'OBSAN-UNAH con datos de SIMPAH', nivel: 'sorgo o maicillo al detalle (la medida de 5 lb pasada a quintal)' },
}

/** Un precio de la region solo se acepta dentro de este rango frente a la referencia. */
export const RANGO_CREIBLE: [number, number] = [0.5, 2]

/** Cuanto puede mover el precio de la region el indice de mercado (0-100) de un cultivo. */
export const AJUSTE_MAXIMO = 15

export function preciosDeReferencia(region: string, consultado = ''): PreciosRegion {
  return { region, origen: 'referencia', consultado, cultivos: {}, fuentes: [] }
}

export function precioCreible(id: string, lempirasQq: number): boolean {
  const ref = PRECIOS_REFERENCIA[id]
  if (!ref || !Number.isFinite(lempirasQq)) return false
  const razon = lempirasQq / ref.lempirasQq
  return razon >= RANGO_CREIBLE[0] && razon <= RANGO_CREIBLE[1]
}

/**
 * Puntos que el precio de la region suma o resta al indice de mercado del cultivo: 10 % sobre la
 * referencia nacional son 4 puntos, con tope de 15. Sin precio de la region no cambia nada.
 */
export function ajustePorPrecio(id: string, precios?: PreciosRegion | null): number {
  const local = precios?.cultivos[id]
  const ref = PRECIOS_REFERENCIA[id]
  if (!local || !ref || !precioCreible(id, local.lempirasQq)) return 0
  const puntos = Math.round(40 * (local.lempirasQq / ref.lempirasQq - 1))
  return Math.max(-AJUSTE_MAXIMO, Math.min(AJUSTE_MAXIMO, puntos))
}

export const lempiras = (v: number) => 'L' + Math.round(v).toLocaleString('en-US')

/** AAAA-MM-DD, AAAA-MM o AAAA como se lee en Honduras: DD-MM-AAAA. */
export function fechaCorta(f: string): string {
  const [a, m, d] = f.split('-')
  return d ? `${d}-${m}-${a}` : m ? `${m}-${a}` : a
}

/** El precio con el que se califica cada cultivo: el de la region si se hallo; si no, la referencia. */
export interface PrecioUsado extends PrecioCultivo {
  id: string
  deRegion: boolean
  /** Puntos que suma o resta al indice de mercado del cultivo. */
  ajuste: number
  referenciaQq: number
}

export function preciosUsados(precios?: PreciosRegion | null): PrecioUsado[] {
  return Object.entries(PRECIOS_REFERENCIA).map(([id, ref]) => {
    const ajuste = ajustePorPrecio(id, precios)
    const local = precios?.cultivos[id]
    const deRegion = Boolean(local && precioCreible(id, local.lempirasQq))
    const p = deRegion && local ? local : ref
    return { id, lempirasQq: p.lempirasQq, mercado: p.mercado, fecha: p.fecha, fuente: p.fuente, deRegion, ajuste, referenciaQq: ref.lempirasQq }
  })
}
