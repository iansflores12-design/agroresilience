import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Boton } from '../../componentes/Boton'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import type { EstadoAnalisis, Fase } from '../../lib/decision/estadoAnalisis'
import { avisar } from '../../lib/avisos'
import { Girando } from './Indicadores'
import estilos from './Rotacion.module.css'

const ICONO_FASE: Record<Fase, NombreIcono> = {
  pasos: 'hourglass_top',
  escribiendo: 'edit',
  resumen: 'schedule',
  listo: 'check_circle',
  fallo: 'info',
}

function Pasos({ pasos }: { pasos: EstadoAnalisis['pasos'] }) {
  const { t } = useTranslation()
  return (
    <ol className={estilos.lista} aria-label={t('analisis.loQueSeHace')}>
      {pasos.map((p) => (
        <li key={p.id} className={estilos.elementoCompacto}>
          <span className={estilos.marcaPaso}>{p.hecho ? <Icono nombre="check" tamano={20} /> : <Girando />}</span>
          <span className={p.hecho ? estilos.pasoHecho : estilos.pasoActivo}>{p.texto}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Analisis a fondo de Gemini segun la linea de tiempo: pasos en vivo, texto en vivo o resumen
 * rapido, aviso cuando llega tarde y reintento si falla.
 */
export function PanelAnalisis({
  analisis,
  resumen,
  titulo,
  apoyo,
  aviso,
  espera,
}: {
  analisis: EstadoAnalisis & { reintentar: () => void }
  resumen: string
  /** Los textos opcionales tienen por defecto los del analisis de una rotacion, en el idioma actual. */
  titulo?: string
  apoyo?: string
  /** Aviso que salta cuando el análisis llega después del resumen rápido. */
  aviso?: { titulo: string; descripcion: string }
  espera?: string
}) {
  const { fase, pasos, texto, causa, llegoTarde, guardado, reintentar } = analisis
  const ancla = useRef<HTMLElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    if (fase !== 'listo' || !llegoTarde) return
    avisar.exito({
      titulo: aviso?.titulo ?? t('analisis.listoTitulo'),
      descripcion: aviso?.descripcion ?? t('analisis.listoDescripcion'),
      accion: { texto: t('comun.ver'), alPulsar: () => ancla.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    })
    // El aviso sale una vez, en el idioma del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, llegoTarde])

  const ocupado = fase === 'pasos' || fase === 'escribiendo' || fase === 'resumen'

  return (
    <section ref={ancla} className={estilos.analisis} aria-labelledby="titulo-analisis" aria-busy={ocupado}>
      <header className={estilos.cabezaAnalisis}>
        <span className={estilos.iconoAnalisis}>
          <Icono nombre="psychiatry" tamano={24} />
        </span>
        <span className={estilos.textoElemento}>
          <h2 id="titulo-analisis" className={estilos.tituloTarjeta}>
            {titulo ?? t('analisis.titulo')}
          </h2>
          <span className={estilos.apoyoElemento}>{apoyo ?? t('analisis.explica')}</span>
        </span>
        <span className={estilos.chipEstado}>
          {ocupado && fase !== 'resumen' ? <Girando /> : <Icono nombre={ICONO_FASE[fase]} tamano={18} />}
          {guardado && fase === 'listo' ? t('analisis.guardado') : t(`analisis.fases.${fase}`)}
        </span>
      </header>

      {fase === 'pasos' && <Pasos pasos={pasos} />}

      {fase === 'escribiendo' && (
        <p className={estilos.textoGemini} aria-live="polite">
          {texto}
          <span className={estilos.cursor} aria-hidden="true" />
        </p>
      )}

      {fase === 'resumen' && (
        <>
          <p className={estilos.textoGemini}>{resumen}</p>
          <p className={estilos.nota} role="status">
            <Girando />
            {espera ?? t('analisis.sigue')}
          </p>
        </>
      )}

      {fase === 'listo' && <p className={estilos.textoGemini}>{texto}</p>}

      {/* Sin clave de Gemini en el servidor no hay nada que el productor pueda hacer: se queda
          el resumen rápido, sin aviso ni reintento. */}
      {fase === 'fallo' && causa === 'sin_clave' && <p className={estilos.textoGemini}>{resumen}</p>}

      {fase === 'fallo' && causa !== 'sin_clave' && (
        <>
          <p className={estilos.textoGemini}>{resumen}</p>
          <div className={estilos.aviso} role="alert">
            <Icono nombre="info" tamano={24} />
            <span className={estilos.textoElemento}>
              <span>{t(`analisis.causas.${causa && causa !== 'servidor' ? causa : 'otra'}`)}</span>
              <span className={estilos.apoyoElemento}>{t('analisis.noCuenta')}</span>
            </span>
            {causa !== 'cuota_local' && (
              <Boton variante="texto" icono="refresh" onClick={reintentar}>
                {t('comun.reintentar')}
              </Boton>
            )}
          </div>
        </>
      )}
    </section>
  )
}
