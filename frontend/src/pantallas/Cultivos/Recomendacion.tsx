import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { avisarDemoUnaVez, descripcionError } from '../../componentes/chat/avisosChat'
import { ListaMensajes } from '../../componentes/chat/ListaMensajes'
import { Redactor } from '../../componentes/chat/Redactor'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { useConversacion, type MensajeChat } from '../../estado/Conversacion'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { crearClienteChat, ErrorChat, esModoDemo, type ClienteChat, type ContextoChat } from '../../lib/chat'
import { ENFOQUES } from '../../lib/recomendacion/tipos'
import type { useRecomendacion } from '../../lib/recomendacion/useRecomendacion'
import estilos from './Recomendacion.module.css'

type Recomendacion = ReturnType<typeof useRecomendacion>

/** "Pregunte más": las preguntas van al mismo hilo que /chat y usan el cliente de chat con el contexto de la recomendacion. */
function usePreguntas(contexto: ContextoChat, reinicios: number) {
  const { mensajes, agregar } = useConversacion()
  const [texto, setTexto] = useState('')
  // La espera se guarda con el numero de recomendacion en que empezo: si cambia, deja de contar sin tocar el estado.
  const [esperaDesde, setEsperaDesde] = useState<number | null>(null)
  const esperando = esperaDesde === reinicios
  const reiniciosActuales = useRef(reinicios)
  const abortar = useRef<AbortController | null>(null)
  const vivo = useRef(true)
  const cliente = useRef<ClienteChat | null>(null)
  const contextoActual = useRef(contexto)
  const mensajesActuales = useRef(mensajes)

  useEffect(() => {
    contextoActual.current = contexto
    mensajesActuales.current = mensajes
  }, [contexto, mensajes])

  const detener = useCallback(() => {
    abortar.current?.abort()
    abortar.current = null
    setEsperaDesde(null)
  }, [])

  // Si cambia la recomendacion (o se cancela), una pregunta en curso ya no aplica.
  useEffect(() => {
    reiniciosActuales.current = reinicios
    abortar.current?.abort()
    abortar.current = null
  }, [reinicios])

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      abortar.current?.abort()
    }
  }, [])

  const ejecutar = useCallback(
    async (lista: MensajeChat[], alReintentar: () => void) => {
      const control = new AbortController()
      abortar.current = control
      setEsperaDesde(reiniciosActuales.current)
      try {
        cliente.current ??= crearClienteChat()
        const r = await cliente.current.enviar({ mensajes: lista, contexto: contextoActual.current, signal: control.signal })
        if (control.signal.aborted) return
        agregar({ rol: 'asistente', texto: r.texto, origen: 'asistente' })
      } catch (e) {
        if (control.signal.aborted || (e instanceof ErrorChat && e.causa === 'cancelado')) return
        avisar.error({
          titulo: 'No se pudo enviar',
          descripcion: descripcionError(e),
          accion: { texto: 'Reintentar', alPulsar: alReintentar },
        })
      } finally {
        if (abortar.current === control) {
          abortar.current = null
          if (vivo.current) setEsperaDesde(null)
        }
      }
    },
    [agregar],
  )

  const reintentar = useCallback(
    function reintentar() {
      if (abortar.current) return
      const lista = mensajesActuales.current
      if (lista.length === 0 || lista[lista.length - 1].rol !== 'usuario') return
      void ejecutar(lista, reintentar)
    },
    [ejecutar],
  )

  const enviar = (contenido: string) => {
    const limpio = contenido.trim()
    if (!limpio || abortar.current) return
    if (esModoDemo()) avisarDemoUnaVez()
    const nuevo = agregar({ rol: 'usuario', texto: limpio, origen: 'usuario' })
    setTexto('')
    void ejecutar([...mensajesActuales.current, nuevo], reintentar)
  }

  return { texto, setTexto, esperando, enviar, detener }
}

/**
 * Elegir lo que mas le importa y pedir la recomendacion de que sembrar despues. El texto (de Gemini o
 * guardado, con su etiqueta) y la conversacion siguen aqui mismo, en el mismo hilo que /chat.
 */
export function Recomendacion({ rec }: { rec: Recomendacion }) {
  const { enfoques, alternarEnfoque } = useEstadoApp()
  const base = useId()
  const preguntas = usePreguntas(rec.contexto, rec.reinicios)
  const pensando = rec.fase === 'pensando'
  const hayTexto = rec.mensajes.length > 0

  return (
    <div className={estilos.bloque}>
      <div className={estilos.enfoques}>
        <h3 id={`${base}-enfoques`} className="tipo-titulo">
          ¿Qué le importa más?
        </h3>
        <p className="tipo-nota">Elija una o dos cosas y le recomendamos según eso.</p>
        <div className={estilos.chips} role="group" aria-labelledby={`${base}-enfoques`}>
          {ENFOQUES.map((e) => (
            <Chip key={e.id} variante="filtro" seleccionado={enfoques.includes(e.id)} onClick={() => alternarEnfoque(e.id)}>
              {e.nombre}
            </Chip>
          ))}
        </div>
      </div>

      <Boton className={estilos.recomendar} icono="lightbulb" onClick={rec.pedir}>
        Recomiéndeme
      </Boton>

      {(pensando || hayTexto) && (
        <section className={estilos.resultado} aria-labelledby={`${base}-resultado`}>
          <h3 id={`${base}-resultado`} className="tipo-titulo">
            Lo que le recomendamos
          </h3>
          <ListaMensajes mensajes={rec.mensajes} esperando={pensando} animada etiqueta="Recomendación y conversación" />
          {hayTexto && (
            <div className={estilos.preguntar}>
              <h4 className={estilos.subtitulo}>Pregunte más</h4>
              <Redactor
                texto={preguntas.texto}
                alCambiar={preguntas.setTexto}
                alEnviar={preguntas.enviar}
                alDetener={preguntas.detener}
                esperando={preguntas.esperando}
                demo={esModoDemo()}
                placeholder="Escriba su pregunta"
              />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
