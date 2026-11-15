import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useIdioma } from '../../i18n'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Chip } from '../../componentes/Chip'
import { buscarZona, humedadPorcentaje } from '../../datos/zonas'
import { claveEstadoHumedad } from '../Zona/formato'
import { TITULO_NUEVO, useConversacion, type MensajeChat } from '../../estado/Conversacion'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { armarContexto, crearClienteChat, ErrorChat, esModoDemo, type ClienteChat, type ContextoChat } from '../../lib/chat'
import estilos from './Chat.module.css'
import { ContenidoMensaje, MensajeEscribiendose } from './Enriquecido'
import { armarSugerencias } from './sugerencias'

const CLAVE_AVISO_DEMO = 'agroresilience.chat.demo.avisado'
const VISTAS: ContextoChat['vista'][] = ['cultivos', 'mapa', 'zona']

export interface PropsChat {
  /** Cliente del backend; por defecto el que corresponde a `VITE_API_URL`. */
  cliente?: ClienteChat
  /** Fuerza el modo demostracion (por defecto segun `VITE_API_URL`). */
  modoDemo?: boolean
}

function avisarDemoUnaVez(t: TFunction) {
  try {
    if (window.sessionStorage.getItem(CLAVE_AVISO_DEMO)) return
    window.sessionStorage.setItem(CLAVE_AVISO_DEMO, '1')
  } catch {
    // Sin sessionStorage se avisa en cada carga de la pagina.
  }
  avisar.info({
    titulo: t('chat.demoTitulo'),
    descripcion: t('chat.demoDescripcion'),
  })
}

function descripcionError(t: TFunction, e: unknown): string {
  if (e instanceof ErrorChat) {
    if (e.causa === 'red') return t('chat.errorRed')
    if (e.causa === 'servidor') return t('chat.errorServidor')
    if (e.causa === 'respuesta') return t('chat.errorRespuesta')
  }
  return t('chat.errorOtro')
}

