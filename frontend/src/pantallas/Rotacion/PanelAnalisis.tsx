import { useEffect, useRef } from 'react'
import { Boton } from '../../componentes/Boton'
import { Icono } from '../../componentes/Icono'
import { textoCausa, type EstadoAnalisis } from '../../lib/decision/estadoAnalisis'
import { avisar } from '../../lib/avisos'
import estilos from './Rotacion.module.css'

function Pasos({ pasos, activo }: { pasos: EstadoAnalisis['pasos']; activo: boolean }) {
  return (
    <ol className={estilos.pasosVivo} aria-label="Lo que se está haciendo">
      {pasos.map((p) => (
        <li key={p.id} className={p.hecho ? estilos.pasoHecho : estilos.pasoActivo}>
          <Icono nombre={p.hecho || !activo ? 'check' : 'hourglass_top'} tamano={20} />
          {p.texto}
        </li>
      ))}
    </ol>
  )
}

/**
 * El analisis a fondo de Gemini segun la linea de tiempo:
 * pasos en vivo, analisis en vivo o resumen rapido, analisis listo y reintento si falla.
 */
export function PanelAnalisis({ analisis, resumen }: { analisis: EstadoAnalisis & { reintentar: () => void }; resumen: string }) {
  const { fase, pasos, texto, causa, llegoTarde, guardado, reintentar } = analisis
  const ancla = useRef<HTMLElement>(null)

  // Lento: cuando Gemini termina despues del resumen rapido, se avisa con el siguiente paso.
  useEffect(() => {
    if (fase !== 'listo' || !llegoTarde) return
    avisar.exito({
      titulo: 'Análisis a fondo listo',
      descripcion: 'Gemini terminó de revisar esta rotación.',
      accion: { texto: 'Ver', alPulsar: () => ancla.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    })
  }, [fase, llegoTarde])

  return (
    <section ref={ancla} className={estilos.analisis} aria-labelledby="titulo-analisis" aria-busy={fase === 'pasos' || fase === 'escribiendo' || fase === 'resumen'}>
      <h2 id="titulo-analisis" className="tipo-titulo">
        Análisis a fondo
      </h2>

      {fase === 'pasos' && <Pasos pasos={pasos} activo />}

      {fase === 'escribiendo' && (
        <>
          <Pasos pasos={pasos} activo />
          <p className={estilos.textoGemini} aria-live="polite">
            {texto}
            <span className={estilos.cursor} aria-hidden="true" />
          </p>
        </>
      )}

      {fase === 'resumen' && (
        <>
          <p className={estilos.etiquetaResumen}>Resumen rápido</p>
          <p className={estilos.textoGemini}>{resumen}</p>
          <p className={estilos.esperando} role="status">
            <Icono nombre="hourglass_top" tamano={20} />
            Gemini sigue preparando el análisis a fondo. Le avisamos cuando esté.
          </p>
        </>
      )}

      {fase === 'listo' && (
        <>
          <p className={estilos.etiquetaResumen}>
            {guardado ? 'Análisis de Gemini (guardado en este teléfono)' : 'Análisis de Gemini'}
          </p>
          <p className={estilos.textoGemini}>{texto}</p>
        </>
      )}

      {fase === 'fallo' && (
        <>
          <p className={estilos.etiquetaResumen}>Resumen rápido</p>
          <p className={estilos.textoGemini}>{resumen}</p>
          <div className={estilos.fallo} role="alert">
            <Icono nombre="info" tamano={20} />
            <span>{textoCausa(causa)} Este intento no cuenta en su límite del día.</span>
          </div>
          {causa !== 'cuota_local' && (
            <Boton variante="tonal" icono="refresh" onClick={reintentar} className={estilos.reintentar}>
              Reintentar
            </Boton>
          )}
        </>
      )}
    </section>
  )
}
