import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BotonIcono } from '../../componentes/BotonIcono'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { RatingRotacion } from '../../componentes/decision/RatingRotacion'
import { ICONO_CULTIVO, ICONO_FACTOR, ICONO_TEMPORADA, iconoRazon } from '../../componentes/decision/visual'
import { entradaDe, useEstadoApp } from '../../estado/EstadoApp'
import { useAnalisis } from '../../estado/useAnalisis'
import { useDecision } from '../../estado/useDecision'
import { armarContexto } from '../../lib/chat'
import { TEMPORADAS } from '../../lib/decision/parametros'
import { buscarRotacion, fechaEnPalabras, respuestaRapida, resumenRapido } from '../../lib/decision/textos'
import type { Decision, PasoPlan, RotacionDecidida } from '../../lib/decision/tipos'
import { ChatSeguimiento } from './ChatSeguimiento'
import { AnilloPuntaje, BarraLineal, Pestanas } from './Indicadores'
import { PanelAnalisis } from './PanelAnalisis'
import estilos from './Rotacion.module.css'

function apoyo(r: RotacionDecidida, d: Decision): string {
  if (r.actual) return 'Es lo que hace hoy. Sirve de base para comparar.'
  const base =
    r.diferencia > 0
      ? `${r.diferencia} puntos más que lo que hace hoy`
      : r.diferencia < 0
        ? `${-r.diferencia} puntos menos que lo que hace hoy`
        : 'Igual que lo que hace hoy'
  return r.mejor ? `La mejor de ${d.rotaciones.length} opciones. ${base}.` : `${base}.`
}

/* ---------- Tarjeta heroe ---------- */

