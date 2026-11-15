import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { BASES, DATOS, ORDEN_BASES, ORDEN_DATOS, type CapaBase, type CapaDatos } from '../../componentes/mapa/capas'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { detectarAnio } from '../../componentes/mapa/escenario'
import { Icono } from '../../componentes/Icono'
import type { ControlMapa } from '../../componentes/mapa/MapaHonduras'
import { LeyendaAptitud, NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { Partes } from '../../componentes/mapa/Partes'
import {
  aptitud,
  buscarDepartamento,
  departamentoDeZona,
  rotacionesPara,
  tieneAptitud,
} from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { buscarZona, cajaHonduras, humedadPorcentaje, zonas } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import estilos from './Mapa.module.css'
import { Rotaciones } from './Rotaciones'


/** En pantallas anchas la lista cabe al lado del mapa; en el telefono empieza cerrada. */
function esPantallaAncha() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 840px)').matches
}

/** Que significan los colores de la capa de satelite activa: una barra de menos a mas. */
function LeyendaDatos({ capa }: { capa: CapaDatos }) {
  const { t } = useTranslation()
  const def = DATOS[capa]
  return (
    <p className={estilos.leyendaDatos}>
      <span>{t(`mapa.capas.datos.${capa}.descripcion`)}</span>
      <span className={estilos.escala}>
        {t(`mapa.capas.datos.${capa}.menos`)}
        <span className={estilos.barraEscala} style={{ backgroundImage: `linear-gradient(to right, ${def.colores.join(', ')})` }} aria-hidden="true" />
        {t(`mapa.capas.datos.${capa}.mas`)}
      </span>
    </p>
  )
}

