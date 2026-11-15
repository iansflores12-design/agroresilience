import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdioma } from '../../i18n'
import { nombreCultivo, nombreEtapa } from '../../i18n/dominio'
import { Boton } from '../../componentes/Boton'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarCultivo, cultivos, etapaEnSemana } from '../../datos/cultivos'
import { condicionesMock } from '../../lib/siembra/condiciones'
import { capturarUbicacion, dentroDeCaja, mensajeErrorGps, parsearCoordenadas, ubicacionManual } from '../../lib/siembra/gps'
import { recomendar } from '../../lib/siembra/motor'
import {
  pasoAnterior,
  primerPasoIncompleto,
  respuestasCompletas,
  siguientePaso,
  validarPaso,
} from '../../lib/siembra/preguntas'
import {
  OBJETIVOS,
  type Drenaje,
  type ErrorGps,
  type Pendiente,
  type RespuestasParciales,
  type PasoSiembra,
  type Terreno,
  type Textura,
  type Ubicacion,
} from '../../lib/siembra/tipos'
import estilos from './Siembra.module.css'

export interface PropsSiembra {
  /** Para pruebas: reemplaza el geolocation del navegador. */
  geo?: Pick<Geolocation, 'getCurrentPosition'>
}

// Los nombres de cada opcion salen de `siembra.*` en el idioma actual.
const TEXTURAS: Textura[] = ['arenoso', 'franco', 'arcilloso']
const PENDIENTES: Pendiente[] = ['plana', 'ondulada', 'inclinada']
const DRENAJES: Drenaje[] = ['bueno', 'regular', 'malo']

interface PropsGrupo<T extends string> {
  leyenda: string
  nombre: string
  opciones: { id: T; nombre: string }[]
  valor: T | undefined
  alElegir: (id: T) => void
}

