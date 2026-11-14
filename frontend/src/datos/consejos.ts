// CONTENIDO ILUSTRATIVO para la interfaz. Los consejos salen de reglas simples sobre los puntajes
// de ejemplo de `aptitud.ts`: todavia no estan validados por tecnicos y no son guia de campo.
// Sin dosis, sin productos agroquimicos, sin promesas de rendimiento ni de precio.

import {
  aptitud,
  buscarDepartamento,
  condiciones,
  escenarios,
  factores,
  rotacionesPara,
  tieneAptitud,
  type ClaveFactor,
  type Escenario,
} from './aptitud'
import { buscarCultivo } from './cultivos'

export type TemaConsejo = 'agua' | 'siembra' | 'tierra' | 'calor' | 'cultivo'

export interface Consejo {
  id: string
  /** Titulo corto, en palabras de todos los dias. */
  titulo: string
  /** Una o dos frases de usted, en lenguaje de campo. */
  texto: string
  tema: TemaConsejo
  /** Version tecnica para el agronomo: el valor y por que se activo la regla. */
  detalle: string
}

interface Candidato {
  /** Menor numero = mas importante. */
  prioridad: number
  consejo: Consejo
}

/** Hasta cuatro consejos de la lista de reglas, mas el fijo del tecnico. */
const MAXIMO_REGLAS = 4
/** Una parte del puntaje por debajo de este valor activa su consejo. */
const UMBRAL_PARTE = 75

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
const redondo = (n: number) => String(Math.round(n))

/**
 * Consejos para un lugar y un cultivo, segun el tipo de ano. Es determinista: sale de las partes
 * del puntaje, de las condiciones del departamento ajustadas al ano y de lo que ya se sabe del
 * cultivo. Devuelve [] si falta el departamento o el cultivo no tiene puntaje.
 */
