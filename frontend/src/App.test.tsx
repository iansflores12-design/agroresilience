import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('arranca en Plan con la primera pregunta de Gemini Decision', () => {
    render(<App />)
    expect(screen.getAllByText('AgroResilience').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1, name: '¿Dónde está su parcela?' })).toBeInTheDocument()
    expect(screen.getByText('Pregunta 1 de 5')).toBeInTheDocument()
  })
})
