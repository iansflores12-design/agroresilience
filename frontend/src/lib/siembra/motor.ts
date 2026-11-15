// CONTENIDO ILUSTRATIVO, pendiente de validacion agronomica: las reglas y los pesos de este motor
// son aproximaciones para la interfaz y no deben usarse como guia de campo (igual que src/datos/aptitud.ts).
//
// Motor de recomendacion de siembra. Determinista y sin dependencias de React.
// Cada opcion arranca con un puntaje base y recibe sumas o restas (aportes) segun:
//   - deficit de agua (0..1): humedad del suelo baja y lluvia de los ultimos 30 dias bajo lo normal
//   - exceso de agua (0..1): humedad alta y lluvia por encima de lo normal
//   - sensibilidad de la etapa del cultivo al agua (baja 0, media 0.5, alta 1)
//   - objetivo de la persona, y las caracteristicas del terreno
// Los datos null se tratan como neutros (no aportan al deficit ni al exceso).
// Al final el puntaje se redondea y se acota a 0..100. Empates: orden fijo de IdOpcion.
import { buscarCultivo, etapaEnSemana } from '../../datos/cultivos'
import { traductor } from '../../i18n/traductor'
import { condicionesMock } from './condiciones'
import { puntoMasCercano } from './gps'
import type {
  CondicionesArchivo,
  IdOpcion,
  Objetivo,
  OpcionPuntuada,
  PuntoCondiciones,
  Recomendacion,
  RespuestasSiembra,
} from './tipos'

/** Orden fijo de las opciones; sirve para desempatar. */
export const ORDEN_OPCIONES: IdOpcion[] = [
  'riego_goteo',
  'riego_auxiliar',
  'cobertura_rastrojo',
  'drenaje_surcos',
  'curvas_nivel',
  'esperar_monitorear',
]

export const NOMBRES_OPCION: Record<IdOpcion, string> = {
  riego_goteo: 'Riego por goteo',
  riego_auxiliar: 'Riego de auxilio',
  cobertura_rastrojo: 'Cobertura con rastrojo',
  drenaje_surcos: 'Surcos para drenar el agua',
  curvas_nivel: 'Curvas a nivel',
  esperar_monitorear: 'Esperar y vigilar',
}

/** Pesos ajustables. Puntos que suma o resta cada factor al puntaje base de la opcion. */
export const PESOS = {
  base: {
    riego_goteo: 25,
    riego_auxiliar: 25,
    cobertura_rastrojo: 35,
    drenaje_surcos: 10,
    curvas_nivel: 15,
    esperar_monitorear: 25,
  } as Record<IdOpcion, number>,
  // Humedad del suelo (m3/m3): <= seca da deficit 1; >= humeda da deficit 0.
  humedadSeca: 0.12,
  humedadHumeda: 0.28,
  // Exceso: humedad entre estos valores va de 0 a 1.
  humedadExcesoDesde: 0.3,
  humedadExcesoHasta: 0.38,
  // Lluvia / normal: <= ratioSeco da deficit 1; >= 1 da deficit 0. Sobre 1, exceso hasta ratioExceso.
  ratioSeco: 0.5,
  ratioExceso: 1.5,
  deficitRiego: 30,
  deficitRiegoSensible: { riego_goteo: 15, riego_auxiliar: 20 },
  deficitCobertura: 25,
  deficitEsperar: -25,
  esperarCalma: 15,
  excesoRiego: -35,
  excesoDrenaje: 35,
  excesoCobertura: -8,
  drenajeMalo: 30,
  drenajeRegular: 10,
  arcillaAlta: 15,
  arcillaAltaPct: 40,
  sinRiego: -60,
  arenoso: { cobertura_rastrojo: 10, riego_goteo: 4 },
  pendiente: { inclinada: 35, ondulada: 12, plana: -10, coberturaInclinada: 5 },
  objetivo: {
    agua: { riego_goteo: 14, riego_auxiliar: -12, cobertura_rastrojo: 14 },
    costo: { riego_goteo: -14, riego_auxiliar: -6, cobertura_rastrojo: 10, esperar_monitorear: 12 },
    suelo: { curvas_nivel: 15, cobertura_rastrojo: 12 },
    rendimiento: { riego_goteo: 8, riego_auxiliar: 12 },
  } as Record<Objetivo, Partial<Record<IdOpcion, number>>>,
} as const

