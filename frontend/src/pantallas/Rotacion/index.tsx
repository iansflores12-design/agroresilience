import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useIdioma } from '../../i18n'
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
import { buscarRotacion, fechaEnPalabras, respuestaRapida, resumenRapido } from '../../lib/decision/textos'
import type { Decision, PasoPlan, RotacionDecidida } from '../../lib/decision/tipos'
import { ChatSeguimiento } from './ChatSeguimiento'
import { AnilloPuntaje, BarraLineal, Pestanas } from './Indicadores'
import { PanelAnalisis } from './PanelAnalisis'
import estilos from './Rotacion.module.css'

function apoyo(t: TFunction, r: RotacionDecidida, d: Decision): string {
  if (r.actual) return t('rotacion.baseComparar')
  const base =
    r.diferencia > 0
      ? t('rotacion.masQueHoy', { n: r.diferencia })
      : r.diferencia < 0
        ? t('rotacion.menosQueHoy', { n: -r.diferencia })
        : t('rotacion.igualQueHoy')
  return r.mejor ? t('rotacion.laMejorDe', { n: d.rotaciones.length, base }) : t('rotacion.conPunto', { base })
}

/* ---------- Tarjeta heroe ---------- */

function Heroe({ r, d }: { r: RotacionDecidida; d: Decision }) {
  const { t } = useTranslation()
  return (
    <section className={estilos.heroe} aria-labelledby="titulo-rotacion">
      <AnilloPuntaje valor={r.puntaje} />
      <div className={estilos.heroeTexto}>
        <span className={estilos.sobretitulo}>
          <Icono nombre={r.mejor ? 'workspace_premium' : ICONO_CULTIVO[r.cultivoIcono] ?? 'grass'} tamano={20} />
          {r.mejor ? t('rotacion.laMejorParcela') : r.actual ? t('comun.loQueHaceHoy') : t('rotacion.opcionPara', { lugar: d.punto.nombre })}
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
        <p className={estilos.apoyo}>{apoyo(t, r, d)}</p>
      </div>
    </section>
  )
}

/* ---------- Por que ---------- */

