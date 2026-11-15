import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdioma } from '../../i18n'
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
  const { t } = useTranslation()
  const idioma = useIdioma()
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
        titulo: t('zona.humedadAntigua'),
        descripcion: t('zona.ultimaLectura', { lugar: nombreCorto(zona?.nombre ?? ''), dias }),
      })
    }
    // El aviso sale una vez por lugar, en el idioma del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idZona, fechaLectura, zona?.nombre])

  async function copiarResumen() {
    if (!zona) return
    try {
      await navigator.clipboard.writeText(textoResumen(zona, fuentes, idioma))
      avisar.exito({ titulo: t('zona.copiado') })
    } catch {
      avisar.error({ titulo: t('zona.noCopiar'), descripcion: t('zona.noPortapapeles') })
    }
  }

  return (
    <div className={`pantalla ${estilos.pantalla}`}>
      <div className={`plano-medio ${estilos.contenido}`}>
        <h1 className={estilos.pregunta}>
          {zona ? t('zona.comoEstaEn', { lugar: nombreCorto(zona.nombre) }) : t('zona.comoEsta')}
        </h1>
        <div role="group" aria-label={t('zona.elegirLugar')} className={estilos.selector} ref={selectorRef}>
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
            <h2 className="tipo-titulo">{t('zona.aunNo')}</h2>
            <p className="tipo-nota">{t('zona.elijaArriba')}</p>
            <Boton variante="tonal" icono="map" to="/mapa">
              {t('zona.verMapa')}
            </Boton>
          </Tarjeta>
        )}

        <EspacioFenomeno zona={zona} cultivoId={cultivoId} />
      </div>
    </div>
  )
}
