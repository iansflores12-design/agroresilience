import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { nombreCultivo, nombreParte, nombreRotacionMapa, textosAptitud } from '../../i18n/dominio'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { Tarjeta } from '../../componentes/Tarjeta'
import { clases } from '../../componentes/clases'
import { NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { Partes } from '../../componentes/mapa/Partes'
import type { RotacionPuntuada } from '../../datos/aptitud'
import estilos from './Rotaciones.module.css'

function tipo(t: TFunction, r: RotacionPuntuada): string {
  if (r.actual) return t('comun.loQueHaceHoy')
  return r.mejor ? t('rotacionesMapa.laMejor') : t('rotacionesMapa.otra')
}

function comparacion(t: TFunction, r: RotacionPuntuada): string {
  if (r.actual) return t('rotacionesMapa.sirveComparar')
  if (r.diferencia > 0) return t('rotacionesMapa.masQueRepetir', { n: r.diferencia })
  if (r.diferencia < 0) return t('rotacionesMapa.menosQueRepetir', { n: -r.diferencia })
  return t('rotacionesMapa.igualQueRepetir')
}

function Lista({ titulo, puntos }: { titulo: string; puntos: string[] }) {
  return (
    <div className={estilos.lista}>
      <h4 className={estilos.subtitulo}>{titulo}</h4>
      <ul>
        {puntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function Detalle({ rotacion: r }: { rotacion: RotacionPuntuada }) {
  const { t } = useTranslation()
  const nombre = nombreRotacionMapa(t, r)
  const textos = textosAptitud(t, r.id)
  return (
    <Tarjeta como="article" variante="elevada" id="detalle-rotacion" className={estilos.detalle} aria-labelledby="titulo-detalle-rotacion">
      <div className={estilos.cabecera}>
        <h3 id="titulo-detalle-rotacion" className="tipo-titulo">
          {nombre}
        </h3>
        <NivelAptitud nivel={r.nivel} grande />
        <p className={estilos.puntos}>{t('comun.deCien', { valor: r.total })}</p>
      </div>
      <p className={estilos.resumen}>
        {comparacion(t, r)}{' '}
        {t('rotacionesMapa.loMejor', { fuerte: nombreParte(t, r.fuerte).toLowerCase(), debil: nombreParte(t, r.debil).toLowerCase() })}
      </p>

      <div className={estilos.columnas}>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>{t('rotacionesMapa.cuandoSiembra')}</h4>
          <ol className={estilos.pasos}>
            {r.pasos.map((paso) => (
              <li key={paso.temporada} className={estilos.paso}>
                <span className={estilos.iconoPaso}>
                  <Icono nombre={paso.temporada === 'primera' ? 'rainy' : 'water_drop'} tamano={22} />
                </span>
                <span className={estilos.textoPaso}>
                  <span className={estilos.nombrePaso}>{nombreCultivo(t, paso.cultivo.id)}</span>
                  <span className="tipo-nota">
                    {t('rotacionesMapa.pasoNota', { meses: t(`temporadas.${paso.temporada}.texto`), n: paso.cultivo.cicloSemanas })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>{t('rotacionesMapa.puntajePartes')}</h4>
          <Partes partes={r.partes} etiqueta={t('rotacionesMapa.partesDe', { nombre })} />
        </div>
      </div>

      <div className={estilos.columnas}>
        <Lista titulo={t('comun.aFavor')} puntos={textos.ventajas} />
        <Lista titulo={t('rotacionesMapa.tengaCuidado')} puntos={textos.riesgos} />
        <Lista titulo={t('comun.faltaSaber')} puntos={textos.falta} />
      </div>
      <p className="tipo-nota">{t('rotacionesMapa.confianza', { confianza: t(`confianza.${r.confianza}`) })}</p>
    </Tarjeta>
  )
}

/** Tarjetas de que sembrar despues. Al tocar una se abre su detalle debajo; al tocarla otra vez se cierra. */
export function Rotaciones({ rotaciones }: { rotaciones: RotacionPuntuada[] }) {
  const { t } = useTranslation()
  const [abiertaId, fijarAbierta] = useState<string | null>(null)
  const abierta = rotaciones.find((r) => r.id === abiertaId) ?? null

  return (
    <>
      <ul className={estilos.tarjetas}>
        {rotaciones.map((r) => {
          const elegida = r.id === abierta?.id
          return (
            <li key={r.id}>
              <Control
                className={clases(estilos.tarjeta, elegida && estilos.tarjetaElegida, 'capa-estado')}
                aria-expanded={elegida}
                aria-controls={elegida ? 'detalle-rotacion' : undefined}
                onClick={() => fijarAbierta(elegida ? null : r.id)}
              >
                <span className="tipo-nota">{tipo(t, r)}</span>
                <span className={estilos.nombre}>{nombreRotacionMapa(t, r)}</span>
                <span className={estilos.pie}>
                  <NivelAptitud nivel={r.nivel} />
                  <span className={estilos.puntos}>{t('comun.deCien', { valor: r.total })}</span>
                </span>
                <span className={estilos.flecha}>
                  <Icono nombre="expand_more" />
                </span>
              </Control>
            </li>
          )
        })}
      </ul>
      {abierta ? <Detalle rotacion={abierta} /> : <p className={estilos.ayuda}>{t('rotacionesMapa.toqueOpcion')}</p>}
    </>
  )
}
