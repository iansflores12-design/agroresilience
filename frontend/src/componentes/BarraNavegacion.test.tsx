import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLAVE_ORDEN_NAV, mover, ordenValido } from '../estado/ordenNavegacion'
import { renderizarApp } from '../pruebas/renderizar'

const nombres = () =>
  within(screen.getByRole('navigation', { name: 'Principal' }))
    .getAllByRole('link')
    .map((a) => a.textContent)

describe('orden de la navegacion', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('mover y validar el orden guardado', () => {
    expect(mover(['/', '/mapa', '/zona', '/chat'], '/', 2)).toEqual(['/mapa', '/zona', '/', '/chat'])
    expect(ordenValido(['/chat', '/', '/zona', '/mapa'])).toEqual(['/chat', '/', '/zona', '/mapa'])
    expect(ordenValido(['/chat', '/'])).toEqual(['/', '/mapa', '/zona', '/chat'])
    expect(ordenValido('basura')).toEqual(['/', '/mapa', '/zona', '/chat'])
  })

  it('Alt + flecha mueve un destino y el orden queda guardado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    expect(nombres()).toEqual(['Plan', 'Mapa', 'Tierra', 'Preguntar'])
    const plan = screen.getByRole('link', { name: 'Plan' })
    plan.focus()
    await usuario.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(nombres()).toEqual(['Mapa', 'Plan', 'Tierra', 'Preguntar'])
    expect(screen.getByText('Plan: posición 2 de 4')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ORDEN_NAV) ?? 'null')).toEqual(['/mapa', '/', '/zona', '/chat'])
  })

  it('arrastrar un destino lo cambia de lugar y no navega al soltar', () => {
    // Cuatro lugares de 100 px en fila, como la barra de abajo.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li')
      const i = li?.parentElement ? [...li.parentElement.children].indexOf(li) : 0
      return { left: i * 100, top: 0, width: 100, height: 80, right: i * 100 + 100, bottom: 80, x: i * 100, y: 0, toJSON() {} } as DOMRect
    })
    renderizarApp('/zona')
    const plan = screen.getByRole('link', { name: 'Plan' })
    act(() => {
      fireEvent.pointerDown(plan, { pointerId: 1, button: 0, clientX: 50, clientY: 40 })
      fireEvent.pointerMove(plan, { pointerId: 1, clientX: 150, clientY: 40 })
      fireEvent.pointerMove(plan, { pointerId: 1, clientX: 260, clientY: 40 })
      fireEvent.pointerUp(plan, { pointerId: 1, clientX: 260, clientY: 40 })
    })
    fireEvent.click(plan)
    expect(nombres()).toEqual(['Mapa', 'Tierra', 'Plan', 'Preguntar'])
    expect(screen.getByRole('heading', { level: 1, name: /tierra|suelo/i })).toBeInTheDocument()
  })
})