function Heroe({ r, d }: { r: RotacionDecidida; d: Decision }) {
  return (
    <section className={estilos.heroe} aria-labelledby="titulo-rotacion">
      <AnilloPuntaje valor={r.puntaje} />
      <div className={estilos.heroeTexto}>
        <span className={estilos.sobretitulo}>
          <Icono nombre={r.mejor ? 'workspace_premium' : ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={20} />
          {r.mejor ? 'La mejor para su parcela' : r.actual ? 'Lo que hace hoy' : `Opción para ${d.punto.nombre}`}
        </span>
        <h1 id="titulo-rotacion" className={estilos.titular}>
          {r.nombre}
        </h1>
        <div className={estilos.heroeFila}>
          <RatingRotacion rating={r.rating} grande />
          {!r.actual && (
            <span className={estilos.diferencia}>
              <Icono nombre={r.diferencia >= 0 ? 'trending_up' : 'trending_down'} tamano={20} />
              {r.diferencia >= 0 ? '+' : '−'}
              {Math.abs(r.diferencia)}
            </span>
          )}
        </div>
        <p className={estilos.apoyo}>{apoyo(r, d)}</p>
      </div>
    </section>
  )
}

/* ---------- Por que ---------- */

function PorQue({ r }: { r: RotacionDecidida }) {
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-por-que">
      <h2 id="titulo-por-que" className={estilos.tituloTarjeta}>
        {r.mejor ? 'Por qué es la mejor' : 'Por qué tiene este puntaje'}
      </h2>
      <ul className={estilos.lista}>
        {r.razones.map((x) => (
          <li key={x.texto} className={estilos.elemento}>
            <span className={estilos.iconoLista}>
              <Icono nombre={iconoRazon(x, r.diferencia)} tamano={24} />
            </span>
            <span className={estilos.textoElemento}>{x.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Calendario ---------- */

function cubre(p: PasoPlan): number | null {
  if (p.lluviaMm === null || !p.aguaPideMm) return null
  return Math.round((100 * p.lluviaMm) / p.aguaPideMm)
}

function Calendario({ r }: { r: RotacionDecidida }) {
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-calendario">
      <h2 id="titulo-calendario" className={estilos.tituloTarjeta}>
        Su año de siembra
      </h2>
      <ol className={estilos.linea}>
        {r.pasos.map((p) => {
          const pct = p.nombre.endsWith('(sigue)') ? null : cubre(p)
          return (
            <li key={p.temporada} className={clases(estilos.temporada, !p.cultivoId && estilos.temporadaVacia)}>
              <span className={estilos.iconoTemporada}>
                <Icono nombre={p.cultivoId ? ICONO_TEMPORADA[p.temporada] : 'remove'} tamano={24} />
              </span>
              <span className={estilos.textoElemento}>
                <span className={estilos.sobrelinea}>
                  {TEMPORADAS[p.temporada].nombre} · {p.meses.toLowerCase()}
                </span>
                <span className={estilos.titularElemento}>{p.nombre}</span>
                {pct !== null && (
                  <>
                    <BarraLineal
                      valor={Math.min(pct, 100)}
                      tono="agua"
                      etiqueta={`La lluvia prevista cubre ${pct} % del agua que pide`}
                    />
                    <span className={estilos.apoyoElemento}>
                      Lluvia {p.lluviaMm} mm · pide {p.aguaPideMm} mm{pct >= 100 ? ' · alcanza' : ` · cubre ${pct} %`}
                    </span>
                  </>
                )}
                {!p.cultivoId && <span className={estilos.apoyoElemento}>La tierra queda descubierta</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------- Partes del puntaje ---------- */

function Partes({ r }: { r: RotacionDecidida }) {
  const orden = [...r.factores].sort((a, b) => b.peso - a.peso)
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-partes">
      <h2 id="titulo-partes" className={estilos.tituloTarjeta}>
        Cómo se calculó
      </h2>
      <p className={estilos.apoyoTarjeta}>De lo que más pesa a lo que menos. Lo que usted marcó pesa el triple.</p>
      <ul className={estilos.partes}>
        {orden.map((f) => (
          <li key={f.clave} className={estilos.parte}>
            <span className={estilos.parteCabeza}>
              <Icono nombre={ICONO_FACTOR[f.clave]} tamano={20} />
              <span className={estilos.parteNombre}>
                {f.nombre}
                {f.objetivo && (
                  <span className={estilos.insignia}>
                    <Icono nombre="flag" tamano={16} />
                    Su objetivo
                  </span>
                )}
              </span>
              <span className={estilos.parteValor}>{f.valor}</span>
            </span>
            <BarraLineal valor={f.valor} etiqueta={`${f.nombre}: ${f.valor} de 100`} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Pestanas: a favor, cuidado, falta saber ---------- */

function ListaSimple({ puntos, icono }: { puntos: string[]; icono: 'check_circle' | 'warning' | 'help' }) {
  return (
    <ul className={estilos.lista}>
      {puntos.map((p) => (
        <li key={p} className={estilos.elemento}>
          <span className={estilos.iconoListaSuave}>
            <Icono nombre={icono} tamano={20} />
          </span>
          <span className={estilos.textoElemento}>{p}</span>
        </li>
      ))}
    </ul>
  )
}

function Detalles({ r }: { r: RotacionDecidida }) {
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-detalles">
      <h2 id="titulo-detalles" className={estilos.tituloTarjeta}>
        Lo bueno y lo que hay que cuidar
      </h2>
      <Pestanas
        etiqueta="Ventajas, cuidados y lo que falta saber"
        pestanas={[
          { id: 'favor', etiqueta: 'A favor', icono: 'thumb_up', cuenta: r.beneficios.length, contenido: <ListaSimple puntos={r.beneficios} icono="check_circle" /> },
          { id: 'cuidado', etiqueta: 'Cuidado', icono: 'warning', cuenta: r.riesgos.length, contenido: <ListaSimple puntos={r.riesgos} icono="warning" /> },
          {
            id: 'falta',
            etiqueta: 'Falta saber',
            icono: 'help',
            cuenta: r.faltaSaber.length,
            contenido: (
              <>
                <ListaSimple puntos={r.faltaSaber} icono="help" />
                <p className={estilos.apoyoTarjeta}>Revise estos puntos con su técnico antes de decidir.</p>
              </>
            ),
          },
        ]}
      />
    </section>
  )
}

/* ---------- De donde salen los datos ---------- */

function Fuentes({ r, d }: { r: RotacionDecidida; d: Decision }) {
  return (
    <details className={estilos.expandible}>
      <summary className="capa-estado">
        <span className={estilos.iconoLista}>
          <Icono nombre="science" tamano={24} />
        </span>
        <span className={estilos.textoElemento}>
          <span className={estilos.titularElemento}>De dónde salen los datos</span>
          <span className={estilos.apoyoElemento}>
            Kharis {d.punto.modelo} · datos hasta el {fechaEnPalabras(d.punto.fechaBase)} · confianza {r.confianza}
          </span>
        </span>
        <Icono nombre="expand_more" tamano={24} />
      </summary>
      <ul className={estilos.lista}>
        {r.evidencia.map((x) => (
          <li key={x.texto} className={estilos.elemento}>
            <span className={estilos.textoElemento}>
              <span>{x.texto}</span>
              <span className={estilos.apoyoElemento}>{x.fuente}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className={estilos.avisos}>
        {d.avisos.map((a) => (
          <li key={a}>
            <Icono nombre="info" tamano={18} />
            {a}
          </li>
        ))}
      </ul>
    </details>
  )
}

/* ---------- Pantalla ---------- */

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
      <Heroe r={r} d={d} />
      <div className={estilos.rejilla}>
        <PorQue r={r} />
        <Calendario r={r} />
        <Partes r={r} />
        <Detalles r={r} />
      </div>
      <Fuentes r={r} d={d} />
      <PanelAnalisis analisis={analisis} resumen={resumen} />
      {analisis.fase === 'listo' && <ChatSeguimiento contexto={contexto} respaldo={(pregunta) => respuestaRapida(d, r.id, pregunta)} />}
    </>
  )
}

export default function Rotacion() {
  const { id = '' } = useParams()
  const entrada = entradaDe(useEstadoApp())
  const decision = useDecision(entrada)

  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [id])

  const rotacion = decision.estado === 'listo' ? buscarRotacion(decision.decision, id) : null

  return (
    <div className="pantalla">
      <article className={estilos.medio} aria-busy={decision.estado === 'calculando'}>
        <div className={estilos.barra}>
          <BotonIcono icono="arrow_back" etiqueta="Volver a las rotaciones" to="/" />
          <span className={estilos.barraTitulo}>Rotación</span>
        </div>
        {decision.estado === 'sin_datos' && (
          <p className={estilos.estado}>Primero conteste las preguntas de su parcela en la pantalla Plan.</p>
        )}
        {decision.estado === 'calculando' && (
          <p className={estilos.estado} role="status">
            Gemini Decision está comparando rotaciones…
          </p>
        )}
        {decision.estado === 'error' && <p className={estilos.estado}>No se pudo leer el pronóstico de su lugar.</p>}
        {decision.estado === 'listo' && !rotacion && (
          <p className={estilos.estado}>Esta rotación ya no está entre las opciones. Vuelva a la lista.</p>
        )}
        {decision.estado === 'listo' && rotacion && <Contenido key={rotacion.id} d={decision.decision} r={rotacion} />}
      </article>
    </div>
  )
}
