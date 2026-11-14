import { buscarCultivo } from '../datos/cultivos'
import { buscarZona } from '../datos/zonas'
import { useEstadoApp } from '../estado/EstadoApp'
import { Chip } from './Chip'
import estilos from './TiraContexto.module.css'

/** Muestra el cultivo y la zona elegidos. Cada chip lleva a la pantalla donde se elige. */
export function TiraContexto() {
  const { cultivoId, zonaId, edadSemanas } = useEstadoApp()
  const cultivo = buscarCultivo(cultivoId)
  const zona = buscarZona(zonaId)
  const textoCultivo = cultivo ? `${cultivo.nombre}, ${edadSemanas} sem` : 'Sin cultivo'
  const textoZona = zona ? zona.nombre : 'Sin zona'
  return (
    <div className={estilos.tira} role="group" aria-label="Contexto elegido">
      <Chip to="/" icono="grass" aria-label={cultivo ? `Cultivo: ${cultivo.nombre}, ${edadSemanas} semanas` : 'Sin cultivo. Elegir cultivo'}>
        {textoCultivo}
      </Chip>
      <Chip to="/mapa" icono="location_on" aria-label={zona ? `Zona: ${zona.nombre}` : 'Sin zona. Elegir zona'}>
        {textoZona}
      </Chip>
    </div>
  )
}
