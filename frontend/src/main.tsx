import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tema/colores.css'
import './tema/tokens.css'
import './tema/base.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
