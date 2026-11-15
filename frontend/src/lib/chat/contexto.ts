import { buscarCultivo, etapaEnSemana } from '../../datos/cultivos'
import { buscarZona } from '../../datos/zonas'
import { nombreCultivo, nombreEtapa } from '../../i18n/dominio'
import type { Idioma } from '../../i18n/idiomas'
import { traductor } from '../../i18n/traductor'
import type { ContextoChat } from './tipos'

export interface EntradaContexto {
  vista: ContextoChat['vista']
  cultivoId: string | null
  edadSemanas: number
  zonaId: string | null
  /** Idioma de los nombres de cultivo y etapa y de la respuesta. Por defecto, español. */
  idioma?: Idioma
}

/** Resume lo que el usuario esta viendo; es lo que recibe el backend junto con los mensajes. */
export function armarContexto({ vista, cultivoId, edadSemanas, zonaId, idioma }: EntradaContexto): ContextoChat {
  const t = traductor(idioma)
  const cultivo = buscarCultivo(cultivoId)
  const zona = buscarZona(zonaId)
  return {
    vista,
    ...(idioma ? { idioma } : {}),
    cultivo: cultivo ? { id: cultivo.id, nombre: nombreCultivo(t, cultivo.id) } : null,
    edadSemanas: cultivo ? edadSemanas : null,
    etapa: cultivo ? nombreEtapa(t, cultivo.id, etapaEnSemana(cultivo, edadSemanas)) : null,
    zona: zona ? { id: zona.id, nombre: zona.nombre, lat: zona.lat, lon: zona.lon } : null,
    humedad: zona?.humedad
      ? { valor: zona.humedad.valor, fecha: zona.humedad.fecha, unidad: zona.humedad.unidad }
      : null,
  }
}
