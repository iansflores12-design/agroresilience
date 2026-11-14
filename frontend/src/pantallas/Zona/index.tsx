import { useEffect, useRef } from 'react'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Tarjeta } from '../../componentes/Tarjeta'
import { EspacioFenomeno } from '../../componentes/fenomeno/EspacioFenomeno'
import { nombreCorto } from '../../componentes/mapa/formato'
import { buscarZona, fechaGeneracion, fuentes, zonas } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { diasEntre } from './formato'
import { HojaZona } from './HojaZona'
import { textoResumen } from './resumen'
import estilos from './Zona.module.css'

/** Dias de antiguedad de la lectura de humedad a partir de los cuales se avisa. */
const DIAS_LECTURA_ANTIGUA = 7

export default function Zona() {
  const { zonaId, cultivoId, edadSemanas, elegirZona } = useEstadoApp()
  const zona = buscarZona(zonaId)
  const selectorRef = useRef<HTMLDivElement>(null)
  const zonaAvisada = useRef<string | null>(null)

  // En compacta la fila de zonas se desplaza: lleva el chip elegido a la vista.
  useEffect(() => {
    const contenedor = selectorRef.current
    if (!zonaId || !contenedor) return
    const elegido = Array.from(contenedor.querySelectorAll<HTMLElement>('[data-zona]')).find(
      (el) => el.dataset.zona === zonaId,
    )
    if (!elegido || typeof elegido.scrollIntoView !== 'function') return
    const reducido =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    elegido.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducido ? 'auto' : 'smooth' })
  }, [zonaId])

  const idZona = zona?.id ?? null
  const fechaLectura = zona?.humedad?.fecha ?? null
  useEffect(() => {
    if (!idZona || !fechaLectura || zonaAvisada.current === idZona) return
    const dias = diasEntre(fechaLectura, fechaGeneracion)
    if (dias > DIAS_LECTURA_ANTIGUA) {
      zonaAvisada.current = idZona
      avisar.alerta({
        titulo: 'Lectura de humedad antigua',
        descripcion: `La última lectura de ${nombreCorto(zona?.nombre ?? '')} es de hace ${dias} días.`,
      })
    }
  }, [idZona, fechaLectura, zona?.nombre])

  async function copiarResumen() {
    if (!zona) return
    try {
      await navigator.clipboard.writeText(textoResumen(zona, fuentes))
      avisar.exito({ titulo: 'Resumen copiado' })
    } catch {
      avisar.error({ titulo: 'No se pudo copiar', descripcion: 'El navegador no permitió usar el portapapeles.' })
    }
  }

  return (
    <div className={`pantalla ${estilos.pantalla}`}>
      <div className={`plano-medio ${estilos.contenido}`}>
        <h1 className={estilos.pregunta}>
          {zona ? `¿Cómo está la tierra en ${nombreCorto(zona.nombre)}?` : '¿Cómo está la tierra?'}
        </h1>
        <div role="group" aria-label="Elegir lugar" className={estilos.selector} ref={selectorRef}>
          {zonas.map((z) => (
            <span key={z.id} data-zona={z.id}>
              <Chip variante="filtro" seleccionado={z.id === zonaId} onClick={() => elegirZona(z.id)}>
                {z.nombre}
              </Chip>
            </span>
          ))}
        </div>

        {zona ? (
          <HojaZona
            zona={zona}
            cultivoId={cultivoId}
            edadSemanas={edadSemanas}
            fuentes={fuentes}
            alCopiar={copiarResumen}
          />
        ) : (
          <Tarjeta className={estilos.vacio}>
            <h2 className="tipo-titulo">Aún no eligió un lugar</h2>
            <p className="tipo-nota">Elija un lugar arriba, o en el mapa, para ver cómo está su tierra.</p>
            <Boton variante="tonal" icono="map" to="/mapa">
              Ver el mapa
            </Boton>
          </Tarjeta>
        )}

        <EspacioFenomeno zona={zona} cultivoId={cultivoId} />
      </div>
    </div>
  )
}
