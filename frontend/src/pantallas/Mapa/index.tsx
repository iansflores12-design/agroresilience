import { useNavigate } from 'react-router-dom'
import { BarraFlotante } from '../../componentes/BarraFlotante'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { PlanoFondo } from '../../componentes/PlanoFondo'
import { Tarjeta } from '../../componentes/Tarjeta'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { coordenadas, nombreCorto } from '../../componentes/mapa/formato'
import { buscarZona, cajaHonduras, humedadPorcentaje, zonas } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import estilos from './Mapa.module.css'

export default function Mapa() {
  const { zonaId, cultivoId, elegirZona } = useEstadoApp()
  const navegar = useNavigate()
  const zona = buscarZona(zonaId)
  const humedad = zona ? humedadPorcentaje(zona) : null

  function alSeleccionarZona(id: string) {
    const elegida = buscarZona(id)
    if (!elegida || id === zonaId) return
    elegirZona(id)
    avisar.exito({
      titulo: `Zona: ${elegida.nombre}`,
      accion: { texto: 'Ver hoja', alPulsar: () => navegar('/zona') },
    })
  }

  const avisarSinMapa = () => avisar.info({ titulo: 'Disponible cuando se integre el mapa' })

  return (
    <div className={`pantalla ${estilos.pantalla}`}>
      <PlanoFondo texto={zona ? nombreCorto(zona.nombre) : 'Mapa'} />
      <h1 className="solo-lectores">Mapa</h1>
      <div className={`plano-medio ${estilos.mapa}`}>
        <ContenedorMapa
          zonas={zonas}
          caja={cajaHonduras}
          zonaSeleccionadaId={zonaId}
          cultivoId={cultivoId}
          alSeleccionarZona={alSeleccionarZona}
        />
        <BarraFlotante className={estilos.controles} role="group" aria-label="Controles del mapa">
          <BotonIcono icono="layers" etiqueta="Capas" onClick={avisarSinMapa} />
          <BotonIcono icono="my_location" etiqueta="Mi ubicación" onClick={avisarSinMapa} />
        </BarraFlotante>
        <Tarjeta como="aside" className={`plano-superior ${estilos.tarjeta}`} aria-label="Zona elegida">
          {zona ? (
            <>
              <div className={estilos.datos}>
                <p className="tipo-titulo">{zona.nombre}</p>
                <p className="tipo-nota">{coordenadas(zona.lat, zona.lon)}</p>
                <p className="tipo-nota">
                  {humedad === null ? 'Humedad: sin lectura' : `Humedad del suelo: ${humedad.toFixed(1)} %`}
                </p>
              </div>
              <Boton to="/zona" icono="arrow_forward">
                Ver hoja de la zona
              </Boton>
            </>
          ) : (
            <p className="tipo-nota">Toca un punto para elegir una zona</p>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
