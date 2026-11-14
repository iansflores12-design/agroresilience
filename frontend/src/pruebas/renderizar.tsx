import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProveedorConversacion } from '../estado/Conversacion'
import { ProveedorEstadoApp } from '../estado/EstadoApp'
import { Rutas } from '../Rutas'

/** Renderiza la aplicacion completa (sin Toaster) en una ruta de memoria. */
export function renderizarApp(ruta = '/') {
  return render(
    <ProveedorEstadoApp>
      <ProveedorConversacion>
        <MemoryRouter initialEntries={[ruta]}>
          <Rutas />
        </MemoryRouter>
      </ProveedorConversacion>
    </ProveedorEstadoApp>,
  )
}
