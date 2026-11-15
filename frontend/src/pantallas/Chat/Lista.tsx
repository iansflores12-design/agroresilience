import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { useConversacion, type ChatGuardado } from '../../estado/Conversacion'
import { avisar } from '../../lib/avisos'
import estilos from './Chats.module.css'

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Lo último que se dijo en el chat, en una línea. */
function resumen(c: ChatGuardado): string {
  const ultimo = c.mensajes[c.mensajes.length - 1]
  if (!ultimo) return 'Sin mensajes todavía'
  const texto = ultimo.texto.replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim()
  return texto.length > 70 ? `${texto.slice(0, 70).trimEnd()}…` : texto || 'Respuesta con mapa o animación'
}

/**
 * La selección de chats: botón "Nuevo chat" y la lista, con los fijados arriba. Cada chat se
 * abre, se fija, se renombra o se borra (con deshacer). En teléfono es una pantalla completa;
 * en computadora es la columna de la izquierda del chat.
 */
export function ListaChats({ abiertoId }: { abiertoId: string | null }) {
  const { chats, crear, renombrar, fijar, eliminar, restaurar } = useConversacion()
  const navegar = useNavigate()
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
    avisar.exito({ titulo: 'Chat borrado', accion: { texto: 'Deshacer', alPulsar: () => restaurar(c) } })
  }

  return (
    <aside className={estilos.lista} aria-labelledby="titulo-chats">
      <Titulo id="titulo-chats" className={estilos.tituloLista}>
        Sus chats
      </Titulo>
      {chats.length > 0 && (
        <label className={estilos.buscador}>
          <Icono nombre="search" tamano={22} />
          <span className="solo-lectores">Buscar en sus chats</span>
          <input
            type="search"
            value={busqueda}
            placeholder="Buscar en sus chats"
            autoComplete="off"
            onChange={(e) => fijarBusqueda(e.target.value)}
          />
        </label>
      )}
      <Boton icono="add" className={estilos.nuevo} onClick={() => navegar(`/chat/${crear()}`)}>
        Nuevo chat
      </Boton>
      {chats.length === 0 ? (
        <p className={estilos.vacioLista}>Todavía no tiene chats. Empiece uno para preguntarle al asistente.</p>
      ) : visibles.length === 0 ? (
        <p className={estilos.vacioLista} role="status">
          Ningún chat tiene esas palabras.
        </p>
      ) : (
        <ul className={estilos.chats}>
          {visibles.map((c) => (
            <li key={c.id} className={clases(estilos.filaChat, c.id === abiertoId && estilos.filaAbierta)}>
              {editando === c.id ? (
                <form className={estilos.renombrar} onSubmit={(e) => guardarNombre(e, c.id)}>
                  <input
                    className={estilos.campoNombre}
                    aria-label="Nombre del chat"
                    value={borrador}
                    maxLength={80}
                    autoFocus
                    onChange={(e) => fijarBorrador(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && fijarEditando(null)}
                  />
                  <Boton type="submit" variante="tonal" icono="check">
                    Guardar
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
                        {c.titulo}
                        {c.fijado && <Icono nombre="keep" tamano={16} />}
                      </span>
                      <span className="tipo-nota">{resumen(c)}</span>
                    </span>
                  </Control>
                  <BotonIcono
                    icono="more_vert"
                    etiqueta={`Opciones de ${c.titulo}`}
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
                        {c.fijado ? 'Quitar de fijados' : 'Fijar arriba'}
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
                        Cambiar nombre
                      </Boton>
                      <Boton variante="texto" icono="delete" onClick={() => borrar(c)}>
                        Borrar
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
