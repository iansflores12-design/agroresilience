// Contrato del modulo de recomendacion de siembra. La logica (preguntas, gps, motor) y la pantalla
// dependen solo de estos tipos. Primera version: las condiciones salen de un fixture mockup
// (fixtures/condiciones.mock.json). Mas adelante el script de procesamiento del equipo generara un
// archivo con la MISMA forma (`CondicionesArchivo`) a partir de datos reales y se comparara con el mockup.

/** Pasos del flujo de preguntas, en orden. */
export type PasoSiembra = 'cultivo' | 'dias' | 'objetivo' | 'terreno' | 'ubicacion' | 'resultado'

export const PASOS: PasoSiembra[] = ['cultivo', 'dias', 'objetivo', 'terreno', 'ubicacion', 'resultado']

/** Lo que la persona quiere lograr. */
export type Objetivo = 'agua' | 'rendimiento' | 'suelo' | 'costo'

export const OBJETIVOS: { id: Objetivo; nombre: string }[] = [
  { id: 'agua', nombre: 'Ahorrar agua' },
  { id: 'rendimiento', nombre: 'Cosechar más' },
  { id: 'suelo', nombre: 'Cuidar la tierra' },
  { id: 'costo', nombre: 'Gastar menos' },
]

export type Textura = 'arenoso' | 'franco' | 'arcilloso'
export type Pendiente = 'plana' | 'ondulada' | 'inclinada'
export type Drenaje = 'bueno' | 'regular' | 'malo'

export interface Terreno {
  textura: Textura
  pendiente: Pendiente
  drenaje: Drenaje
  /** Tiene alguna forma de regar (pozo, quebrada, sistema). */
  tieneRiego: boolean
}

export type OrigenUbicacion = 'gps' | 'manual'

export interface Ubicacion {
  lat: number
  lon: number
  /** Precision reportada por el GPS, en metros. null si se escribio a mano. */
  precisionM: number | null
  origen: OrigenUbicacion
}

/** Respuestas completas del flujo. Todas obligatorias antes de recomendar. */
export interface RespuestasSiembra {
  cultivoId: string
  diasDesdeSiembra: number
  objetivo: Objetivo
  terreno: Terreno
  ubicacion: Ubicacion
}

/** Respuestas mientras se llena el flujo. */
export type RespuestasParciales = Partial<RespuestasSiembra>

export type ErrorGps = 'no_disponible' | 'permiso' | 'tiempo' | 'fuera_de_zona' | 'posicion'

// ---------- Condiciones del lugar (mockup ahora, datos reales despues) ----------

/** Condiciones en un punto. Unidades en el nombre del campo. null = sin dato. */
export interface PuntoCondiciones {
  id: string
  nombre: string
  lat: number
  lon: number
  humedadSuelo_m3m3: number | null
  lluvia30d_mm: number | null
  lluviaNormal30d_mm: number | null
  temperatura_c: number | null
  arcilla_pct: number | null
  arena_pct: number | null
}

/** Forma del archivo de condiciones: la produce el mockup y, despues, el script con datos reales. */
export interface CondicionesArchivo {
  version: 1
  /** 'mockup' para el fixture; el nombre del proceso para datos reales. */
  origen: string
  generado: string
  /** Caja que se acepta como zona de trabajo (Honduras). */
  caja: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
  puntos: PuntoCondiciones[]
}

// ---------- Recomendacion ----------

export type IdOpcion = 'riego_goteo' | 'riego_auxiliar' | 'cobertura_rastrojo' | 'drenaje_surcos' | 'curvas_nivel' | 'esperar_monitorear'

export interface OpcionPuntuada {
  id: IdOpcion
  nombre: string
  /** 0 a 100. */
  puntaje: number
  /** Frases cortas de por que suma o resta, en orden de peso. */
  razones: string[]
}

export interface Recomendacion {
  mejor: OpcionPuntuada
  /** Todas las opciones, de mayor a menor puntaje (incluye la mejor). */
  opciones: OpcionPuntuada[]
  /** Punto de condiciones usado y distancia desde la ubicacion de la persona. */
  punto: { id: string; nombre: string; distanciaKm: number }
  /** Etapa del cultivo segun los dias desde la siembra. */
  etapa: { id: string; nombre: string; sensibilidadAgua: 'baja' | 'media' | 'alta' }
  /** 'mockup' mientras se use el fixture. */
  origenDatos: string
}
