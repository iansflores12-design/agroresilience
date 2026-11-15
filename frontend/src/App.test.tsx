import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('arranca en Cultivo con el nombre de la aplicacion', () => {
    render(<App />)
    expect(screen.getAllByText('AgroResilience').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué sembró?' })).toBeInTheDocument()
  })

  it('la ruta /siembra muestra su titulo', () => {
    window.history.pushState({}, '', '/siembra')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Recomendación de siembra' })).toBeInTheDocument()
  })
})
