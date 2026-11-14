import { Route, Routes } from 'react-router-dom'
import { Estructura } from './componentes/Estructura'
import Chat from './pantallas/Chat'
import Cultivos from './pantallas/Cultivos'
import Mapa from './pantallas/Mapa'
import Zona from './pantallas/Zona'

/** Las cuatro rutas de DISENO.md, seccion 3, dentro del armazon. */
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Cultivos />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="zona" element={<Zona />} />
        <Route path="chat" element={<Chat />} />
        <Route path="*" element={<Cultivos />} />
      </Route>
    </Routes>
  )
}
