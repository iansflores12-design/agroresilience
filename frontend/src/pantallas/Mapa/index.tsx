import { useNavigate } from 'react-router-dom'
import { BarraFlotante } from '../../componentes/BarraFlotante'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Control } from '../../componentes/Control'
import { Medidor } from '../../componentes/Medidor'
import { nivelDePercentil } from '../../componentes/nivelMedidor'
import { Tarjeta } from '../../componentes/Tarjeta'
import { clases } from '../../componentes/clases'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { coordenadas } from '../../componentes/mapa/formato'
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
      titulo: `Lugar: ${elegida.nombre}`,
      accion: { texto: 'Ver la tierra', alPulsar: () => navegar('/zona') },
    })
  }

  const avisarSinMapa = () => avisar.info({ titulo: 'Disponible cuando se integre el mapa' })

  return (
    <div className={clases('pantalla', estilos.pantalla)}>
      <h1 className={estilos.pregunta}>¿Dónde está su parcela?</h1>
      <div className={estilos.cuerpo}>
        <div className={estilos.mapa}>
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
        </div>

        <div className={estilos.lateral}>
          <section aria-labelledby="titulo-lugares" className={estilos.lugares}>
            <h2 id="titulo-lugares" className="tipo-titulo">
              Lugares
            </h2>
            <ul className={estilos.lista}>
              {zonas.map((z) => {
                const elegida = z.id === zonaId
                return (
                  <li key={z.id}>
                    <Control
                      className={clases(estilos.lugar, elegida && estilos.lugarElegido, 'capa-estado')}
                      aria-pressed={elegida}
                      onClick={() => alSeleccionarZona(z.id)}
                    >
                      <span className={estilos.nombreLugar}>{z.nombre}</span>
                      <Medidor nivel={nivelDePercentil(z.humedad?.percentil)} />
                    </Control>
                  </li>
                )
              })}
            </ul>
          </section>

          <Tarjeta como="aside" variante="elevada" className={estilos.tarjeta} aria-label="Lugar elegido">
            {zona ? (
              <>
                <div className={estilos.datos}>
                  <p className="tipo-titulo">{zona.nombre}</p>
                  <Medidor nivel={nivelDePercentil(zona.humedad?.percentil)} grande />
                  <p className="tipo-nota">
                    {humedad === null ? 'Sin lectura de humedad' : `${humedad.toFixed(1)} % de agua en la tierra`}
                  </p>
                  <details className={estilos.detalle}>
                    <summary>Ver detalles</summary>
                    <p className="tipo-nota">{coordenadas(zona.lat, zona.lon)}</p>
                  </details>
                </div>
                <Boton to="/zona" icono="arrow_forward">
                  Ver cómo está la tierra
                </Boton>
              </>
            ) : (
              <p className={estilos.vacio}>Toque un punto del mapa o un lugar de la lista.</p>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}
