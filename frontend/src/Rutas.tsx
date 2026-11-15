import { Route, Routes } from 'react-router-dom'
import { Estructura } from './componentes/Estructura'
import Chats from './pantallas/Chat/Chats'
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
        <Route path="chat" element={<Chats />} />
        <Route path="chat/:id" element={<Chats />} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}
