// CONTENIDO ILUSTRATIVO para la interfaz. Pendiente de validacion agronomica:
// los textos son orientativos, no prometen rendimientos ni precios y no deben usarse como guia de campo.
// Sirven cuando el asistente tarda o no hay red. Cada plantilla: por que conviene, en que se basa, que revisar.

import type { Escenario } from './aptitud'
import type { AvisoDecision, Enfoque, TipoCambio } from '../lib/recomendacion/tipos'

type Plantilla = [string, string, string]

const T: Record<`${Enfoque | 'general'}.${TipoCambio}`, Plantilla> = {
  'agua.repetir': [
    'Repetir {actual} en {lugar} no le pide un cambio de manejo: usted ya sabe cuánta agua necesita.',
    'Se basa en cuánta agua da la zona y cuánta necesita este cultivo.',
    'Revise con su técnico si la tierra guarda humedad hasta la floración.',
  ],
  'agua.leguminosa': [
    '{siguiente} después de {actual} es una buena opción para cuidar el agua: sus hojas tapan la tierra y esta guarda mejor la humedad.',
    'Se basa en cuánta agua necesita y cuánta da {lugar}.',
    'Pregunte a su técnico cuándo sembrar para que la floración no caiga en días secos.',
  ],
  'agua.cobertura': [
    '{siguiente} después de {actual} cubre la tierra y ayuda a que no se seque tan rápido.',
    'Se basa en el agua de la zona y en lo poco que gasta una planta que solo cubre el suelo.',
    'Hable con su técnico sobre cuándo cortarla y cómo dejarla antes de la siguiente siembra.',
  ],
  'agua.graminea': [
    '{siguiente} después de {actual} puede aguantar mejor la falta de agua en {lugar}.',
    'Se basa en cuánta agua pide cada etapa del cultivo y cuánta da la zona.',
    'Revise con su técnico la fecha de siembra para no pasar la etapa más delicada en días sin lluvia.',
  ],
  'agua.hortaliza': [
    '{siguiente} después de {actual} puede dar buen resultado en {lugar} si usted cuenta con riego a mano.',
    'Se basa en el agua que da la zona y en la que pide una hortaliza, que es bastante.',
    'Antes de decidir, confirme con su técnico de dónde sacaría el agua en la época seca.',
  ],
  'seguro.repetir': [
    'Repetir {actual} en {lugar} es lo que usted ya conoce, y eso le da menos sorpresas.',
    'Se basa en cómo le fue a este cultivo en años parecidos en la zona.',
    'Pregunte a su técnico qué hacer si la lluvia se atrasa y cuándo conviene sembrar.',
  ],
  'seguro.leguminosa': [
    '{siguiente} después de {actual} es una opción más segura: se da bien después de otro cultivo y deja la tierra mejor para el siguiente.',
    'Se basa en cómo suelen salir los años parecidos en {lugar}.',
    'Revise con su técnico qué semilla aguanta mejor un año seco.',
  ],
  'seguro.cobertura': [
    '{siguiente} después de {actual} arriesga poco: cuesta poco sembrarla y protege la tierra.',
    'Se basa en cómo suelen salir los años parecidos en la zona.',
    'Hable con su técnico para saber si le conviene más que dejar la tierra sola.',
  ],
  'seguro.graminea': [
    '{siguiente} después de {actual} es una opción que aguanta bien un año difícil en {lugar}.',
    'Se basa en cómo suelen salir los años parecidos en la zona.',
    'Revise con su técnico la fecha de siembra y la semilla que más le aguanta a la sequía.',
  ],
  'seguro.hortaliza': [
    '{siguiente} después de {actual} puede darle más ganancia, pero arriesga más que un grano.',
    'Se basa en cómo suelen salir los años parecidos en {lugar} y en lo delicada que es esta planta.',
    'Antes de sembrar, converse con su técnico sobre el riego y qué hacer si el año sale malo.',
  ],
  'tierra.repetir': [
    'Repetir {actual} varias veces en la misma tierra de {lugar} la va cansando.',
    'Se basa en que un cultivo igual seguido deja menos para el que viene.',
    'Revise con su técnico si conviene cambiar de cultivo, aunque sea esta vez.',
  ],
  'tierra.leguminosa': [
    '{siguiente} después de {actual} le hace bien a la tierra: sus raíces le dejan abono natural.',
    'Se basa en cómo ayuda cada cultivo al suelo de {lugar}.',
    'Pregunte a su técnico qué hacer con los rastrojos para que la tierra aproveche más.',
  ],
  'tierra.cobertura': [
    '{siguiente} después de {actual} es de lo que más cuida la tierra: la tapa, la protege y le deja materia.',
    'Se basa en cómo ayuda cada cultivo al suelo.',
    'Hable con su técnico sobre cuándo cortarla y cómo dejarla antes de la siguiente siembra.',
  ],
  'tierra.graminea': [
    '{siguiente} después de {actual} cambia el tipo de planta en {lugar}, y eso ayuda a que la tierra descanse.',
    'Se basa en cómo usa cada cultivo lo que hay en el suelo.',
    'Revise con su técnico si la tierra pide abono o materia antes de sembrar.',
  ],
  'tierra.hortaliza': [
    '{siguiente} después de {actual} cambia mucho la siembra en {lugar} y rompe el ciclo del mismo cultivo.',
    'Se basa en cómo usa cada cultivo lo que hay en el suelo. Una hortaliza le saca bastante a la tierra.',
    'Converse con su técnico sobre cómo reponer lo que la tierra va a perder.',
  ],
  'venta.repetir': [
    'Repetir {actual} en {lugar} le deja vender a quien ya conoce.',
    'Se basa en qué tan fácil es colocar este cultivo en la zona y en los costos que usted ya sabe.',
    'Pregunte a su técnico o a su comprador si la demanda sigue igual, porque los precios cambian.',
  ],
  'venta.leguminosa': [
    '{siguiente} después de {actual} puede encontrar comprador en {lugar}.',
    'Se basa en qué tan fácil es colocar el cultivo en {lugar}.',
    'Antes de sembrar, pregunte a su comprador qué está pidiendo, porque los precios cambian.',
  ],
  'venta.cobertura': [
    '{siguiente} después de {actual} casi no se vende, pero deja la tierra mejor para la siguiente cosecha.',
    'Se basa en lo que esta planta aporta al suelo más que en la venta.',
    'Revise con su técnico si esta opción le conviene si lo que busca es vender.',
  ],
  'venta.graminea': [
    '{siguiente} después de {actual} tiene salida en {lugar} y se maneja con lo que usted ya tiene.',
    'Se basa en qué tan fácil es colocar el cultivo en la zona.',
    'Pregunte a su comprador qué está pidiendo, porque los precios cambian.',
  ],
  'venta.hortaliza': [
    '{siguiente} después de {actual} puede venderse mejor en {lugar}, pero pide más trabajo y más cuidado.',
    'Se basa en qué tan fácil es colocar el cultivo en la zona.',
    'Antes de sembrar, converse con su técnico y su comprador sobre costos, riego y a quién vender.',
  ],
  'general.repetir': [
    'Repetir {actual} en {lugar} es lo más sencillo, porque ya conoce el manejo.',
    'Se basa en el agua, la tierra, el clima y la venta de la zona.',
    'Revise con su técnico si no le conviene alternar con otro cultivo.',
  ],
  'general.leguminosa': [
    '{siguiente} después de {actual} es una opción pareja: sus raíces le dejan abono natural a la tierra.',
    'Se basa en el agua, la tierra, el clima y la venta en {lugar}.',
    'Pregunte a su técnico qué semilla y qué fecha le convienen.',
  ],
  'general.cobertura': [
    '{siguiente} después de {actual} cuida y tapa la tierra de {lugar}, aunque no se cosecha para vender.',
    'Se basa en el agua, la tierra, el clima y la venta.',
    'Hable con su técnico para ver si esta opción le sirve este año.',
  ],
  'general.graminea': [
    '{siguiente} después de {actual} cambia el tipo de cultivo y se adapta bien a {lugar}.',
    'Se basa en el agua, la tierra, el clima y la venta de la zona.',
    'Revise con su técnico la semilla y la fecha de siembra.',
  ],
  'general.hortaliza': [
    '{siguiente} después de {actual} puede ser buena opción en {lugar}, pero pide más cuidado que un grano.',
    'Se basa en el agua, la tierra, el clima y la venta de la zona.',
    'Converse con su técnico sobre el riego, los costos y a quién vender.',
  ],
}

