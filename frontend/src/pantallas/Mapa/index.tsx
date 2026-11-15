import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarraFlotante } from '../../componentes/BarraFlotante'
import { Boton } from '../../componentes/Boton'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Chip } from '../../componentes/Chip'
import { Control } from '../../componentes/Control'
import { Medidor } from '../../componentes/Medidor'
import { nivelDePercentil } from '../../componentes/nivelMedidor'
import { Tarjeta } from '../../componentes/Tarjeta'
import { clases } from '../../componentes/clases'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { useEscenario } from '../../componentes/mapa/escenario'
import { Icono } from '../../componentes/Icono'
import type { ControlMapa } from '../../componentes/mapa/MapaHonduras'
import { LeyendaAptitud, NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { Partes } from '../../componentes/mapa/Partes'
import {
  aptitud,
  buscarDepartamento,
  departamentoDeZona,
  escenarios,
  rotacionesPara,
  tieneAptitud,
  type Escenario,
} from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { buscarZona, cajaHonduras, humedadPorcentaje, zonas } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import estilos from './Mapa.module.css'
import { Rotaciones } from './Rotaciones'

const ORDEN_ESCENARIOS: Escenario[] = ['seco', 'normal', 'lluvioso']

/** "Año seco" -> "Seco": la pregunta de arriba ya dice "año". */
function nombreCorto(nombre: string) {
  const sinAnio = nombre.replace(/^Año\s+/, '')
  return sinAnio.charAt(0).toUpperCase() + sinAnio.slice(1)
}

/** En pantallas anchas la lista cabe al lado del mapa; en el telefono empieza cerrada. */
function esPantallaAncha() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 840px)').matches
}

