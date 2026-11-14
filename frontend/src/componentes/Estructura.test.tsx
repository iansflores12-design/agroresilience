import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cultivos } from '../datos/cultivos'
import { zonas } from '../datos/zonas'
import { renderizarApp } from '../pruebas/renderizar'

const rutas = [
  { etiqueta: 'Cultivos', titulo: 'Cultivos' },
  { etiqueta: 'Mapa', titulo: 'Mapa' },
  { etiqueta: 'Zona', titulo: 'Zona' },
  { etiqueta: 'Asistente', titulo: 'Asistente' },
]

describe('Estructura', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('navega por las cuatro rutas y marca la activa con aria-current', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    for (const { etiqueta, titulo } of rutas) {
      await usuario.click(within(nav).getByRole('link', { name: etiqueta }))
      expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: etiqueta })).toHaveAttribute('aria-current', 'page')
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    }
  })

  it('pasa el foco al contenido al cambiar de ruta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Mapa' }))
    expect(document.getElementById('contenido')).toHaveFocus()
  })

  it('mantiene cultivo y zona elegidos en la tira de contexto al cambiar de vista', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const tira = screen.getByRole('group', { name: 'Contexto elegido' })
    expect(within(tira).getByText('Sin cultivo')).toBeInTheDocument()
    expect(within(tira).getByText('Sin zona')).toBeInTheDocument()

    const cultivo = cultivos[0]
    await usuario.click(screen.getByRole('button', { name: cultivo.nombre }))
    expect(within(tira).getByText(new RegExp(cultivo.nombre))).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    await usuario.click(within(nav).getByRole('link', { name: 'Mapa' }))
    const zona = zonas[0]
    await usuario.click(screen.getByRole('button', { name: zona.nombre }))

    for (const etiqueta of ['Zona', 'Asistente', 'Cultivos']) {
      await usuario.click(within(nav).getByRole('link', { name: etiqueta }))
      expect(within(tira).getByText(new RegExp(cultivo.nombre))).toBeInTheDocument()
      expect(within(tira).getByText(zona.nombre)).toBeInTheDocument()
    }
  })

  it('el FAB Preguntar enlaza a /chat con la vista de origen y no aparece en el chat', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/mapa')
    expect(screen.getByRole('link', { name: 'Preguntar' })).toHaveAttribute('href', '/chat?desde=mapa')
    await usuario.click(screen.getByRole('link', { name: 'Preguntar' }))
    expect(screen.queryByRole('link', { name: 'Preguntar' })).not.toBeInTheDocument()
  })

  it('el boton de sonido alterna su etiqueta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: 'Silenciar sonido' }))
    expect(screen.getByRole('button', { name: 'Activar sonido' })).toBeInTheDocument()
  })
})
