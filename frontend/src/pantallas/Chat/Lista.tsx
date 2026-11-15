import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { TITULO_NUEVO, useConversacion, type ChatGuardado } from '../../estado/Conversacion'
import { avisar } from '../../lib/avisos'
import estilos from './Chats.module.css'

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Lo último que se dijo en el chat, en una línea. */
function resumen(t: TFunction, c: ChatGuardado): string {
  const ultimo = c.mensajes[c.mensajes.length - 1]
  if (!ultimo) return t('chats.sinMensajes')
  const texto = ultimo.texto.replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim()
  return texto.length > 70 ? `${texto.slice(0, 70).trimEnd()}…` : texto || t('chats.conPieza')
}

/**
 * La selección de chats: botón "Nuevo chat" y la lista, con los fijados arriba. Cada chat se
 * abre, se fija, se renombra o se borra (con deshacer). En teléfono es una pantalla completa;
 * en computadora es la columna de la izquierda del chat.
 */
export function ListaChats({ abiertoId }: { abiertoId: string | null }) {
  const { chats, crear, renombrar, fijar, eliminar, restaurar } = useConversacion()
  const navegar = useNavigate()
  const { t } = useTranslation()
  // Un chat sin nombre propio se llama "Chat nuevo" en el idioma actual.
  const titulo = (c: ChatGuardado) => (c.titulo === TITULO_NUEVO ? t('chats.nuevo') : c.titulo)
  const [editando, fijarEditando] = useState<string | null>(null)
  const [borrador, fijarBorrador] = useState('')
  const [busqueda, fijarBusqueda] = useState('')
  // El chat cuyas opciones (fijar, nombre, borrar) están abiertas debajo de su fila.
  const [opciones, fijarOpciones] = useState<string | null>(null)
  const buscado = sinTildes(busqueda.trim())
  const visibles = buscado
    ? chats.filter((c) => sinTildes(c.titulo).includes(buscado) || c.mensajes.some((m) => sinTildes(m.texto).includes(buscado)))
    : chats
  const Titulo = abiertoId ? 'h2' : 'h1'

  function guardarNombre(e: FormEvent, id: string) {
    e.preventDefault()
    renombrar(id, borrador)
    fijarEditando(null)
  }

  function borrar(c: ChatGuardado) {
    eliminar(c.id)
    if (c.id === abiertoId) navegar('/chat', { replace: true })
    avisar.exito({ titulo: t('chats.borrado'), accion: { texto: t('chat.deshacer'), alPulsar: () => restaurar(c) } })
  }

  return (
    <aside className={estilos.lista} aria-labelledby="titulo-chats">
      <Titulo id="titulo-chats" className={estilos.tituloLista}>
        {t('chats.titulo')}
      </Titulo>
      {chats.length > 0 && (
        <label className={estilos.buscador}>
          <Icono nombre="search" tamano={22} />
          <span className="solo-lectores">{t('chats.buscar')}</span>
          <input
            type="search"
            value={busqueda}
            placeholder={t('chats.buscar')}
            autoComplete="off"
            onChange={(e) => fijarBusqueda(e.target.value)}
          />
        </label>
      )}
      <Boton icono="add" className={estilos.nuevo} onClick={() => navegar(`/chat/${crear()}`)}>
        {t('chats.nuevoChat')}
      </Boton>
      {chats.length === 0 ? (
        <p className={estilos.vacioLista}>{t('chats.vacio')}</p>
      ) : visibles.length === 0 ? (
        <p className={estilos.vacioLista} role="status">
          {t('chats.sinCoincidencias')}
        </p>
      ) : (
        <ul className={estilos.chats}>
          {visibles.map((c) => (
            <li key={c.id} className={clases(estilos.filaChat, c.id === abiertoId && estilos.filaAbierta)}>
              {editando === c.id ? (
                <form className={estilos.renombrar} onSubmit={(e) => guardarNombre(e, c.id)}>
                  <input
                    className={estilos.campoNombre}
                    aria-label={t('chats.nombre')}
                    value={borrador}
                    maxLength={80}
                    autoFocus
                    onChange={(e) => fijarBorrador(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && fijarEditando(null)}
                  />
                  <Boton type="submit" variante="tonal" icono="check">
                    {t('plan.guardar')}
                  </Boton>
                </form>
              ) : (
                <>
                  <Control
                    to={`/chat/${c.id}`}
                    className={clases(estilos.enlaceChat, 'capa-estado')}
                    aria-current={c.id === abiertoId ? 'page' : undefined}
                  >
                    <span className={estilos.iconoChat}>
                      <Icono nombre="forum" tamano={20} />
                    </span>
                    <span className={estilos.textoChat}>
                      <span className={estilos.nombreChat}>
                        {titulo(c)}
                        {c.fijado && <Icono nombre="keep" tamano={16} />}
                      </span>
                      <span className="tipo-nota">{resumen(t, c)}</span>
                    </span>
                  </Control>
                  <BotonIcono
                    icono="more_vert"
                    etiqueta={t('chats.opcionesDe', { titulo: titulo(c) })}
                    aria-expanded={opciones === c.id}
                    onClick={() => fijarOpciones(opciones === c.id ? null : c.id)}
                  />
                  {opciones === c.id && (
                    <span className={estilos.accionesChat}>
                      <Boton
                        variante="texto"
                        icono="keep"
                        onClick={() => {
                          fijar(c.id, !c.fijado)
                          fijarOpciones(null)
                        }}
                      >
                        {c.fijado ? t('chats.quitarFijado') : t('chats.fijarArriba')}
                      </Boton>
                      <Boton
                        variante="texto"
                        icono="edit"
                        onClick={() => {
                          fijarBorrador(c.titulo)
                          fijarEditando(c.id)
                          fijarOpciones(null)
                        }}
                      >
                        {t('chats.cambiarNombre')}
                      </Boton>
                      <Boton variante="texto" icono="delete" onClick={() => borrar(c)}>
                        {t('chats.borrar')}
                      </Boton>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
