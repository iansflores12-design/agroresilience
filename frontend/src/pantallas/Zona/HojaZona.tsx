import type { ReactNode } from 'react'
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
  estadoHumedad,
  fechaGeneracion,
  fuentes as fuentesBase,
  humedadPorcentaje,
  type Zona,
} from '../../datos/zonas'
import { coordenadas } from '../../componentes/mapa/formato'
import { acidez, decimal, fechaLarga, hace, texturaUsda } from './formato'
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
  return (
    <>
      <p className={estilos.valor}>Sin lectura</p>
      <p className="tipo-nota">{razon}</p>
    </>
  )
}

/** Lluvia frente a lo normal, en palabras. */
function compararLluvia(valor: number, normal: number | null): string {
  if (normal === null || normal <= 0) return 'Sin normal histórica para comparar.'
  const razon = valor / normal
  if (razon >= 2) return `Más del doble de lo normal (${decimal(normal)} mm).`
  const dif = Math.round((razon - 1) * 100)
  if (Math.abs(dif) < 5) return `Igual a lo normal (${decimal(normal)} mm).`
  return `${Math.abs(dif)} % ${dif > 0 ? 'más' : 'menos'} que lo normal (${decimal(normal)} mm).`
}

const FRASE_SENSIBILIDAD = {
  baja: 'Necesita poca agua en esta etapa.',
  media: 'Necesita agua con regularidad en esta etapa.',
  alta: 'Esta etapa es delicada: no le puede faltar agua.',
} as const

const FRASE_ESTADO: Record<string, string> = {
  'Más seca de lo normal': 'Más seca que lo normal para esta época',
  'Dentro de lo normal': 'Normal para esta época',
  'Más húmeda de lo normal': 'Más húmeda que lo normal para esta época',
  'Sin referencia histórica': 'Sin referencia para comparar',
}

