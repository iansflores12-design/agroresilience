import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sileo'
import 'sileo/styles.css'
import './tema/sileo.css'
import { ProveedorConversacion } from './estado/Conversacion'
import { ProveedorEstadoApp } from './estado/EstadoApp'
import { Rutas } from './Rutas'

function App() {
  return (
    <ProveedorEstadoApp>
      <ProveedorConversacion>
        <BrowserRouter>
          <Rutas />
        </BrowserRouter>
        <Toaster
          position="top-center"
          offset={{ top: 'calc(env(safe-area-inset-top) + var(--esp-2))' }}
          theme="system"
        />
      </ProveedorConversacion>
    </ProveedorEstadoApp>
  )
}

export default App