function PorQue({ r }: { r: RotacionDecidida }) {
  const { t } = useTranslation()
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-por-que">
      <h2 id="titulo-por-que" className={estilos.tituloTarjeta}>
        {r.mejor ? t('rotacion.porQueMejor') : t('rotacion.porQuePuntaje')}
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
  const { t } = useTranslation()
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-calendario">
      <h2 id="titulo-calendario" className={estilos.tituloTarjeta}>
        {t('rotacion.anioSiembra')}
      </h2>
      <ol className={estilos.linea}>
        {r.pasos.map((p) => {
          const pct = p.continua ? null : cubre(p)
          return (
            <li key={p.temporada} className={clases(estilos.temporada, !p.cultivoId && estilos.temporadaVacia)}>
              <span className={estilos.iconoTemporada}>
                <Icono nombre={p.cultivoId ? ICONO_TEMPORADA[p.temporada] : 'remove'} tamano={24} />
              </span>
              <span className={estilos.textoElemento}>
                <span className={estilos.sobrelinea}>
                  {t(`temporadas.${p.temporada}.nombre`)} · {p.meses.toLowerCase()}
                </span>
                <span className={estilos.titularElemento}>{p.nombre}</span>
                {pct !== null && (
                  <>
                    <BarraLineal
                      valor={Math.min(pct, 100)}
                      tono="agua"
                      etiqueta={t('rotacion.cubreAria', { pct })}
                    />
                    <span className={estilos.apoyoElemento}>
                      {t('rotacion.lluviaPide', { lluvia: p.lluviaMm, pide: p.aguaPideMm })}
                      {pct >= 100 ? t('rotacion.alcanza') : t('rotacion.cubre', { pct })}
                    </span>
                  </>
                )}
                {!p.cultivoId && <span className={estilos.apoyoElemento}>{t('rotacion.descubierta')}</span>}
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
  const { t } = useTranslation()
  const orden = [...r.factores].sort((a, b) => b.peso - a.peso)
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-partes">
      <h2 id="titulo-partes" className={estilos.tituloTarjeta}>
        {t('rotacion.comoSeCalculo')}
      </h2>
      <p className={estilos.apoyoTarjeta}>{t('rotacion.pesoTriple')}</p>
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
                    {t('rotacion.suObjetivo')}
                  </span>
                )}
              </span>
              <span className={estilos.parteValor}>{f.valor}</span>
            </span>
            <BarraLineal valor={f.valor} etiqueta={t('rotacion.parteAria', { nombre: f.nombre, valor: f.valor })} />
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
  const { t } = useTranslation()
  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-detalles">
      <h2 id="titulo-detalles" className={estilos.tituloTarjeta}>
        {t('rotacion.loBueno')}
      </h2>
      <Pestanas
        etiqueta={t('rotacion.pestanasAria')}
        pestanas={[
          { id: 'favor', etiqueta: t('comun.aFavor'), icono: 'thumb_up', cuenta: r.beneficios.length, contenido: <ListaSimple puntos={r.beneficios} icono="check_circle" /> },
          { id: 'cuidado', etiqueta: t('rotacion.cuidado'), icono: 'warning', cuenta: r.riesgos.length, contenido: <ListaSimple puntos={r.riesgos} icono="warning" /> },
          {
            id: 'falta',
            etiqueta: t('comun.faltaSaber'),
            icono: 'help',
            cuenta: r.faltaSaber.length,
            contenido: (
              <>
                <ListaSimple puntos={r.faltaSaber} icono="help" />
                <p className={estilos.apoyoTarjeta}>{t('rotacion.reviseTecnico')}</p>
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
  const { t } = useTranslation()
  const idioma = useIdioma()
  return (
    <details className={estilos.expandible}>
      <summary className="capa-estado">
        <span className={estilos.iconoLista}>
          <Icono nombre="science" tamano={24} />
        </span>
        <span className={estilos.textoElemento}>
          <span className={estilos.titularElemento}>{t('rotacion.deDonde')}</span>
          <span className={estilos.apoyoElemento}>
            {t('rotacion.fuentesResumen', { modelo: d.punto.modelo, fecha: fechaEnPalabras(d.punto.fechaBase, idioma), confianza: t(`confianza.${r.confianza}`) })}
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
  const idioma = useIdioma()
  const analisis = useAnalisis(d.entrada, r.id, d.punto.fechaBase)
  const resumen = resumenRapido(d, r.id)
  const contexto = useMemo(
    () => ({
      ...armarContexto({ vista: 'cultivos', cultivoId: estado.cultivoId, edadSemanas: estado.edadSemanas, zonaId: estado.zonaId, idioma }),
      consulta: { entrada: d.entrada, rotacionId: r.id },
    }),
    [estado.cultivoId, estado.edadSemanas, estado.zonaId, d.entrada, r.id, idioma],
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
      <PanelAnalisis analisis={analisis} resumen={resumen}>
        {analisis.fase === 'listo' && (
          <ChatSeguimiento integrado contexto={contexto} respaldo={(pregunta) => respuestaRapida(d, r.id, pregunta)} />
        )}
      </PanelAnalisis>
    </>
  )
}

export default function Rotacion() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const entrada = entradaDe(useEstadoApp(), useIdioma())
  const decision = useDecision(entrada)

  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [id])

  const rotacion = decision.estado === 'listo' ? buscarRotacion(decision.decision, id) : null

  return (
    <div className="pantalla">
      <article className={estilos.medio} aria-busy={decision.estado === 'calculando'}>
        <div className={estilos.barra}>
          <BotonIcono icono="arrow_back" etiqueta={t('rotacion.volver')} to="/" />
          <span className={estilos.barraTitulo}>{t('rotacion.titulo')}</span>
        </div>
        {decision.estado === 'sin_datos' && (
          <p className={estilos.estado}>{t('rotacion.primeroConteste')}</p>
        )}
        {decision.estado === 'calculando' && (
          <p className={estilos.estado} role="status">
            {t('comun.calculando')}
          </p>
        )}
        {decision.estado === 'error' && <p className={estilos.estado}>{t('comun.errorPronostico')}</p>}
        {decision.estado === 'listo' && !rotacion && (
          <p className={estilos.estado}>{t('rotacion.yaNoEsta')}</p>
        )}
        {decision.estado === 'listo' && rotacion && <Contenido key={rotacion.id} d={decision.decision} r={rotacion} />}
      </article>
    </div>
  )
}
