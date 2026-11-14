import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { avisarDemoUnaVez } from '../../componentes/chat/avisosChat'
import { useEscenario } from '../../componentes/mapa/escenario'
import { buscarDepartamento, departamentoDeZona, type Escenario } from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { perspectivaDe } from '../../datos/perspectiva'
import { armarPreset } from '../../datos/presets'
import { buscarZona } from '../../datos/zonas'
import { useConversacion, type MensajeChat } from '../../estado/Conversacion'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../avisos'
import { armarContexto, esModoDemo, type ContextoChat } from '../chat'
import { pedirDecision, urlBaseApi } from './clienteDecision'
import { pedirExplicacion } from './clienteExplicacion'
import { candidatosPara } from './motor'
import { crearOrquestador, type EventoRecomendacion, type Orquestador } from './orquestador'
import { situacionDe } from './situacion'
import type { Decision, Enfoque } from './tipos'

export type FaseRecomendacion = 'inactivo' | 'pensando' | 'listo'

interface EstadoRecomendacion {
  fase: FaseRecomendacion
  decision: Decision | null
  rotacion: { id: string; nombre: string } | null
  enfoques: Enfoque[]
  escenario: Escenario
  /** Cuantos mensajes del hilo eran anteriores a esta recomendacion (los demas se muestran en la portada). */
  desde: number | null
}

const INICIAL: EstadoRecomendacion = { fase: 'inactivo', decision: null, rotacion: null, enfoques: [], escenario: 'normal', desde: null }
const CLAVE_AVISO_SIN_CONEXION = 'agroresilience.recomendacion.sinconexion.avisado'

function avisarSinConexionUnaVez() {
  try {
    if (window.sessionStorage.getItem(CLAVE_AVISO_SIN_CONEXION)) return
    window.sessionStorage.setItem(CLAVE_AVISO_SIN_CONEXION, '1')
  } catch {
    // Sin sessionStorage se avisa en cada recomendacion.
  }
  avisar.alerta({ titulo: 'Sin conexión: le mostramos el texto guardado' })
}

