import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { lista as listaT } from '../../i18n/traductor'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Chip } from '../../componentes/Chip'
import type { MensajeChat } from '../../estado/Conversacion'
import { ErrorChat, type ClienteChat, type ContextoChat } from '../../lib/chat'
import { crearClienteHttp } from '../../lib/chat/clienteHttp'
import estilos from './Rotacion.module.css'

let siguienteId = 0

/** Chat de seguimiento sobre una rotacion. Gemini recibe el ranking y la evidencia de la consulta. */
export function ChatSeguimiento({ contexto, cliente }: { contexto: ContextoChat; cliente?: ClienteChat }) {
  const { t } = useTranslation()
  const sugerencias = listaT(t, 'chatSeguimiento.sugerencias')
  const [mensajes, fijarMensajes] = useState<MensajeChat[]>([])
  const [texto, fijarTexto] = useState('')
  const [esperando, fijarEsperando] = useState(false)
  const [error, fijarError] = useState(false)
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
    fijarError(false)
    const c = new AbortController()
    control.current = c
    fijarEsperando(true)
    try {
      const r = await clienteReal.current.enviar({ mensajes: conNuevo, contexto, signal: c.signal })
      fijarMensajes((m) => [...m, { id: `s${++siguienteId}`, rol: 'asistente', texto: r.texto, fecha: new Date().toISOString() }])
    } catch (e) {
      if (c.signal.aborted || (e instanceof ErrorChat && e.causa === 'cancelado')) return
      fijarError(true)
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
    <section className={estilos.chat} aria-labelledby="titulo-chat">
      <h2 id="titulo-chat" className={estilos.tituloTarjeta}>
        {t('chatSeguimiento.titulo')}
      </h2>
      {mensajes.length === 0 && (
        <div className={estilos.sugerencias} role="group" aria-label={t('comun.sugerencias')}>
          {sugerencias.map((s) => (
            <Chip key={s} onClick={() => void enviar(s)}>
              {s}
            </Chip>
          ))}
        </div>
      )}
      <div className={estilos.mensajes} role="log" aria-live="polite" aria-label={t('chatSeguimiento.conversacion')}>
        {mensajes.map((m) => (
          <p key={m.id} className={m.rol === 'usuario' ? estilos.burbujaUsuario : estilos.burbujaAsistente}>
            {m.texto}
          </p>
        ))}
        {esperando && (
          <p className={estilos.burbujaAsistente}>
            <span className="solo-lectores">{t('chatSeguimiento.escribiendo')}</span>
            <span aria-hidden="true">…</span>
          </p>
        )}
      </div>
      {error && (
        <p className={estilos.fallo} role="alert">
          {t('chatSeguimiento.error')}
        </p>
      )}
      <div className={estilos.redactor}>
        <textarea
          className={estilos.campo}
          aria-label={t('chatSeguimiento.suPregunta')}
          placeholder={t('comun.escribaPregunta')}
          rows={2}
          value={texto}
          onChange={(e) => fijarTexto(e.target.value)}
          onKeyDown={alTeclear}
        />
        {esperando ? (
          <BotonIcono icono="stop" etiqueta={t('comun.detener')} variante="relleno" onClick={() => control.current?.abort()} />
        ) : (
          <Boton icono="send" disabled={texto.trim() === ''} onClick={() => void enviar(texto)}>
            {t('comun.enviar')}
          </Boton>
        )}
      </div>
    </section>
  )
}
