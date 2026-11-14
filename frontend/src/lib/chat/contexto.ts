import { buscarCultivo, etapaEnSemana } from '../../datos/cultivos'
import { buscarZona } from '../../datos/zonas'
import type { ContextoChat } from './tipos'

export interface EntradaContexto {
  vista: ContextoChat['vista']
  cultivoId: string | null
  edadSemanas: number
  zonaId: string | null
  recomendacion?: ContextoChat['recomendacion']
  perspectiva?: ContextoChat['perspectiva']
}

/** Resume lo que el usuario esta viendo; es lo que recibe el backend junto con los mensajes. */
export function armarContexto({ vista, cultivoId, edadSemanas, zonaId, recomendacion, perspectiva }: EntradaContexto): ContextoChat {
  const cultivo = buscarCultivo(cultivoId)
  const zona = buscarZona(zonaId)
  return {
    vista,
    cultivo: cultivo ? { id: cultivo.id, nombre: cultivo.nombre } : null,
    edadSemanas: cultivo ? edadSemanas : null,
    etapa: cultivo ? etapaEnSemana(cultivo, edadSemanas).nombre : null,
    zona: zona ? { id: zona.id, nombre: zona.nombre, lat: zona.lat, lon: zona.lon } : null,
    humedad: zona?.humedad
      ? { valor: zona.humedad.valor, fecha: zona.humedad.fecha, unidad: zona.humedad.unidad }
      : null,
    // Solo se agregan cuando hay dato, para que el contexto de siempre no cambie.
    ...(recomendacion ? { recomendacion } : {}),
    ...(perspectiva ? { perspectiva } : {}),
  }
}
