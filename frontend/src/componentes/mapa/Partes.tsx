import type { ParteAptitud } from '../../datos/aptitud'
import estilos from './Partes.module.css'

/**
 * Lista de las partes de un puntaje: nombre, valor y una barra. Con `mostrarPeso` dice cuanto
 * pesa cada parte en el puntaje total (para quien quiere el detalle).
 */
export function Partes({
  partes,
  etiqueta,
  mostrarPeso = false,
}: {
  partes: ParteAptitud[]
  etiqueta: string
  mostrarPeso?: boolean
}) {
  return (
    <ul className={estilos.partes} aria-label={etiqueta}>
      {partes.map((p) => (
        <li key={p.clave} className={estilos.parte}>
          <span className={estilos.nombre}>
            {p.nombre}
            {mostrarPeso && <span className={estilos.peso}> (pesa {Math.round(p.peso * 100)} %)</span>}
          </span>
          <span className={estilos.valor}>{p.valor} de 100</span>
          <span className={estilos.barra} aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, p.valor)) / 100})` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
