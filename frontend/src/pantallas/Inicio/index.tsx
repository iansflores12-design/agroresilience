import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useIdioma, useLocale } from '../../i18n'
import { lista as listaT } from '../../i18n/traductor'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Control } from '../../componentes/Control'
import { DescargaAndroid } from '../../componentes/DescargaAndroid'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { DondeSeDa } from '../../componentes/decision/DondeSeDa'
import { RatingRotacion } from '../../componentes/decision/RatingRotacion'
import { ICONO_CULTIVO, ICONO_TEMPORADA, ICONO_TERRENO } from '../../componentes/decision/visual'
import { buscarCultivo, cultivos } from '../../datos/cultivos'
import { confirmar } from '../../lib/sonido'
import { entradaDe, useEstadoApp, type Perfil } from '../../estado/EstadoApp'
import { useMarcarCuestionario } from '../../estado/cuestionario'
import { useAnalisis } from '../../estado/useAnalisis'
import { useDecision } from '../../estado/useDecision'
import { armarContexto } from '../../lib/chat'
import { analisisGuardado, claveAnalisis } from '../../lib/decision/memoria'
import { CULTIVOS, LUGARES } from '../../lib/decision/parametros'
import type { Decision, EntradaDecision, InfoParcela, RotacionDecidida } from '../../lib/decision/tipos'
import { TOP3, fechaEnPalabras, respuestaRapida, resumenRapido, tresMejores } from '../../lib/decision/textos'
import { ChatSeguimiento } from '../Rotacion/ChatSeguimiento'
import { PanelAnalisis } from '../Rotacion/PanelAnalisis'
import { Cuestionario, type ClavePregunta } from './Cuestionario'
import estilos from './Inicio.module.css'

/** "Su parcela · 1,240 m, cerca de Siguatepeque" */
function textoParcela(t: TFunction, locale: string, p: InfoParcela | undefined): string {
  if (!p) return t('inicio.parcelaSinDatos')
  const altura = p.alturaM === null ? '' : ` · ${Math.round(p.alturaM).toLocaleString(locale)} m`
  return t('inicio.parcela', { altura, lugar: p.puntoNombre })
}

/** "Ahorrar agua", "Ahorrar agua y 2 más" o "Sin objetivos". */
function textoObjetivos(t: TFunction, e: EntradaDecision): string {
  const [primero, ...resto] = e.objetivos
  if (!primero) return t('plan.sinObjetivos')
  const nombre = t(`objetivos.${primero}.nombre`)
  return resto.length ? t('plan.objetivoYMas', { nombre, n: resto.length }) : nombre
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
  const { t } = useTranslation()
  const locale = useLocale()
  const lugar = entrada.parcela ? textoParcela(t, locale, parcela) : LUGARES[entrada.zonaId].nombre
  const cultivo = t('plan.cultivoSemanas', {
    cultivo: t(`cultivos.${entrada.cultivoId}.nombre`),
    semanas: semanas === 1 ? t('plan.unaSemana') : t('plan.semanas', { n: semanas }),
  })
  const terreno = t('inicio.terreno', { terreno: t(`terrenos.${entrada.terreno}.nombre`).toLowerCase() })
  const siembra = t('inicio.siembraDe', { temporada: t(`temporadas.${entrada.temporada}.nombre`).toLowerCase() })
  const objetivos = textoObjetivos(t, entrada)
  const cambiar = (dato: string) => t('plan.cambiar', { dato })
  return (
    <div className={estilos.respuestas} role="group" aria-labelledby="titulo-respuestas">
      <p id="titulo-respuestas" className="tipo-nota">
        {t('plan.susRespuestas')}
      </p>
      <div className={estilos.chipsRespuestas}>
        <Chip icono={entrada.parcela ? 'my_location' : 'location_on'} aria-label={cambiar(t('plan.lugar', { lugar }))} onClick={() => alCambiar('zonaId')}>
          {lugar}
        </Chip>
        <Chip icono={ICONO_TERRENO[entrada.terreno]} aria-label={cambiar(terreno)} onClick={() => alCambiar('terreno')}>
          {terreno}
        </Chip>
        <Chip icono={ICONO_CULTIVO[entrada.cultivoId] ?? 'grass'} aria-label={cambiar(t('plan.cultivo', { cultivo }))} onClick={() => alCambiar('cultivoId')}>
          {cultivo}
        </Chip>
        <Chip icono={ICONO_TEMPORADA[entrada.temporada]} aria-label={cambiar(siembra)} onClick={() => alCambiar('temporada')}>
          {siembra}
        </Chip>
        <Chip icono="flag" aria-label={cambiar(t('plan.quiereLograr', { objetivos }))} onClick={() => alCambiar('objetivos')}>
          {objetivos}
        </Chip>
      </div>
    </div>
  )
}

