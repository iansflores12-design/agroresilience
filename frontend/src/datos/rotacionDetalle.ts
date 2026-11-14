// CONTENIDO ILUSTRATIVO para la interfaz. Pendiente de validacion con el equipo agronomico y con tecnicos
// de campo. Sin dosis ni productos agroquimicos y sin cifras de rendimiento inventadas.
//
// Regla de honestidad: una plaga o enfermedad solo cuenta para decir "esta rotacion corta (o no corta) el
// ciclo" si `confirmado` es true, es decir, si hay una fuente que respalda que ataca a ese cultivo. Lo que
// no se pudo confirmar se muestra aparte como "por confirmar con el tecnico" y nunca se afirma.
// Los titulos de las fuentes son descriptivos y las direcciones salieron de una busqueda web: un tecnico debe
// revisarlas antes de usar este contenido como guia de campo.

import { buscarCultivo, type Cultivo } from './cultivos'
import { tipoCambioDe } from '../lib/recomendacion/situacion'
import type { TipoCambio } from '../lib/recomendacion/tipos'
import type { NombreIcono } from '../componentes/iconos'

/* ---------- Fuentes ---------- */

export interface FuenteDetalle {
  id: string
  titulo: string
  institucion: string
  url: string
}

function f(id: string, titulo: string, institucion: string, url: string): FuenteDetalle {
  return { id, titulo, institucion, url }
}

export const fuentes: Record<string, FuenteDetalle> = Object.fromEntries(
  [
    f(
      'fao-legumbres',
      'Las legumbres y los suelos: un dúo dinámico',
      'FAO, Alianza Mundial por el Suelo',
      'https://www.fao.org/global-soil-partnership/resources/highlights/detail/es/c/1676775/',
    ),
    f(
      'fao-ca',
      'Agricultura de conservación: diversificación de especies',
      'FAO',
      'https://www.fao.org/conservation-agriculture/in-practice/species-diversification/es/',
    ),
    f(
      'attra',
      'Rotación de cultivos en sistemas agrícolas orgánicos',
      'USDA, Servicio de Mercadeo Agrícola (ATTRA)',
      'https://www.ams.usda.gov/sites/default/files/media/FINAL%20Rotacion%20de%20Cultivos%20en%20Sistemas%20Agricolas%20Organicos.pdf',
    ),
    f(
      'cogollero-catie',
      'Fall armyworm and neotropical cornstalk borer on sorghum and maize intercropped with legumes in Honduras',
      'CATIE (repositorio institucional)',
      'https://repositorio.catie.ac.cr/handle/11554/9568',
    ),
    f(
      'cogollero-arroz',
      'Gusano cogollero en maíz y arroz (ficha técnica)',
      'Gobierno de México',
      'https://www.gob.mx/cms/uploads/attachment/file/635236/Gusano_cogollero_en_ma_z_y_arroz.pdf',
    ),
    f(
      'gallina-ciega',
      'Gallina ciega (Phyllophaga, Cyclocephala y Anomala), principal plaga del suelo del maíz en Centroamérica',
      'Escuela Agrícola Panamericana Zamorano, revista CEIBA',
      'https://revistas.zamorano.edu/CEIBA/article/download/568/546/837',
    ),
    f(
      'asfalto',
      'Mancha de asfalto del maíz en Honduras: epidemiología e impacto en el rendimiento (2021)',
      'Escuela Agrícola Panamericana Zamorano, revista CEIBA',
      'https://revistas.zamorano.edu/CEIBA/article/download/1269/1205/3413',
    ),
    f(
      'chicharrita',
      'Chicharrita del maíz (Dalbulus maidis) y complejo del achaparramiento',
      'Universidad de San Carlos de Guatemala, revista de investigación',
      'https://revistasguatemala.usac.edu.gt/index.php/riyc/article/download/1800/1563/3499',
    ),
    f(
      'frijol-ciat',
      'Enfermedades principales del frijol en el trópico: roya, mosaico y mustia hilachosa',
      'CIAT (CGIAR, repositorio CGSpace)',
      'https://cgspace.cgiar.org/server/api/core/bitstreams/89f3571d-01c3-431d-9f78-9ca6ecd0f7f8/content',
    ),
    f(
      'frijol-zam',
      'Mosaico dorado amarillo del frijol y mosca blanca en Centroamérica (2019)',
      'Escuela Agrícola Panamericana Zamorano',
      'https://bdigital.zamorano.edu/bitstreams/c5e60813-91b5-4807-bdd6-c620a166f621/download',
    ),
    f(
      'sorgo-zam',
      'Sondeo de enfermedades del sorgo en el sur y el centro de Honduras',
      'Escuela Agrícola Panamericana Zamorano, revista CEIBA',
      'https://revistas.zamorano.edu/CEIBA/article/download/656/624/1157',
    ),
    f(
      'arroz-zam',
      'Inventario de plagas y enfermedades del arroz en Honduras (1993)',
      'Escuela Agrícola Panamericana Zamorano, revista CEIBA',
      'https://revistas.zamorano.edu/CEIBA/article/download/415/406/409',
    ),
    f(
      'tomate-uprm',
      'Enfermedades del tomate',
      'Universidad de Puerto Rico en Mayagüez, Estación Experimental Agrícola',
      'https://www.uprm.edu/eea/wp-content/uploads/sites/177/2016/04/TOMATE-Enfermedades-v2007.pdf',
    ),
    f(
      'tomate-bioagro',
      'Ralstonia solanacearum y Meloidogyne incognita en tomate',
      'Bioagro (Venezuela)',
      'https://ve.scielo.org/pdf/ba/v28n2/art05.pdf',
    ),
  ].map((x) => [x.id, x]),
)

