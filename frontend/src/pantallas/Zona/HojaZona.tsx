import type { ReactNode } from 'react'
import { Boton } from '../../componentes/Boton'
import { Chip } from '../../componentes/Chip'
import { Heroe } from '../../componentes/Heroe'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarCultivo, etapaEnSemana } from '../../datos/cultivos'
import { estadoHumedad, fuentes as fuentesBase, humedadPorcentaje, type Zona } from '../../datos/zonas'
import { decimal, fechaLarga } from './formato'
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
          <Icono nombre={icono} tamano={18} />
        </span>
        {titulo}
      </h3>
      {children}
    </Tarjeta>
  )
}

function SinLectura({ razon }: { razon: string }) {
  return (
    <>
      <p className={estilos.valor}>Sin lectura</p>
      <p className="tipo-nota">{razon}</p>
    </>
  )
}

/** Comparacion de la lluvia con lo normal, sin mezclarla con otros datos. */
function compararLluvia(valor: number, normal: number | null): string {
  if (normal === null) return 'Sin normal histórica para comparar.'
  const base = `Normal para la época: ${decimal(normal)} mm`
  if (normal <= 0) return `${base}.`
  const dif = Math.round(((valor - normal) / normal) * 100)
  if (dif === 0) return `${base} (igual a lo normal).`
  return `${base} (${Math.abs(dif)} % ${dif > 0 ? 'sobre' : 'bajo'} lo normal).`
}

/** Hoja de informacion de una zona: humedad, grafica, fichas y cultivo. Solo presenta datos. */
export function HojaZona({ zona, cultivoId, edadSemanas, fuentes = fuentesBase, alCopiar }: PropsHojaZona) {
  const { humedad, lluvia30d, temperatura, suelo } = zona
  const pct = humedadPorcentaje(zona)
  const cultivo = buscarCultivo(cultivoId)
  const etapa = cultivo ? etapaEnSemana(cultivo, edadSemanas) : null

  const nota = humedad
    ? [
        estadoHumedad(zona),
        humedad.normal === null ? null : `Normal para la época: ${decimal(humedad.normal * 100)} %`,
        `Lectura del ${fechaLarga(humedad.fecha)}`,
        `Fuente: ${fuentes.humedad ?? 'sin fuente'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <div className={estilos.hoja}>
      <section className={estilos.humedad} aria-label="Humedad del suelo">
        {pct !== null ? (
          <Heroe valor={decimal(pct)} unidad="% de agua en el suelo (0 a 5 cm)" nota={nota} />
        ) : (
          <Heroe
            valor="Sin lectura"
            unidad="Humedad del suelo (0 a 5 cm)"
            nota="No hay lectura de humedad SMAP para esta zona en los datos procesados."
          />
        )}
        {humedad && (
          <Tarjeta variante="contorno" className={estilos.tarjetaGrafica}>
            <h2 className="tipo-titulo">Últimos 120 días</h2>
            <GraficaHumedad serie={humedad.serie} normal={humedad.normal} />
          </Tarjeta>
        )}
      </section>

      <section className={estilos.fichas} aria-label="Otros datos de la zona">
        <Ficha icono="rainy" tono="agua" titulo="Lluvia de 30 días">
          {lluvia30d ? (
            <>
              <p className={estilos.valor}>{decimal(lluvia30d.valor_mm)} mm</p>
              <p className="tipo-nota">{compararLluvia(lluvia30d.valor_mm, lluvia30d.normal_mm)}</p>
              <p className="tipo-nota">
                Hasta el {fechaLarga(lluvia30d.hasta)} · Fuente: {fuentes.lluvia ?? 'sin fuente'}
              </p>
            </>
          ) : (
            <SinLectura razon="No hay datos de lluvia para esta zona en los datos procesados." />
          )}
        </Ficha>

        <Ficha icono="thermostat" tono="tierra" titulo="Temperatura">
          {temperatura ? (
            <>
              <p className={estilos.valor}>{decimal(temperatura.valor_c)} °C</p>
              <p className="tipo-nota">Media de 7 días</p>
              <p className="tipo-nota">
                Hasta el {fechaLarga(temperatura.hasta)} · Fuente: {fuentes.temperatura ?? 'sin fuente'}
              </p>
            </>
          ) : (
            <SinLectura razon="No hay datos de temperatura para esta zona en los datos procesados." />
          )}
        </Ficha>

        <Ficha icono="landscape" tono="tierra" titulo="Suelo">
          {suelo ? (
            <>
              <p className={estilos.valor}>
                Arena {decimal(suelo.arena_pct)} % · Limo {decimal(suelo.limo_pct)} % · Arcilla{' '}
                {decimal(suelo.arcilla_pct)} %
              </p>
              <p className={estilos.valor}>pH {decimal(suelo.ph)}</p>
              <p className="tipo-nota">Punto de SoilGrids más cercano con datos; no está verificado como agrícola.</p>
              <p className="tipo-nota">Fuente: {fuentes.suelo ?? 'sin fuente'}</p>
            </>
          ) : (
            <SinLectura razon="No hay datos de suelo para esta zona en los datos procesados." />
          )}
        </Ficha>
      </section>

      {cultivo && etapa && (
        <p className={estilos.cultivo}>
          <strong>{cultivo.nombre}</strong>, semana {edadSemanas} · {etapa.nombre} · Sensibilidad a la falta de agua:{' '}
          {etapa.sensibilidadAgua}
          <span className="tipo-nota"> Referencia, pendiente de validación agronómica.</span>
        </p>
      )}

      {!cultivo && (
        <div className={estilos.sinCultivo}>
          <p className={estilos.cultivo}>Sin cultivo elegido. Con un cultivo, la hoja suma su etapa.</p>
          <Chip to="/" icono="grass">
            Elegir cultivo
          </Chip>
        </div>
      )}

      {alCopiar && (
        <div>
          <Boton variante="tonal" icono="content_copy" onClick={alCopiar}>
            Copiar resumen
          </Boton>
        </div>
      )}
    </div>
  )
}
