import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buscarCultivo } from '../datos/cultivos'
import { buscarZona } from '../datos/zonas'
import { useEstadoApp } from '../estado/EstadoApp'
import { nombreCultivo } from '../i18n/dominio'
import { Chip } from './Chip'
import { PreguntaContexto } from './PreguntaContexto'
import estilos from './TiraContexto.module.css'

/**
 * Dice en palabras completas el cultivo y el lugar elegidos. Cada chip abre a pantalla completa la
 * misma pregunta del cuestionario; al contestarla se vuelve a la pantalla de antes, ya actualizada.
 */
export function TiraContexto() {
  const { t } = useTranslation()
  const { cultivoId, zonaId, temporada, parcela } = useEstadoApp()
  const [abierta, fijarAbierta] = useState<'cultivoId' | 'zonaId' | null>(null)
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
      <Chip icono="grass" aria-label={ariaCultivo} aria-haspopup="dialog" onClick={() => fijarAbierta('cultivoId')}>
        {textoCultivo}
      </Chip>
      <Chip
        icono={conParcela ? 'my_location' : 'location_on'}
        aria-label={ariaLugar}
        aria-haspopup="dialog"
        onClick={() => fijarAbierta('zonaId')}
      >
        {conParcela ? t('contexto.suParcela') : zona ? zona.nombre : t('contexto.elegirLugar')}
      </Chip>
      <PreguntaContexto clave={abierta} alCerrar={() => fijarAbierta(null)} />
    </div>
  )
}