/* ---------- Datos por cultivo ---------- */

export interface Problema {
  /** Clave de la plaga o enfermedad: dos cultivos que la comparten tienen la misma. */
  grupo: string
  /** Nombre comun, en minusculas. */
  comun: string
  cientifico: string | null
  /** Que daña, en pocas palabras. */
  dano: string
  /** Hay una fuente que respalda que ataca a este cultivo. */
  confirmado: boolean
  fuente: string | null
  /** Ataca a muchos cultivos distintos (por ejemplo la gallina ciega): conviene preguntar al tecnico. */
  amplio?: boolean
}

function p(
  grupo: string,
  comun: string,
  cientifico: string | null,
  dano: string,
  fuente: string | null,
  extra: { amplio?: boolean } = {},
): Problema {
  return { grupo, comun, cientifico, dano, confirmado: fuente !== null, fuente, ...extra }
}

export interface DatosCultivo {
  plagas: Problema[]
  enfermedades: Problema[]
  /** Pide mucho nitrogeno a la tierra. */
  extraeNitrogeno: boolean
  /** Deja nitrogeno en la tierra. */
  fijaNitrogeno: boolean
  cubreSuelo: boolean
  /** Que pasa con lo que queda despues de cosechar. */
  rastrojo: string
  etapaDelicada: string
  fuenteSuelo: string[]
}

