import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('arranca en Cultivos con el nombre de la aplicacion', () => {
    render(<App />)
    expect(screen.getByText('AgroResilience')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Cultivos' })).toBeInTheDocument()
  })
})