function GrupoRadios<T extends string>({ leyenda, nombre, opciones, valor, alElegir }: PropsGrupo<T>) {
  return (
    <fieldset className={estilos.grupo}>
      <legend className={estilos.leyenda}>{leyenda}</legend>
      <div className={estilos.opciones}>
        {opciones.map((o) => (
          <label key={o.id} className={`${estilos.opcion} ${valor === o.id ? estilos.opcionMarcada : ''}`}>
            <input type="radio" name={nombre} checked={valor === o.id} onChange={() => alElegir(o.id)} />
            {o.nombre}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function formatoGrados(n: number) {
  return n.toFixed(5)
}

export default function Siembra({ geo }: PropsSiembra) {
  const { t } = useTranslation()
  const idioma = useIdioma()
  const [respuestas, setRespuestas] = useState<RespuestasParciales>({})
  const [paso, setPaso] = useState<PasoSiembra>('cultivo')
  // Hay un error de validacion a la vista: el mensaje se vuelve a calcular en el idioma actual.
  const [conError, setConError] = useState(false)
  const [diasTexto, setDiasTexto] = useState('')
  const [cargandoGps, setCargandoGps] = useState(false)
  const [errorGps, setErrorGps] = useState<ErrorGps | null>(null)
  const [textoCoord, setTextoCoord] = useState('')
  const [errorCoord, setErrorCoord] = useState<'coordNoEntendidas' | 'coordFuera' | null>(null)
  const encabezado = useRef<HTMLHeadingElement>(null)
  const idDias = useId()
  const idCoord = useId()

  // El foco va al encabezado del paso cada vez que cambia.
  useEffect(() => {
    encabezado.current?.focus()
  }, [paso])

  const cultivo = buscarCultivo(respuestas.cultivoId ?? null)
  const dias = respuestas.diasDesdeSiembra
  const etapaCalculada = cultivo && dias !== undefined ? etapaEnSemana(cultivo, dias / 7) : null

  const resultado = useMemo(
    () => (paso === 'resultado' && respuestasCompletas(respuestas) ? recomendar(respuestas, undefined, idioma) : null),
    [paso, respuestas, idioma],
  )

  const cambiar = (parcial: RespuestasParciales) => {
    setRespuestas((r) => ({ ...r, ...parcial }))
    setConError(false)
  }

  const cambiarTerreno = (parcial: Partial<Terreno>) => {
    setRespuestas((r) => ({ ...r, terreno: { ...r.terreno, ...parcial } as Terreno }))
    setConError(false)
  }

  const escribirDias = (texto: string) => {
    setDiasTexto(texto)
    const limpio = texto.trim()
    const n = Number(limpio)
    setRespuestas((r) => ({ ...r, diasDesdeSiembra: limpio !== '' && Number.isFinite(n) ? n : undefined }))
    setConError(false)
  }

  const siguiente = () => {
    if (validarPaso(paso, respuestas)) {
      setConError(true)
      return
    }
    setConError(false)
    setPaso(siguientePaso(paso))
  }

  const atras = () => {
    setConError(false)
    setPaso(pasoAnterior(paso))
  }

  const reiniciar = () => {
    setRespuestas({})
    setDiasTexto('')
    setConError(false)
    setErrorGps(null)
    setErrorCoord(null)
    setTextoCoord('')
    setPaso('cultivo')
  }

  const usarGps = async () => {
    setCargandoGps(true)
    setErrorGps(null)
    try {
      const u = await capturarUbicacion(geo)
      cambiar({ ubicacion: u })
    } catch (e) {
      setErrorGps((e instanceof Error ? e.message : 'posicion') as ErrorGps)
    } finally {
      setCargandoGps(false)
    }
  }

  const usarCoordenadas = () => {
    const c = parsearCoordenadas(textoCoord)
    if (!c) {
      setErrorCoord('coordNoEntendidas')
      return
    }
    if (!dentroDeCaja(c.lat, c.lon, condicionesMock.caja)) {
      setErrorCoord('coordFuera')
      return
    }
    setErrorCoord(null)
    setErrorGps(null)
    cambiar({ ubicacion: ubicacionManual(c.lat, c.lon) })
  }

  const ubicacion: Ubicacion | undefined = respuestas.ubicacion
  const numero = Math.min(PASOS_NUMERADOS.indexOf(paso) + 1, 5)
  const error = conError ? validarPaso(paso, respuestas, idioma) : null
  const opciones = <T extends string>(ids: T[], grupo: string) => ids.map((id) => ({ id, nombre: t(`siembra.${grupo}.${id as string}`) }))

  return (
    <div className={estilos.medio}>
      <h1 className={estilos.titulo}>{t('siembra.titulo')}</h1>
      {paso !== 'resultado' && <p className={estilos.progreso}>{t('siembra.paso', { n: numero })}</p>}

      <section className={estilos.paso} aria-labelledby="titulo-paso">
        <h2 id="titulo-paso" ref={encabezado} tabIndex={-1} className={estilos.encabezado}>
          {t(`siembra.titulos.${paso}`)}
        </h2>

        {paso === 'cultivo' && (
          <GrupoRadios
            leyenda={t('siembra.leyendaCultivo')}
            nombre="cultivo"
            opciones={cultivos.map((c) => ({ id: c.id, nombre: nombreCultivo(t, c.id) }))}
            valor={respuestas.cultivoId}
            alElegir={(id) => cambiar({ cultivoId: id })}
          />
        )}

        {paso === 'dias' && (
          <div className={estilos.campo}>
            <label htmlFor={idDias}>{t('siembra.diasDesde')}</label>
            <input
              id={idDias}
              type="text"
              inputMode="numeric"
              value={diasTexto}
              onChange={(e) => escribirDias(e.target.value)}
            />
            {etapaCalculada && (
              <p className={estilos.nota}>{t('siembra.etapa', { etapa: cultivo ? nombreEtapa(t, cultivo.id, etapaCalculada) : etapaCalculada.nombre })}</p>
            )}
          </div>
        )}

        {paso === 'objetivo' && (
          <GrupoRadios
            leyenda={t('siembra.leyendaObjetivo')}
            nombre="objetivo"
            opciones={OBJETIVOS.map((o) => ({ id: o.id, nombre: t(`siembra.objetivos.${o.id}`) }))}
            valor={respuestas.objetivo}
            alElegir={(id) => cambiar({ objetivo: id })}
          />
        )}

        {paso === 'terreno' && (
          <>
            <GrupoRadios
              leyenda={t('siembra.leyendaTierra')}
              nombre="textura"
              opciones={opciones(TEXTURAS, 'texturas')}
              valor={respuestas.terreno?.textura}
              alElegir={(id) => cambiarTerreno({ textura: id })}
            />
            <GrupoRadios
              leyenda={t('siembra.leyendaPendiente')}
              nombre="pendiente"
              opciones={opciones(PENDIENTES, 'pendientes')}
              valor={respuestas.terreno?.pendiente}
              alElegir={(id) => cambiarTerreno({ pendiente: id })}
            />
            <GrupoRadios
              leyenda={t('siembra.leyendaDrenaje')}
              nombre="drenaje"
              opciones={opciones(DRENAJES, 'drenajes')}
              valor={respuestas.terreno?.drenaje}
              alElegir={(id) => cambiarTerreno({ drenaje: id })}
            />
            <GrupoRadios
              leyenda={t('siembra.tieneRiego')}
              nombre="riego"
              opciones={[
                { id: 'si', nombre: t('siembra.si') },
                { id: 'no', nombre: t('siembra.no') },
              ]}
              valor={
                respuestas.terreno?.tieneRiego === undefined ? undefined : respuestas.terreno.tieneRiego ? 'si' : 'no'
              }
              alElegir={(id) => cambiarTerreno({ tieneRiego: id === 'si' })}
            />
          </>
        )}

        {paso === 'ubicacion' && (
          <>
            <div className={estilos.gps}>
              <Boton variante="tonal" icono="my_location" onClick={usarGps} disabled={cargandoGps} aria-busy={cargandoGps}>
                {t('siembra.usarGps')}
              </Boton>
              {cargandoGps && <p className={estilos.estadoGps}>{t('siembra.buscando')}</p>}
              {errorGps && (
                <p className={estilos.error} role="status">
                  {mensajeErrorGps(errorGps, idioma)}
                </p>
              )}
              {ubicacion && !cargandoGps && (
                <p className={estilos.estadoGps}>
                  {t('siembra.ubicacion', { lat: formatoGrados(ubicacion.lat), lon: formatoGrados(ubicacion.lon) })}
                  {ubicacion.precisionM !== null && t('siembra.precision', { m: Math.round(ubicacion.precisionM) })}
                </p>
              )}
            </div>
            <div className={estilos.campo}>
              <label htmlFor={idCoord}>{t('siembra.oCoordenadas')}</label>
              <input
                id={idCoord}
                type="text"
                value={textoCoord}
                placeholder="14.65, -86.21"
                onChange={(e) => setTextoCoord(e.target.value)}
              />
              <Boton variante="contorno" onClick={usarCoordenadas}>
                {t('siembra.usarCoordenadas')}
              </Boton>
              {errorCoord && (
                <p className={estilos.error} role="alert">
                  {t(`siembra.${errorCoord}`)}
                </p>
              )}
            </div>
          </>
        )}

        {paso === 'resultado' && resultado && (
          <>
            {resultado.origenDatos === 'mockup' && (
              <p className={estilos.aviso}>{t('siembra.mockup')}</p>
            )}
            <Tarjeta como="section" className={estilos.destacada} aria-label={t('siembra.mejorOpcion')}>
              <p className={estilos.nombreMejor}>{resultado.mejor.nombre}</p>
              <p className={estilos.puntaje}>{t('comun.deCien', { valor: resultado.mejor.puntaje })}</p>
              <ul className={estilos.razones}>
                {resultado.mejor.razones.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Tarjeta>
            <h3 className={estilos.leyenda}>{t('siembra.otrasOpciones')}</h3>
            <ol className={estilos.lista}>
              {resultado.opciones
                .filter((o) => o.id !== resultado.mejor.id)
                .map((o) => (
                  <li key={o.id} className={estilos.item}>
                    {t('siembra.opcionPuntaje', { nombre: o.nombre, puntaje: o.puntaje })}
                  </li>
                ))}
            </ol>
            <p className={estilos.nota}>
              {t('siembra.datosPunto', { punto: resultado.punto.nombre, km: resultado.punto.distanciaKm.toFixed(1) })}
            </p>
            <p className={estilos.nota}>{t('siembra.etapaCultivo', { etapa: resultado.etapa.nombre })}</p>
          </>
        )}

        {paso === 'resultado' && !resultado && (
          <p className={estilos.error} role="alert">
            {t('siembra.faltan')}
          </p>
        )}

        {error && (
          <p className={estilos.error} role="alert">
            {error}
          </p>
        )}

        <div className={estilos.acciones}>
          {paso === 'resultado' ? (
            <>
              {!resultado && (
                <Boton variante="tonal" onClick={() => setPaso(primerPasoIncompleto(respuestas))}>
                  {t('siembra.completar')}
                </Boton>
              )}
              <Boton variante="relleno" icono="refresh" onClick={reiniciar}>
                {t('siembra.empezar')}
              </Boton>
            </>
          ) : (
            <>
              {paso !== 'cultivo' && (
                <Boton variante="contorno" onClick={atras}>
                  {t('comun.atras')}
                </Boton>
              )}
              <Boton onClick={siguiente}>{t('comun.siguiente')}</Boton>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

const PASOS_NUMERADOS: PasoSiembra[] = ['cultivo', 'dias', 'objetivo', 'terreno', 'ubicacion']