export const datosCultivo: Record<string, DatosCultivo> = {
  maiz: {
    plagas: [
      p('cogollero', 'gusano cogollero', 'Spodoptera frugiperda', 'se come el cogollo y las hojas tiernas', 'cogollero-catie'),
      p('gallina-ciega', 'gallina ciega', 'Phyllophaga spp.', 'larvas que comen las raíces desde la tierra', 'gallina-ciega', { amplio: true }),
      p('chicharrita-maiz', 'chicharrita del maíz', 'Dalbulus maidis', 'pasa el achaparramiento de planta en planta', 'chicharrita'),
    ],
    enfermedades: [
      p('mancha-asfalto', 'mancha de asfalto', 'Phyllachora maydis y Monographella maydis', 'manchas negras que secan la hoja', 'asfalto'),
      p('achaparramiento', 'achaparramiento del maíz', 'espiroplasma, llevado por la chicharrita', 'plantas bajas, amarillas y con poca mazorca', 'chicharrita'),
    ],
    extraeNitrogeno: true,
    fijaNitrogeno: false,
    cubreSuelo: false,
    rastrojo:
      'Deja bastante rastrojo, que tapa la tierra y le aporta materia al pudrirse. Si el maíz tuvo mancha de asfalto, pregunte al técnico qué hacer con ese rastrojo (por confirmar).',
    etapaDelicada: 'la floración y el llenado del grano',
    fuenteSuelo: ['attra'],
  },
  frijol: {
    plagas: [
      p('mosca-blanca', 'mosca blanca', 'Bemisia tabaci', 'chupa la savia y pasa el mosaico dorado', 'frijol-zam'),
      p('chicharrita-frijol', 'chicharrita del frijol', 'Empoasca kraemeri', 'chupa la savia y enrosca las hojas', null),
      p('diabroticas', 'diabróticas (tortuguillas)', null, 'se comen las hojas y las larvas dañan la raíz', null),
    ],
    enfermedades: [
      p('mosaico-dorado', 'mosaico dorado del frijol', 'virus del mosaico dorado amarillo del frijol', 'hojas amarillas y vainas deformes', 'frijol-zam'),
      p('rhizoctonia', 'mustia hilachosa', 'Rhizoctonia solani', 'hongo que seca las hojas con una tela blanquecina', 'frijol-ciat'),
      p('roya-frijol', 'roya del frijol', 'Uromyces appendiculatus', 'puntitos color óxido en las hojas', null),
      p('mancha-angular', 'mancha angular', 'Phaseoisariopsis griseola', 'manchas con forma angular en las hojas', null),
    ],
    extraeNitrogeno: false,
    fijaNitrogeno: true,
    cubreSuelo: false,
    rastrojo: 'Deja un rastrojo blando y con nitrógeno, que se pudre rápido y alimenta la tierra.',
    etapaDelicada: 'la floración y el llenado de las vainas',
    fuenteSuelo: ['fao-legumbres'],
  },
  sorgo: {
    plagas: [p('cogollero', 'gusano cogollero', 'Spodoptera frugiperda', 'se come el cogollo y las hojas tiernas', 'cogollero-catie')],
    enfermedades: [
      p('carbon-sorgo', 'carbón cubierto del sorgo', 'Sporisorium sorghi', 'hongo que convierte el grano en polvo negro', 'sorgo-zam'),
      p('roya-sorgo', 'roya del sorgo', 'Puccinia purpurea', 'puntitos color óxido en las hojas', 'sorgo-zam'),
      p('antracnosis-sorgo', 'antracnosis del sorgo', 'Colletotrichum sp.', 'manchas en hojas y tallo', 'sorgo-zam'),
      p('mildiu-sorgo', 'cenicilla (mildiu) del sorgo', 'Peronosclerospora sorghi', 'hongo que raya y seca las hojas', 'sorgo-zam'),
    ],
    extraeNitrogeno: true,
    fijaNitrogeno: false,
    cubreSuelo: false,
    rastrojo: 'Deja rastrojo que tapa la tierra. Algunos cultivos crecen difícil después del sorgo: pregunte al técnico (por confirmar).',
    etapaDelicada: 'el embuche y la floración',
    fuenteSuelo: ['attra'],
  },
  arroz: {
    plagas: [
      p('cogollero', 'gusano cogollero', 'Spodoptera frugiperda', 'se come el cogollo y las hojas tiernas', 'cogollero-arroz'),
      p('sogata', 'sogata', 'Tagosodes orizicolus', 'chupa la savia y pasa la hoja blanca', null),
    ],
    enfermedades: [
      p('piricularia', 'piricularia (quemazón del arroz)', 'Pyricularia oryzae', 'manchas que queman la hoja y el cuello de la espiga', 'arroz-zam'),
      p('rhizoctonia', 'añublo de la vaina', 'Rhizoctonia solani', 'hongo que pudre la vaina cerca del agua', null),
    ],
    extraeNitrogeno: true,
    fijaNitrogeno: false,
    cubreSuelo: false,
    rastrojo: 'Deja paja y rastrojo que, si se manejan bien, regresan materia a la tierra (por confirmar con el técnico).',
    etapaDelicada: 'la formación de la espiga y la floración',
    fuenteSuelo: ['attra'],
  },
  tomate: {
    plagas: [p('mosca-blanca', 'mosca blanca', 'Bemisia tabaci', 'chupa la savia y pasa virus', null)],
    enfermedades: [
      p('fusarium-tomate', 'marchitez por Fusarium', 'Fusarium oxysporum f. sp. lycopersici', 'hongo del suelo que marchita la planta', 'tomate-uprm'),
      p('ralstonia', 'marchitez bacteriana', 'Ralstonia solanacearum', 'bacteria del suelo que marchita la planta de golpe', 'tomate-bioagro'),
      p('meloidogyne', 'nematodos agalladores', 'Meloidogyne incognita', 'gusanitos del suelo que hacen bolas en la raíz', 'tomate-bioagro'),
      p('tizon-tardio', 'tizón tardío', 'Phytophthora infestans', 'manchas oscuras que pudren hojas y frutos con lluvia', 'tomate-uprm'),
    ],
    extraeNitrogeno: true,
    fijaNitrogeno: false,
    cubreSuelo: false,
    rastrojo: 'Los restos de la planta pueden guardar enfermedades: pregunte al técnico cómo sacarlos o enterrarlos (por confirmar).',
    etapaDelicada: 'la floración y el cuajado del fruto',
    fuenteSuelo: ['fao-ca'],
  },
  'frijol-terciopelo': {
    plagas: [],
    enfermedades: [],
    extraeNitrogeno: false,
    fijaNitrogeno: true,
    cubreSuelo: true,
    rastrojo: 'Se corta y se deja sobre la tierra: la cubre y le aporta materia y nitrógeno.',
    etapaDelicada: 'el establecimiento, cuando todavía no tapa la tierra',
    fuenteSuelo: ['fao-legumbres', 'fao-ca'],
  },
}

