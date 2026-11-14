import { useEstadoApp } from '../estado/EstadoApp'
import { BotonIcono } from './BotonIcono'
import estilos from './BarraSuperior.module.css'
import { Icono } from './Icono'
import { TiraContexto } from './TiraContexto'

export function BarraSuperior() {
  const { sonido, alternarSonido } = useEstadoApp()

  return (
    <header className={estilos.barra}>
      <div className={estilos.marca}>
        <span className={estilos.logo} aria-hidden="true">
          <Icono nombre="grass" relleno tamano={24} />
        </span>
        <p className={estilos.nombre}>AgroResilience</p>
      </div>
      <TiraContexto />
      <BotonIcono
        className={estilos.sonido}
        icono={sonido ? 'volume_up' : 'volume_off'}
        etiqueta={sonido ? 'Silenciar sonido' : 'Activar sonido'}
        variante="tonal"
        onClick={alternarSonido}
      />
    </header>
  )
}
