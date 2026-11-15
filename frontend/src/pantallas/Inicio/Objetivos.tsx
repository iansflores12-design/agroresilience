import { useTranslation } from 'react-i18next'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import { ICONO_OBJETIVO } from '../../componentes/decision/visual'
import { OBJETIVOS } from '../../lib/decision/parametros'
import type { Objetivo } from '../../lib/decision/tipos'
import estilos from './Inicio.module.css'

/** Los objetivos del productor: se marcan y desmarcan. Los usan el cuestionario y la pantalla Plan. */
export function Objetivos({ elegidos, alternar }: { elegidos: Objetivo[]; alternar: (o: Objetivo) => void }) {
  const { t } = useTranslation()
  return (
    <ul className={estilos.objetivos} aria-label={t('inicio.objetivos')}>
      {(Object.keys(OBJETIVOS) as Objetivo[]).map((o) => {
        const marcado = elegidos.includes(o)
        return (
          <li key={o}>
            <Control
              className={clases(estilos.objetivo, marcado && estilos.objetivoMarcado, 'capa-estado')}
              aria-pressed={marcado}
              onClick={() => alternar(o)}
            >
              <span className={estilos.iconoObjetivo}>
                <Icono nombre={marcado ? 'check' : ICONO_OBJETIVO[o]} tamano={24} />
              </span>
              <span className={estilos.textoOpcion}>
                <span className={estilos.nombreOpcion}>{t(`objetivos.${o}.nombre`)}</span>
                <span className="tipo-nota">{t(`objetivos.${o}.descripcion`)}</span>
              </span>
            </Control>
          </li>
        )
      })}
    </ul>
  )
}