/** Conecta el orquestador con React: estado compartido, hilo de la conversacion y avisos. */
export function useRecomendacion() {
  const { cultivoId, zonaId, edadSemanas, enfoques } = useEstadoApp()
  const [escenario] = useEscenario()
  const { mensajes, agregar } = useConversacion()
  const [estado, setEstado] = useState<EstadoRecomendacion>(INICIAL)
  const [reinicios, setReinicios] = useState(0)
  const orquestador = useRef<Orquestador | null>(null)
  const conteo = useRef(mensajes.length)
  const rotaciones = useRef<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    conteo.current = mensajes.length
  }, [mensajes.length])

  const manejar = useCallback(
    (e: EventoRecomendacion) => {
      switch (e.tipo) {
        case 'decision': {
          const rotacion = rotaciones.current.find((r) => r.id === e.decision.rotacionId) ?? null
          setEstado((s) => ({ ...s, decision: e.decision, rotacion }))
          break
        }
        case 'mostrarPreset':
          agregar({ rol: 'asistente', texto: e.texto, origen: 'preset' })
          setEstado((s) => ({ ...s, fase: 'listo' }))
          break
        case 'mostrarExplicacion':
          agregar({ rol: 'asistente', texto: e.texto, origen: 'asistente' })
          setEstado((s) => ({ ...s, fase: 'listo' }))
          break
        case 'seguimiento':
          agregar({ rol: 'asistente', texto: e.texto, origen: 'asistente' })
          break
        case 'error':
          if (e.causa === 'demo') {
            avisarDemoUnaVez('Le mostramos el texto guardado. El asistente real se conectará al backend.')
          } else {
            avisarSinConexionUnaVez()
          }
          break
      }
    },
    [agregar],
  )

  // Si cambia cualquier dato de entrada, se cancela todo y la recomendacion anterior deja de mostrarse en la portada.
  const clave = `${cultivoId}|${zonaId}|${enfoques.join(',')}|${escenario}`
  const clavePrevia = useRef(clave)
  useEffect(() => {
    if (clavePrevia.current === clave) return
    clavePrevia.current = clave
    orquestador.current?.cancelar()
    orquestador.current = null
    setEstado({ ...INICIAL, desde: conteo.current })
    setReinicios((n) => n + 1)
  }, [clave])

  // Al salir de la pantalla se abortan las peticiones y los temporizadores.
  useEffect(
    () => () => {
      orquestador.current?.cancelar()
      orquestador.current = null
    },
    [],
  )

  const perspectiva = useMemo(() => perspectivaDe(zonaId), [zonaId])

  const pedir = useCallback(() => {
    const departamentoId = departamentoDeZona(zonaId)
    const actual = buscarCultivo(cultivoId)
    if (!actual) return
    const { candidatos, rotaciones: puntuadas, escenarioUsado } = candidatosPara({
      departamentoId,
      cultivoId,
      escenario,
      enfoques,
      perspectiva,
    })
    if (candidatos.length === 0) return
    rotaciones.current = candidatos.map((c) => ({ id: c.id, nombre: c.nombre }))
    const lugar = buscarDepartamento(departamentoId)?.nombre ?? buscarZona(zonaId)?.nombre ?? 'su zona'

    orquestador.current?.cancelar()
    const nuevo = crearOrquestador(
      {
        demo: esModoDemo(),
        pedirDecision: (p, signal) => pedirDecision(urlBaseApi(), p, signal),
        pedirExplicacion: (p, signal) => pedirExplicacion(urlBaseApi(), p, signal),
      },
      manejar,
    )
    orquestador.current = nuevo
    setEstado({ fase: 'pensando', decision: null, rotacion: null, enfoques, escenario: escenarioUsado, desde: conteo.current })
    setReinicios((n) => n + 1)
    nuevo.iniciar({
      candidatos,
      enfoques,
      escenario: escenarioUsado,
      contexto: armarContexto({ vista: 'cultivos', cultivoId, edadSemanas, zonaId }),
      perspectiva,
      armarPreset: (d) => {
        const elegido = candidatos.find((c) => c.id === d.rotacionId) ?? candidatos[0]
        return armarPreset({
          situacion: situacionDe(d.enfoquePrincipal, elegido.tipoCambio),
          actual: actual.nombre,
          siguiente: buscarCultivo(elegido.id)?.nombre ?? elegido.nombre,
          lugar,
          diferencia: puntuadas.find((r) => r.id === elegido.id)?.diferencia ?? 0,
          escenario: escenarioUsado,
          aviso: d.aviso,
        })
      },
    })
  }, [zonaId, cultivoId, escenario, enfoques, perspectiva, edadSemanas, manejar])

  // Contexto de las preguntas posteriores: lo de siempre mas la rotacion recomendada y la perspectiva.
  const contexto: ContextoChat = useMemo(
    () =>
      armarContexto({
        vista: 'cultivos',
        cultivoId,
        edadSemanas,
        zonaId,
        recomendacion:
          estado.decision && estado.rotacion
            ? { rotacion: estado.rotacion, enfoques: estado.enfoques, escenario: estado.escenario, origen: estado.decision.origen }
            : null,
        perspectiva,
      }),
    [cultivoId, edadSemanas, zonaId, estado, perspectiva],
  )

  const visibles: MensajeChat[] = useMemo(() => {
    if (estado.desde !== null) return mensajes.slice(estado.desde)
    return mensajes.some((m) => m.origen === 'preset' || m.origen === 'asistente') ? mensajes : []
  }, [mensajes, estado.desde])

  return {
    pedir,
    fase: estado.fase,
    /** Id del cultivo siguiente que se marca en el comparador; null mientras no haya recomendacion. */
    elegidaId: estado.fase === 'inactivo' ? null : (estado.decision?.rotacionId ?? null),
    mensajes: visibles,
    contexto,
    /** Cambia cada vez que se pide una recomendacion o se cancela: sirve para abortar preguntas en curso. */
    reinicios,
  }
}
