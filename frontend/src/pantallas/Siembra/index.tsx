import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

const TITULOS: Record<PasoSiembra, string> = {
  cultivo: '¿Qué sembró?',
  dias: '¿Hace cuánto sembró?',
  objetivo: '¿Qué quiere lograr?',
  terreno: 'Cuéntenos de su terreno',
  ubicacion: '¿Dónde está su terreno?',
  resultado: 'Lo que le recomendamos',
}

const TEXTURAS: { id: Textura; nombre: string }[] = [
  { id: 'arenoso', nombre: 'Arenosa (suelta)' },
  { id: 'franco', nombre: 'Media (franca)' },
  { id: 'arcilloso', nombre: 'Arcillosa (pesada)' },
]
const PENDIENTES: { id: Pendiente; nombre: string }[] = [
  { id: 'plana', nombre: 'Plana' },
  { id: 'ondulada', nombre: 'Algo inclinada' },
  { id: 'inclinada', nombre: 'Muy inclinada' },
]
const DRENAJES: { id: Drenaje; nombre: string }[] = [
  { id: 'bueno', nombre: 'El agua se va rápido' },
  { id: 'regular', nombre: 'El agua se va despacio' },
  { id: 'malo', nombre: 'El agua se queda encharcada' },
]

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
  const [respuestas, setRespuestas] = useState<RespuestasParciales>({})
  const [paso, setPaso] = useState<PasoSiembra>('cultivo')
  const [error, setError] = useState<string | null>(null)
  const [diasTexto, setDiasTexto] = useState('')
  const [cargandoGps, setCargandoGps] = useState(false)
  const [errorGps, setErrorGps] = useState<ErrorGps | null>(null)
  const [textoCoord, setTextoCoord] = useState('')
  const [errorCoord, setErrorCoord] = useState<string | null>(null)
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
    () => (paso === 'resultado' && respuestasCompletas(respuestas) ? recomendar(respuestas) : null),
    [paso, respuestas],
  )

  const cambiar = (parcial: RespuestasParciales) => {
    setRespuestas((r) => ({ ...r, ...parcial }))
    setError(null)
  }

  const cambiarTerreno = (parcial: Partial<Terreno>) => {
    setRespuestas((r) => ({ ...r, terreno: { ...r.terreno, ...parcial } as Terreno }))
    setError(null)
  }

  const escribirDias = (texto: string) => {
    setDiasTexto(texto)
    const limpio = texto.trim()
    const n = Number(limpio)
    setRespuestas((r) => ({ ...r, diasDesdeSiembra: limpio !== '' && Number.isFinite(n) ? n : undefined }))
    setError(null)
  }

  const siguiente = () => {
    const msg = validarPaso(paso, respuestas)
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    setPaso(siguientePaso(paso))
  }

  const atras = () => {
    setError(null)
    setPaso(pasoAnterior(paso))
  }

  const reiniciar = () => {
    setRespuestas({})
    setDiasTexto('')
    setError(null)
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
      setErrorCoord('No entendimos las coordenadas. Escriba latitud y longitud, por ejemplo: 14.65, -86.21.')
      return
    }
    if (!dentroDeCaja(c.lat, c.lon, condicionesMock.caja)) {
      setErrorCoord('Esas coordenadas están fuera de Honduras. Revíselas.')
      return
    }
    setErrorCoord(null)
    setErrorGps(null)
    cambiar({ ubicacion: ubicacionManual(c.lat, c.lon) })
  }

  const ubicacion: Ubicacion | undefined = respuestas.ubicacion
  const numero = Math.min(PASOS_NUMERADOS.indexOf(paso) + 1, 5)

  return (
    <div className={estilos.medio}>
      <h1 className={estilos.titulo}>Recomendación de siembra</h1>
      {paso !== 'resultado' && <p className={estilos.progreso}>Paso {numero} de 5</p>}

      <section className={estilos.paso} aria-labelledby="titulo-paso">
        <h2 id="titulo-paso" ref={encabezado} tabIndex={-1} className={estilos.encabezado}>
          {TITULOS[paso]}
        </h2>

        {paso === 'cultivo' && (
          <GrupoRadios
            leyenda="Cultivo"
            nombre="cultivo"
            opciones={cultivos.map((c) => ({ id: c.id, nombre: c.nombre }))}
            valor={respuestas.cultivoId}
            alElegir={(id) => cambiar({ cultivoId: id })}
          />
        )}

        {paso === 'dias' && (
          <div className={estilos.campo}>
            <label htmlFor={idDias}>Días desde la siembra</label>
            <input
              id={idDias}
              type="text"
              inputMode="numeric"
              value={diasTexto}
              onChange={(e) => escribirDias(e.target.value)}
            />
            {etapaCalculada && (
              <p className={estilos.nota}>Su cultivo está en la etapa: {etapaCalculada.nombre}.</p>
            )}
          </div>
        )}

        {paso === 'objetivo' && (
          <GrupoRadios
            leyenda="Objetivo"
            nombre="objetivo"
            opciones={OBJETIVOS}
            valor={respuestas.objetivo}
            alElegir={(id) => cambiar({ objetivo: id })}
          />
        )}

        {paso === 'terreno' && (
          <>
            <GrupoRadios
              leyenda="Tierra"
              nombre="textura"
              opciones={TEXTURAS}
              valor={respuestas.terreno?.textura}
              alElegir={(id) => cambiarTerreno({ textura: id })}
            />
            <GrupoRadios
              leyenda="Pendiente"
              nombre="pendiente"
              opciones={PENDIENTES}
              valor={respuestas.terreno?.pendiente}
              alElegir={(id) => cambiarTerreno({ pendiente: id })}
            />
            <GrupoRadios
              leyenda="Drenaje"
              nombre="drenaje"
              opciones={DRENAJES}
              valor={respuestas.terreno?.drenaje}
              alElegir={(id) => cambiarTerreno({ drenaje: id })}
            />
            <GrupoRadios
              leyenda="¿Tiene riego?"
              nombre="riego"
              opciones={[
                { id: 'si', nombre: 'Sí' },
                { id: 'no', nombre: 'No' },
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
                Usar mi ubicación (GPS)
              </Boton>
              {cargandoGps && <p className={estilos.estadoGps}>Buscando su ubicación…</p>}
              {errorGps && (
                <p className={estilos.error} role="status">
                  {mensajeErrorGps(errorGps)}
                </p>
              )}
              {ubicacion && !cargandoGps && (
                <p className={estilos.estadoGps}>
                  Ubicación: {formatoGrados(ubicacion.lat)}, {formatoGrados(ubicacion.lon)}
                  {ubicacion.precisionM !== null && ` (precisión de ${Math.round(ubicacion.precisionM)} m)`}
                </p>
              )}
            </div>
            <div className={estilos.campo}>
              <label htmlFor={idCoord}>O escriba las coordenadas</label>
              <input
                id={idCoord}
                type="text"
                value={textoCoord}
                placeholder="14.65, -86.21"
                onChange={(e) => setTextoCoord(e.target.value)}
              />
              <Boton variante="contorno" onClick={usarCoordenadas}>
                Usar estas coordenadas
              </Boton>
              {errorCoord && (
                <p className={estilos.error} role="alert">
                  {errorCoord}
                </p>
              )}
            </div>
          </>
        )}

        {paso === 'resultado' && resultado && (
          <>
            {resultado.origenDatos === 'mockup' && (
              <p className={estilos.aviso}>Datos de ejemplo (mockup): no son mediciones reales</p>
            )}
            <Tarjeta como="section" className={estilos.destacada} aria-label="Mejor opción">
              <p className={estilos.nombreMejor}>{resultado.mejor.nombre}</p>
              <p className={estilos.puntaje}>{resultado.mejor.puntaje} de 100</p>
              <ul className={estilos.razones}>
                {resultado.mejor.razones.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Tarjeta>
            <h3 className={estilos.leyenda}>Otras opciones</h3>
            <ol className={estilos.lista}>
              {resultado.opciones
                .filter((o) => o.id !== resultado.mejor.id)
                .map((o) => (
                  <li key={o.id} className={estilos.item}>
                    {o.nombre}: {o.puntaje} de 100
                  </li>
                ))}
            </ol>
            <p className={estilos.nota}>
              Datos del punto: {resultado.punto.nombre}, a {resultado.punto.distanciaKm.toFixed(1)} km de su terreno.
            </p>
            <p className={estilos.nota}>Etapa del cultivo: {resultado.etapa.nombre}.</p>
          </>
        )}

        {paso === 'resultado' && !resultado && (
          <p className={estilos.error} role="alert">
            Faltan respuestas para recomendar.
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
                  Completar respuestas
                </Boton>
              )}
              <Boton variante="relleno" icono="refresh" onClick={reiniciar}>
                Empezar de nuevo
              </Boton>
            </>
          ) : (
            <>
              {paso !== 'cultivo' && (
                <Boton variante="contorno" onClick={atras}>
                  Atrás
                </Boton>
              )}
              <Boton onClick={siguiente}>Siguiente</Boton>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

const PASOS_NUMERADOS: PasoSiembra[] = ['cultivo', 'dias', 'objetivo', 'terreno', 'ubicacion']
