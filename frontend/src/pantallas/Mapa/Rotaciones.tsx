import { useState } from 'react'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { Tarjeta } from '../../componentes/Tarjeta'
import { clases } from '../../componentes/clases'
import { NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { Partes } from '../../componentes/mapa/Partes'
import type { RotacionPuntuada } from '../../datos/aptitud'
import estilos from './Rotaciones.module.css'

function tipo(r: RotacionPuntuada): string {
  if (r.actual) return 'Lo que hace hoy'
  return r.mejor ? 'La mejor opción' : 'Otra opción'
}

function comparacion(r: RotacionPuntuada): string {
  if (r.actual) return 'Sirve para comparar las otras opciones.'
  if (r.diferencia > 0) return `${r.diferencia} puntos más que repetir el cultivo.`
  if (r.diferencia < 0) return `${-r.diferencia} puntos menos que repetir el cultivo.`
  return 'Igual que repetir el cultivo.'
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
  return (
    <Tarjeta como="article" variante="elevada" id="detalle-rotacion" className={estilos.detalle} aria-labelledby="titulo-detalle-rotacion">
      <div className={estilos.cabecera}>
        <h3 id="titulo-detalle-rotacion" className="tipo-titulo">
          {r.nombre}
        </h3>
        <NivelAptitud nivel={r.nivel} grande />
        <p className={estilos.puntos}>{r.total} de 100</p>
      </div>
      <p className={estilos.resumen}>
        {comparacion(r)} Lo mejor que tiene es {r.fuerte.nombre.toLowerCase()} y lo más flojo, {r.debil.nombre.toLowerCase()}.
      </p>

      <div className={estilos.columnas}>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>Cuándo se siembra</h4>
          <ol className={estilos.pasos}>
            {r.pasos.map((paso) => (
              <li key={paso.temporada} className={estilos.paso}>
                <span className={estilos.iconoPaso}>
                  <Icono nombre={paso.temporada === 'primera' ? 'rainy' : 'water_drop'} tamano={22} />
                </span>
                <span className={estilos.textoPaso}>
                  <span className={estilos.nombrePaso}>{paso.cultivo.nombre}</span>
                  <span className="tipo-nota">
                    {paso.meses}. Unas {paso.cultivo.cicloSemanas} semanas.
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>El puntaje por partes</h4>
          <Partes partes={r.partes} etiqueta={`Puntaje por partes de ${r.nombre}`} />
        </div>
      </div>

      <div className={estilos.columnas}>
        <Lista titulo="A favor" puntos={r.ventajas} />
        <Lista titulo="Tenga cuidado con" puntos={r.riesgos} />
        <Lista titulo="Falta saber" puntos={r.falta} />
      </div>
      <p className="tipo-nota">Qué tan seguro es este cálculo: confianza {r.confianza}.</p>
    </Tarjeta>
  )
}

/** Tarjetas de que sembrar despues. Al tocar una se abre su detalle debajo; al tocarla otra vez se cierra. */
export function Rotaciones({ rotaciones }: { rotaciones: RotacionPuntuada[] }) {
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
                <span className="tipo-nota">{tipo(r)}</span>
                <span className={estilos.nombre}>{r.nombre}</span>
                <span className={estilos.pie}>
                  <NivelAptitud nivel={r.nivel} />
                  <span className={estilos.puntos}>{r.total} de 100</span>
                </span>
                <span className={estilos.flecha}>
                  <Icono nombre="expand_more" />
                </span>
              </Control>
            </li>
          )
        })}
      </ul>
      {abierta ? <Detalle rotacion={abierta} /> : <p className={estilos.ayuda}>Toque una opción para ver más.</p>}
    </>
  )
}
