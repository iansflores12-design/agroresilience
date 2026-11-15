import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useIdioma } from '../../i18n'
import { nombreCultivo, nombreEtapa } from '../../i18n/dominio'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Heroe } from '../../componentes/Heroe'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import { Medidor } from '../../componentes/Medidor'
import { nivelDePercentil } from '../../componentes/nivelMedidor'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarCultivo, etapaEnSemana } from '../../datos/cultivos'
import {
  fechaGeneracion,
  fuentes as fuentesBase,
  humedadPorcentaje,
  type Zona,
} from '../../datos/zonas'
import { coordenadas } from '../../componentes/mapa/formato'
import { acidez, claveEstadoHumedad, decimal, fechaLarga, hace, texturaUsda } from './formato'
import { GraficaHumedad } from './GraficaHumedad'
import estilos from './Zona.module.css'

export interface PropsHojaZona {
  zona: Zona
  cultivoId: string | null
  edadSemanas: number
  fuentes?: Record<string, string>
  alCopiar?: () => void
}

function Ficha({
  icono,
  tono,
  titulo,
  children,
}: {
  icono: NombreIcono
  tono: 'agua' | 'tierra'
  titulo: string
  children: ReactNode
}) {
  return (
    <Tarjeta como="article" variante="relleno" className={estilos.ficha}>
      <h3 className={estilos.tituloFicha}>
        <span className={`${estilos.icono} ${estilos[tono]}`}>
          <Icono nombre={icono} tamano={22} />
        </span>
        {titulo}
      </h3>
      {children}
    </Tarjeta>
  )
}

function SinLectura({ razon }: { razon: string }) {
  const { t } = useTranslation()
  return (
    <>
      <p className={estilos.valor}>{t('zona.sinLectura')}</p>
      <p className="tipo-nota">{razon}</p>
    </>
  )
}

/** Lluvia frente a lo normal, en palabras. */
function compararLluvia(t: TFunction, valor: number, normal: number | null): string {
  if (normal === null || normal <= 0) return t('zona.sinNormal')
  const razon = valor / normal
  if (razon >= 2) return t('zona.masDelDoble', { normal: decimal(normal) })
  const dif = Math.round((razon - 1) * 100)
  if (Math.abs(dif) < 5) return t('zona.igualNormal', { normal: decimal(normal) })
  return t(dif > 0 ? 'zona.masQueNormal' : 'zona.menosQueNormal', { pct: Math.abs(dif), normal: decimal(normal) })
}

