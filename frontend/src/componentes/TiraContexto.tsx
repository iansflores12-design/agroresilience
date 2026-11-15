import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buscarCultivo } from '../datos/cultivos'
import { buscarZona } from '../datos/zonas'
import { useEstadoApp } from '../estado/EstadoApp'
import { nombreCultivo } from '../i18n/dominio'
import { CULTIVOS, LUGARES } from '../lib/decision/parametros'
import { Chip } from './Chip'
import { MenuContexto } from './MenuContexto'
import estilos from './TiraContexto.module.css'

/**
 * Dice en palabras completas el cultivo y el lugar elegidos. Cada chip abre una hoja para
 * cambiarlo ahí mismo: la pantalla en la que se está se actualiza sin ir a otra.
 */
export function TiraContexto() {
  const { t } = useTranslation()
  const { cultivoId, zonaId, temporada, parcela, elegirCultivo, elegirZona } = useEstadoApp()
  const [abierto, fijarAbierto] = useState<'cultivo' | 'lugar' | null>(null)
  const cultivo = buscarCultivo(cultivoId)
  const zona = buscarZona(zonaId)
  const textoCultivo = cultivo
    ? temporada
      ? t('contexto.cultivoDeTemporada', {
          cultivo: nombreCultivo(t, cultivo.id),
          temporada: t(`temporadas.${temporada}.nombre`).toLowerCase(),
        })
      : nombreCultivo(t, cultivo.id)
    : t('contexto.elegirCultivo')
  const ariaCultivo = cultivo ? t('contexto.cultivoAria', { cultivo: nombreCultivo(t, cultivo.id) }) : t('contexto.sinCultivoAria')
  const conParcela = Boolean(zona && parcela)
  const ariaLugar = conParcela
    ? t('contexto.suParcelaAria', { lugar: zona!.nombre })
    : zona
      ? t('contexto.lugarAria', { lugar: zona.nombre })
      : t('contexto.sinLugarAria')

  return (
    <div className={estilos.tira} role="group" aria-label={t('contexto.grupo')}>
      <Chip icono="grass" aria-label={ariaCultivo} aria-haspopup="dialog" onClick={() => fijarAbierto('cultivo')}>
        {textoCultivo}
      </Chip>
      <Chip
        icono={conParcela ? 'my_location' : 'location_on'}
        aria-label={ariaLugar}
        aria-haspopup="dialog"
        onClick={() => fijarAbierto('lugar')}
      >
        {conParcela ? t('contexto.suParcela') : zona ? zona.nombre : t('contexto.elegirLugar')}
      </Chip>
      <MenuContexto
        abierto={abierto === 'cultivo'}
        titulo={t('contexto.tituloCultivo')}
        opciones={Object.keys(CULTIVOS).map((id) => ({ id, nombre: nombreCultivo(t, id) }))}
        elegida={cultivoId}
        alElegir={elegirCultivo}
        alCerrar={() => fijarAbierto(null)}
      />
      <MenuContexto
        abierto={abierto === 'lugar'}
        titulo={t('contexto.tituloLugar')}
        opciones={Object.entries(LUGARES).map(([id, l]) => ({ id, nombre: l.nombre }))}
        elegida={zonaId}
        alElegir={elegirZona}
        alCerrar={() => fijarAbierto(null)}
        enlace={{ texto: t('contexto.elegirEnMapa'), to: '/mapa' }}
      />
    </div>
  )
}
