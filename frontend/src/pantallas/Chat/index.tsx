import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Chip } from '../../componentes/Chip'
import { buscarZona, estadoHumedad, humedadPorcentaje } from '../../datos/zonas'
import { useConversacion, type MensajeChat } from '../../estado/Conversacion'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { armarContexto, crearClienteChat, ErrorChat, esModoDemo, type ClienteChat, type ContextoChat } from '../../lib/chat'
import estilos from './Chat.module.css'
import { armarSugerencias } from './sugerencias'

const CLAVE_AVISO_DEMO = 'agroresilience.chat.demo.avisado'
const VISTAS: ContextoChat['vista'][] = ['cultivos', 'mapa', 'zona']

export interface PropsChat {
  /** Cliente del backend; por defecto el que corresponde a `VITE_API_URL`. */
  cliente?: ClienteChat
  /** Fuerza el modo demostracion (por defecto segun `VITE_API_URL`). */
  modoDemo?: boolean
}

function avisarDemoUnaVez() {
  try {
    if (window.sessionStorage.getItem(CLAVE_AVISO_DEMO)) return
    window.sessionStorage.setItem(CLAVE_AVISO_DEMO, '1')
  } catch {
    // Sin sessionStorage se avisa en cada carga de la pagina.
  }
  avisar.info({
    titulo: 'Modo de demostración',
    descripcion: 'Las respuestas son locales: el asistente real se conectará al backend.',
  })
}

function descripcionError(e: unknown): string {
  if (e instanceof ErrorChat) {
    if (e.causa === 'red') return 'Revisa tu conexión e inténtalo de nuevo.'
    if (e.causa === 'servidor') return 'El servidor no pudo responder en este momento.'
    if (e.causa === 'respuesta') return 'El servidor envió una respuesta que no se entiende.'
  }
  return 'Inténtalo de nuevo.'
}

