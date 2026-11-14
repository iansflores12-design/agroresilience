import { palabraNivel, type Escenario, type PuestoDepartamento } from '../../datos/aptitud'
import { Control } from '../Control'
import { Tarjeta } from '../Tarjeta'
import { clases } from '../clases'
import { NivelAptitud } from './NivelAptitud'
import estilos from './TopTres.module.css'

const FRASE: Record<Escenario, string> = {
  seco: 'En un año seco, estos son los que mejor aguantan.',
  normal: 'En un año normal, estos son los que mejor se dan.',
  lluvioso: 'En un año lluvioso, estos son los que mejor se dan.',
}

/** Barra del puntaje (de 0 a 100). Va en tinta: no se toca, asi que no lleva color de senal. */
export function BarraPuntaje({ total }: { total: number }) {
  return (
    <span className={estilos.barra} aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, total)) / 100})` }} />
    </span>
  )
}

export interface PropsTopTres {
  nombreCultivo: string
  escenario: Escenario
  /** Los 18 departamentos, del mejor al peor (con empates ya desempatados por orden alfabetico). */
  orden: PuestoDepartamento[]
  elegidoId: string | null
  alElegir(id: string): void
}

/** Tarjeta "Los 3 mejores para <cultivo>": tres filas grandes que eligen el departamento. */
export function TopTres({ nombreCultivo, escenario, orden, elegidoId, alElegir }: PropsTopTres) {
  const mejores = orden.slice(0, 3)
  const tercero = mejores[2]
  // Si el cuarto tiene el mismo puntaje que el tercero, no se esconde.
  const empatados = tercero ? orden.slice(3).filter((p) => p.total === tercero.total) : []
  return (
    <Tarjeta como="section" variante="elevada" className={estilos.tarjeta} aria-labelledby="titulo-top-tres">
      <div className={estilos.encabezado}>
        <h2 id="titulo-top-tres" className="tipo-titulo">
          Los 3 mejores para {nombreCultivo}
        </h2>
        <p className="tipo-nota">{FRASE[escenario]}</p>
      </div>
      <ol className={estilos.lista}>
        {mejores.map((p, i) => {
          const elegido = p.id === elegidoId
          return (
            <li key={p.id}>
              <Control
                className={clases(estilos.fila, elegido && estilos.elegida, 'capa-estado')}
                aria-pressed={elegido}
                aria-label={`Puesto ${i + 1}: ${p.nombre}, ${p.total} de 100, ${palabraNivel[p.nivel].toLowerCase()}`}
                onClick={() => alElegir(p.id)}
              >
                <span className={estilos.puesto} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={estilos.nombre} aria-hidden="true">
                  {p.nombre}
                </span>
                <span className={estilos.puntaje} aria-hidden="true">
                  <b>{p.total}</b>
                  <span className="tipo-nota">de 100</span>
                </span>
                <span className={estilos.nivel} aria-hidden="true">
                  <NivelAptitud nivel={p.nivel} />
                </span>
                <BarraPuntaje total={p.total} />
              </Control>
            </li>
          )
        })}
      </ol>
      {empatados.length > 0 && (
        <p className="tipo-nota">
          Con el mismo puntaje que el tercero: {empatados.map((p) => p.nombre).join(', ')}.
        </p>
      )}
    </Tarjeta>
  )
}