/** Hoja de informacion de una zona: respuesta, numero, grafica, fichas y cultivo. Solo presenta datos. */
export function HojaZona({ zona, cultivoId, edadSemanas, fuentes = fuentesBase, alCopiar }: PropsHojaZona) {
  const { humedad, lluvia30d, temperatura, suelo } = zona
  const pct = humedadPorcentaje(zona)
  const cultivo = buscarCultivo(cultivoId)
  const etapa = cultivo ? etapaEnSemana(cultivo, edadSemanas) : null
  const estado = estadoHumedad(zona)

  const notaHumedad = humedad
    ? [
        humedad.normal === null ? null : `Lo normal en estas fechas: ${decimal(humedad.normal * 100)} %`,
        `Medido ${hace(humedad.fecha, fechaGeneracion).toLowerCase()}`,
      ]
        .filter(Boolean)
        .join('. ')
    : undefined

  return (
    <div className={estilos.hoja}>
      <div className={estilos.columnaPrincipal}>
        <section className={estilos.humedad} aria-label="Humedad del suelo">
          {humedad && (
            <div className={estilos.respuesta}>
              <Medidor nivel={nivelDePercentil(humedad.percentil)} grande />
              <p className={estilos.frase}>{FRASE_ESTADO[estado]}</p>
            </div>
          )}
          {pct !== null ? (
            <Heroe valor={decimal(pct)} unidad="% de agua en la tierra" nota={notaHumedad} />
          ) : (
            <Heroe
              valor="Sin lectura"
              unidad="Humedad de la tierra"
              nota="No hay lectura de humedad para este lugar en los datos procesados."
            />
          )}
          {humedad && (
            <Tarjeta variante="contorno" className={estilos.tarjetaGrafica}>
              <h2 className="tipo-titulo">Últimos 4 meses</h2>
              <GraficaHumedad serie={humedad.serie} normal={humedad.normal} />
            </Tarjeta>
          )}
        </section>
      </div>

      <div className={estilos.columnaLateral}>
        <section className={estilos.fichas} aria-label="Otros datos del lugar">
          <Ficha icono="rainy" tono="agua" titulo="Lluvia">
            {lluvia30d ? (
              <>
                <p className={estilos.valor}>{decimal(lluvia30d.valor_mm, 0)} mm en 30 días</p>
                <p className="tipo-nota">{compararLluvia(lluvia30d.valor_mm, lluvia30d.normal_mm)}</p>
              </>
            ) : (
              <SinLectura razon="No hay datos de lluvia para este lugar." />
            )}
          </Ficha>

          <Ficha icono="thermostat" tono="tierra" titulo="Temperatura">
            {temperatura ? (
              <p className={estilos.valor}>{decimal(temperatura.valor_c, 0)} °C en promedio esta semana</p>
            ) : (
              <SinLectura razon="No hay datos de temperatura para este lugar." />
            )}
          </Ficha>

          <Ficha icono="landscape" tono="tierra" titulo="Tipo de tierra">
            {suelo ? (
              <p className={estilos.valor}>
                {texturaUsda(suelo.arena_pct, suelo.limo_pct, suelo.arcilla_pct)}, pH {decimal(suelo.ph)},{' '}
                {acidez(suelo.ph)}
              </p>
            ) : (
              <SinLectura razon="No hay datos de suelo para este lugar." />
            )}
          </Ficha>
        </section>

        {cultivo && etapa ? (
          <Tarjeta variante="elevada" className={estilos.cultivo}>
            <p className={estilos.valor}>
              {cultivo.nombre}, semana {edadSemanas}: {etapa.nombre.toLowerCase()}
            </p>
            <p>{FRASE_SENSIBILIDAD[etapa.sensibilidadAgua]}</p>
            <p className="tipo-nota">Referencia, pendiente de validación agronómica.</p>
          </Tarjeta>
        ) : (
          <Tarjeta variante="elevada" className={estilos.sinCultivo}>
            <p className={estilos.valor}>Sin cultivo elegido</p>
            <Chip to="/" icono="grass">
              Elegir cultivo
            </Chip>
          </Tarjeta>
        )}

        <details className={estilos.detalles}>
          <summary>Ver de dónde salen estos datos</summary>
          <ul className={estilos.fuentes}>
            <li>
              <strong>Humedad:</strong> {fuentes.humedad ?? 'sin fuente'}.
              {humedad && ` Lectura del ${fechaLarga(humedad.fecha)}, ${humedad.muestras} muestras.`}
              {humedad?.percentil != null && ` Percentil ${decimal(humedad.percentil, 0)} frente a lo normal.`} Mide solo los
              primeros 5 cm de la tierra.
            </li>
            <li>
              <strong>Lluvia:</strong> {fuentes.lluvia ?? 'sin fuente'}.
              {lluvia30d && ` Hasta el ${fechaLarga(lluvia30d.hasta)}.`}
            </li>
            <li>
              <strong>Temperatura:</strong> {fuentes.temperatura ?? 'sin fuente'}.
              {temperatura && ` Hasta el ${fechaLarga(temperatura.hasta)}.`}
            </li>
            <li>
              <strong>Tierra:</strong> {fuentes.suelo ?? 'sin fuente'}. Punto más cercano con datos; no está
              verificado como agrícola.
              {suelo && ` Arena ${decimal(suelo.arena_pct)} %, limo ${decimal(suelo.limo_pct)} %, arcilla ${decimal(suelo.arcilla_pct)} %.`}
            </li>
            <li>
              <strong>Ubicación:</strong> {coordenadas(zona.lat, zona.lon)}.
            </li>
          </ul>
        </details>

        {alCopiar && (
          <div className={estilos.acciones}>
            <Boton to="/chat?desde=zona" icono="forum">
              Preguntar sobre esta tierra
            </Boton>
            <Boton variante="tonal" icono="content_copy" onClick={alCopiar}>
              Copiar resumen
            </Boton>
          </div>
        )}
      </div>
    </div>
  )
}
