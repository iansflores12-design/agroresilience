import { useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { RatingRotacion } from '../../componentes/decision/RatingRotacion'
import { EdadCultivo, SelectorCultivo } from '../../componentes/decision/SuCultivo'
import { ICONO_CULTIVO, ICONO_OBJETIVO, ICONO_TEMPORADA, ICONO_TERRENO } from '../../componentes/decision/visual'
import { buscarCultivo } from '../../datos/cultivos'
import { confirmar } from '../../lib/sonido'
import { entradaDe, useEstadoApp, type Perfil } from '../../estado/EstadoApp'
import { useDecision } from '../../estado/useDecision'
import { CULTIVOS, LUGARES, OBJETIVOS, TEMPORADAS, TERRENOS } from '../../lib/decision/parametros'
import type { Objetivo, RotacionDecidida } from '../../lib/decision/tipos'
import { fechaEnPalabras } from '../../lib/decision/textos'
import { Cuestionario } from './Cuestionario'
import estilos from './Inicio.module.css'

function etiqueta(r: RotacionDecidida): string | null {
  if (r.mejor) return 'La mejor'
  if (r.actual) return 'Lo que hace hoy'
  return null
}

/** Tarjeta pequena: icono del cultivo, nombre, puntaje y rating. Al tocarla se abre su detalle. */
function TarjetaRotacion({ r }: { r: RotacionDecidida }) {
  const marca = etiqueta(r)
  return (
    <li>
      <Control
        to={`/rotacion/${r.id}`}
        className={clases(estilos.tarjeta, r.mejor && estilos.tarjetaMejor, 'capa-estado')}
        aria-label={`${r.nombre}. ${r.puntaje} de 100, ${r.rating}.${marca ? ` ${marca}.` : ''} Ver por qué`}
      >
        <span className={estilos.tarjetaArriba}>
          <span className={estilos.iconoRotacion}>
            <Icono nombre={ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={28} />
          </span>
          {marca && (
            <span className={estilos.marca}>
              {r.mejor && <Icono nombre="workspace_premium" tamano={18} />}
              {marca}
            </span>
          )}
        </span>
        <span className={estilos.nombreRotacion}>{r.nombre}</span>
        <span className={estilos.tarjetaPie}>
          <span className={estilos.puntaje}>
            {r.puntaje}
            <span className={estilos.porciento}>%</span>
          </span>
          <RatingRotacion rating={r.rating} />
        </span>
      </Control>
    </li>
  )
}

function Objetivos({ elegidos, alternar }: { elegidos: Objetivo[]; alternar: (o: Objetivo) => void }) {
  return (
    <ul className={estilos.objetivos} aria-label="Objetivos">
      {(Object.keys(OBJETIVOS) as Objetivo[]).map((o) => {
        const marcado = elegidos.includes(o)
        return (
          <li key={o}>
            <Control
              className={clases(estilos.objetivo, marcado && estilos.objetivoMarcado, 'capa-estado')}
              aria-pressed={marcado}
              onClick={() => alternar(o)}
            >
              <span className={estilos.iconoObjetivo}>
                <Icono nombre={marcado ? 'check' : ICONO_OBJETIVO[o]} tamano={24} />
              </span>
              <span className={estilos.textoOpcion}>
                <span className={estilos.nombreOpcion}>{OBJETIVOS[o].nombre}</span>
                <span className="tipo-nota">{OBJETIVOS[o].descripcion}</span>
              </span>
            </Control>
          </li>
        )
      })}
    </ul>
  )
}

export default function Inicio() {
  const estado = useEstadoApp()
  const { fijarPerfil, alternarObjetivo, objetivos, elegirCultivo, edadSemanas, fijarEdad } = estado
  const entrada = entradaDe(estado)
  const cultivo = buscarCultivo(entrada?.cultivoId ?? null)
  const [editando, fijarEditando] = useState(false)
  const [intento, fijarIntento] = useState(0)
  const decision = useDecision(editando ? null : entrada, intento)

  if (!entrada || editando) {
    return (
      <div className="pantalla">
        <div className={estilos.medio}>
          <Cuestionario
            inicial={{
              zonaId: estado.zonaId && LUGARES[estado.zonaId] ? estado.zonaId : undefined,
              terreno: estado.terreno ?? undefined,
              cultivoId: estado.cultivoId && CULTIVOS[estado.cultivoId] ? estado.cultivoId : undefined,
              temporada: estado.temporada ?? undefined,
            }}
            alCancelar={entrada ? () => fijarEditando(false) : undefined}
            alTerminar={(p: Perfil) => {
              fijarPerfil(p)
              fijarEditando(false)
            }}
          />
        </div>
      </div>
    )
  }

  const t = TEMPORADAS[entrada.temporada]
  return (
    <div className="pantalla">
      <div className={estilos.medio}>
        <section className={estilos.seccion} aria-labelledby="titulo-objetivos">
          <h1 id="titulo-objetivos" className={estilos.pregunta}>
            ¿Qué quiere lograr?
          </h1>
          <p className={estilos.ayuda}>Toque uno o varios. Las rotaciones se ordenan según lo que elija.</p>
          <Objetivos elegidos={objetivos} alternar={alternarObjetivo} />
        </section>

        <section className={estilos.seccion} aria-labelledby="titulo-cultivo">
          <h2 id="titulo-cultivo" className="tipo-titulo">
            ¿Qué sembró?
          </h2>
          <SelectorCultivo
            elegido={entrada.cultivoId}
            alElegir={(id) => {
              if (id === entrada.cultivoId) return
              elegirCultivo(id)
              confirmar()
            }}
          />
        </section>

        {cultivo && <EdadCultivo cultivo={cultivo} semanas={edadSemanas} alCambiar={fijarEdad} />}

        <section className={estilos.perfil} aria-labelledby="titulo-perfil">
          <h2 id="titulo-perfil" className="solo-lectores">
            Su parcela
          </h2>
          <ul className={estilos.datosPerfil}>
            <li>
              <Icono nombre="location_on" tamano={20} />
              {LUGARES[entrada.zonaId].nombre}
            </li>
            <li>
              <Icono nombre={ICONO_TERRENO[entrada.terreno]} tamano={20} />
              Terreno {TERRENOS[entrada.terreno].nombre.toLowerCase()}
            </li>
            <li>
              <Icono nombre={ICONO_TEMPORADA[entrada.temporada]} tamano={20} />
              Siembra de {t.nombre.toLowerCase()}
            </li>
          </ul>
          <Boton variante="tonal" icono="edit" onClick={() => fijarEditando(true)}>
            Cambiar datos
          </Boton>
        </section>

        <section className={estilos.seccion} aria-labelledby="titulo-recomendados" aria-busy={decision.estado === 'calculando'}>
          <h2 id="titulo-recomendados" className="tipo-titulo">
            Rotaciones recomendadas
          </h2>
          {decision.estado === 'calculando' && (
            <>
              <p className={estilos.ayuda} role="status">
                Gemini Decision está comparando rotaciones…
              </p>
              <ul className={estilos.tarjetas} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className={estilos.esqueleto} />
                ))}
              </ul>
            </>
          )}
          {decision.estado === 'error' && (
            <div className={estilos.error} role="alert">
              <p>No se pudo leer el pronóstico de su lugar.</p>
              <Boton
                variante="tonal"
                icono="refresh"
                onClick={() => fijarIntento((i) => i + 1)}
              >
                Reintentar
              </Boton>
            </div>
          )}
          {decision.estado === 'listo' && (
            <>
              <p className={estilos.ayuda}>
                De la mejor a la menos buena para su parcela. Pronóstico de Kharis con datos hasta el{' '}
                {fechaEnPalabras(decision.decision.punto.fechaBase)}. Toque una para ver por qué.
              </p>
              <ul className={estilos.tarjetas}>
                {decision.decision.rotaciones.map((r) => (
                  <TarjetaRotacion key={r.id} r={r} />
                ))}
              </ul>
              <p className="tipo-nota">Es una ayuda para pensar: la decisión final es suya y de su técnico.</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
