import { palabraNivel, type Nivel } from '../../datos/aptitud'
import { Control } from '../Control'
import { Icono } from '../Icono'
import { clases } from '../clases'
import { NivelAptitud } from './NivelAptitud'
import estilos from './ListaDepartamentos.module.css'

export interface ItemDepartamento {
  id: string
  nombre: string
  /** Sin cultivo no hay puntaje ni nivel. */
  total: number | null
  nivel: Nivel | null
  puesto: number | null
}

export interface PropsListaDepartamentos {
  /** Los departamentos ya ordenados: del mejor al peor con cultivo, alfabeticos sin cultivo. */
  items: ItemDepartamento[]
  elegidoId: string | null
  alElegir(id: string): void
  /** En pantalla expandida la lista va siempre abierta, al lado del mapa. */
  expandida: boolean
}

/** Elegir un departamento sin leer el mapa: un boton grande por departamento, con su puntaje. */
export function ListaDepartamentos({ items, elegidoId, alElegir, expandida }: PropsListaDepartamentos) {
  const lista = (
    <ul className={estilos.lista} aria-label={`Los ${items.length} departamentos`}>
      {items.map((p) => {
        const elegido = p.id === elegidoId
        const etiqueta =
          p.total === null || p.nivel === null
            ? `Elegir ${p.nombre}`
            : `Elegir ${p.nombre}: puesto ${p.puesto}, ${p.total} de 100, ${palabraNivel[p.nivel].toLowerCase()}`
        return (
          <li key={p.id}>
            <Control
              className={clases(estilos.departamento, elegido && estilos.elegido, 'capa-estado')}
              aria-pressed={elegido}
              aria-label={etiqueta}
              onClick={() => alElegir(p.id)}
            >
              <span className={estilos.nombre} aria-hidden="true">
                {elegido && <Icono nombre="check" tamano={20} />}
                {p.nombre}
              </span>
              {p.total !== null && p.nivel !== null && (
                <span className={estilos.datos} aria-hidden="true">
                  <span className={estilos.puntaje}>
                    <b>{p.total}</b>
                    <span className="tipo-nota">de 100</span>
                  </span>
                  <NivelAptitud nivel={p.nivel} />
                </span>
              )}
            </Control>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-departamentos">
      <h2 id="titulo-departamentos" className="tipo-titulo">
        {expandida ? 'Todos los departamentos' : 'Elija otro departamento'}
      </h2>
      {expandida ? (
        lista
      ) : (
        <details className={estilos.hoja}>
          <summary className="capa-estado">
            <span>Ver los {items.length} departamentos</span>
            <Icono nombre="expand_more" />
          </summary>
          {lista}
        </details>
      )}
    </section>
  )
}