export default function Chat({ cliente, modoDemo }: PropsChat) {
  const [params] = useSearchParams()
  const { t } = useTranslation()
  const idioma = useIdioma()
  const tActual = useRef(t)
  const { cultivoId, zonaId, edadSemanas } = useEstadoApp()
  const { id } = useParams()
  const navegar = useNavigate()
  const { chat, mensajes, agregar, reemplazar, borrar, fijar } = useConversacion(id)
  const toque = useRef<{ x: number; y: number } | null>(null)
  // La respuesta que acaba de llegar se muestra escribiéndose; las anteriores, completas.
  const [recienId, fijarRecienId] = useState<string | null>(null)

  const desde = params.get('desde')
  const vista = VISTAS.find((v) => v === desde) ?? 'chat'
  const contexto = useMemo(
    () => armarContexto({ vista, cultivoId, edadSemanas, zonaId, idioma }),
    [vista, cultivoId, edadSemanas, zonaId, idioma],
  )
  const sugerencias = useMemo(() => armarSugerencias(contexto), [contexto])
  const zona = buscarZona(zonaId)
  const pctHumedad = zona ? humedadPorcentaje(zona) : null
  const estadoZona = zona ? t(`zona.estado.${claveEstadoHumedad(zona)}`).toLowerCase() : ''

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
    tActual.current = t
  }, [cliente, contexto, mensajes, demo, t])

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
        fijarRecienId(agregar({ rol: 'asistente', texto: r.texto }).id)
      } catch (e) {
        if (controlador.signal.aborted || (e instanceof ErrorChat && e.causa === 'cancelado')) return
        avisar.error({
          titulo: tActual.current('chat.noEnviar'),
          descripcion: descripcionError(tActual.current, e),
          accion: { texto: tActual.current('comun.reintentar'), alPulsar: alReintentar },
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
    if (demoActual.current) avisarDemoUnaVez(t)
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

  // Gesto para volver: deslizar hacia la derecha desde el borde izquierdo de la pantalla.
  function alTocar(e: TouchEvent) {
    const dedo = e.touches[0]
    toque.current = dedo.clientX <= 28 ? { x: dedo.clientX, y: dedo.clientY } : null
  }
  function alSoltar(e: TouchEvent) {
    const inicio = toque.current
    toque.current = null
    if (!inicio) return
    const dedo = e.changedTouches[0]
    if (dedo.clientX - inicio.x > 72 && Math.abs(dedo.clientY - inicio.y) < 56) navegar('/chat')
  }

  function borrarConversacion() {
    const previos = mensajes
    fijarRecienId(null)
    abortar.current?.abort()
    abortar.current = null
    setEsperando(false)
    borrar()
    avisar.exito({
      titulo: t('chat.borrada'),
      accion: { texto: t('chat.deshacer'), alPulsar: () => reemplazar(previos) },
    })
  }

  return (
    <div className={`pantalla ${estilos.chat}`} onTouchStart={alTocar} onTouchEnd={alSoltar}>
      <div className={estilos.barraChat}>
        <BotonIcono icono="arrow_back" etiqueta={t('chats.volver')} to="/chat" />
        <span className={estilos.tituloChat}>{!chat || chat.titulo === TITULO_NUEVO ? t('chats.nuevo') : chat.titulo}</span>
        {chat && (
          <BotonIcono
            icono="keep"
            variante={chat.fijado ? 'tonal' : 'estandar'}
            etiqueta={chat.fijado ? t('chats.quitarFijado') : t('chats.fijarEste')}
            onClick={() => fijar(chat.id, !chat.fijado)}
          />
        )}
      </div>
      <section className={`plano-medio ${estilos.medio}`} aria-labelledby="chat-titulo">
        <h1 className={estilos.pregunta} id="chat-titulo">
          {t('chat.titulo')}
        </h1>
        <div className={estilos.tira}>
          <p className={estilos.tiraEtiqueta} id="chat-ve-esto">
            {t('chat.sabeQue')}
          </p>
          <div className={estilos.chips} role="group" aria-labelledby="chat-ve-esto">
            <Chip to="/" icono="grass">
              {contexto.cultivo
                ? t('chat.cultivoChip', { cultivo: contexto.cultivo.nombre, semana: contexto.edadSemanas ?? 0, etapa: contexto.etapa ?? '' })
                : t('chat.sinCultivo')}
            </Chip>
            <Chip to={zona ? '/zona' : '/mapa'} icono="location_on">
              {zona ? zona.nombre : t('chat.sinZona')}
            </Chip>
            {zona && (
              <Chip to="/zona" icono="water_drop">
                {contexto.humedad && pctHumedad !== null
                  ? t('chat.tierraChip', { estado: estadoZona })
                  : t('chat.sinHumedad')}
              </Chip>
            )}
          </div>
          {mensajes.length > 0 && (
            <Boton variante="texto" icono="delete" className={estilos.borrar} onClick={borrarConversacion}>
              {t('chat.borrar')}
            </Boton>
          )}
        </div>

        {mensajes.length === 0 && (
          <div className={estilos.vacio}>
            <p className={estilos.ayuda}>{t('chat.toquePregunta')}</p>
            <div className={estilos.sugerencias} role="group" aria-label={t('comun.sugerencias')}>
              {sugerencias.map((s) => (
                <Chip key={s} className={estilos.sugerencia} onClick={() => enviar(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className={estilos.lista} role="log" aria-live="polite" aria-label={t('chat.conversacion')}>
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`${estilos.fila} ${m.rol === 'usuario' ? estilos.filaUsuario : estilos.filaAsistente}`}
            >
              {m.rol === 'asistente' && <span className={estilos.etiqueta}>{t('chat.asistente')}</span>}
              {m.rol === 'usuario' ? (
                <p className={`${estilos.burbuja} ${estilos.burbujaUsuario}`}>{m.texto}</p>
              ) : (
                <div className={`${estilos.burbuja} ${estilos.burbujaAsistente}`}>
                  {m.id === recienId ? (
                    <MensajeEscribiendose texto={m.texto} zonaId={zonaId} />
                  ) : (
                    <ContenidoMensaje texto={m.texto} zonaId={zonaId} />
                  )}
                </div>
              )}
            </div>
          ))}
          {esperando && (
            <div className={`${estilos.fila} ${estilos.filaAsistente}`}>
              <span className={estilos.etiqueta}>{t('chat.asistente')}</span>
              <div className={`${estilos.burbuja} ${estilos.burbujaAsistente}`}>
                <span className={estilos.puntos} aria-hidden="true">
                  <span className={estilos.punto} />
                  <span className={estilos.punto} />
                  <span className={estilos.punto} />
                </span>
                <span className="solo-lectores">{t('chat.escribiendo')}</span>
              </div>
            </div>
          )}
          <div ref={fin} className={estilos.fin} />
        </div>
      </section>

      <div className={`plano-superior ${estilos.redactor}`}>
        <div className={estilos.redactorInterior}>
          {demo && <span className={estilos.insignia}>{t('chat.modoPrueba')}</span>}
          <div className={estilos.campoFila}>
            <textarea
              ref={campo}
              className={estilos.campo}
              aria-label={t('chat.mensaje')}
              placeholder={t('comun.escribaPregunta')}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
            />
            {esperando ? (
              <BotonIcono icono="stop" etiqueta={t('comun.detener')} variante="relleno" onClick={detener} />
            ) : (
              <Boton icono="send" disabled={texto.trim() === ''} onClick={() => enviar(texto)}>
                {t('comun.enviar')}
              </Boton>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
