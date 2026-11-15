// CONTENIDO ILUSTRATIVO para la interfaz. Pendiente de validacion con el equipo agronomico:
// las etapas, sensibilidades y duraciones son aproximaciones y no deben usarse como guia de campo.

export interface EtapaCultivo {
  id: string
  nombre: string
  /** Primera semana de la etapa (inclusive). */
  desdeSemana: number
  /** Ultima semana de la etapa (inclusive). */
  hastaSemana: number
  sensibilidadAgua: 'baja' | 'media' | 'alta'
}

export interface Cultivo {
  id: string
  nombre: string
  nombreCientifico: string
  familia: 'gramínea' | 'leguminosa' | 'hortaliza' | 'cobertura' | 'perenne'
  /** Cultivo permanente (cafe, platano, palma, cana): no se rota por temporadas. */
  perenne?: boolean
  /** Semanas desde la siembra hasta la primera cosecha (o el ciclo completo si no es permanente). */
  cicloSemanas: number
  etapas: EtapaCultivo[]
}

type Sensibilidad = EtapaCultivo['sensibilidadAgua']

function etapa(id: string, nombre: string, desde: number, hasta: number, s: Sensibilidad): EtapaCultivo {
  return { id, nombre, desdeSemana: desde, hastaSemana: hasta, sensibilidadAgua: s }
}