/* ---------- Bloques de la pagina ---------- */

export type IdBloque = 'tierra' | 'plagas' | 'enfermedades' | 'cosecha'

export interface BloqueDetalle {
  id: IdBloque
  titulo: string
  icono: NombreIcono
  /** Primer nivel: una o dos frases cortas, de usted y sin jerga. */
  simple: string
  /** El efecto de este cambio en este tema, para el color y la palabra del bloque. */
  efecto: 'bueno' | 'regular' | 'malo'
  /** Segundo nivel, para el agronomo. */
  tecnico: { mecanismo: string; organismos: string[]; porConfirmar: string[] }
  /** Ids de `fuentes`. Siempre hay al menos una. */
  fuentes: string[]
}

export interface DetalleRotacion {
  actual: Cultivo
  siguiente: Cultivo
  tipo: TipoCambio
  repetir: boolean
  bloques: BloqueDetalle[]
  /** Fuentes de todos los bloques, sin repetir. */
  fuentes: FuenteDetalle[]
}

const TITULOS: Record<IdBloque, { titulo: string; icono: NombreIcono }> = {
  tierra: { titulo: 'La tierra', icono: 'landscape' },
  plagas: { titulo: 'Las plagas', icono: 'bug_report' },
  enfermedades: { titulo: 'Las enfermedades', icono: 'microbiology' },
  cosecha: { titulo: 'La cosecha', icono: 'agriculture' },
}

/** Nombre corto en minusculas: "sorgo (maicillo)" pasa a "sorgo". */
export function nombreCorto(c: Cultivo): string {
  return c.nombre.replace(/\s*\(.*\)/, '').toLowerCase()
}

