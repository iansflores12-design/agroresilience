import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Chip } from '../../componentes/Chip'
import type { MensajeChat } from '../../estado/Conversacion'
import { ErrorChat, type ClienteChat, type ContextoChat } from '../../lib/chat'
import { crearClienteHttp } from '../../lib/chat/clienteHttp'
import { ContenidoMensaje, MensajeEscribiendose } from '../Chat/Enriquecido'
import estilos from './Rotacion.module.css'

const SUGERENCIAS = ['¿Qué necesito para empezar?', '¿Y si llueve menos de lo previsto?', '¿Por qué no la otra opción?']

let siguienteId = 0

/** Chat de seguimiento sobre una rotacion. Gemini recibe el ranking y la evidencia de la consulta. */
export function ChatSeguimiento({
  contexto,
  cliente,
  titulo = 'Pregunte sobre esta rotación',
  sugerencias = SUGERENCIAS,
  respaldo,
  integrado = false,
}: {
  contexto: ContextoChat
  cliente?: ClienteChat
  titulo?: string
  sugerencias?: string[]
  /** Respuesta preparada de antemano con los datos de la decisión, por si Gemini no contesta. */
  respaldo?: (pregunta: string) => string
  /** Va dentro de la tarjeta del análisis: sin fondo ni relleno propios, separado por una línea. */
  integrado?: boolean
}) {
  const [mensajes, fijarMensajes] = useState<MensajeChat[]>([])
  const [texto, fijarTexto] = useState('')
  const [esperando, fijarEsperando] = useState(false)
  const [error, fijarError] = useState<string | null>(null)
  const control = useRef<AbortController | null>(null)
  const clienteReal = useRef<ClienteChat>(cliente ?? crearClienteHttp('/api'))

  useEffect(() => () => control.current?.abort(), [])

  async function enviar(contenido: string, lista = mensajes) {
    const limpio = contenido.trim()
    if (!limpio || control.current) return
    const nuevo: MensajeChat = { id: `s${++siguienteId}`, rol: 'usuario', texto: limpio, fecha: new Date().toISOString() }
    const conNuevo = [...lista, nuevo]
    fijarMensajes(conNuevo)
    fijarTexto('')
    fijarError(null)
    const c = new AbortController()
    control.current = c
    fijarEsperando(true)
    try {
      const r = await clienteReal.current.enviar({ mensajes: conNuevo, contexto, signal: c.signal })
      fijarMensajes((m) => [...m, { id: `s${++siguienteId}`, rol: 'asistente', texto: r.texto, fecha: new Date().toISOString() }])
    } catch (e) {
      if (c.signal.aborted || (e instanceof ErrorChat && e.causa === 'cancelado')) return
      if (respaldo) {
        fijarMensajes((m) => [...m, { id: `s${++siguienteId}`, rol: 'asistente', texto: respaldo(limpio), fecha: new Date().toISOString() }])
        fijarError('La IA no contestó. Le dejamos un resumen rápido con los datos de su consulta.')
        return
      }
      fijarError('La IA no contestó. Su pregunta quedó escrita: puede reintentar.')
      fijarMensajes(lista)
      fijarTexto(limpio)
    } finally {
      if (control.current === c) control.current = null
      fijarEsperando(false)
    }
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void enviar(texto)
  }

  return (
    <section className={integrado ? estilos.chatIntegrado : estilos.chat} aria-labelledby="titulo-chat">
      <h2 id="titulo-chat" className={estilos.tituloTarjeta}>
        {titulo}
      </h2>
      {mensajes.length === 0 && (
        <div className={estilos.sugerencias} role="group" aria-label="Sugerencias">
          {sugerencias.map((s) => (
            <Chip key={s} onClick={() => void enviar(s)}>
              {s}
            </Chip>
          ))}
        </div>
      )}
      <div className={estilos.mensajes} role="log" aria-live="polite" aria-label={`Conversación: ${titulo}`}>
        {mensajes.map((m, i) => (
          m.rol === 'usuario' ? (
            <p key={m.id} className={estilos.burbujaUsuario}>
              {m.texto}
            </p>
          ) : (
            <div key={m.id} className={estilos.burbujaAsistente}>
              {i === mensajes.length - 1 ? (
                <MensajeEscribiendose texto={m.texto} zonaId={contexto.zona?.id ?? null} />
              ) : (
                <ContenidoMensaje texto={m.texto} zonaId={contexto.zona?.id ?? null} />
              )}
            </div>
          )
        ))}
        {esperando && (
          <p className={estilos.burbujaAsistente}>
            <span className="solo-lectores">La IA está escribiendo</span>
            <span aria-hidden="true">…</span>
          </p>
        )}
      </div>
      {error && (
        <p className={estilos.fallo} role="alert">
          {error}
        </p>
      )}
      <div className={estilos.redactor}>
        <textarea
          className={estilos.campo}
          aria-label="Su pregunta"
          placeholder="Escriba su pregunta"
          rows={2}
          value={texto}
          onChange={(e) => fijarTexto(e.target.value)}
          onKeyDown={alTeclear}
        />
        {esperando ? (
          <BotonIcono icono="stop" etiqueta="Detener" variante="relleno" onClick={() => control.current?.abort()} />
        ) : (
          <Boton icono="send" disabled={texto.trim() === ''} onClick={() => void enviar(texto)}>
            Enviar
          </Boton>
        )}
      </div>
    </section>
  )
}
