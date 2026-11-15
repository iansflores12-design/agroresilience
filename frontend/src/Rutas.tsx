import { Route, Routes } from 'react-router-dom'
import { Estructura } from './componentes/Estructura'
import Chat from './pantallas/Chat'
import Inicio from './pantallas/Inicio'
import Mapa from './pantallas/Mapa'
import Rotacion from './pantallas/Rotacion'
import Zona from './pantallas/Zona'

/** Las rutas de DISENO.md, seccion 3, dentro del armazon. */
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="rotacion/:id" element={<Rotacion />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="zona" element={<Zona />} />
        <Route path="chat" element={<Chat />} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}
