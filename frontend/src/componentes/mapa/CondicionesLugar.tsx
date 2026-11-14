import { condiciones, escenarios, type Departamento, type Escenario } from '../../datos/aptitud'
import estilos from './CondicionesLugar.module.css'

/** Los datos que usa el puntaje, ajustados al tipo de ano, con sus unidades. Para el agronomo. */
export function CondicionesLugar({ departamento, escenario }: { departamento: Departamento; escenario: Escenario }) {
  const c = condiciones(departamento, escenario)
  const filas: [string, string][] = [
    ['Lluvia del año', `${Math.round(c.lluvia)} mm`],
    ['Temperatura media', `${c.temp.toFixed(1)} °C`],
    ['Altura del terreno', `${Math.round(c.alt)} m sobre el nivel del mar`],
    ['Agua en la tierra', `${c.hum.toFixed(1)} %`],
    ['Días seguidos sin lluvia en la canícula', `${Math.round(c.canicula)} días`],
    ['Qué tan ácida es la tierra (pH)', c.ph.toFixed(1)],
  ]
  return (
    <>
      <dl className={estilos.lista} aria-label={`Condiciones de ${departamento.nombre}, ${escenarios[escenario].nombre.toLowerCase()}`}>
        {filas.map(([nombre, valor]) => (
          <div key={nombre} className={estilos.fila}>
            <dt>{nombre}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="tipo-nota">
        {escenarios[escenario].nombre}. Valores típicos del departamento, de ejemplo.
      </p>
    </>
  )
}
