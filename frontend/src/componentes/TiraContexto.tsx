import { buscarCultivo } from '../datos/cultivos'
import { buscarZona } from '../datos/zonas'
import { useEstadoApp } from '../estado/EstadoApp'
import { TEMPORADAS } from '../lib/decision/parametros'
import { Chip } from './Chip'
import estilos from './TiraContexto.module.css'

/** Dice en palabras completas el cultivo y el lugar elegidos. Cada chip lleva a donde se elige. */
export function TiraContexto() {
  const { cultivoId, zonaId, temporada } = useEstadoApp()
  const cultivo = buscarCultivo(cultivoId)
  const zona = buscarZona(zonaId)
  const textoCultivo = cultivo
    ? temporada
      ? `${cultivo.nombre} de ${TEMPORADAS[temporada].nombre.toLowerCase()}`
      : cultivo.nombre
    : 'Elegir cultivo'
  const textoZona = zona ? zona.nombre : 'Elegir lugar'
  return (
    <div className={estilos.tira} role="group" aria-label="Contexto elegido">
      <Chip to="/" icono="grass" aria-label={cultivo ? `Cultivo: ${textoCultivo}` : 'Sin cultivo. Elegir cultivo'}>
        {textoCultivo}
      </Chip>
      <Chip to="/mapa" icono="location_on" aria-label={zona ? `Lugar: ${zona.nombre}` : 'Sin lugar. Elegir lugar'}>
        {textoZona}
      </Chip>
    </div>
  )
}
