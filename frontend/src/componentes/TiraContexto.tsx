import { useTranslation } from 'react-i18next'
import { buscarCultivo } from '../datos/cultivos'
import { buscarZona } from '../datos/zonas'
import { useEstadoApp } from '../estado/EstadoApp'
import { nombreCultivo } from '../i18n/dominio'
import { Chip } from './Chip'
import estilos from './TiraContexto.module.css'

/** Dice en palabras completas el cultivo y el lugar elegidos. Cada chip lleva a donde se elige. */
export function TiraContexto() {
  const { t } = useTranslation()
  const { cultivoId, zonaId, temporada, parcela } = useEstadoApp()
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
  const ariaCultivo = cultivo ? t('contexto.cultivoAria', { cultivo: textoCultivo }) : t('contexto.sinCultivoAria')

  if (zona && parcela) {
    return (
      <div className={estilos.tira} role="group" aria-label={t('contexto.grupo')}>
        <Chip to="/" icono="grass" aria-label={cultivo ? t('contexto.cultivoAria', { cultivo: nombreCultivo(t, cultivo.id) }) : ariaCultivo}>
          {textoCultivo}
        </Chip>
        <Chip to="/" icono="my_location" aria-label={t('contexto.suParcelaAria', { lugar: zona.nombre })}>
          {t('contexto.suParcela')}
        </Chip>
      </div>
    )
  }
  return (
    <div className={estilos.tira} role="group" aria-label={t('contexto.grupo')}>
      <Chip to="/" icono="grass" aria-label={ariaCultivo}>
        {textoCultivo}
      </Chip>
      <Chip
        to="/mapa"
        icono="location_on"
        aria-label={zona ? t('contexto.lugarAria', { lugar: zona.nombre }) : t('contexto.sinLugarAria')}
      >
        {zona ? zona.nombre : t('contexto.elegirLugar')}
      </Chip>
    </div>
  )
}