export function consejosPara(departamentoId: string | null, cultivoId: string | null, escenario: Escenario): Consejo[] {
  const d = buscarDepartamento(departamentoId)
  const cultivo = buscarCultivo(cultivoId)
  const a = aptitud(departamentoId, cultivoId, escenario)
  if (!d || !cultivo || !a || !tieneAptitud(cultivoId)) return []

  const c = condiciones(d, escenario)
  const v = Object.fromEntries(a.partes.map((p) => [p.clave, p.valor])) as Record<ClaveFactor, number>
  const factor = (clave: ClaveFactor) => factores.find((f) => f.clave === clave)!
  const cultivoMin = cultivo.nombre.toLowerCase()
  const base = rotacionesPara(departamentoId, cultivoId, escenario).find((r) => r.actual)
  const ano = escenarios[escenario]

  const textoParte = (clave: ClaveFactor) => {
    const f = factor(clave)
    return `Parte "${f.nombre}": ${v[clave]} de 100, pesa ${redondo(f.peso * 100)} % del puntaje. Se activó porque está por debajo de ${UMBRAL_PARTE}.`
  }
  const candidatos: Candidato[] = []
  const poner = (prioridad: number, consejo: Consejo) => candidatos.push({ prioridad, consejo })
  const prioridadParte = (clave: ClaveFactor) => 10 + v[clave] / 10

  // Si el puntaje es dificil, lo primero es mirar otras opciones.
  if (a.nivel === 'dificil') {
    poner(5, {
      id: 'otro-cultivo',
      titulo: 'Piense en otro cultivo',
      texto: `Aquí el ${cultivoMin} se da con dificultad. Mire los 3 mejores departamentos y qué sembrar después antes de decidir.`,
      tema: 'cultivo',
      detalle: `Puntaje ${a.total} de 100, puesto ${a.puesto} de ${a.de}. Menos de 65 es "difícil". Lo que más cuesta: ${a.limite}.`,
    })
  }

  // Canicula: la parte que mas pesa en el puntaje.
  if (v.sequia < UMBRAL_PARTE) {
    const ajuste = escenario === 'normal' ? '' : ` (${d.canicula} días en un año normal, por ${ano.canicula}: ${ano.nombre.toLowerCase()})`
    poner(prioridadParte('sequia'), {
      id: 'canicula',
      titulo: 'Cuide la floración en la canícula',
      texto: `Siembre de modo que la floración del ${cultivoMin} no caiga en los días secos de la canícula. Si puede, pregunte por una variedad de ciclo más corto.`,
      tema: 'siembra',
      detalle: `Canícula esperada: ${redondo(c.canicula)} días seguidos sin lluvia${ajuste}. ${textoParte('sequia')}`,
    })
  }

  // Lluvia: segun llueva poco o mucho.
  if (v.agua < UMBRAL_PARTE) {
    if (c.lluvia < 1100) {
      poner(prioridadParte('agua'), {
        id: 'agua-poca',
        titulo: 'Aproveche cada lluvia',
        texto: `Aquí llueve poco para el ${cultivoMin}. Siembre cuando la lluvia ya esté asentada y use el rastrojo para que la tierra guarde el agua.`,
        tema: 'agua',
        detalle: `Lluvia del año: ${redondo(c.lluvia)} mm. ${textoParte('agua')}`,
      })
    } else if (c.lluvia > 2200) {
      poner(prioridadParte('agua'), {
        id: 'agua-mucha',
        titulo: 'Cuide que el agua no se encharque',
        texto: `Aquí llueve mucho para el ${cultivoMin}. Haga zanjas o siembre en lomos para que el agua salga de la parcela.`,
        tema: 'agua',
        detalle: `Lluvia del año: ${redondo(c.lluvia)} mm. ${textoParte('agua')}`,
      })
    } else {
      poner(prioridadParte('agua'), {
        id: 'agua-revisar',
        titulo: 'Revise la lluvia de su zona',
        texto: `La lluvia de ${d.nombre} no es la que más le gusta al ${cultivoMin}. Pregunte al técnico cuándo conviene sembrar.`,
        tema: 'agua',
        detalle: `Lluvia del año: ${redondo(c.lluvia)} mm. ${textoParte('agua')}`,
      })
    }
  }

  // Calor o frio.
  if (v.clima < UMBRAL_PARTE) {
    if (c.temp >= 26) {
      poner(prioridadParte('clima'), {
        id: 'calor',
        titulo: 'Trabaje en las horas frescas',
        texto: `Aquí hace calor para el ${cultivoMin}. Haga las labores en las horas frescas del día y cuide que la planta no sufra con el calor.`,
        tema: 'calor',
        detalle: `Temperatura media: ${c.temp.toFixed(1)} °C. ${textoParte('clima')}`,
      })
    } else if (c.temp <= 21) {
      poner(prioridadParte('clima'), {
        id: 'fresco',
        titulo: 'Aquí hace fresco',
        texto: `Hace fresco para el ${cultivoMin} y puede tardar más en madurar. Vigile las noches frías y pregunte por variedades para clima fresco.`,
        tema: 'calor',
        detalle: `Temperatura media: ${c.temp.toFixed(1)} °C. ${textoParte('clima')}`,
      })
    } else {
      poner(prioridadParte('clima'), {
        id: 'clima-revisar',
        titulo: 'Revise el clima de su zona',
        texto: `El clima de ${d.nombre} no es el que más le gusta al ${cultivoMin}. Consulte con el técnico cómo manejarlo.`,
        tema: 'calor',
        detalle: `Temperatura media: ${c.temp.toFixed(1)} °C. ${textoParte('clima')}`,
      })
    }
  }

  // Altura del terreno.
  if (v.altitud < UMBRAL_PARTE) {
    poner(prioridadParte('altitud'), {
      id: 'altura',
      titulo: 'La altura no es la mejor',
      texto: `La altura de ${d.nombre} no es la mejor para el ${cultivoMin}. Pregunte al técnico por variedades que se den bien a esta altura.`,
      tema: 'cultivo',
      detalle: `Altura media: ${redondo(d.alt)} m sobre el nivel del mar. ${textoParte('altitud')}`,
    })
  }

  // Tierra: la parte "Tierra" mezcla acidez (60 %) y agua guardada (40 %). La acidez se despeja
  // restando la parte del agua, asi no se repiten aqui los rangos de cada cultivo.
  const parteAgua = 40 * Math.max(0, Math.min(1, (c.hum - 10) / 25))
  const acidez = Math.max(0, Math.min(1, (v.suelo - parteAgua) / 60))
  if (acidez < 0.9) {
    poner(13, {
      id: 'tierra-analisis',
      titulo: 'Pida un análisis de la tierra',
      texto: 'Conviene saber qué tan ácida es la tierra de su parcela. Pida un análisis al técnico antes de sembrar.',
      tema: 'tierra',
      detalle: `pH típico del departamento: ${d.ph}. La parte "Tierra" (${v.suelo} de 100) descuenta cerca de ${redondo((1 - acidez) * 60)} puntos porque el pH queda fuera del rango óptimo del cultivo.`,
    })
  }
  if (c.hum < 22) {
    poner(14, {
      id: 'tierra-cobertura',
      titulo: 'Deje cobertura sobre la tierra',
      texto: 'La tierra guarda poca agua. Deje rastrojo u hojas secas sobre el suelo para que no se seque tan rápido.',
      tema: 'agua',
      detalle: `Agua en la tierra: ${c.hum.toFixed(1)} % (${d.hum} % típico${escenario === 'normal' ? '' : `, por ${ano.hum}: ${ano.nombre.toLowerCase()}`}). Se activó porque está por debajo de 22 %.`,
    })
  }

  // Tipo de ano.
  if (escenario === 'seco') {
    poner(12, {
      id: 'ano-seco',
      titulo: 'Adelante la siembra y vigile la humedad',
      texto: 'Si el año viene seco, siembre apenas la lluvia se asiente y revise seguido si la tierra guarda humedad.',
      tema: 'siembra',
      detalle: `Año seco: lluvia por ${ano.lluvia} (${redondo(c.lluvia)} mm), canícula por ${ano.canicula} (${redondo(c.canicula)} días) y agua en la tierra por ${ano.hum} (${c.hum.toFixed(1)} %).`,
    })
  } else if (escenario === 'lluvioso' && !candidatos.some((x) => x.consejo.id === 'agua-mucha')) {
    poner(12, {
      id: 'ano-lluvioso',
      titulo: 'Cuide el drenaje',
      texto: 'Si el año viene lluvioso, no deje que el agua se encharque en la parcela y revise las plantas seguido por si aparecen hongos.',
      tema: 'agua',
      detalle: `Año lluvioso: lluvia por ${ano.lluvia} (${redondo(c.lluvia)} mm) y agua en la tierra por ${ano.hum} (${c.hum.toFixed(1)} %).`,
    })
  }

  // Lo que ya se sabe del cultivo.
  if (base) {
    poner(28, {
      id: 'a-favor',
      titulo: 'Lo que le ayuda',
      texto: `A favor del ${cultivoMin}: ${minuscula(base.ventajas[0] ?? 'es un cultivo conocido')}.`,
      tema: 'cultivo',
      detalle: `Ventajas conocidas del cultivo: ${base.ventajas.join('; ')}.`,
    })
    poner(30, {
      id: 'vigilar',
      titulo: 'Lo que debe vigilar',
      texto: `Tenga en cuenta que ${minuscula(base.riesgos[0] ?? 'cada cultivo tiene sus riesgos')}.`,
      tema: 'cultivo',
      detalle: `Riesgos conocidos del cultivo: ${base.riesgos.join('; ')}.`,
    })
    poner(31, {
      id: 'averiguar',
      titulo: 'Averigüe antes de sembrar',
      texto: `Antes de decidir, averigüe esto: ${minuscula(base.falta[0] ?? 'qué le conviene a su parcela')}.`,
      tema: 'siembra',
      detalle: `Lo que falta saber: ${base.falta.join('; ')}.`,
    })
  }

  const reglas = candidatos
    .sort((x, y) => x.prioridad - y.prioridad)
    .slice(0, MAXIMO_REGLAS)
    .map((x) => x.consejo)

  return [
    ...reglas,
    {
      id: 'tecnico',
      titulo: 'Hable con su técnico',
      texto: 'Confirme estos consejos con el técnico agrícola de su zona antes de decidir.',
      tema: 'cultivo',
      detalle: 'Los puntajes y los consejos son de ejemplo y todavía no están validados con técnicos.',
    },
  ]
}