export default function Chat({ cliente, modoDemo }: PropsChat) {
  const [params] = useSearchParams()
  const { cultivoId, zonaId, edadSemanas } = useEstadoApp()
  const { mensajes, agregar, reemplazar, borrar } = useConversacion()

  const desde = params.get('desde')
  const vista = VISTAS.find((v) => v === desde) ?? 'chat'
  const contexto = useMemo(
    () => armarContexto({ vista, cultivoId, edadSemanas, zonaId }),
    [vista, cultivoId, edadSemanas, zonaId],
  )
  const sugerencias = useMemo(() => armarSugerencias(contexto), [contexto])
  const zona = buscarZona(zonaId)
  const pctHumedad = zona ? humedadPorcentaje(zona) : null
  const estadoZona = zona ? estadoHumedad(zona).toLowerCase() : ''

  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const abortar = useRef<AbortController | null>(null)
  const vivo = useRef(true)

  const demo = modoDemo ?? esModoDemo()
  const clienteActual = useRef<ClienteChat | null>(cliente ?? null)
  const contextoActual = useRef(contexto)
  const mensajesActuales = useRef(mensajes)
  const demoActual = useRef(demo)
  useEffect(() => {
    clienteActual.current = cliente ?? clienteActual.current ?? crearClienteChat()
    contextoActual.current = contexto
    mensajesActuales.current = mensajes
    demoActual.current = demo
  }, [cliente, contexto, mensajes, demo])

  // Al salir de la pantalla se aborta la peticion en curso.
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      abortar.current?.abort()
    }
  }, [])

  // Altura del campo: crece hasta unas cuatro lineas (el tope lo pone el CSS).
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto])

  // Desplazamiento automatico al ultimo mensaje.
  useEffect(() => {
    const el = fin.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'end' })
  }, [mensajes.length, esperando])

  const ejecutar = useCallback(
    async (lista: MensajeChat[], alReintentar: () => void) => {
      const controlador = new AbortController()
      abortar.current = controlador
      setEsperando(true)
      try {
        clienteActual.current ??= crearClienteChat()
        const r = await clienteActual.current.enviar({
          mensajes: lista,
          contexto: contextoActual.current,
          signal: controlador.signal,
        })
        if (controlador.signal.aborted) return
        agregar({ rol: 'asistente', texto: r.texto })
      } catch (e) {
        if (controlador.signal.aborted || (e instanceof ErrorChat && e.causa === 'cancelado')) return
        avisar.error({
          titulo: 'No se pudo enviar',
          descripcion: descripcionError(e),
          accion: { texto: 'Reintentar', alPulsar: alReintentar },
        })
      } finally {
        if (abortar.current === controlador) {
          abortar.current = null
          if (vivo.current) setEsperando(false)
        }
      }
    },
    [agregar],
  )

  const reintentar = useCallback(function reintentar() {
    if (abortar.current) return
    const lista = mensajesActuales.current
    if (lista.length === 0 || lista[lista.length - 1].rol !== 'usuario') return
    void ejecutar(lista, reintentar)
  }, [ejecutar])

  function enviar(contenido: string) {
    const limpio = contenido.trim()
    if (!limpio || abortar.current) return
    if (demoActual.current) avisarDemoUnaVez()
    const nuevo = agregar({ rol: 'usuario', texto: limpio })
    setTexto('')
    campo.current?.focus()
    void ejecutar([...mensajesActuales.current, nuevo], reintentar)
  }

  function detener() {
    abortar.current?.abort()
    abortar.current = null
    setEsperando(false)
    campo.current?.focus()
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    enviar(texto)
  }

  function borrarConversacion() {
    const previos = mensajes
    abortar.current?.abort()
    abortar.current = null
    setEsperando(false)
    borrar()
    avisar.exito({
      titulo: 'Conversación borrada',
      accion: { texto: 'Deshacer', alPulsar: () => reemplazar(previos) },
    })
  }

  return (
    <div className="pantalla">
      <section className={`plano-medio ${estilos.medio}`} aria-labelledby="chat-titulo">
        <h1 className={estilos.pregunta} id="chat-titulo">
          Pregunte lo que quiera
        </h1>
        <div className={estilos.tira}>
          <p className={estilos.tiraEtiqueta} id="chat-ve-esto">
            El asistente sabe que
          </p>
          <div className={estilos.chips} role="group" aria-labelledby="chat-ve-esto">
            <Chip to="/" icono="grass">
              {contexto.cultivo
                ? `${contexto.cultivo.nombre} · semana ${contexto.edadSemanas ?? 0} · ${contexto.etapa ?? ''}`
                : 'Sin cultivo'}
            </Chip>
            <Chip to={zona ? '/zona' : '/mapa'} icono="location_on">
              {zona ? zona.nombre : 'Sin zona'}
            </Chip>
            {zona && (
              <Chip to="/zona" icono="water_drop">
                {contexto.humedad && pctHumedad !== null
                  ? `Tierra: ${estadoZona}`
                  : 'Sin lectura de humedad'}
              </Chip>
            )}
          </div>
          {mensajes.length > 0 && (
            <Boton variante="texto" icono="delete" className={estilos.borrar} onClick={borrarConversacion}>
              Borrar conversación
            </Boton>
          )}
        </div>

        {mensajes.length === 0 && (
          <div className={estilos.vacio}>
            <p className={estilos.ayuda}>Toque una pregunta o escriba la suya abajo.</p>
            <div className={estilos.sugerencias} role="group" aria-label="Sugerencias">
              {sugerencias.map((s) => (
                <Chip key={s} className={estilos.sugerencia} onClick={() => enviar(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className={estilos.lista} role="log" aria-live="polite" aria-label="Conversación con el asistente">
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`${estilos.fila} ${m.rol === 'usuario' ? estilos.filaUsuario : estilos.filaAsistente}`}
            >
              {m.rol === 'asistente' && <span className={estilos.etiqueta}>Asistente</span>}
              <p className={`${estilos.burbuja} ${m.rol === 'usuario' ? estilos.burbujaUsuario : estilos.burbujaAsistente}`}>
                {m.texto}
              </p>
            </div>
          ))}
          {esperando && (
            <div className={`${estilos.fila} ${estilos.filaAsistente}`}>
              <span className={estilos.etiqueta}>Asistente</span>
              <div className={`${estilos.burbuja} ${estilos.burbujaAsistente}`}>
                <span className={estilos.puntos} aria-hidden="true">
                  <span className={estilos.punto} />
                  <span className={estilos.punto} />
                  <span className={estilos.punto} />
                </span>
                <span className="solo-lectores">El asistente está escribiendo</span>
              </div>
            </div>
          )}
          <div ref={fin} className={estilos.fin} />
        </div>
      </section>

      <div className={`plano-superior ${estilos.redactor}`}>
        <div className={estilos.redactorInterior}>
          {demo && <span className={estilos.insignia}>Modo de prueba: todavía sin conexión al asistente real</span>}
          <div className={estilos.campoFila}>
            <textarea
              ref={campo}
              className={estilos.campo}
              aria-label="Mensaje"
              placeholder="Escriba su pregunta"
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
            />
            {esperando ? (
              <BotonIcono icono="stop" etiqueta="Detener" variante="relleno" onClick={detener} />
            ) : (
              <Boton icono="send" disabled={texto.trim() === ''} onClick={() => enviar(texto)}>
                Enviar
              </Boton>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
