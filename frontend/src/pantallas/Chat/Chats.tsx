import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { useConversacion } from '../../estado/Conversacion'
import estilos from './Chats.module.css'
import Chat, { type PropsChat } from './index'
import { ListaChats } from './Lista'

/**
 * Preguntar. Sin chat abierto (`/chat`) es la selección de chats, con la navegación y la barra
 * de siempre. Con uno abierto (`/chat/:id`) el chat toma la pantalla: en teléfono desaparecen
 * la barra superior y la navegación inferior y se vuelve con la flecha o deslizando desde el
 * borde; en computadora queda el menú lateral y la lista de chats va en una columna al lado.
 */
export default function Chats(props: PropsChat) {
  const { id } = useParams()
  const { chats, abrir, crear } = useConversacion()
  const navegar = useNavigate()
  const { t } = useTranslation()
  const existe = id !== undefined && chats.some((c) => c.id === id)

  useEffect(() => {
    if (existe) abrir(id)
  }, [existe, id, abrir])

  if (id !== undefined && !existe) return <Navigate to="/chat" replace />

  return (
    <div className={`pantalla ${estilos.chatsPantalla}`} data-abierto={id ? '' : undefined}>
      <ListaChats abiertoId={id ?? null} />
      <div className={estilos.conversacion}>
        {id ? (
          <Chat key={id} {...props} />
        ) : (
          <div className={estilos.sinChat}>
            <p>{t('chats.elija')}</p>
            <Boton variante="tonal" icono="add" onClick={() => navegar(`/chat/${crear()}`)}>
              {t('chats.nuevoChat')}
            </Boton>
          </div>
        )}
      </div>
    </div>
  )
}
