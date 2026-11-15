import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Boton } from '../../componentes/Boton'
import { Icono } from '../../componentes/Icono'
import { Partes } from '../../componentes/mapa/Partes'
import { RatingRotacion } from '../../componentes/decision/RatingRotacion'
import { ICONO_CULTIVO, ICONO_TEMPORADA } from '../../componentes/decision/visual'
import { entradaDe, useEstadoApp } from '../../estado/EstadoApp'
import { useAnalisis } from '../../estado/useAnalisis'
import { useDecision } from '../../estado/useDecision'
import { armarContexto } from '../../lib/chat'
import { TEMPORADAS } from '../../lib/decision/parametros'
import { buscarRotacion, fechaEnPalabras, resumenRapido } from '../../lib/decision/textos'
import type { Decision, RotacionDecidida } from '../../lib/decision/tipos'
import { ChatSeguimiento } from './ChatSeguimiento'
import { PanelAnalisis } from './PanelAnalisis'
import estilos from './Rotacion.module.css'

function comparacion(r: RotacionDecidida, d: Decision): string {
  if (r.actual) return 'Es lo que hace hoy. Sirve para comparar.'
  const base = r.diferencia > 0 ? `${r.diferencia} puntos más que lo que hace hoy.` : r.diferencia < 0 ? `${-r.diferencia} puntos menos que lo que hace hoy.` : 'Igual que lo que hace hoy.'
  if (r.mejor) return `La mejor de ${d.rotaciones.length} opciones. ${base}`
  return base
}

