import type { NombreIcono } from '../iconos'
import type { Objetivo, Rating, Temporada, Terreno } from '../../lib/decision/tipos'

export const ICONO_CULTIVO: Record<string, NombreIcono> = {
  maiz: 'grain',
  frijol: 'eco',
  sorgo: 'spa',
  arroz: 'rice_bowl',
  tomate: 'nutrition',
  'frijol-terciopelo': 'local_florist',
}

export const ICONO_TEMPORADA: Record<Temporada, NombreIcono> = {
  primera: 'rainy',
  postrera: 'water_drop',
  verano: 'wb_sunny',
}

export const ICONO_TERRENO: Record<Terreno, NombreIcono> = {
  plano: 'horizontal_rule',
  elevado: 'mountain_flag',
  bajo: 'waves',
  ondulado: 'landscape',
}

export const ICONO_OBJETIVO: Record<Objetivo, NombreIcono> = {
  agua: 'water_drop',
  suelo: 'compost',
  erosion: 'landslide',
  ingreso: 'savings',
  forraje: 'pets',
  nitrogeno: 'eco',
  plagas: 'pest_control',
}

export const ICONO_RATING: Record<Rating, NombreIcono> = {
  alta: 'check_circle',
  buena: 'thumb_up',
  intermedia: 'remove',
  baja: 'warning',
}
