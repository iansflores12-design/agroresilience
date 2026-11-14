import { useId, useState } from 'react'
import type { RotacionPuntuada } from '../../datos/aptitud'
import { detalleRotacion } from '../../datos/rotacionDetalle'
import { clases } from '../clases'
import { Control } from '../Control'
import { Icono } from '../Icono'
import { NivelAptitud } from '../mapa/NivelAptitud'
import { Partes } from '../mapa/Partes'
import { Tarjeta } from '../Tarjeta'
import estilos from './ComparadorRotaciones.module.css'

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

const ETIQUETA_EFECTO = { bueno: 'Ayuda', regular: 'Depende', malo: 'Perjudica' } as const

function Detalle({
  rotacion: r,
  actualId,
  id,
  idCabecera,
}: {
  rotacion: RotacionPuntuada
  actualId: string | null
  id: string
  idCabecera: string
}) {
  const explicacion = r.actual ? null : detalleRotacion(actualId, r.id)
  return (
    <div id={id} role="region" aria-labelledby={idCabecera} className={estilos.detalle}>
      <p className={estilos.resumen}>
        {comparacion(r)} Lo mejor que tiene es {r.fuerte.nombre.toLowerCase()} y lo más flojo, {r.debil.nombre.toLowerCase()}.
      </p>

      <div className={estilos.columnas}>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>Cuándo se siembra</h4>
          <ol className={estilos.pasos}>
            {r.pasos.map((paso) => (
              <li key={paso.temporada} className={estilos.paso}>
                <span className={estilos.nombrePaso}>{paso.cultivo.nombre}</span>
                <span className="tipo-nota">
                  {paso.meses}. Unas {paso.cultivo.cicloSemanas} semanas.
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>En qué nos basamos</h4>
          <Partes partes={r.partes} etiqueta={`Puntaje por partes de ${r.nombre}`} />
        </div>
      </div>

      <div className={estilos.columnas}>
        <Lista titulo="A favor" puntos={r.ventajas} />
        <Lista titulo="Tenga cuidado con" puntos={r.riesgos} />
        <Lista titulo="Falta saber" puntos={r.falta} />
      </div>
      {explicacion && (
        <div className={estilos.lista}>
          <h4 className={estilos.subtitulo}>Qué cambia al sembrar {r.nombre.toLowerCase()}</h4>
          <ul>
            {explicacion.bloques.map((b) => (
              <li key={b.id}>
                <strong>{b.titulo}:</strong> {b.simple} <span className="tipo-nota">({ETIQUETA_EFECTO[b.efecto]})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="tipo-nota">Qué tan seguro es este cálculo: confianza {r.confianza}.</p>
      <p className="tipo-nota">Revise esta opción con su técnico antes de decidir.</p>
    </div>
  )
}

/**
 * Compara las opciones de que sembrar despues: recomienda la mejor y deja abrir cada una para ver
 * por que. Solo una abierta a la vez. No elige cultivo.
 */
export function ComparadorRotaciones({
  rotaciones,
  elegidaId = null,
  actualId = null,
}: {
  rotaciones: RotacionPuntuada[]
  /** Cultivo de hoy: sirve para explicar que cambia en cada opcion. */
  actualId?: string | null
  /** Opcion que recomendo el asistente: se resalta, pero se siguen mostrando todas. */
  elegidaId?: string | null
}) {
  const base = useId()
  const [abiertaId, fijarAbierta] = useState<string | null>(null)
  const mejor = rotaciones.find((r) => r.mejor) ?? null
  const hayAbierta = rotaciones.some((r) => r.id === abiertaId)

  return (
    <div className={estilos.comparador}>
      {mejor && (
        <Tarjeta como="article" variante="elevada" className={estilos.recomendacion} aria-labelledby={`${base}-mejor`}>
          <p className="tipo-nota">Lo que más le conviene</p>
          <h3 id={`${base}-mejor`} className="tipo-titulo">
            {mejor.nombre}
          </h3>
          <div className={estilos.nivelFila}>
            <NivelAptitud nivel={mejor.nivel} grande />
            <p className={estilos.puntos}>{mejor.total} de 100</p>
          </div>
          <p className={estilos.resumen}>
            {mejor.actual ? 'Lo que hace hoy ya es la mejor opción de esta lista.' : `${mejor.diferencia} puntos más que repetir el cultivo.`}
          </p>
          <div className={estilos.lista}>
            <h4 className={estilos.subtitulo}>Por qué:</h4>
            <ul>
              {mejor.ventajas.slice(0, 2).map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
          <p className={estilos.resumen}>Su punto más fuerte es {mejor.fuerte.nombre.toLowerCase()}.</p>
        </Tarjeta>
      )}

      <ul className={estilos.opciones}>
        {rotaciones.map((r) => {
          const abierta = r.id === abiertaId
          const idCabecera = `${base}-cab-${r.id}`
          const idPanel = `${base}-panel-${r.id}`
          const elegida = r.id === elegidaId
          return (
            <li key={r.id} className={clases(estilos.opcion, abierta && estilos.opcionAbierta, elegida && estilos.opcionElegida)}>
              <Control
                id={idCabecera}
                className={clases(estilos.cabecera, 'capa-estado')}
                aria-expanded={abierta}
                aria-controls={abierta ? idPanel : undefined}
                onClick={() => fijarAbierta(abierta ? null : r.id)}
              >
                <span className={estilos.tipoNombre}>
                  <span className="tipo-nota">{tipo(r)}</span>
                  <span className={estilos.nombre}>{r.nombre}</span>
                  {elegida && (
                    <span className={estilos.marcaElegida}>
                      <Icono nombre="check_circle" tamano={18} />
                      Recomendada para usted
                    </span>
                  )}
                </span>
                <span className={estilos.nivelPuntos}>
                  <NivelAptitud nivel={r.nivel} />
                  <span className={estilos.puntos}>{r.total} de 100</span>
                </span>
                <span className={estilos.flecha}>
                  <Icono nombre="expand_more" />
                </span>
              </Control>
              {abierta && <Detalle rotacion={r} actualId={actualId} id={idPanel} idCabecera={idCabecera} />}
            </li>
          )
        })}
      </ul>
      {!hayAbierta && <p className={estilos.ayuda}>Toque una opción para ver por qué.</p>}
    </div>
  )
}
