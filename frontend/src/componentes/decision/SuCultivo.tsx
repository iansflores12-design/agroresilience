import { useTranslation } from 'react-i18next'
import { nombreCultivo, nombreEtapa } from '../../i18n/dominio'
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
  const { t } = useTranslation()
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
              <span className={estilos.nombreCultivo}>{nombreCultivo(t, c.id)}</span>
              <span className="tipo-nota">
                {c.perenne ? t('suCultivo.permanente') : t('comun.unasSemanas', { n: c.cicloSemanas })}
              </span>
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
  const { t } = useTranslation()
  const actual = etapaEnSemana(cultivo, semana)
  const descripcion = t('suCultivo.etapasAria', {
    lista: cultivo.etapas.map((e) => nombreEtapa(t, cultivo.id, e)).join(', '),
    actual: nombreEtapa(t, cultivo.id, actual),
  })
  return (
    <div className={estilos.etapas} role="img" aria-label={descripcion}>
      {cultivo.etapas.map((e) => (
        <span
          key={e.id}
          className={clases(estilos.etapa, e.id === actual.id && estilos.etapaActual)}
          style={{ flexGrow: e.hastaSemana - e.desdeSemana + 1 }}
          title={nombreEtapa(t, cultivo.id, e)}
        />
      ))}
    </div>
  )
}

/** "¿Hace cuanto sembro?": semanas en grande, la etapa en palabras y el selector deslizable. */
export function EdadCultivo({ cultivo, semanas, alCambiar }: { cultivo: Cultivo; semanas: number; alCambiar: (s: number) => void }) {
  const { t } = useTranslation()
  const semana = Math.min(semanas, cultivo.cicloSemanas)
  const etapa = (s: number) => nombreEtapa(t, cultivo.id, etapaEnSemana(cultivo, s))
  return (
    <section className={estilos.edad} aria-labelledby="titulo-edad">
      <h2 id="titulo-edad" className="tipo-titulo">
        {t('suCultivo.edadTitulo')}
      </h2>
      <Heroe
        valor={semana}
        unidad={t('suCultivo.semanasDesde')}
        nota={t('suCultivo.enEtapa', { etapa: etapa(semana).toLowerCase() })}
      />
      <SelectorDeslizable
        etiqueta={t('suCultivo.edadEtiqueta')}
        valor={semana}
        min={0}
        max={cultivo.cicloSemanas}
        paso={1}
        marcaMayorCada={4}
        unidad={t('suCultivo.semanas')}
        alCambiar={alCambiar}
        textoValor={(v) => t('suCultivo.valorSemanas', { n: v, etapa: etapa(v) })}
      />
      <TiraEtapas cultivo={cultivo} semana={semana} />
    </section>
  )
}