const SENSIBILIDAD = { baja: 0, media: 0.5, alta: 1 } as const

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Deficit de agua 0..1 (0 si no hay datos). */
export function deficitAgua(p: PuntoCondiciones): number {
  const partes: number[] = []
  if (p.humedadSuelo_m3m3 !== null) {
    partes.push(acotar((PESOS.humedadHumeda - p.humedadSuelo_m3m3) / (PESOS.humedadHumeda - PESOS.humedadSeca), 0, 1))
  }
  if (p.lluvia30d_mm !== null && p.lluviaNormal30d_mm) {
    partes.push(acotar((1 - p.lluvia30d_mm / p.lluviaNormal30d_mm) / (1 - PESOS.ratioSeco), 0, 1))
  }
  return promedio(partes)
}

/** Exceso de agua 0..1 (0 si no hay datos). */
export function excesoAgua(p: PuntoCondiciones): number {
  const partes: number[] = []
  if (p.humedadSuelo_m3m3 !== null) {
    partes.push(acotar((p.humedadSuelo_m3m3 - PESOS.humedadExcesoDesde) / (PESOS.humedadExcesoHasta - PESOS.humedadExcesoDesde), 0, 1))
  }
  if (p.lluvia30d_mm !== null && p.lluviaNormal30d_mm) {
    partes.push(acotar((p.lluvia30d_mm / p.lluviaNormal30d_mm - 1) / (PESOS.ratioExceso - 1), 0, 1))
  }
  return promedio(partes)
}

interface Aporte {
  delta: number
  razon: string
}

