import { Heroe } from '../Heroe'
import { Icono } from '../Icono'
import { Control } from '../Control'
import { clases } from '../clases'
import { SelectorDeslizable } from '../SelectorDeslizable'
import { cultivos, etapaEnSemana, type Cultivo } from '../../datos/cultivos'
import estilos from './SuCultivo.module.css'
import { ICONO_CULTIVO } from './visual'

/** Rejilla de tarjetas grandes, una por cultivo (la de la pantalla "¿Qué sembró?" original). */
export function SelectorCultivo({ elegido, alElegir }: { elegido: string | null; alElegir: (id: string) => void }) {
  return (
    <ul className={estilos.cultivos}>
      {cultivos.map((c) => {
        const marcado = c.id === elegido
        return (
          <li key={c.id}>
            <Control
              className={clases(estilos.cultivo, marcado && estilos.cultivoElegido, 'capa-estado')}
              aria-pressed={marcado}
              onClick={() => alElegir(c.id)}
            >
              <span className={estilos.iconoCultivo}>
                <Icono nombre={ICONO_CULTIVO[c.id] ?? 'grass'} tamano={32} />
              </span>
              <span className={estilos.nombreCultivo}>{c.nombre}</span>
              <span className="tipo-nota">Unas {c.cicloSemanas} semanas</span>
              {marcado && (
                <span className={estilos.visto}>
                  <Icono nombre="check" tamano={20} />
                </span>
              )}
            </Control>
          </li>
        )
      })}
    </ul>
  )
}

function TiraEtapas({ cultivo, semana }: { cultivo: Cultivo; semana: number }) {
  const actual = etapaEnSemana(cultivo, semana)
  const descripcion = `Etapas del ciclo: ${cultivo.etapas.map((e) => e.nombre).join(', ')}. Etapa actual: ${actual.nombre}.`
  return (
    <div className={estilos.etapas} role="img" aria-label={descripcion}>
      {cultivo.etapas.map((e) => (
        <span
          key={e.id}
          className={clases(estilos.etapa, e.id === actual.id && estilos.etapaActual)}
          style={{ flexGrow: e.hastaSemana - e.desdeSemana + 1 }}
          title={e.nombre}
        />
      ))}
    </div>
  )
}

/** "¿Hace cuanto sembro?": semanas en grande, la etapa en palabras y el selector deslizable. */
export function EdadCultivo({ cultivo, semanas, alCambiar }: { cultivo: Cultivo; semanas: number; alCambiar: (s: number) => void }) {
  const semana = Math.min(semanas, cultivo.cicloSemanas)
  return (
    <section className={estilos.edad} aria-labelledby="titulo-edad">
      <h2 id="titulo-edad" className="tipo-titulo">
        ¿Hace cuánto sembró?
      </h2>
      <Heroe
        valor={semana}
        unidad="semanas desde la siembra"
        nota={`Está en la etapa de ${etapaEnSemana(cultivo, semana).nombre.toLowerCase()}`}
      />
      <SelectorDeslizable
        etiqueta="Edad del cultivo"
        valor={semana}
        min={0}
        max={cultivo.cicloSemanas}
        paso={1}
        marcaMayorCada={4}
        unidad="semanas"
        alCambiar={alCambiar}
        textoValor={(v) => `${v} semanas, etapa ${etapaEnSemana(cultivo, v).nombre}`}
      />
      <TiraEtapas cultivo={cultivo} semana={semana} />
    </section>
  )
}
