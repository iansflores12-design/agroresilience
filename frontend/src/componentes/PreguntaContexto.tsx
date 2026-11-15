import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEstadoApp } from '../estado/EstadoApp'
import { CULTIVOS, LUGARES } from '../lib/decision/parametros'
import { Cuestionario, type ClavePregunta } from '../pantallas/Inicio/Cuestionario'
import { BotonIcono } from './BotonIcono'
import estilos from './PreguntaContexto.module.css'

/**
 * La misma pregunta del cuestionario del Plan (cultivo con sus semanas, o lugar con ubicación y
 * buscador), a pantalla completa y encima de la pantalla actual. Al contestar se guarda y se
 * vuelve a donde se estaba, que ya muestra el dato nuevo.
 */
export function PreguntaContexto({ clave, alCerrar }: { clave: ClavePregunta | null; alCerrar: () => void }) {
  const { t } = useTranslation()
  const estado = useEstadoApp()
  const dialogo = useRef<HTMLDialogElement>(null)
  const abierto = clave !== null

  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (abierto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    } else if (!abierto && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [abierto])

  const cultivoValido = estado.cultivoId && CULTIVOS[estado.cultivoId] ? estado.cultivoId : undefined

  return (
    <dialog
      ref={dialogo}
      className={estilos.pagina}
      aria-labelledby="pregunta-cuestionario"
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
    >
      {clave && (
        <>
          <div className={estilos.barra}>
            <BotonIcono icono="close" etiqueta={t('comun.cerrar')} onClick={alCerrar} />
          </div>
          <div className={estilos.contenido}>
            <Cuestionario
              key={clave}
              soloPaso={clave}
              inicial={{
                zonaId: estado.zonaId && LUGARES[estado.zonaId] ? estado.zonaId : undefined,
                terreno: estado.terreno ?? undefined,
                cultivoId: cultivoValido,
                temporada: estado.temporada ?? undefined,
                parcela: estado.parcela,
                edadSemanas: cultivoValido ? estado.edadSemanas : 0,
                objetivos: estado.objetivos,
              }}
              alCancelar={alCerrar}
              alTerminar={(p) => {
                estado.fijarPerfil(p)
                alCerrar()
              }}
              alResponder={(r) => {
                estado.actualizarPerfil(
                  clave === 'cultivoId'
                    ? { cultivoId: r.cultivoId, edadSemanas: r.edadSemanas }
                    : { zonaId: r.zonaId, parcela: r.parcela ?? null },
                )
                alCerrar()
              }}
            />
          </div>
        </>
      )}
    </dialog>
  )
}