/** El cultivo, como etiquetas con icono que se deslizan de lado. Al tocar una cambian el mapa y las rotaciones. */
function EtiquetasCultivo({ elegido, alElegir }: { elegido: string; alElegir: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className={estilos.etiquetas} role="group" aria-label={t('plan.suCultivo')}>
      {cultivos.map((c) => (
        <Chip
          key={c.id}
          variante="filtro"
          icono={ICONO_CULTIVO[c.id] ?? 'grass'}
          seleccionado={c.id === elegido}
          onClick={() => alElegir(c.id)}
        >
          {t(`cultivos.${c.id}.nombre`)}
        </Chip>
      ))}
    </div>
  )
}

function etiqueta(t: TFunction, r: RotacionDecidida): string | null {
  if (r.mejor) return t('inicio.laMejor')
  if (r.actual) return t('comun.loQueHaceHoy')
  return null
}

/** "Maíz y después frijol. 86 de 100, alta. La mejor. Ver por qué" */
function ariaRotacion(t: TFunction, r: RotacionDecidida, marca: string | null): string {
  return t('inicio.tarjetaAria', { nombre: r.nombre, puntaje: r.puntaje, rating: t(`rating.${r.rating}`).toLowerCase(), marca: marca ? ` ${marca}.` : '' })
}

