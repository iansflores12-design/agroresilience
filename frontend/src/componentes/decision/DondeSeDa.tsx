import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aptitud, departamentoDeZona, tieneAptitud } from '../../datos/aptitud'
import type { Cultivo } from '../../datos/cultivos'
import { cajaHonduras } from '../../datos/zonas'
import { ContenedorMapa } from '../mapa/ContenedorMapa'
import { useEscenario } from '../mapa/escenario'
import { NivelAptitud } from '../mapa/NivelAptitud'
import estilos from './DondeSeDa.module.css'

const SIN_LUGARES: never[] = []
const sinAccion = () => {}

/**
 * Honduras entera pintada según qué tan bien se da el cultivo, con la mirada puesta en el
 * departamento de la parcela: es el único que va entero y con su puntaje encima. Debajo, una
 * sola línea con el nivel y el puntaje. Al tocar otro departamento, el enfoque pasa a ese.
 * Sin leyenda ni textos de apoyo: el mapa completo, con su leyenda, vive en la pantalla Mapa.
 */
export function DondeSeDa({ cultivo, zonaId }: { cultivo: Cultivo; zonaId: string | null }) {
  const { t } = useTranslation()
  const [escenario] = useEscenario()
  const [tocado, fijarTocado] = useState<string | null>(null)
  if (!tieneAptitud(cultivo.id)) return null

  const el = t(`cultivos.${cultivo.id}.el`)
  const departamentoId = tocado ?? departamentoDeZona(zonaId)
  const resultado = aptitud(departamentoId, cultivo.id, escenario)

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-donde">
      <h2 id="titulo-donde" className="solo-lectores">
        {t('dondeSeDa.titulo', { el })}
      </h2>
      <div className={estilos.mapa}>
        <ContenedorMapa
          zonas={SIN_LUGARES}
          caja={cajaHonduras}
          zonaSeleccionadaId={null}
          cultivoId={cultivo.id}
          alSeleccionarZona={sinAccion}
          departamentoId={departamentoId}
          alSeleccionarDepartamento={fijarTocado}
          escenario={escenario}
          enfocar
        />
      </div>
      <p className={estilos.resultado} aria-live="polite">
        {resultado ? (
          <>
            <NivelAptitud nivel={resultado.nivel} />
            <span>
              {t('dondeSeDa.resultado', { cultivo: t(`cultivos.${cultivo.id}.nombre`), departamento: resultado.departamento.nombre, total: resultado.total })}
              <span className={estilos.ejemplo}>{t('dondeSeDa.ejemplo')}</span>
            </span>
          </>
        ) : (
          <span>{t('dondeSeDa.toque', { el })}</span>
        )}
      </p>
    </section>
  )
}