function unir(lista: string[]): string {
  if (lista.length <= 1) return lista[0] ?? ''
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
}

function sinRepetir<T>(lista: T[]): T[] {
  return [...new Set(lista)]
}

function mayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Cultivos (de los seis) donde esta plaga o enfermedad esta confirmada. */
function dondeAtaca(grupo: string, clave: 'plagas' | 'enfermedades'): string[] {
  return Object.entries(datosCultivo)
    .filter(([, d]) => d[clave].some((x) => x.grupo === grupo && x.confirmado))
    .map(([id]) => buscarCultivo(id)?.nombre.replace(/\s*\(.*\)/, '').toLowerCase() ?? id)
}

function describirOrganismo(x: Problema, clave: 'plagas' | 'enfermedades'): string {
  const donde = dondeAtaca(x.grupo, clave)
  const nombre = x.cientifico ? `${mayuscula(x.comun)} (${x.cientifico})` : mayuscula(x.comun)
  return `${nombre}: ${x.dano}. Confirmado en ${unir(donde)}.`
}

interface Comparacion {
  cortadas: Problema[]
  compartidas: Problema[]
  propiasDelSiguiente: Problema[]
  sinDato: boolean
}

function comparar(a: Problema[], s: Problema[]): Comparacion {
  const ca = a.filter((x) => x.confirmado)
  const cs = s.filter((x) => x.confirmado)
  const grupos = new Set(cs.map((x) => x.grupo))
  return {
    cortadas: ca.filter((x) => !grupos.has(x.grupo)),
    compartidas: ca.filter((x) => grupos.has(x.grupo)),
    propiasDelSiguiente: cs.filter((x) => !ca.some((y) => y.grupo === x.grupo)),
    sinDato: ca.length === 0,
  }
}

function porConfirmar(a: DatosCultivo, s: DatosCultivo, clave: 'plagas' | 'enfermedades', nA: string, nS: string, repetir: boolean): string[] {
  const salida: string[] = []
  const dudosos = (d: DatosCultivo, n: string) =>
    d[clave].filter((x) => !x.confirmado).map((x) => `${mayuscula(x.comun)}${x.cientifico ? ` (${x.cientifico})` : ''} en ${n}: no pudimos confirmarlo con una fuente, confirme con el técnico.`)
  salida.push(...dudosos(a, nA))
  if (!repetir) salida.push(...dudosos(s, nS))
  if (clave === 'plagas' && a.plagas.some((x) => x.amplio)) {
    salida.push(`Algunas plagas del suelo, como la gallina ciega, atacan a varios cultivos: confirme con el técnico si en su lote también afectan al ${nS}.`)
  }
  return sinRepetir(salida)
}