export const SITUACIONES: string[] = Object.keys(T)

// Varias formulaciones por escenario para que los textos no suenen repetidos; la elegida depende de la situacion.
const FRASE_ANIO: Record<Escenario, string[]> = {
  seco: [
    'Si el año sale seco, cuide el agua al sembrar.',
    'Si el año sale seco, mire la humedad antes de sembrar.',
    'Si el año sale seco, no siembre con la tierra seca.',
  ],
  normal: [
    'Con un año normal, debería andar bien.',
    'En un año normal no se esperan sorpresas.',
    'Si el año sale normal, siga su manejo de siempre.',
  ],
  lluvioso: [
    'Si el año sale lluvioso, cuide el drenaje.',
    'Si el año sale lluvioso, evite que el agua se estanque.',
    'Con mucha lluvia, revise que el agua salga del terreno.',
  ],
}

const FRASE_AVISO: Record<AvisoDecision, string> = {
  ninguno: '',
  canicula: 'Ojo con la canícula, los días secos a mitad de temporada.',
  lluvia_fuerte: 'Ojo con la lluvia fuerte: revise el drenaje.',
  tierra_seca: 'Ojo: la tierra está seca, mire la humedad antes de sembrar.',
}

const FRASE_PUNTOS = 'Saca {puntos} puntos más que repetir el mismo cultivo.'
const FRASE_PUNTO = 'Saca {puntos} punto más que repetir el mismo cultivo.'

