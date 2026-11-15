import { useEffect, useMemo, useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { DondeSeDa } from '../../componentes/decision/DondeSeDa'
import { RatingRotacion } from '../../componentes/decision/RatingRotacion'
import { ICONO_CULTIVO, ICONO_TEMPORADA, ICONO_TERRENO } from '../../componentes/decision/visual'
import { buscarCultivo, cultivos } from '../../datos/cultivos'
import { confirmar } from '../../lib/sonido'
import { entradaDe, useEstadoApp, type Perfil } from '../../estado/EstadoApp'
import { useAnalisis } from '../../estado/useAnalisis'
import { useDecision } from '../../estado/useDecision'
import { armarContexto } from '../../lib/chat'
import { analisisGuardado, claveAnalisis } from '../../lib/decision/memoria'
import { CULTIVOS, LUGARES, OBJETIVOS, PALABRA_RATING, TEMPORADAS, TERRENOS } from '../../lib/decision/parametros'
import type { Decision, EntradaDecision, InfoParcela, RotacionDecidida } from '../../lib/decision/tipos'
import { TOP3, fechaEnPalabras, respuestaRapida, resumenRapido, tresMejores } from '../../lib/decision/textos'
import { ChatSeguimiento } from '../Rotacion/ChatSeguimiento'
import { PanelAnalisis } from '../Rotacion/PanelAnalisis'
import { Cuestionario, type ClavePregunta } from './Cuestionario'
import estilos from './Inicio.module.css'

/** "Su parcela · 1,240 m, cerca de Siguatepeque" */
function textoParcela(p: InfoParcela | undefined): string {
  if (!p) return 'Su parcela (ubicación)'
  const altura = p.alturaM === null ? '' : ` · ${Math.round(p.alturaM).toLocaleString('es-HN')} m`
  return `Su parcela${altura}, cerca de ${p.puntoNombre}`
}

/** "Ahorrar agua", "Ahorrar agua y 2 más" o "Sin objetivos". */
function textoObjetivos(e: EntradaDecision): string {
  const [primero, ...resto] = e.objetivos
  if (!primero) return 'Sin objetivos'
  const nombre = OBJETIVOS[primero].nombre
  return resto.length ? `${nombre} y ${resto.length} más` : nombre
}

/**
 * Las respuestas del cuestionario, en una línea de chips. Cada chip dice el dato en palabras
 * completas y, al tocarlo, abre solo su pregunta para cambiarlo.
 */
function SusRespuestas({
  entrada,
  semanas,
  parcela,
  alCambiar,
}: {
  entrada: EntradaDecision
  semanas: number
  parcela: InfoParcela | undefined
  alCambiar: (clave: ClavePregunta) => void
}) {
  const lugar = entrada.parcela ? textoParcela(parcela) : LUGARES[entrada.zonaId].nombre
  const cultivo = `${CULTIVOS[entrada.cultivoId].nombre}, ${semanas === 1 ? '1 semana' : `${semanas} semanas`}`
  const terreno = `Terreno ${TERRENOS[entrada.terreno].nombre.toLowerCase()}`
  const siembra = `Siembra de ${TEMPORADAS[entrada.temporada].nombre.toLowerCase()}`
  const objetivos = textoObjetivos(entrada)
  return (
    <div className={estilos.respuestas} role="group" aria-labelledby="titulo-respuestas">
      <p id="titulo-respuestas" className="tipo-nota">
        Sus respuestas. Toque una para cambiarla.
      </p>
      <div className={estilos.chipsRespuestas}>
        <Chip icono={entrada.parcela ? 'my_location' : 'location_on'} aria-label={`Lugar: ${lugar}. Cambiar`} onClick={() => alCambiar('zonaId')}>
          {lugar}
        </Chip>
        <Chip icono={ICONO_TERRENO[entrada.terreno]} aria-label={`${terreno}. Cambiar`} onClick={() => alCambiar('terreno')}>
          {terreno}
        </Chip>
        <Chip icono={ICONO_CULTIVO[entrada.cultivoId] ?? 'grass'} aria-label={`Cultivo: ${cultivo}. Cambiar`} onClick={() => alCambiar('cultivoId')}>
          {cultivo}
        </Chip>
        <Chip icono={ICONO_TEMPORADA[entrada.temporada]} aria-label={`${siembra}. Cambiar`} onClick={() => alCambiar('temporada')}>
          {siembra}
        </Chip>
        <Chip icono="flag" aria-label={`Quiere lograr: ${objetivos}. Cambiar`} onClick={() => alCambiar('objetivos')}>
          {objetivos}
        </Chip>
      </div>
    </div>
  )
}

/** El cultivo, como etiquetas con icono que se deslizan de lado. Al tocar una cambian el mapa y las rotaciones. */
function EtiquetasCultivo({ elegido, alElegir }: { elegido: string; alElegir: (id: string) => void }) {
  return (
    <div className={estilos.etiquetas} role="group" aria-label="Su cultivo">
      {cultivos.map((c) => (
        <Chip
          key={c.id}
          variante="filtro"
          icono={ICONO_CULTIVO[c.id] ?? 'grass'}
          seleccionado={c.id === elegido}
          onClick={() => alElegir(c.id)}
        >
          {c.nombre}
        </Chip>
      ))}
    </div>
  )
}

function etiqueta(r: RotacionDecidida): string | null {
  if (r.mejor) return 'La mejor'
  if (r.actual) return 'Lo que hace hoy'
  return null
}

/** Una de las tres mejores: icono del cultivo, nombre, puntaje y rating. Al tocarla se abre su detalle. */
function TarjetaRotacion({ r }: { r: RotacionDecidida }) {
  const marca = etiqueta(r)
  return (
    <li>
      <Control
        to={`/rotacion/${r.id}`}
        className={clases(estilos.tarjeta, r.mejor && estilos.tarjetaMejor, 'capa-estado')}
        aria-label={`${r.nombre}. ${r.puntaje} de 100, ${PALABRA_RATING[r.rating].toLowerCase()}.${marca ? ` ${marca}.` : ''} Ver por qué`}
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

/** Una de las demás opciones: un cuadrado con icono, nombre y porcentaje. */
function CuadroRotacion({ r }: { r: RotacionDecidida }) {
  return (
    <li>
      <Control
        to={`/rotacion/${r.id}`}
        className={clases(estilos.cuadro, 'capa-estado')}
        aria-label={`${r.nombre}. ${r.puntaje} de 100, ${PALABRA_RATING[r.rating].toLowerCase()}.${r.actual ? ' Lo que hace hoy.' : ''} Ver por qué`}
      >
        <span className={estilos.iconoCuadro}>
          <Icono nombre={ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={24} />
        </span>
        <span className={estilos.nombreCuadro}>{r.nombre}</span>
        {r.actual && <span className="tipo-nota">Lo que hace hoy</span>}
        <span className={estilos.puntajeCuadro}>
          {r.puntaje}
          <span>%</span>
        </span>
      </Control>
    </li>
  )
}

/** Espera antes de llamar a Gemini: si el productor sigue cambiando objetivos, no se gasta una consulta por toque. */
const ESPERA_MS = 1200

const PREGUNTAS_TOP3 = ['¿Por qué la primera es la mejor?', '¿Y si llueve menos de lo previsto?', '¿Qué necesito para empezar?']

/**
 * Gemini explica por qué estas tres quedaron arriba con el clima de la zona, con la misma línea
 * de tiempo del análisis de una rotación: pasos en vivo, texto en vivo o resumen rápido a los
 * 6 s, aviso si llega tarde, reintento si falla y, al terminar, chat de seguimiento.
 */
function PorQueTop3({ d }: { d: Decision }) {
  const estado = useEstadoApp()
  const clave = claveAnalisis(d.entrada, TOP3, d.punto.fechaBase)
  // Un análisis ya guardado se muestra de una vez; uno nuevo espera a que la consulta se asiente.
  const [asentada, fijarAsentada] = useState(() => analisisGuardado(clave) !== null)
  useEffect(() => {
    if (asentada) return
    const espera = window.setTimeout(() => fijarAsentada(true), ESPERA_MS)
    return () => window.clearTimeout(espera)
  }, [asentada])

  const analisis = useAnalisis(asentada ? d.entrada : null, TOP3, asentada ? d.punto.fechaBase : null)
  const contexto = useMemo(
    () => ({
      ...armarContexto({ vista: 'cultivos', cultivoId: estado.cultivoId, edadSemanas: estado.edadSemanas, zonaId: estado.zonaId }),
      consulta: { entrada: d.entrada, rotacionId: TOP3 },
    }),
    [estado.cultivoId, estado.edadSemanas, estado.zonaId, d.entrada],
  )

  return (
    <div className={estilos.porQue}>
      <PanelAnalisis
        analisis={analisis}
        resumen={resumenRapido(d, TOP3)}
        titulo="Por qué estas tres"
        apoyo={`Gemini lo explica con el clima de ${d.punto.nombre}. No cambia los puntajes.`}
        aviso={{ titulo: 'Explicación lista', descripcion: 'Gemini terminó de explicar las tres mejores.' }}
        espera="Gemini sigue preparando la explicación. Le avisamos cuando esté."
      />
      {analisis.fase === 'listo' && (
        <ChatSeguimiento
          contexto={contexto}
          titulo="Pregunte sobre estas rotaciones"
          sugerencias={PREGUNTAS_TOP3}
          respaldo={(pregunta) => respuestaRapida(d, TOP3, pregunta)}
        />
      )}
    </div>
  )
}

function Rotaciones({ d }: { d: Decision }) {
  const tres = tresMejores(d)
  const otras = d.rotaciones.slice(tres.length)
  return (
    <>
      <section className={estilos.seccion} aria-labelledby="titulo-mejores">
        <h2 id="titulo-mejores" className="tipo-titulo">
          Las tres mejores
        </h2>
        <ol className={estilos.podio} aria-labelledby="titulo-mejores">
          {tres.map((r) => (
            <TarjetaRotacion key={r.id} r={r} />
          ))}
        </ol>
      </section>
      {otras.length > 0 && (
        <section className={estilos.seccion} aria-labelledby="titulo-otras">
          <h2 id="titulo-otras" className="tipo-titulo">
            Más opciones
          </h2>
          <ul className={estilos.cuadros} aria-labelledby="titulo-otras">
            {otras.map((r) => (
              <CuadroRotacion key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function Inicio() {
  const estado = useEstadoApp()
  const { fijarPerfil, objetivos, edadSemanas, elegirCultivo } = estado
  const entrada = entradaDe(estado)
  const cultivo = buscarCultivo(entrada?.cultivoId ?? null)
  // 'todo' = el cuestionario completo; una clave = solo esa pregunta, abierta desde un chip.
  const [editando, fijarEditando] = useState<ClavePregunta | 'todo' | null>(null)
  const [intento, fijarIntento] = useState(0)
  const decision = useDecision(editando ? null : entrada, intento)

  if (!entrada || editando) {
    const cultivoValido = estado.cultivoId && CULTIVOS[estado.cultivoId] ? estado.cultivoId : undefined
    return (
      <div className="pantalla">
        <div className={estilos.medio}>
          <Cuestionario
            key={editando ?? 'nuevo'}
            soloPaso={entrada && editando && editando !== 'todo' ? editando : undefined}
            inicial={{
              zonaId: estado.zonaId && LUGARES[estado.zonaId] ? estado.zonaId : undefined,
              terreno: estado.terreno ?? undefined,
              cultivoId: cultivoValido,
              temporada: estado.temporada ?? undefined,
              parcela: estado.parcela,
              edadSemanas: cultivoValido ? edadSemanas : 0,
              objetivos,
            }}
            alCancelar={entrada ? () => fijarEditando(null) : undefined}
            alTerminar={(p: Perfil) => {
              fijarPerfil(p)
              fijarEditando(null)
            }}
          />
        </div>
      </div>
    )
  }

  const d = decision.estado === 'listo' ? decision.decision : null
  return (
    <div className="pantalla">
      <div className={estilos.medio} aria-busy={decision.estado === 'calculando'}>
        <header className={estilos.seccion}>
          <h1 className={estilos.pregunta}>¿Qué sembrar después?</h1>
          <EtiquetasCultivo
            elegido={entrada.cultivoId}
            alElegir={(id) => {
              if (id === entrada.cultivoId) return
              elegirCultivo(id)
              confirmar()
            }}
          />
        </header>

        {cultivo && <DondeSeDa key={`${cultivo.id}-${entrada.zonaId}`} cultivo={cultivo} zonaId={entrada.zonaId} />}

        {decision.estado === 'calculando' && (
          <section className={estilos.seccion}>
            <p className={estilos.ayuda} role="status">
              Gemini Decision está comparando rotaciones…
            </p>
            <ul className={estilos.podio} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className={estilos.esqueleto} />
              ))}
            </ul>
          </section>
        )}
        {decision.estado === 'error' && (
          <div className={estilos.error} role="alert">
            <p>No se pudo leer el pronóstico de su lugar.</p>
            <Boton variante="tonal" icono="refresh" onClick={() => fijarIntento((i) => i + 1)}>
              Reintentar
            </Boton>
          </div>
        )}
        {d && <Rotaciones d={d} />}

        {d && <PorQueTop3 key={claveAnalisis(d.entrada, TOP3, d.punto.fechaBase)} d={d} />}

        <SusRespuestas entrada={entrada} semanas={edadSemanas} parcela={d?.punto.parcela} alCambiar={fijarEditando} />

        <p className="tipo-nota">
          Es una ayuda para pensar: la decisión final es suya y de su técnico.
          {d && ` Pronóstico de Kharis con datos hasta el ${fechaEnPalabras(d.punto.fechaBase)}.`}
        </p>
      </div>
    </div>
  )
}