/** Los textos (nombres, razones y etapa) salen en `idioma`; por defecto, español. */
export function recomendar(r: RespuestasSiembra, cond: CondicionesArchivo = condicionesMock, idioma?: string | null): Recomendacion {
  const t = traductor(idioma)
  const cultivo = buscarCultivo(r.cultivoId)
  if (!cultivo) throw new Error(`Cultivo desconocido: ${r.cultivoId}`)
  const semana = Math.floor(r.diasDesdeSiembra / 7)
  const etapa = etapaEnSemana(cultivo, semana)
  const { punto, distanciaKm } = puntoMasCercano(r.ubicacion, cond.puntos)

  const sens = SENSIBILIDAD[etapa.sensibilidadAgua]
  const def = deficitAgua(punto)
  const exc = excesoAgua(punto)
  const terreno = r.terreno
  const nombreEtapa = t(`cultivos.${cultivo.id}.etapas.${etapa.id}`, { defaultValue: etapa.nombre })
  const etapaTxt = nombreEtapa.toLowerCase()
  const humedo = exc >= 0.4
  const arcillaAlta = terreno.textura === 'arcilloso' || (punto.arcilla_pct !== null && punto.arcilla_pct >= PESOS.arcillaAltaPct)

  const ap: Record<IdOpcion, Aporte[]> = {
    riego_goteo: [],
    riego_auxiliar: [],
    cobertura_rastrojo: [],
    drenaje_surcos: [],
    curvas_nivel: [],
    esperar_monitorear: [],
  }
  const sumar = (id: IdOpcion, delta: number, razon: string) => {
    if (delta !== 0) ap[id].push({ delta, razon })
  }

  // Deficit de agua
  const txtSeco = t('siembra.razones.seco', { el: t(`cultivos.${cultivo.id}.el`), etapa: etapaTxt })
  sumar('riego_goteo', def * PESOS.deficitRiego, def >= 0.2 ? txtSeco : t('siembra.razones.algoFalta'))
  sumar('riego_auxiliar', def * PESOS.deficitRiego, def >= 0.2 ? t('siembra.razones.lluveMenos') : t('siembra.razones.algoFalta'))
  sumar('riego_goteo', def * sens * PESOS.deficitRiegoSensible.riego_goteo, t('siembra.razones.goteoEtapa', { etapa: etapaTxt }))
  sumar('riego_auxiliar', def * sens * PESOS.deficitRiegoSensible.riego_auxiliar, t('siembra.razones.riegoEtapa', { etapa: etapaTxt }))
  sumar('cobertura_rastrojo', def * PESOS.deficitCobertura, t('siembra.razones.rastrojo'))
  sumar('esperar_monitorear', def * PESOS.deficitEsperar * (0.5 + 0.5 * sens), t('siembra.razones.esperarSeco'))

  // Exceso de agua
  sumar('riego_goteo', exc * PESOS.excesoRiego, t('siembra.razones.muchaAgua'))
  sumar('riego_auxiliar', exc * PESOS.excesoRiego, t('siembra.razones.llovioMas'))
  sumar('drenaje_surcos', exc * PESOS.excesoDrenaje, t('siembra.razones.exceso'))
  sumar('cobertura_rastrojo', exc * PESOS.excesoCobertura, t('siembra.razones.coberturaPoco'))
  if (humedo || terreno.drenaje !== 'bueno') {
    const dren = terreno.drenaje === 'malo' ? PESOS.drenajeMalo : terreno.drenaje === 'regular' ? PESOS.drenajeRegular : 0
    sumar('drenaje_surcos', Math.max(exc, 0.3) * dren, terreno.drenaje === 'malo' ? t('siembra.razones.drenaMal') : t('siembra.razones.drenaRegular'))
  }
  if (arcillaAlta) {
    sumar('drenaje_surcos', exc * PESOS.arcillaAlta, t('siembra.razones.arcilla'))
  }

  // Calma: ni seco ni humedo favorece esperar y vigilar
  sumar('esperar_monitorear', (1 - Math.max(def, exc)) * PESOS.esperarCalma, t('siembra.razones.normal'))

  // Objetivo
  const tabla = PESOS.objetivo[r.objetivo]
  const meta = t(`siembra.metas.${r.objetivo}`)
  for (const id of ORDEN_OPCIONES) {
    const d = tabla[id]
    if (d) sumar(id, d, d > 0 ? t('siembra.razones.vaConMeta', { meta }) : t('siembra.razones.contraMeta', { meta }))
  }

  // Terreno
  if (!terreno.tieneRiego) {
    sumar('riego_goteo', PESOS.sinRiego, t('siembra.razones.sinRiego'))
    sumar('riego_auxiliar', PESOS.sinRiego, t('siembra.razones.sinRiego'))
  }
  if (terreno.textura === 'arenoso') {
    sumar('cobertura_rastrojo', PESOS.arenoso.cobertura_rastrojo, t('siembra.razones.arenosaCobertura'))
    sumar('riego_goteo', PESOS.arenoso.riego_goteo, t('siembra.razones.arenosaGoteo'))
  }
  const dPend = PESOS.pendiente[terreno.pendiente]
  sumar('curvas_nivel', dPend, terreno.pendiente === 'plana' ? t('siembra.razones.plano') : terreno.pendiente === 'inclinada' ? t('siembra.razones.inclinado') : t('siembra.razones.algoPendiente'))
  if (terreno.pendiente === 'inclinada') sumar('cobertura_rastrojo', PESOS.pendiente.coberturaInclinada, t('siembra.razones.coberturaPendiente'))

  // Contexto sin aporte propio: aviso de datos faltantes
  if (punto.humedadSuelo_m3m3 === null && punto.lluvia30d_mm === null) {
    sumar('esperar_monitorear', 0, t('siembra.razones.sinDatos'))
  }

  const opciones: OpcionPuntuada[] = ORDEN_OPCIONES.map((id) => {
    const total = PESOS.base[id] + ap[id].reduce((s, a) => s + a.delta, 0)
    const razones = [...ap[id]]
      .filter((a) => Math.abs(a.delta) >= 5)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
      .map((a) => a.razon)
    return { id, nombre: t(`siembra.opciones.${id}`), puntaje: Math.round(acotar(total, 0, 100)), razones }
  })
  // sort estable: a igual puntaje se conserva el orden fijo de ORDEN_OPCIONES
  opciones.sort((a, b) => b.puntaje - a.puntaje)

  return {
    mejor: opciones[0],
    opciones,
    punto: { id: punto.id, nombre: punto.nombre, distanciaKm },
    etapa: { id: etapa.id, nombre: nombreEtapa, sensibilidadAgua: etapa.sensibilidadAgua },
    origenDatos: cond.origen,
  }
}
