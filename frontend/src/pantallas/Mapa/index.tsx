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
import { coordenadas } from '../../componentes/mapa/formato'
import type { ControlMapa } from '../../componentes/mapa/MapaHonduras'
import { CondicionesLugar } from '../../componentes/mapa/CondicionesLugar'
import { ConsejosLugar } from '../../componentes/mapa/ConsejosLugar'
import { ListaDepartamentos, type ItemDepartamento } from '../../componentes/mapa/ListaDepartamentos'
import { LeyendaAptitud, NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { Partes } from '../../componentes/mapa/Partes'
import { TopTres } from '../../componentes/mapa/TopTres'
import { useExpandida } from '../../componentes/mapa/useExpandida'
import { ComparadorRotaciones } from '../../componentes/rotaciones/ComparadorRotaciones'
import {
  aptitud,
  buscarDepartamento,
  departamentoDeZona,
  departamentos,
  escenarios,
  ranking,
  rotacionesPara,
  tieneAptitud,
  type Escenario,
} from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { consejosPara } from '../../datos/consejos'
import { buscarZona, cajaHonduras, humedadPorcentaje, zonas } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import estilos from './Mapa.module.css'

const ORDEN_ESCENARIOS: Escenario[] = ['seco', 'normal', 'lluvioso']

export default function Mapa() {
  const { zonaId, cultivoId, elegirZona } = useEstadoApp()
  const navegar = useNavigate()
  const [escenario, fijarEscenario] = useEscenario()
  const [departamentoTocado, fijarDepartamentoTocado] = useState<string | null>(null)
  const controlMapa = useRef<ControlMapa>(null)

  const zona = buscarZona(zonaId)
  const humedad = zona ? humedadPorcentaje(zona) : null
  const cultivo = tieneAptitud(cultivoId) ? buscarCultivo(cultivoId) : null
  // Hay cultivo elegido pero todavia no tiene puntaje: se dice claro y no se muestra ningun numero.
  const cultivoSinPuntaje = !cultivo ? buscarCultivo(cultivoId) : null
  const expandida = useExpandida()
  const nombreCultivo = cultivo?.nombre.toLowerCase() ?? ''
  // Sin tocar un departamento, se muestra el del lugar elegido.
  const departamentoId = departamentoTocado ?? departamentoDeZona(zonaId)
  const departamento = buscarDepartamento(departamentoId)
  const resultado = aptitud(departamentoId, cultivoId, escenario)
  const rotaciones = rotacionesPara(departamentoId, cultivoId, escenario)
  const consejos = consejosPara(departamentoId, cultivoId, escenario)
  // Del mejor al peor; con el mismo puntaje, por orden alfabetico. Sin cultivo, alfabetico.
  const orden = ranking(cultivoId, escenario)
  const items: ItemDepartamento[] =
    orden.length > 0
      ? orden.map((p, i) => ({ id: p.id, nombre: p.nombre, total: p.total, nivel: p.nivel, puesto: i + 1 }))
      : [...departamentos]
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
          .map((d) => ({ id: d.id, nombre: d.nombre, total: null, nivel: null, puesto: null }))

  /** Elegir desde el top, la lista o el mapa es lo mismo; desde el top y la lista, el mapa se acerca. */
  function elegirDepartamento(id: string) {
    fijarDepartamentoTocado(id)
    controlMapa.current?.irADepartamento(id)
  }

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
      <h1 className={estilos.pregunta}>¿Dónde está su parcela?</h1>
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
          {cultivo ? (
            <LeyendaAptitud />
          ) : cultivoSinPuntaje ? (
            <p className="tipo-nota">Todavía no hay puntaje para {cultivoSinPuntaje.nombre.toLowerCase()}.</p>
          ) : (
            <p className="tipo-nota">Elija su cultivo para ver en el mapa dónde se da mejor.</p>
          )}
          {cultivo && (
            <div className={estilos.anio}>
              <p className={estilos.pregunta2} id="titulo-anio">
                ¿Cómo viene el año?
              </p>
              <div className={estilos.escenarios} role="group" aria-labelledby="titulo-anio">
                {ORDEN_ESCENARIOS.map((e) => (
                  <Chip key={e} variante="filtro" seleccionado={e === escenario} onClick={() => fijarEscenario(e)}>
                    {escenarios[e].nombre}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={estilos.lateral}>
          {cultivo && (
            <TopTres
              nombreCultivo={nombreCultivo}
              escenario={escenario}
              orden={orden}
              elegidoId={departamentoId}
              alElegir={elegirDepartamento}
            />
          )}

          <ListaDepartamentos items={items} elegidoId={departamentoId} alElegir={elegirDepartamento} expandida={expandida} />

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
                    <details className={estilos.detalle}>
                      <summary>Ver el puntaje por partes</summary>
                      <Partes
                        partes={resultado.partes}
                        etiqueta={`Puntaje por partes en ${resultado.departamento.nombre}`}
                        mostrarPeso
                      />
                    </details>
                    <details className={estilos.detalle}>
                      <summary>Ver las condiciones del lugar</summary>
                      <CondicionesLugar departamento={resultado.departamento} escenario={escenario} />
                    </details>
                  </div>
                </Tarjeta>
              ) : (
                <p className={estilos.vacio}>Toque un departamento del mapa o elíjalo en la lista para ver cómo se da ahí.</p>
              )}
            </section>
          )}

          {cultivo && departamento && <ConsejosLugar nombreDepartamento={departamento.nombre} consejos={consejos} />}

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

      {!cultivo && (
        <Tarjeta variante="relleno" className={estilos.tarjeta}>
          <p className={estilos.vacio}>
            {cultivoSinPuntaje
              ? `Todavía no hay puntaje para ${cultivoSinPuntaje.nombre.toLowerCase()}. Elija otro cultivo para ver los 3 mejores departamentos y sus consejos.`
              : 'Con su cultivo, el mapa muestra dónde se da mejor, los 3 mejores departamentos, consejos y qué sembrar después.'}
          </p>
          <Boton to="/" variante="tonal" icono="grass">
            {cultivoSinPuntaje ? 'Elegir otro cultivo' : 'Elegir cultivo'}
          </Boton>
        </Tarjeta>
      )}

      {cultivo && departamento && rotaciones.length > 0 && (
        <section className={estilos.seccion} aria-labelledby="titulo-despues">
          <h2 id="titulo-despues" className="tipo-titulo">
            Qué sembrar después en {departamento.nombre}
          </h2>
          <ComparadorRotaciones key={`${departamento.id}-${cultivo.id}`} rotaciones={rotaciones} actualId={cultivo.id} />
        </section>
      )}

      {cultivo && (
        <p className="tipo-nota">
          Puntajes, consejos y opciones de siembra de ejemplo, todavía sin validar con técnicos. Consulte a su
          técnico. Límites de los departamentos: geoBoundaries y OpenStreetMap.
        </p>
      )}
    </div>
  )
}