/** Hoja de informacion de una zona: respuesta, numero, grafica, fichas y cultivo. Solo presenta datos. */
export function HojaZona({ zona, cultivoId, edadSemanas, fuentes = fuentesBase, alCopiar }: PropsHojaZona) {
  const { t } = useTranslation()
  const idioma = useIdioma()
  const sinFuente = t('comun.sinFuente')
  const { humedad, lluvia30d, temperatura, suelo } = zona
  const pct = humedadPorcentaje(zona)
  const cultivo = buscarCultivo(cultivoId)
  const etapa = cultivo ? etapaEnSemana(cultivo, edadSemanas) : null
  const estado = claveEstadoHumedad(zona)

  const notaHumedad = humedad
    ? [
        humedad.normal === null ? null : t('zona.normalFechas', { pct: decimal(humedad.normal * 100) }),
        t('zona.medido', { cuando: hace(humedad.fecha, fechaGeneracion, idioma).toLowerCase() }),
      ]
        .filter(Boolean)
        .join('. ')
    : undefined

  return (
    <div className={estilos.hoja}>
      <div className={estilos.columnaPrincipal}>
        <section className={estilos.humedad} aria-label={t('zona.humedadSuelo')}>
          {humedad && (
            <div className={estilos.respuesta}>
              <Medidor nivel={nivelDePercentil(humedad.percentil)} grande />
              <p className={estilos.frase}>{t(`zona.frase.${estado}`)}</p>
            </div>
          )}
          {pct !== null ? (
            <Heroe valor={decimal(pct)} unidad={t('zona.aguaTierra')} nota={notaHumedad} />
          ) : (
            <Heroe
              valor={t('zona.sinLectura')}
              unidad={t('zona.humedadTierra')}
              nota={t('zona.sinLecturaLugar')}
            />
          )}
          {humedad && (
            <Tarjeta variante="contorno" className={estilos.tarjetaGrafica}>
              <h2 className="tipo-titulo">{t('zona.ultimos4')}</h2>
              <GraficaHumedad serie={humedad.serie} normal={humedad.normal} />
            </Tarjeta>
          )}
        </section>
      </div>

      <div className={estilos.columnaLateral}>
        <section className={estilos.fichas} aria-label={t('zona.otrosDatos')}>
          <Ficha icono="rainy" tono="agua" titulo={t('zona.lluvia')}>
            {lluvia30d ? (
              <>
                <p className={estilos.valor}>{t('zona.lluvia30', { mm: decimal(lluvia30d.valor_mm, 0) })}</p>
                <p className="tipo-nota">{compararLluvia(t, lluvia30d.valor_mm, lluvia30d.normal_mm)}</p>
              </>
            ) : (
              <SinLectura razon={t('zona.sinLluvia')} />
            )}
          </Ficha>

          <Ficha icono="thermostat" tono="tierra" titulo={t('zona.temperatura')}>
            {temperatura ? (
              <p className={estilos.valor}>{t('zona.tempSemana', { c: decimal(temperatura.valor_c, 0) })}</p>
            ) : (
              <SinLectura razon={t('zona.sinTemp')} />
            )}
          </Ficha>

          <Ficha icono="landscape" tono="tierra" titulo={t('zona.tipoTierra')}>
            {suelo ? (
              <p className={estilos.valor}>
                {texturaUsda(suelo.arena_pct, suelo.limo_pct, suelo.arcilla_pct, idioma)}, pH {decimal(suelo.ph)},{' '}
                {acidez(suelo.ph, idioma)}
              </p>
            ) : (
              <SinLectura razon={t('zona.sinSuelo')} />
            )}
          </Ficha>
        </section>

        {cultivo && etapa ? (
          <Tarjeta variante="elevada" className={estilos.cultivo}>
            <p className={estilos.valor}>
              {t('zona.cultivoSemana', { cultivo: nombreCultivo(t, cultivo.id), semana: edadSemanas, etapa: nombreEtapa(t, cultivo.id, etapa).toLowerCase() })}
            </p>
            <p>{t(`zona.sensibilidad.${etapa.sensibilidadAgua}`)}</p>
            <p className="tipo-nota">{t('zona.referencia')}</p>
          </Tarjeta>
        ) : (
          <Tarjeta variante="elevada" className={estilos.sinCultivo}>
            <p className={estilos.valor}>{t('zona.sinCultivo')}</p>
            <Chip to="/" icono="grass">
              {t('contexto.elegirCultivo')}
            </Chip>
          </Tarjeta>
        )}

        <details className={estilos.detalles}>
          <summary>{t('zona.verFuentes')}</summary>
          <ul className={estilos.fuentes}>
            <li>
              <strong>{t('zona.fHumedad')}</strong> {fuentes.humedad ?? sinFuente}.
              {humedad && t('zona.fLectura', { fecha: fechaLarga(humedad.fecha, idioma), n: humedad.muestras })}
              {humedad?.percentil != null && t('zona.fPercentil', { p: decimal(humedad.percentil, 0) })}
              {t('zona.fCinco')}
            </li>
            <li>
              <strong>{t('zona.fLluvia')}</strong> {fuentes.lluvia ?? sinFuente}.
              {lluvia30d && t('zona.fHasta', { fecha: fechaLarga(lluvia30d.hasta, idioma) })}
            </li>
            <li>
              <strong>{t('zona.fTemperatura')}</strong> {fuentes.temperatura ?? sinFuente}.
              {temperatura && t('zona.fHasta', { fecha: fechaLarga(temperatura.hasta, idioma) })}
            </li>
            <li>
              <strong>{t('zona.fTierra')}</strong> {fuentes.suelo ?? sinFuente}.
              {t('zona.fTierraNota')}
              {suelo && t('zona.fTextura', { arena: decimal(suelo.arena_pct), limo: decimal(suelo.limo_pct), arcilla: decimal(suelo.arcilla_pct) })}
            </li>
            <li>
              <strong>{t('zona.fUbicacion')}</strong> {coordenadas(zona.lat, zona.lon, idioma)}.
            </li>
          </ul>
        </details>

        {alCopiar && (
          <div className={estilos.acciones}>
            <Boton to="/chat?desde=zona" icono="forum">
              {t('zona.preguntar')}
            </Boton>
            <Boton variante="tonal" icono="content_copy" onClick={alCopiar}>
              {t('zona.copiar')}
            </Boton>
          </div>
        )}
      </div>
    </div>
  )
}