export const cultivos: Cultivo[] = [
  {
    id: 'maiz',
    nombre: 'Maíz',
    nombreCientifico: 'Zea mays',
    familia: 'gramínea',
    cicloSemanas: 17,
    etapas: [
      etapa('emergencia', 'Emergencia', 0, 2, 'media'),
      etapa('vegetativa', 'Crecimiento vegetativo', 3, 7, 'media'),
      etapa('floracion', 'Floración', 8, 10, 'alta'),
      etapa('llenado', 'Llenado de grano', 11, 14, 'alta'),
      etapa('maduracion', 'Maduración', 15, 17, 'baja'),
    ],
  },
  {
    id: 'frijol',
    nombre: 'Frijol',
    nombreCientifico: 'Phaseolus vulgaris',
    familia: 'leguminosa',
    cicloSemanas: 12,
    etapas: [
      etapa('emergencia', 'Emergencia', 0, 1, 'media'),
      etapa('vegetativa', 'Crecimiento vegetativo', 2, 4, 'media'),
      etapa('floracion', 'Floración', 5, 7, 'alta'),
      etapa('vainas', 'Llenado de vainas', 8, 10, 'alta'),
      etapa('maduracion', 'Maduración', 11, 12, 'baja'),
    ],
  },
  {
    id: 'sorgo',
    nombre: 'Sorgo (maicillo)',
    nombreCientifico: 'Sorghum bicolor',
    familia: 'gramínea',
    cicloSemanas: 16,
    etapas: [
      etapa('emergencia', 'Emergencia', 0, 2, 'baja'),
      etapa('macollamiento', 'Macollamiento', 3, 6, 'media'),
      etapa('floracion', 'Embuche y floración', 7, 9, 'alta'),
      etapa('llenado', 'Llenado de grano', 10, 13, 'media'),
      etapa('maduracion', 'Maduración', 14, 16, 'baja'),
    ],
  },
  {
    id: 'arroz',
    nombre: 'Arroz',
    nombreCientifico: 'Oryza sativa',
    familia: 'gramínea',
    cicloSemanas: 18,
    etapas: [
      etapa('establecimiento', 'Establecimiento', 0, 3, 'alta'),
      etapa('macollamiento', 'Macollamiento', 4, 8, 'alta'),
      etapa('floracion', 'Panícula y floración', 9, 12, 'alta'),
      etapa('lechoso', 'Grano lechoso', 13, 15, 'media'),
      etapa('maduracion', 'Maduración', 16, 18, 'baja'),
    ],
  },
  {
    id: 'tomate',
    nombre: 'Tomate',
    nombreCientifico: 'Solanum lycopersicum',
    familia: 'hortaliza',
    cicloSemanas: 16,
    etapas: [
      etapa('trasplante', 'Trasplante y arraigo', 0, 2, 'alta'),
      etapa('vegetativa', 'Crecimiento vegetativo', 3, 6, 'media'),
      etapa('floracion', 'Floración y cuajado', 7, 10, 'alta'),
      etapa('fructificacion', 'Fructificación', 11, 14, 'alta'),
      etapa('cosecha', 'Cosecha', 15, 16, 'media'),
    ],
  },
  {
    id: 'frijol-terciopelo',
    nombre: 'Frijol terciopelo',
    nombreCientifico: 'Mucuna pruriens',
    familia: 'cobertura',
    cicloSemanas: 20,
    etapas: [
      etapa('establecimiento', 'Establecimiento', 0, 3, 'media'),
      etapa('crecimiento', 'Crecimiento de cobertura', 4, 12, 'baja'),
      etapa('floracion', 'Floración', 13, 16, 'baja'),
      etapa('maduracion', 'Maduración', 17, 20, 'baja'),
    ],
  },
  // Los mayores cultivos de exportacion de Honduras segun el Atlas of Economic Complexity (Harvard
  // Growth Lab, exportaciones de 2024): cafe US$1,240 M, aceite de palma US$366 M, banano y platano
  // US$263 M, puros (tabaco) US$149 M, cana de azucar US$127 M y melon y papaya US$117 M.
  // https://atlas.hks.harvard.edu/explore/treemap/?exporter=country-340&importer=group-1
  {
    id: 'cafe',
    nombre: 'Café',
    nombreCientifico: 'Coffea arabica',
    familia: 'perenne',
    perenne: true,
    cicloSemanas: 156,
    etapas: [
      etapa('establecimiento', 'Vivero y establecimiento', 0, 25, 'alta'),
      etapa('crecimiento', 'Crecimiento del cafeto', 26, 103, 'media'),
      etapa('produccion', 'Producción', 104, 156, 'media'),
    ],
  },
  {
    id: 'platano',
    nombre: 'Banano y plátano',
    nombreCientifico: 'Musa spp.',
    familia: 'perenne',
    perenne: true,
    cicloSemanas: 52,
    etapas: [
      etapa('establecimiento', 'Siembra del hijo', 0, 8, 'alta'),
      etapa('vegetativa', 'Crecimiento', 9, 28, 'media'),
      etapa('floracion', 'Parición (floración)', 29, 36, 'alta'),
      etapa('llenado', 'Llenado del racimo', 37, 48, 'alta'),
      etapa('cosecha', 'Cosecha', 49, 52, 'media'),
    ],
  },
  {
    id: 'palma',
    nombre: 'Palma africana',
    nombreCientifico: 'Elaeis guineensis',
    familia: 'perenne',
    perenne: true,
    cicloSemanas: 156,
    etapas: [
      etapa('establecimiento', 'Establecimiento', 0, 25, 'alta'),
      etapa('crecimiento', 'Crecimiento', 26, 129, 'media'),
      etapa('produccion', 'Producción de racimos', 130, 156, 'media'),
    ],
  },
  {
    id: 'cana',
    nombre: 'Caña de azúcar',
    nombreCientifico: 'Saccharum officinarum',
    familia: 'gramínea',
    perenne: true,
    cicloSemanas: 52,
    etapas: [
      etapa('brotacion', 'Brotación', 0, 6, 'alta'),
      etapa('macollamiento', 'Macollamiento', 7, 17, 'alta'),
      etapa('crecimiento', 'Gran crecimiento', 18, 39, 'alta'),
      etapa('maduracion', 'Maduración', 40, 52, 'baja'),
    ],
  },
  {
    id: 'melon',
    nombre: 'Melón',
    nombreCientifico: 'Cucumis melo',
    familia: 'hortaliza',
    cicloSemanas: 12,
    etapas: [
      etapa('emergencia', 'Emergencia', 0, 1, 'media'),
      etapa('vegetativa', 'Guías', 2, 4, 'media'),
      etapa('floracion', 'Floración', 5, 6, 'alta'),
      etapa('fructificacion', 'Crecimiento del fruto', 7, 10, 'alta'),
      etapa('cosecha', 'Cosecha', 11, 12, 'baja'),
    ],
  },
  {
    id: 'tabaco',
    nombre: 'Tabaco',
    nombreCientifico: 'Nicotiana tabacum',
    familia: 'hortaliza',
    cicloSemanas: 16,
    etapas: [
      etapa('trasplante', 'Trasplante', 0, 2, 'alta'),
      etapa('crecimiento', 'Crecimiento', 3, 7, 'media'),
      etapa('despunte', 'Botón floral y despunte', 8, 10, 'media'),
      etapa('cosecha', 'Corte de hojas', 11, 16, 'baja'),
    ],
  },
]

export function buscarCultivo(id: string | null): Cultivo | null {
  if (!id) return null
  return cultivos.find((c) => c.id === id) ?? null
}

/** Etapa que corresponde a una semana. Fuera de rango devuelve la primera o la ultima. */
export function etapaEnSemana(cultivo: Cultivo, semana: number): EtapaCultivo {
  const etapas = cultivo.etapas
  if (!(semana > etapas[0].desdeSemana)) return etapas[0]
  const encontrada = etapas.find((e) => semana >= e.desdeSemana && semana <= e.hastaSemana)
  if (encontrada) return encontrada
  // Hueco entre etapas (semanas fraccionarias): la ultima que ya empezo.
  const empezadas = etapas.filter((e) => e.desdeSemana <= semana)
  return empezadas[empezadas.length - 1] ?? etapas[etapas.length - 1]
}