function bloqueTierra(a: Cultivo, s: Cultivo, da: DatosCultivo, ds: DatosCultivo, repetir: boolean): BloqueDetalle {
  const nA = nombreCorto(a)
  const nS = nombreCorto(s)
  let simple: string
  let efecto: BloqueDetalle['efecto']
  let mecanismo: string
  let fuente: string[] = sinRepetir([...da.fuenteSuelo, ...ds.fuenteSuelo])

  if (repetir) {
    efecto = 'malo'
    simple = `Sembrar ${nA} otra vez en el mismo lote le saca a la tierra siempre lo mismo y no le deja nada nuevo.`
    if (da.extraeNitrogeno) simple += ` Además el ${nA} gasta mucho nitrógeno, que es el alimento principal de la planta.`
    if (da.fijaNitrogeno) simple = `El ${nA} le deja algo de nitrógeno a la tierra, pero sembrarlo otra vez en el mismo lote no cambia lo que la tierra recibe ni lo que se acumula en ella.`
    mecanismo =
      'Con el mismo cultivo seguido se repite la misma extracción de nutrientes y el mismo tipo de residuo; no se alternan raíces ni aportes. Alternar cultivos, sobre todo con leguminosas, es lo que repone nitrógeno y materia orgánica.'
    fuente = sinRepetir([...fuente, 'fao-legumbres'])
  } else if (ds.fijaNitrogeno && !da.fijaNitrogeno) {
    efecto = 'bueno'
    simple = `El ${nS} le deja nitrógeno a la tierra y le agrega materia con sus hojas y raíces.`
    if (da.extraeNitrogeno) simple += ` El ${nA} se lleva mucho, así que este cambio ayuda a devolver una parte.`
    if (ds.cubreSuelo) simple += ' Además tapa la tierra y la protege del sol y de la lluvia fuerte.'
    mecanismo =
      'Las leguminosas toman nitrógeno del aire con ayuda de bacterias de sus raíces y lo dejan en el suelo; sus raíces y residuos suman materia orgánica y mejoran la estructura. Un cultivo de cobertura además protege la superficie.'
    fuente = sinRepetir([...fuente, 'fao-legumbres', ...(ds.cubreSuelo ? ['fao-ca'] : [])])
  } else if (da.fijaNitrogeno && ds.extraeNitrogeno) {
    efecto = 'bueno'
    simple = `El ${nA} dejó nitrógeno en la tierra y el ${nS}, que pide bastante, lo aprovecha.`
    mecanismo =
      'Después de una leguminosa conviene sembrar un cultivo que pida mucho nitrógeno, como un cereal o una hortaliza, porque aprovecha lo que quedó en el suelo.'
    fuente = sinRepetir([...fuente, 'fao-legumbres', 'attra'])
  } else if (da.fijaNitrogeno && ds.fijaNitrogeno) {
    efecto = 'bueno'
    simple = `Tanto el ${nA} como el ${nS} dejan nitrógeno en la tierra, así que ella no se queda sin alimento.`
    mecanismo = 'Dos fijadores de nitrógeno seguidos mantienen el aporte al suelo; el beneficio sobre plagas y enfermedades depende de cada caso.'
    fuente = sinRepetir([...fuente, 'fao-legumbres'])
  } else {
    efecto = 'regular'
    simple = `El ${nA} y el ${nS} piden mucho nitrógeno a la tierra, y este cambio no le devuelve nada. Pregunte a su técnico cómo reponerlo.`
    mecanismo =
      'Dos cultivos extractivos seguidos agotan el nitrógeno disponible; cambiar de planta no repone nutrientes por sí solo. Conviene alternar con una leguminosa o una cobertura en alguna temporada.'
    fuente = sinRepetir([...fuente, 'attra', 'fao-legumbres'])
  }

  return {
    id: 'tierra',
    ...TITULOS.tierra,
    simple,
    efecto,
    tecnico: {
      mecanismo,
      organismos: [`Después del ${nA}: ${da.rastrojo}`],
      porConfirmar: [],
    },
    fuentes: fuente,
  }
}

