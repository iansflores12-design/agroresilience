import { useEstadoApp } from '../estado/EstadoApp'
import { avisar } from '../lib/avisos'
import { BotonIcono } from './BotonIcono'
import estilos from './BarraSuperior.module.css'
import { TiraContexto } from './TiraContexto'

export function BarraSuperior() {
  const { sonido, alternarSonido } = useEstadoApp()

  function alAlternar() {
    alternarSonido()
    avisar.info({ titulo: sonido ? 'Sonido silenciado' : 'Sonido activado' })
  }

  return (
    <header className={estilos.barra}>
      <div className={estilos.fila}>
        <p className={estilos.nombre}>AgroResilience</p>
        <BotonIcono
          icono={sonido ? 'volume_up' : 'volume_off'}
          etiqueta={sonido ? 'Silenciar sonido' : 'Activar sonido'}
          onClick={alAlternar}
        />
      </div>
      <TiraContexto />
    </header>
  )
}