const TEXTO_ANIO: Record<Escenario, string> = { seco: 'seco', normal: 'normal', lluvioso: 'lluvioso' }

const GENERAL: Plantilla = [
  'Esta opción es una de las mejores para {lugar} después de {actual}.',
  'Se basa en el agua, la tierra, el clima y la venta de la zona.',
  'Revise con su técnico antes de decidir.',
]

const LIMITE = 420

export function armarPreset(args: {
  situacion: string
  actual: string
  siguiente: string
  lugar: string
  diferencia: number
  escenario: Escenario
  aviso: AvisoDecision
}): string {
  const { situacion, actual, siguiente, lugar, diferencia, escenario, aviso } = args
  const tipo = situacion.split('.')[1] ?? ''
  const plantillas: Record<string, Plantilla | undefined> = T
  const plantilla = plantillas[situacion] ?? plantillas[`general.${tipo}`] ?? GENERAL
  const puntos = Math.round(diferencia)
  const frases = plantilla.map((f) => f.trim())
  // La frase con {puntos} solo aparece si la opcion le gana a repetir; va despues de "en que se basa".
  if (puntos > 0 && tipo !== 'repetir') frases.splice(2, 0, puntos === 1 ? FRASE_PUNTO : FRASE_PUNTOS)
  const valores: Record<string, string> = {
    actual: actual.toLowerCase(),
    siguiente: siguiente.toLowerCase(),
    lugar,
    puntos: String(puntos),
    anio: TEXTO_ANIO[escenario] ?? 'normal',
  }
  const expandir = (t: string): string => {
    return t
      .replace(/\{(\w+)\}/g, (_, k: string) => valores[k] ?? '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/(^|[.!?]\s+)(\p{L})/gu, (_, pre: string, l: string) => pre + l.toUpperCase())
      .trim()
  }
  const variantes = FRASE_ANIO[escenario] ?? FRASE_ANIO.normal
  const semilla = [...situacion].reduce((suma, c) => suma + c.charCodeAt(0), 0)
  const anio = variantes[semilla % variantes.length]
  const avisoTexto = FRASE_AVISO[aviso] ?? ''
  const armar = (partes: string[]) => partes.filter(Boolean).join(' ')
  const sinPuntos = frases.filter((f) => f !== FRASE_PUNTOS && f !== FRASE_PUNTO)
  // Si no cabe en el limite se sueltan primero la frase de puntos y luego la del anio; el aviso siempre se queda.
  const candidatos = [[...frases, anio, avisoTexto], [...sinPuntos, anio, avisoTexto], [...sinPuntos, avisoTexto]]
  const texto = candidatos.map(armar).find((t) => expandir(t).length <= LIMITE) ?? armar(candidatos[2])
  return expandir(texto)
}
