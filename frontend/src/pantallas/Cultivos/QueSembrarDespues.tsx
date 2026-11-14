import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Medidor } from '../../componentes/Medidor'
import { nivelDePercentil } from '../../componentes/nivelMedidor'
import { useEscenario } from '../../componentes/mapa/escenario'
import { ComparadorRotaciones } from '../../componentes/rotaciones/ComparadorRotaciones'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarDepartamento, departamentoDeZona, escenarios, rotacionesPara, type Escenario } from '../../datos/aptitud'
import type { Cultivo } from '../../datos/cultivos'
import { escenarioMasProbable, frasePerspectiva, fuentesPerspectiva, oni, perspectiva as datosPerspectiva } from '../../datos/perspectiva'
import { buscarZona, estadoHumedad } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { useRecomendacion } from '../../lib/recomendacion/useRecomendacion'
import estilos from './Cultivos.module.css'
import { Recomendacion } from './Recomendacion'

const ORDEN_ESCENARIOS: Escenario[] = ['seco', 'normal', 'lluvioso']

// Misma clave que usa useEscenario (componentes/mapa/escenario.ts): sirve para saber si la persona ya eligio.
const CLAVE_ESCENARIO = 'agroresilience.escenario.v1'
// Lo que se preselecciono por perspectiva en esta sesion: { valor, zonas }.
const CLAVE_AUTO = 'agroresilience.escenario.auto.v1'

interface Preseleccion {
  valor: Escenario
  zonas: string[]
}

function leerSesion(clave: string): string | null {
  try {
    return window.sessionStorage.getItem(clave)
  } catch {
    return null
  }
}

function leerPreseleccion(): Preseleccion | null {
  try {
    const dato: unknown = JSON.parse(leerSesion(CLAVE_AUTO) ?? 'null')
    if (typeof dato !== 'object' || dato === null) return null
    const d = dato as Partial<Preseleccion>
    return typeof d.valor === 'string' && Array.isArray(d.zonas) ? { valor: d.valor, zonas: d.zonas.map(String) } : null
  } catch {
    return null
  }
}

/** Elegir "lo mas probable" solo si la persona no eligio otro tipo de ano en esta sesion (aqui o en el mapa). */
function preseleccionar(zonaId: string, masProbable: Escenario): boolean {
  const previa = leerPreseleccion()
  const guardado = leerSesion(CLAVE_ESCENARIO)
  const eligioLaPersona = guardado !== null && (previa === null || guardado !== previa.valor)
  if (eligioLaPersona || previa?.zonas.includes(zonaId)) return false
  try {
    window.sessionStorage.setItem(CLAVE_AUTO, JSON.stringify({ valor: masProbable, zonas: [...(previa?.zonas ?? []), zonaId] }))
  } catch {
    // Sin sessionStorage solo se preselecciona en esta carga.
  }
  return true
}

const FASE_ONI = { nino: 'El Niño', nina: 'La Niña', neutral: 'neutral' } as const

/** Para el agronomo: de donde sale la frase del ano. En el primer nivel no hay jerga. */
function DeDondeSale({ zonaId, conFrase }: { zonaId: string; conFrase: boolean }) {
  const zona = datosPerspectiva.temporadas[0]?.zonas.find((z) => z.id === zonaId)
  if (!zona) return null
  const frase = conFrase ? frasePerspectiva(zonaId) : null
  return (
    <details className={estilos.fuente}>
      <summary className={estilos.fuenteResumen}>Ver de dónde sale este dato</summary>
      <div className={estilos.fuenteCuerpo}>
        {frase && <p>{frase}</p>}
        <ul>
          <li>Lluvia de años pasados: {fuentesPerspectiva.lluvia}.</li>
          <li>
            Océano Pacífico ({fuentesPerspectiva.oni}): {FASE_ONI[oni.fase]}, índice ONI {oni.valor} en el trimestre {oni.trimestre} de{' '}
            {oni.anio}.
          </li>
          <li>
            Años parecidos a este:{' '}
            {zona.aniosParecidos.length > 0 ? zona.aniosParecidos.join(', ') : 'no hay suficientes'}.
          </li>
          <li>
            Aciertos al probarlo con años pasados: {zona.aciertos} de {zona.aniosProbados}.
          </li>
        </ul>
      </div>
    </details>
  )
}

/** Recomienda que sembrar despues del cultivo elegido y deja abrir cada opcion para ver por que. No elige cultivo. */
export function QueSembrarDespues({ cultivo }: { cultivo: Cultivo | null }) {
  const { zonaId } = useEstadoApp()
  const [escenario, fijarEscenario] = useEscenario()
  const departamento = buscarDepartamento(departamentoDeZona(zonaId))
  const zona = buscarZona(zonaId)
  const rotaciones = cultivo && departamento ? rotacionesPara(departamento.id, cultivo.id, escenario) : []
  const conHumedad = zona && nivelDePercentil(zona.humedad?.percentil) !== 'sin'
  const recomendacion = useRecomendacion()
  const masProbable = escenarioMasProbable(zonaId)
  const frase = zonaId && !masProbable ? frasePerspectiva(zonaId) : null

  // La primera vez que se ve una zona con senal clara, "lo mas probable" queda elegido.
  useEffect(() => {
    if (zonaId && masProbable && preseleccionar(zonaId, masProbable)) fijarEscenario(masProbable)
  }, [zonaId, masProbable, fijarEscenario])

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-rotaciones">
      <h2 id="titulo-rotaciones" className="tipo-titulo">
        Qué sembrar después{departamento ? ` en ${departamento.nombre}` : ''}
      </h2>
      {!cultivo ? (
        <p>Elija su cultivo arriba y le decimos qué le conviene sembrar después.</p>
      ) : !departamento ? (
        <Tarjeta variante="relleno" className={estilos.aviso}>
          <p>Para recomendarle qué sembrar después necesitamos saber dónde está su parcela.</p>
          <Boton to="/mapa" variante="tonal" icono="map">
            Elegir lugar
          </Boton>
        </Tarjeta>
      ) : rotaciones.length === 0 ? (
        <p>Todavía no tenemos recomendación para este cultivo.</p>
      ) : (
        <>
          <div className={estilos.escenarios} role="group" aria-label="¿Cómo viene el año?">
            {ORDEN_ESCENARIOS.map((e) => (
              <Chip key={e} variante="filtro" seleccionado={e === escenario} onClick={() => fijarEscenario(e)}>
                {escenarios[e].nombre}
                {e === masProbable && <span className={estilos.marca}>Lo más probable</span>}
              </Chip>
            ))}
          </div>
          {frase && <p className="tipo-nota">{frase}</p>}
          {zonaId && <DeDondeSale zonaId={zonaId} conFrase={masProbable !== null} />}
          {zona && conHumedad && (
            <p className={estilos.resultado}>
              <Medidor nivel={nivelDePercentil(zona.humedad?.percentil)} />
              <span>Según el satélite, la tierra en {zona.nombre} está {estadoHumedad(zona).toLowerCase()}.</span>
              <Link to="/zona">Ver cómo está la tierra</Link>
            </p>
          )}
          <Recomendacion rec={recomendacion} />
          <ComparadorRotaciones
            key={`${departamento.id}-${cultivo.id}`}
            rotaciones={rotaciones}
            elegidaId={recomendacion.elegidaId}
            actualId={cultivo.id}
          />
          <p className="tipo-nota">Puntajes y opciones de siembra de ejemplo, todavía sin validar. Consulte a su técnico.</p>
        </>
      )}
    </section>
  )
}
