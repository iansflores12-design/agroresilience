import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cultivos } from '../datos/cultivos'
import { zonas } from '../datos/zonas'
import { renderizarApp } from '../pruebas/renderizar'

const rutas = [
  { etiqueta: 'Plan', titulo: '¿Dónde está su parcela?' },
  { etiqueta: 'Mapa', titulo: '¿Dónde está su parcela?' },
  { etiqueta: 'Tierra', titulo: '¿Cómo está la tierra?' },
  { etiqueta: 'Preguntar', titulo: 'Pregunte lo que quiera' },
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
    expect(within(tira).getByText('Elegir cultivo')).toBeInTheDocument()
    expect(within(tira).getByText('Elegir lugar')).toBeInTheDocument()

    // Cuestionario de Gemini Decision: lugar, terreno, cultivo y temporada.
    const cultivo = cultivos[0]
    await usuario.click(screen.getByRole('button', { name: 'Choluteca' }))
    await usuario.click(screen.getByRole('button', { name: /^Plano/ }))
    await usuario.click(screen.getByRole('button', { name: new RegExp(`^${cultivo.nombre}\\s*Unas`) }))
    expect(screen.getByRole('slider', { name: 'Edad del cultivo' })).toBeInTheDocument()   // se abre abajo
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))
    await usuario.click(screen.getByRole('button', { name: /^De primera/ }))
    expect(within(tira).getByText(new RegExp(cultivo.nombre))).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Principal' })
    await usuario.click(within(nav).getByRole('link', { name: 'Mapa' }))
    const zona = zonas[0]
    await usuario.click(screen.getByRole('button', { name: zona.nombre }))

    for (const etiqueta of ['Tierra', 'Preguntar', 'Plan']) {
      await usuario.click(within(nav).getByRole('link', { name: etiqueta }))
      expect(within(tira).getByText(new RegExp(cultivo.nombre))).toBeInTheDocument()
      expect(within(tira).getByText(zona.nombre)).toBeInTheDocument()
    }
  })

  it('no hay boton flotante: Preguntar solo esta en la navegacion', () => {
    renderizarApp('/mapa')
    const enlaces = screen.getAllByRole('link', { name: 'Preguntar' })
    expect(enlaces).toHaveLength(1)
    expect(enlaces[0].closest('nav')).not.toBeNull()
  })

  it('el boton de sonido alterna su etiqueta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: 'Silenciar sonido' }))
    expect(screen.getByRole('button', { name: 'Activar sonido' })).toBeInTheDocument()
  })
})