/** Una de las tres mejores: icono del cultivo, nombre, puntaje y rating. Al tocarla se abre su detalle. */
function TarjetaRotacion({ r }: { r: RotacionDecidida }) {
  const { t } = useTranslation()
  const marca = etiqueta(t, r)
  return (
    <li>
      <Control
        to={`/rotacion/${r.id}`}
        className={clases(estilos.tarjeta, r.mejor && estilos.tarjetaMejor, 'capa-estado')}
        aria-label={ariaRotacion(t, r, marca)}
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
  const { t } = useTranslation()
  return (
    <li>
      <Control
        to={`/rotacion/${r.id}`}
        className={clases(estilos.cuadro, 'capa-estado')}
        aria-label={ariaRotacion(t, r, r.actual ? t('comun.loQueHaceHoy') : null)}
      >
        <span className={estilos.iconoCuadro}>
          <Icono nombre={ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={24} />
        </span>
        <span className={estilos.nombreCuadro}>{r.nombre}</span>
        {r.actual && <span className="tipo-nota">{t('comun.loQueHaceHoy')}</span>}
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

/**
 * Gemini explica por qué estas tres quedaron arriba con el clima de la zona, con la misma línea
 * de tiempo del análisis de una rotación: pasos en vivo, texto en vivo o resumen rápido a los
 * 6 s, aviso si llega tarde, reintento si falla y, al terminar, chat de seguimiento.
 */
function PorQueTop3({ d }: { d: Decision }) {
  const { t } = useTranslation()
  const idioma = useIdioma()
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
      ...armarContexto({ vista: 'cultivos', cultivoId: estado.cultivoId, edadSemanas: estado.edadSemanas, zonaId: estado.zonaId, idioma }),
      consulta: { entrada: d.entrada, rotacionId: TOP3 },
    }),
    [estado.cultivoId, estado.edadSemanas, estado.zonaId, d.entrada, idioma],
  )

  return (
    <PanelAnalisis
      analisis={analisis}
      resumen={resumenRapido(d, TOP3)}
      titulo={t('plan.top3Titulo')}
      apoyo={t('plan.top3Apoyo', { lugar: d.punto.nombre })}
      aviso={{ titulo: t('plan.top3AvisoTitulo'), descripcion: t('plan.top3AvisoDescripcion') }}
      espera={t('plan.top3Espera')}
    >
      {analisis.fase === 'listo' && (
        <ChatSeguimiento
          integrado
          contexto={contexto}
          titulo={t('plan.top3Chat')}
          sugerencias={listaT(t, 'plan.top3Preguntas')}
          respaldo={(pregunta) => respuestaRapida(d, TOP3, pregunta)}
        />
      )}
    </PanelAnalisis>
  )
}

function Rotaciones({ d }: { d: Decision }) {
  const { t } = useTranslation()
  const tres = tresMejores(d)
  const otras = d.rotaciones.slice(tres.length)
  return (
    <>
      <section className={estilos.seccion} aria-labelledby="titulo-mejores">
        <h2 id="titulo-mejores" className="tipo-titulo">
          {t('plan.tresMejores')}
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
            {t('plan.masOpciones')}
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

const PREGUNTAS_CHIP: ClavePregunta[] = ['zonaId', 'cultivoId']

export default function Inicio() {
  const { t } = useTranslation()
  const idioma = useIdioma()
  const estado = useEstadoApp()
  const { fijarPerfil, objetivos, edadSemanas, elegirCultivo } = estado
  const entrada = entradaDe(estado, idioma)
  const cultivo = buscarCultivo(entrada?.cultivoId ?? null)
  // 'todo' = el cuestionario completo; una clave = solo esa pregunta, abierta desde un chip.
  const [editando, fijarEditando] = useState<ClavePregunta | 'todo' | null>(null)
  useMarcarCuestionario(!entrada || editando !== null)
  const [intento, fijarIntento] = useState(0)
  // Un cultivo permanente (cafe, platano, palma, cana) no se rota por temporadas: no hay rotaciones que calcular.
  const perenne = Boolean(entrada && CULTIVOS[entrada.cultivoId]?.perenne)
  const decision = useDecision(editando || perenne ? null : entrada, intento)
  // Los chips de la barra superior abren aquí una pregunta: /?pregunta=cultivoId o zonaId.
  const [params, fijarParams] = useSearchParams()
  const pedida = params.get('pregunta')
  const [pasoInicial, fijarPasoInicial] = useState<ClavePregunta | undefined>()
  const hayEntrada = Boolean(entrada)
  useEffect(() => {
    if (!pedida) return
    if (PREGUNTAS_CHIP.includes(pedida as ClavePregunta)) {
      if (hayEntrada) fijarEditando(pedida as ClavePregunta)
      else fijarPasoInicial(pedida as ClavePregunta)
    }
    fijarParams({}, { replace: true })
  }, [pedida, hayEntrada, fijarParams])

  if (!entrada || editando) {
    const cultivoValido = estado.cultivoId && CULTIVOS[estado.cultivoId] ? estado.cultivoId : undefined
    return (
      <div className="pantalla">
        <div className={estilos.medio}>
          <Cuestionario
            key={`${editando ?? 'nuevo'}-${pasoInicial ?? ''}`}
            pasoInicial={pasoInicial}
            soloPaso={entrada && editando && editando !== 'todo' ? editando : undefined}
            inicial={{
              zonaId: estado.zonaId && LUGARES[estado.zonaId] ? estado.zonaId : undefined,
              terreno: estado.terreno ?? undefined,
              cultivoId: cultivoValido,
              temporada: estado.temporada ?? undefined,
              parcela: estado.parcela,
              departamentoId: estado.departamentoId,
              edadSemanas: cultivoValido ? edadSemanas : 0,
              objetivos,
            }}
            alCancelar={entrada ? () => fijarEditando(null) : undefined}
            alTerminar={(p: Perfil) => {
              fijarPerfil(p)
              fijarEditando(null)
            }}
          />
          {!entrada && <DescargaAndroid />}
        </div>
      </div>
    )
  }

  const d = decision.estado === 'listo' ? decision.decision : null
  return (
    <div className="pantalla">
      <div className={estilos.medio} aria-busy={decision.estado === 'calculando'}>
        <header className={estilos.seccion}>
          <h1 className={estilos.pregunta}>{t('plan.queSembrarDespues')}</h1>
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

        {perenne && cultivo && (
          <section className={estilos.seccion} aria-labelledby="titulo-perenne">
            <h2 id="titulo-perenne" className="tipo-titulo">
              {t('plan.perenneTitulo', { cultivo: t(`cultivos.${cultivo.id}.nombre`) })}
            </h2>
            <p className={estilos.ayuda}>{t('plan.perenneTexto', { el: t(`cultivos.${cultivo.id}.el`) })}</p>
          </section>
        )}

        {!perenne && decision.estado === 'calculando' && (
          <section className={estilos.seccion}>
            <p className={estilos.ayuda} role="status">
              {t('comun.calculando')}
            </p>
            <ul className={estilos.podio} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className={estilos.esqueleto} />
              ))}
            </ul>
          </section>
        )}
        {!perenne && decision.estado === 'error' && (
          <div className={estilos.error} role="alert">
            <p>{t('comun.errorPronostico')}</p>
            <Boton variante="tonal" icono="refresh" onClick={() => fijarIntento((i) => i + 1)}>
              {t('comun.reintentar')}
            </Boton>
          </div>
        )}
        {d && <Rotaciones d={d} />}

        {d && <PorQueTop3 key={claveAnalisis(d.entrada, TOP3, d.punto.fechaBase)} d={d} />}

        <SusRespuestas entrada={entrada} semanas={edadSemanas} parcela={d?.punto.parcela} alCambiar={fijarEditando} />

        <p className="tipo-nota">
          {t('comun.ayudaPensar')}
          {d && t('plan.pronostico', { fecha: fechaEnPalabras(d.punto.fechaBase, idioma) })}
        </p>

        {/* Sus respuestas quedan guardadas; esto solo vuelve a la primera pregunta para repasarlas. */}
        <Boton
          variante="tonal"
          icono="arrow_back"
          className={estilos.volverInicio}
          onClick={() => {
            fijarEditando('todo')
            window.scrollTo?.({ top: 0 })
          }}
        >
          {t('plan.volverInicio')}
        </Boton>

        <DescargaAndroid />
      </div>
    </div>
  )
}