export default function Mapa() {
  const { zonaId, cultivoId, elegirZona } = useEstadoApp()
  const navegar = useNavigate()
  const { t } = useTranslation()
  const [departamentoTocado, fijarDepartamentoTocado] = useState<string | null>(null)
  const controlMapa = useRef<ControlMapa>(null)
  const [listaAbierta] = useState(esPantallaAncha)
  const [capasAbiertas, fijarCapasAbiertas] = useState(false)
  const [base, fijarBase] = useState<CapaBase>('simple')
  const [datos, fijarDatos] = useState<CapaDatos | null>(null)

  const zona = buscarZona(zonaId)
  const anio = detectarAnio(zona)
  const escenario = anio.escenario
  const humedad = zona ? humedadPorcentaje(zona) : null
  const cultivo = tieneAptitud(cultivoId) ? buscarCultivo(cultivoId) : null
  const elCultivo = cultivo ? t(`cultivos.${cultivo.id}.el`) : ''
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
      titulo: t('mapa.lugarAviso', { lugar: elegida.nombre }),
      accion: { texto: t('mapa.verTierra'), alPulsar: () => navegar('/zona') },
    })
  }

  function buscarMiUbicacion() {
    const sinUbicacion = () =>
      avisar.alerta({ titulo: t('mapa.sinUbicacion'), descripcion: t('mapa.elijaLista') })
    if (!('geolocation' in navigator)) return sinUbicacion()
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lon } = coords
        const dentro =
          lat >= cajaHonduras.lat_min && lat <= cajaHonduras.lat_max && lon >= cajaHonduras.lon_min && lon <= cajaHonduras.lon_max
        if (!dentro) {
          avisar.info({ titulo: t('mapa.fueraHonduras'), descripcion: t('mapa.elijaLista') })
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
        <h1 className={estilos.pregunta}>{t('mapa.dondeParcela')}</h1>
        <p className={estilos.vacio}>{t('mapa.toquePunto')}</p>
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
              base={base}
              datos={datos}
            />
            <BarraFlotante className={estilos.controles} role="group" aria-label={t('mapa.controles')}>
              <BotonIcono icono="add" etiqueta={t('mapa.acercar')} onClick={() => controlMapa.current?.acercar()} />
              <BotonIcono icono="remove" etiqueta={t('mapa.alejar')} onClick={() => controlMapa.current?.alejar()} />
              <BotonIcono icono="my_location" etiqueta={t('mapa.miUbicacion')} onClick={buscarMiUbicacion} />
              <BotonIcono
                icono="layers"
                etiqueta={t('mapa.capas.boton')}
                seleccionado={capasAbiertas}
                aria-expanded={capasAbiertas}
                aria-controls="capas-mapa"
                onClick={() => fijarCapasAbiertas((a) => !a)}
              />
            </BarraFlotante>
          </div>
          {capasAbiertas && (
            <div id="capas-mapa" className={estilos.capas}>
              <div className={estilos.grupoCapas} role="group" aria-label={t('mapa.capas.tipo')}>
                {ORDEN_BASES.map((b) => (
                  <Chip key={b} variante="filtro" seleccionado={b === base} onClick={() => fijarBase(b)}>
                    {t(`mapa.capas.bases.${b}.nombre`)}
                  </Chip>
                ))}
              </div>
              <div className={estilos.grupoCapas} role="group" aria-label={t('mapa.capas.satelite')}>
                {ORDEN_DATOS.map((c) => (
                  <Chip key={c} variante="filtro" seleccionado={c === datos} onClick={() => fijarDatos(c === datos ? null : c)}>
                    {t(`mapa.capas.datos.${c}.nombre`)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {datos ? <LeyendaDatos capa={datos} /> : cultivo && <LeyendaAptitud />}
        </div>

        <div className={estilos.lateral}>
          <Tarjeta como="aside" variante="elevada" className={estilos.tarjeta} aria-label={t('mapa.lugarElegido')}>
            {zona ? (
              <>
                <div className={estilos.datos}>
                  <p className="tipo-titulo">{zona.nombre}</p>
                  <Medidor nivel={nivelDePercentil(zona.humedad?.percentil)} grande />
                  <p className="tipo-nota">
                    {humedad === null ? t('mapa.sinHumedad') : t('mapa.aguaTierra', { pct: humedad.toFixed(1) })}
                  </p>
                </div>
                <Boton to="/zona" icono="arrow_forward">
                  {t('mapa.verComoTierra')}
                </Boton>
              </>
            ) : (
              <p className={estilos.vacio}>{t('mapa.sinLugar')}</p>
            )}
            {!cultivo && (
              <Boton to="/" variante="tonal" icono="grass">
                {t('contexto.elegirCultivo')}
              </Boton>
            )}
          </Tarjeta>

          <details className={estilos.plegable} open={listaAbierta}>
            <summary>
              <span className="tipo-titulo">{t('mapa.todosLugares', { n: zonas.length })}</span>
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
            {departamento ? t('mapa.seDaBienEn', { el: elCultivo, departamento: departamento.nombre }) : t('mapa.dondeSeDa', { el: elCultivo })}
          </h2>
          {resultado ? (
            <Tarjeta variante="elevada" className={estilos.tarjeta}>
              <div className={estilos.datos}>
                <NivelAptitud nivel={resultado.nivel} grande />
                <p className={estilos.puntos}>
                  {t('mapa.puesto', { total: resultado.total, puesto: resultado.puesto, de: resultado.de })}
                </p>
                <p className={estilos.vacio}>{t('mapa.loQueCuesta', { limite: t(`aptitud.factores.${resultado.claveLimite}.limite`) })}</p>
              </div>
              <div className={estilos.anio}>
                <p className="tipo-nota" id="titulo-anio">
                  {t('mapa.comoAnio')}
                </p>
                <p className={estilos.anioDetectado}>
                  <span className={estilos.anioTipo}>
                    <Icono nombre={escenario === 'seco' ? 'wb_sunny' : escenario === 'lluvioso' ? 'rainy' : 'partly_cloudy_day'} tamano={20} />
                    {t(`aptitud.escenarios.${escenario}`)}
                  </span>
                  {anio.pct !== null && <span>{t(zona ? 'mapa.anioLluviaZona' : 'mapa.anioLluviaPais', { pct: anio.pct, lugar: zona?.nombre })}</span>}
                </p>
              </div>
              <details className={estilos.detalle}>
                <summary>{t('mapa.verPartes')}</summary>
                <Partes partes={resultado.partes} etiqueta={t('mapa.partesEn', { departamento: resultado.departamento.nombre })} />
              </details>
            </Tarjeta>
          ) : (
            <p className={estilos.vacio}>{t('mapa.toqueDepartamento')}</p>
          )}
        </section>
      )}

      {cultivo && departamento && rotaciones.length > 0 && (
        <details className={estilos.plegable}>
          <summary>
            <h2 className="tipo-titulo">{t('mapa.queSembrarDespues', { departamento: departamento.nombre })}</h2>
            <Icono nombre="expand_more" />
          </summary>
          <section className={estilos.seccion} aria-label={t('mapa.queSembrarDespues', { departamento: departamento.nombre })}>
            <Rotaciones key={`${departamento.id}-${cultivo.id}`} rotaciones={rotaciones} />
          </section>
        </details>
      )}

      <p className="tipo-nota">
        {cultivo && t('mapa.ejemplo')}
        {t('mapa.limites')}
        {BASES[base].url && ` ${t(`mapa.capas.bases.${base}.credito`)}.`}
        {datos && ` ${t(`mapa.capas.datos.${datos}.credito`)}.`}
      </p>
    </div>
  )
}