export default function Mapa() {
  const { zonaId, cultivoId, elegirZona } = useEstadoApp()
  const navegar = useNavigate()
  const [escenario, fijarEscenario] = useEscenario()
  const [departamentoTocado, fijarDepartamentoTocado] = useState<string | null>(null)
  const controlMapa = useRef<ControlMapa>(null)
  const [listaAbierta] = useState(esPantallaAncha)

  const zona = buscarZona(zonaId)
  const humedad = zona ? humedadPorcentaje(zona) : null
  const cultivo = tieneAptitud(cultivoId) ? buscarCultivo(cultivoId) : null
  const nombreCultivo = cultivo?.nombre.toLowerCase() ?? ''
  // Sin tocar un departamento, se muestra el del lugar elegido.
  const departamentoId = departamentoTocado ?? departamentoDeZona(zonaId)
  const departamento = buscarDepartamento(departamentoId)
  const resultado = aptitud(departamentoId, cultivoId, escenario)
  const rotaciones = rotacionesPara(departamentoId, cultivoId, escenario)

  function alSeleccionarZona(id: string) {
    const elegida = buscarZona(id)
    if (!elegida) return
    fijarDepartamentoTocado(departamentoDeZona(id))
    if (id === zonaId) return
    elegirZona(id)
    avisar.exito({
      titulo: `Lugar: ${elegida.nombre}`,
      accion: { texto: 'Ver la tierra', alPulsar: () => navegar('/zona') },
    })
  }

  function buscarMiUbicacion() {
    const sinUbicacion = () =>
      avisar.alerta({ titulo: 'No se pudo saber dónde está', descripcion: 'Elija su lugar en la lista.' })
    if (!('geolocation' in navigator)) return sinUbicacion()
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lon } = coords
        const dentro =
          lat >= cajaHonduras.lat_min && lat <= cajaHonduras.lat_max && lon >= cajaHonduras.lon_min && lon <= cajaHonduras.lon_max
        if (!dentro) {
          avisar.info({ titulo: 'Está fuera de Honduras', descripcion: 'Elija su lugar en la lista.' })
          return
        }
        const distancia = (z: (typeof zonas)[number]) => (z.lat - lat) ** 2 + (z.lon - lon) ** 2
        const cercana = zonas.reduce((a, b) => (distancia(b) < distancia(a) ? b : a))
        controlMapa.current?.irA(lat, lon)
        alSeleccionarZona(cercana.id)
      },
      sinUbicacion,
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  return (
    <div className={clases('pantalla', estilos.pantalla)}>
      <div className={estilos.encabezado}>
        <h1 className={estilos.pregunta}>¿Dónde está su parcela?</h1>
        <p className={estilos.vacio}>Toque un punto del mapa o use su ubicación.</p>
      </div>
      <div className={estilos.cuerpo}>
        <div className={estilos.columnaMapa}>
          <div className={estilos.mapa}>
            <ContenedorMapa
              ref={controlMapa}
              zonas={zonas}
              caja={cajaHonduras}
              zonaSeleccionadaId={zonaId}
              cultivoId={cultivoId}
              alSeleccionarZona={alSeleccionarZona}
              departamentoId={departamentoId}
              alSeleccionarDepartamento={fijarDepartamentoTocado}
              escenario={escenario}
            />
            <BarraFlotante className={estilos.controles} role="group" aria-label="Controles del mapa">
              <BotonIcono icono="add" etiqueta="Acercar" onClick={() => controlMapa.current?.acercar()} />
              <BotonIcono icono="remove" etiqueta="Alejar" onClick={() => controlMapa.current?.alejar()} />
              <BotonIcono icono="my_location" etiqueta="Mi ubicación" onClick={buscarMiUbicacion} />
            </BarraFlotante>
          </div>
          {cultivo && <LeyendaAptitud />}
        </div>

        <div className={estilos.lateral}>
          <Tarjeta como="aside" variante="elevada" className={estilos.tarjeta} aria-label="Lugar elegido">
            {zona ? (
              <>
                <div className={estilos.datos}>
                  <p className="tipo-titulo">{zona.nombre}</p>
                  <Medidor nivel={nivelDePercentil(zona.humedad?.percentil)} grande />
                  <p className="tipo-nota">
                    {humedad === null ? 'Sin lectura de humedad' : `${humedad.toFixed(1)} % de agua en la tierra`}
                  </p>
                </div>
                <Boton to="/zona" icono="arrow_forward">
                  Ver cómo está la tierra
                </Boton>
              </>
            ) : (
              <p className={estilos.vacio}>Todavía no eligió un lugar.</p>
            )}
            {!cultivo && (
              <Boton to="/" variante="tonal" icono="grass">
                Elegir cultivo
              </Boton>
            )}
          </Tarjeta>

          <details className={estilos.plegable} open={listaAbierta}>
            <summary>
              <span className="tipo-titulo">Todos los lugares ({zonas.length})</span>
              <Icono nombre="expand_more" />
            </summary>
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
          </details>
        </div>
      </div>

      {cultivo && (
        <section className={estilos.seccion} aria-labelledby="titulo-aptitud">
          <h2 id="titulo-aptitud" className="tipo-titulo">
            {departamento ? `¿Se da bien el ${nombreCultivo} en ${departamento.nombre}?` : `¿Dónde se da bien el ${nombreCultivo}?`}
          </h2>
          {resultado ? (
            <Tarjeta variante="elevada" className={estilos.tarjeta}>
              <div className={estilos.datos}>
                <NivelAptitud nivel={resultado.nivel} grande />
                <p className={estilos.puntos}>
                  {resultado.total} de 100. Puesto {resultado.puesto} de {resultado.de} departamentos.
                </p>
                <p className={estilos.vacio}>Lo que más le cuesta: {resultado.limite}.</p>
              </div>
              <div className={estilos.anio}>
                <p className="tipo-nota" id="titulo-anio">
                  ¿Cómo viene el año?
                </p>
                <div className={estilos.escenarios} role="group" aria-labelledby="titulo-anio">
                  {ORDEN_ESCENARIOS.map((e) => (
                    <Chip key={e} variante="filtro" seleccionado={e === escenario} onClick={() => fijarEscenario(e)}>
                      {nombreCorto(escenarios[e].nombre)}
                    </Chip>
                  ))}
                </div>
              </div>
              <details className={estilos.detalle}>
                <summary>Ver el puntaje por partes</summary>
                <Partes partes={resultado.partes} etiqueta={`Puntaje por partes en ${resultado.departamento.nombre}`} />
              </details>
            </Tarjeta>
          ) : (
            <p className={estilos.vacio}>Toque un departamento del mapa para ver cómo se da ahí.</p>
          )}
        </section>
      )}

      {cultivo && departamento && rotaciones.length > 0 && (
        <details className={estilos.plegable}>
          <summary>
            <h2 className="tipo-titulo">Qué sembrar después en {departamento.nombre}</h2>
            <Icono nombre="expand_more" />
          </summary>
          <section className={estilos.seccion} aria-label={`Qué sembrar después en ${departamento.nombre}`}>
            <Rotaciones key={`${departamento.id}-${cultivo.id}`} rotaciones={rotaciones} />
          </section>
        </details>
      )}

      <p className="tipo-nota">
        {cultivo && 'Puntajes de ejemplo, todavía sin validar. Consulte a su técnico. '}
        Límites: geoBoundaries y OpenStreetMap.
      </p>
    </div>
  )
}