function bloqueProblemas(
  id: 'plagas' | 'enfermedades',
  a: Cultivo,
  s: Cultivo,
  da: DatosCultivo,
  ds: DatosCultivo,
  repetir: boolean,
): BloqueDetalle {
  const nA = nombreCorto(a)
  const nS = nombreCorto(s)
  const cual = id === 'plagas' ? 'plagas' : 'enfermedades'
  const lista = da[id]
  const conf = lista.filter((x) => x.confirmado)
  const nombres = (l: Problema[]) => unir(l.map((x) => x.comun))
  let simple: string
  let efecto: BloqueDetalle['efecto']
  let mecanismo: string
  const fuente: string[] = ['fao-legumbres']

  if (repetir) {
    efecto = 'malo'
    if (conf.length > 0) {
      simple = `Si repite el ${nA}, ${id === 'plagas' ? 'las plagas' : 'las enfermedades'} que ya tuvo (${nombres(conf.slice(0, 3))}) encuentran comida otra vez y se van acumulando de una siembra a la otra.`
    } else {
      simple = `No tenemos confirmadas ${cual} principales del ${nA}, pero repetir un mismo cultivo hace que se acumulen las de ese cultivo. Consulte a su técnico.`
    }
    mecanismo =
      'Repetir el cultivo mantiene vivo al organismo entre una siembra y la siguiente: sobrevive en el rastrojo, en el suelo o en plantas vecinas y empieza cada ciclo con más población.'
    if (id === 'enfermedades' && a.id === 'tomate') {
      simple += ' Las enfermedades del suelo del tomate se quedan años en el lote.'
    }
  } else {
    const c = comparar(lista, ds[id])
    if (c.sinDato) {
      efecto = 'regular'
      simple = `No tenemos ${cual} principales confirmadas del ${nA}, así que no podemos decir si este cambio les corta el ciclo. Pregunte a su técnico.`
      mecanismo = 'Sin datos confirmados no se afirma qué ciclo se corta.'
    } else if (c.compartidas.length > 0 && c.cortadas.length === 0) {
      efecto = 'malo'
      simple = `Este cambio NO corta el ciclo de ${nombres(c.compartidas)}: también atacan al ${nS}, así que siguen teniendo comida en el lote.`
      mecanismo =
        'El organismo usa como hospedero a los dos cultivos, de modo que la rotación no le quita alimento y puede pasar de un cultivo al otro.'
    } else if (c.compartidas.length > 0) {
      efecto = 'regular'
      simple = `Corta el ciclo de ${nombres(c.cortadas)}, pero NO el de ${nombres(c.compartidas)}, que también atacan al ${nS}.`
      mecanismo =
        'Los organismos que solo viven en el cultivo anterior pierden su hospedero y bajan; los que también usan al siguiente cultivo siguen en el lote.'
    } else {
      efecto = 'bueno'
      simple = `Según lo que tenemos confirmado, ${nombres(c.cortadas)} no atacan al ${nS}, así que este cambio les corta el ciclo. Aun así pueden llegar de lotes vecinos o de las malezas.`
      mecanismo =
        'Al sembrar una planta que no es hospedera, el organismo se queda sin alimento durante la temporada y su población baja; no desaparece del todo porque puede venir de fuera del lote.'
    }
    if (c.propiasDelSiguiente.length > 0) {
      simple += ` Ojo: el ${nS} trae las suyas (${nombres(c.propiasDelSiguiente.slice(0, 2))}).`
    }
    if (id === 'enfermedades' && s.id === 'tomate' && a.id !== 'tomate') {
      simple += ' Las enfermedades del suelo del tomate pueden quedarse años en el lote: no siembre tomate seguido.'
    }
  }

  const involucrados = repetir ? conf : [...conf, ...ds[id].filter((x) => x.confirmado)]
  const fuentesProblema = involucrados.map((x) => x.fuente).filter((x): x is string => x !== null)
  if (id === 'enfermedades' && (a.id === 'tomate' || s.id === 'tomate')) fuente.push('tomate-uprm')
  const organismos = sinRepetir(involucrados.map((x) => describirOrganismo(x, id)))

  return {
    id,
    ...TITULOS[id],
    simple,
    efecto,
    tecnico: {
      mecanismo:
        id === 'enfermedades' && (a.id === 'tomate' || s.id === 'tomate')
          ? `${mecanismo} Para la marchitez por Fusarium en suelos infectados se aconseja rotar por lo menos de 4 a 5 años.`
          : mecanismo,
      organismos,
      porConfirmar: porConfirmar(da, ds, id, nA, nS, repetir),
    },
    fuentes: sinRepetir([...fuente, ...fuentesProblema]),
  }
}

