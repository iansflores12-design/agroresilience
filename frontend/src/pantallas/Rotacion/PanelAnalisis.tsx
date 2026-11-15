import { useEffect, useRef } from 'react'
import { Boton } from '../../componentes/Boton'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import { textoCausa, type EstadoAnalisis, type Fase } from '../../lib/decision/estadoAnalisis'
import { avisar } from '../../lib/avisos'
import { Girando } from './Indicadores'
import estilos from './Rotacion.module.css'

const ESTADO: Record<Fase, { texto: string; icono: NombreIcono }> = {
  pasos: { texto: 'Preparando', icono: 'hourglass_top' },
  escribiendo: { texto: 'Escribiendo', icono: 'edit' },
  resumen: { texto: 'Resumen rápido', icono: 'schedule' },
  listo: { texto: 'Listo', icono: 'check_circle' },
  fallo: { texto: 'Resumen rápido', icono: 'info' },
}

function Pasos({ pasos }: { pasos: EstadoAnalisis['pasos'] }) {
  return (
    <ol className={estilos.lista} aria-label="Lo que se está haciendo">
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
  titulo = 'Análisis a fondo',
  apoyo = 'Gemini explica los números; no los cambia.',
  aviso = { titulo: 'Análisis a fondo listo', descripcion: 'Gemini terminó de revisar esta rotación.' },
  espera = 'Gemini sigue preparando el análisis a fondo. Le avisamos cuando esté.',
}: {
  analisis: EstadoAnalisis & { reintentar: () => void }
  resumen: string
  titulo?: string
  apoyo?: string
  /** Aviso que salta cuando el análisis llega después del resumen rápido. */
  aviso?: { titulo: string; descripcion: string }
  espera?: string
}) {
  const { fase, pasos, texto, causa, llegoTarde, guardado, reintentar } = analisis
  const ancla = useRef<HTMLElement>(null)

  useEffect(() => {
    if (fase !== 'listo' || !llegoTarde) return
    avisar.exito({
      titulo: aviso.titulo,
      descripcion: aviso.descripcion,
      accion: { texto: 'Ver', alPulsar: () => ancla.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    })
    // El aviso salta una vez por análisis; sus textos no cambian mientras tanto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, llegoTarde])

  const estado = ESTADO[fase]
  const ocupado = fase === 'pasos' || fase === 'escribiendo' || fase === 'resumen'

  return (
    <section ref={ancla} className={estilos.analisis} aria-labelledby="titulo-analisis" aria-busy={ocupado}>
      <header className={estilos.cabezaAnalisis}>
        <span className={estilos.iconoAnalisis}>
          <Icono nombre="psychiatry" tamano={24} />
        </span>
        <span className={estilos.textoElemento}>
          <h2 id="titulo-analisis" className={estilos.tituloTarjeta}>
            {titulo}
          </h2>
          <span className={estilos.apoyoElemento}>{apoyo}</span>
        </span>
        <span className={estilos.chipEstado}>
          {ocupado && fase !== 'resumen' ? <Girando /> : <Icono nombre={estado.icono} tamano={18} />}
          {guardado && fase === 'listo' ? 'Guardado' : estado.texto}
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
            {espera}
          </p>
        </>
      )}

      {fase === 'listo' && <p className={estilos.textoGemini}>{texto}</p>}

      {fase === 'fallo' && (
        <>
          <p className={estilos.textoGemini}>{resumen}</p>
          <div className={estilos.aviso} role="alert">
            <Icono nombre="info" tamano={24} />
            <span className={estilos.textoElemento}>
              <span>{textoCausa(causa)}</span>
              <span className={estilos.apoyoElemento}>Este intento no cuenta en su límite del día.</span>
            </span>
            {causa !== 'cuota_local' && (
              <Boton variante="texto" icono="refresh" onClick={reintentar}>
                Reintentar
              </Boton>
            )}
          </div>
        </>
      )}
    </section>
  )
}
