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
      <div className={estilos.cabezaLista}>
        <Titulo id="titulo-chats" className={estilos.tituloLista}>
          Sus chats
        </Titulo>
        <Boton icono="add" onClick={() => navegar(`/chat/${crear()}`)}>
          Nuevo chat
        </Boton>
      </div>
      {chats.length === 0 ? (
        <p className={estilos.vacioLista}>Todavía no tiene chats. Empiece uno para preguntarle al asistente.</p>
      ) : (
        <ul className={estilos.chats}>
          {chats.map((c) => (
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
                    <span className={estilos.nombreChat}>
                      {c.fijado && <Icono nombre="keep" tamano={18} />}
                      {c.titulo}
                    </span>
                    <span className="tipo-nota">{resumen(c)}</span>
                  </Control>
                  <span className={estilos.accionesChat}>
                    <BotonIcono
                      icono="keep"
                      variante={c.fijado ? 'tonal' : 'estandar'}
                      etiqueta={c.fijado ? `Quitar de fijados: ${c.titulo}` : `Fijar arriba: ${c.titulo}`}
                      onClick={() => fijar(c.id, !c.fijado)}
                    />
                    <BotonIcono
                      icono="edit"
                      etiqueta={`Cambiar nombre: ${c.titulo}`}
                      onClick={() => {
                        fijarBorrador(c.titulo)
                        fijarEditando(c.id)
                      }}
                    />
                    <BotonIcono icono="delete" etiqueta={`Borrar: ${c.titulo}`} onClick={() => borrar(c)} />
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