function bloqueCosecha(a: Cultivo, s: Cultivo, ds: DatosCultivo, previos: BloqueDetalle[], repetir: boolean): BloqueDetalle {
  const nA = nombreCorto(a)
  const nS = nombreCorto(s)
  const [tierra, plagas, enfermedades] = previos
  let simple: string
  let efecto: BloqueDetalle['efecto']
  if (repetir) {
    efecto = 'malo'
    simple = `Con los años, repetir el ${nA} en el mismo lote suele dar menos cosecha: se juntan plagas y enfermedades y la tierra se cansa. Cuánto baja depende de su lote; consulte a su técnico.`
  } else if (tierra.efecto === 'bueno' && plagas.efecto !== 'malo' && enfermedades.efecto !== 'malo') {
    efecto = 'bueno'
    simple = `La siembra de ${nS} debería encontrar la tierra con más alimento y menos problemas del cultivo anterior. Cuánto mejora depende de la lluvia y del manejo; no podemos prometer una cantidad.`
  } else if (tierra.efecto === 'bueno') {
    efecto = 'regular'
    simple = `La tierra viene mejor, pero hay problemas que siguen de un cultivo al otro: cuide el ${nS} de cerca. Cuánto mejora la cosecha depende de la lluvia y del manejo.`
  } else {
    efecto = 'regular'
    simple = `Este cambio ayuda poco a la cosecha por sí solo. Lo que más pesa será el cuidado que le dé al ${nS} y la lluvia del año.`
  }
  simple += ` Su etapa más delicada es ${ds.etapaDelicada}.`
  return {
    id: 'cosecha',
    ...TITULOS.cosecha,
    simple,
    efecto,
    tecnico: {
      mecanismo:
        'El efecto sobre el rendimiento se explica por el nitrógeno disponible, la presión de plagas y enfermedades y el agua del año. Aquí se describe solo de forma cualitativa: no hay una cifra validada para Honduras.',
      organismos: [],
      porConfirmar: ['Cuánto cambia el rendimiento en su lote: depende del año, de la semilla y del manejo; confírmelo con su técnico.'],
    },
    fuentes: ['fao-legumbres', 'fao-ca'],
  }
}

/** Los cuatro bloques de "por que conviene" para un cambio de cultivo. Null si falta un cultivo o sus datos. */
export function detalleRotacion(actualId: string | null | undefined, siguienteId: string | null | undefined): DetalleRotacion | null {
  const actual = buscarCultivo(actualId ?? null)
  const siguiente = buscarCultivo(siguienteId ?? null)
  if (!actual || !siguiente) return null
  const da = datosCultivo[actual.id]
  const ds = datosCultivo[siguiente.id]
  if (!da || !ds) return null
  const repetir = actual.id === siguiente.id
  const tierra = bloqueTierra(actual, siguiente, da, ds, repetir)
  const plagas = bloqueProblemas('plagas', actual, siguiente, da, ds, repetir)
  const enfermedades = bloqueProblemas('enfermedades', actual, siguiente, da, ds, repetir)
  const cosecha = bloqueCosecha(actual, siguiente, ds, [tierra, plagas, enfermedades], repetir)
  const bloques = [tierra, plagas, enfermedades, cosecha]
  const usadas = sinRepetir(bloques.flatMap((b) => b.fuentes))
  return {
    actual,
    siguiente,
    tipo: tipoCambioDe(actual, siguiente),
    repetir,
    bloques,
    fuentes: usadas.map((id) => fuentes[id]).filter((x): x is FuenteDetalle => Boolean(x)),
  }
}

/** Tres preguntas para el chat de la rotacion, armadas por plantilla. */
export function preguntasSugeridas(actual: Cultivo, siguiente: Cultivo): string[] {
  const nA = nombreCorto(actual)
  const nS = nombreCorto(siguiente)
  if (actual.id === siguiente.id) {
    return [
      `¿Qué plagas se acumulan si repito el ${nA}?`,
      `¿Cada cuánto conviene cambiar el ${nA} por otro cultivo?`,
      `¿Qué hago con el rastrojo del ${nA}?`,
    ]
  }
  return [
    '¿Qué plagas se cortan con este cambio?',
    `¿Cuándo siembro el ${nS} después del ${nA}?`,
    `¿Qué hago con el rastrojo del ${nA}?`,
  ]
}