function Lista({ titulo, puntos, icono }: { titulo: string; puntos: string[]; icono: 'thumb_up' | 'warning' | 'info' }) {
  if (!puntos.length) return null
  return (
    <div className={estilos.lista}>
      <h3 className={estilos.subtitulo}>
        <Icono nombre={icono} tamano={20} />
        {titulo}
      </h3>
      <ul>
        {puntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function Contenido({ d, r }: { d: Decision; r: RotacionDecidida }) {
  const estado = useEstadoApp()
  const analisis = useAnalisis(d.entrada, r.id, d.punto.fechaBase)
  const resumen = resumenRapido(d, r.id)
  const contexto = useMemo(
    () => ({
      ...armarContexto({ vista: 'cultivos', cultivoId: estado.cultivoId, edadSemanas: estado.edadSemanas, zonaId: estado.zonaId }),
      consulta: { entrada: d.entrada, rotacionId: r.id },
    }),
    [estado.cultivoId, estado.edadSemanas, estado.zonaId, d.entrada, r.id],
  )

  return (
    <>
      <header className={estilos.cabecera}>
        <span className={estilos.iconoGrande}>
          <Icono nombre={ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={36} />
        </span>
        <div className={estilos.titulos}>
          {(r.mejor || r.actual) && (
            <span className={estilos.marca}>
              {r.mejor && <Icono nombre="workspace_premium" tamano={20} />}
              {r.mejor ? 'La mejor para su parcela' : 'Lo que hace hoy'}
            </span>
          )}
          <h1 className={estilos.pregunta}>{r.nombre}</h1>
        </div>
        <div className={estilos.puntajeFila}>
          <p className={estilos.puntaje} aria-label={`${r.puntaje} de 100`}>
            {r.puntaje}
            <span className={estilos.porciento}>%</span>
          </p>
          <RatingRotacion rating={r.rating} grande />
        </div>
        <p className={estilos.comparacion}>{comparacion(r, d)}</p>
      </header>

      <section className={estilos.seccion} aria-labelledby="titulo-por-que">
        <h2 id="titulo-por-que" className="tipo-titulo">
          {r.mejor ? 'Por qué es la mejor' : 'Por qué tiene este puntaje'}
        </h2>
        <ul className={estilos.razones}>
          {r.razones.map((x) => (
            <li key={x}>
              <Icono nombre="check_circle" tamano={20} />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className={estilos.columnas}>
        <section className={estilos.seccion} aria-labelledby="titulo-calendario">
          <h2 id="titulo-calendario" className="tipo-titulo">
            Cuándo se siembra
          </h2>
          <ol className={estilos.pasos}>
            {r.pasos.map((p) => (
              <li key={p.temporada} className={estilos.paso}>
                <span className={estilos.iconoPaso}>
                  <Icono nombre={p.cultivoId ? ICONO_TEMPORADA[p.temporada] : 'remove'} tamano={22} />
                </span>
                <span className={estilos.textoPaso}>
                  <span className={estilos.nombrePaso}>{p.nombre}</span>
                  <span className="tipo-nota">
                    {TEMPORADAS[p.temporada].nombre}: {p.meses.toLowerCase()}
                  </span>
                  {p.lluviaMm !== null && p.aguaPideMm !== null && !p.nombre.endsWith('(sigue)') && (
                    <span className="tipo-nota">
                      Lluvia prevista {p.lluviaMm} mm · el cultivo pide unos {p.aguaPideMm} mm
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className={estilos.seccion} aria-labelledby="titulo-partes">
          <h2 id="titulo-partes" className="tipo-titulo">
            El puntaje por partes
          </h2>
          <Partes partes={r.factores} etiqueta={`Puntaje por partes de ${r.nombre}`} />
          <p className="tipo-nota">Las partes que usted marcó como objetivo pesan más.</p>
        </section>
      </div>

      <div className={estilos.columnas}>
        <Lista titulo="A favor" puntos={r.beneficios} icono="thumb_up" />
        <Lista titulo="Tenga cuidado con" puntos={r.riesgos} icono="warning" />
        <Lista titulo="Falta saber (revise con su técnico)" puntos={r.faltaSaber} icono="info" />
      </div>

      <details className={estilos.detalles}>
        <summary className="capa-estado">
          <Icono nombre="science" tamano={20} />
          Ver de dónde salen estos datos
          <Icono nombre="expand_more" tamano={20} />
        </summary>
        <ul className={estilos.evidencia}>
          {r.evidencia.map((x) => (
            <li key={x.texto}>
              {x.texto} <span className="tipo-nota">({x.fuente})</span>
            </li>
          ))}
        </ul>
        <p className="tipo-nota">
          Pronóstico de Kharis {d.punto.modelo}, punto {d.punto.id}, datos hasta el {fechaEnPalabras(d.punto.fechaBase)}. Confianza de
          este cálculo: {r.confianza}.
        </p>
        <ul className={estilos.avisos}>
          {d.avisos.map((a) => (
            <li key={a} className="tipo-nota">
              {a}
            </li>
          ))}
        </ul>
      </details>

      <PanelAnalisis analisis={analisis} resumen={resumen} />
      {analisis.fase === 'listo' && <ChatSeguimiento contexto={contexto} />}
    </>
  )
}

export default function Rotacion() {
  const { id = '' } = useParams()
  const estado = useEstadoApp()
  const entrada = entradaDe(estado)
  const decision = useDecision(entrada)

  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [id])

  const rotacion = decision.estado === 'listo' ? buscarRotacion(decision.decision, id) : null

  return (
    <div className="pantalla">
      <article className={estilos.medio} aria-busy={decision.estado === 'calculando'}>
        <Boton variante="texto" icono="arrow_back" to="/" className={estilos.volver}>
          Volver a las rotaciones
        </Boton>
        {decision.estado === 'sin_datos' && (
          <p className={estilos.ayuda}>
            Primero conteste las preguntas de su parcela en la pantalla Plan.
          </p>
        )}
        {decision.estado === 'calculando' && (
          <p className={estilos.ayuda} role="status">
            Gemini Decision está comparando rotaciones…
          </p>
        )}
        {decision.estado === 'error' && <p className={estilos.ayuda}>No se pudo leer el pronóstico de su lugar.</p>}
        {decision.estado === 'listo' && !rotacion && (
          <p className={estilos.ayuda}>Esta rotación ya no está entre las opciones. Vuelva a la lista.</p>
        )}
        {decision.estado === 'listo' && rotacion && <Contenido key={rotacion.id} d={decision.decision} r={rotacion} />}
      </article>
    </div>
  )
}
