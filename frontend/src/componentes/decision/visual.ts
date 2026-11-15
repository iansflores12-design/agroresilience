import type { NombreIcono } from '../iconos'
import type { ClaveFactor, Objetivo, Rating, Razon, Temporada, Terreno } from '../../lib/decision/tipos'

export const ICONO_FACTOR: Record<ClaveFactor, NombreIcono> = {
  agua: 'water_drop',
  calor: 'thermostat',
  suelo: 'compost',
  erosion: 'landslide',
  venta: 'savings',
  forraje: 'pets',
  plagas: 'pest_control',
  nitrogeno: 'eco',
}

export function iconoRazon(r: Razon, diferencia: number): NombreIcono {
  if (r.tipo === 'comparacion') return diferencia >= 0 ? 'trending_up' : 'trending_down'
  if (r.tipo === 'objetivos') return 'flag'
  if (r.tipo === 'actual') return 'schedule'
  if (r.tipo === 'historial') return 'calendar_month'
  return ICONO_FACTOR[r.tipo]
}

export const ICONO_CULTIVO: Record<string, NombreIcono> = {
  maiz: 'grain',
  frijol: 'eco',
  sorgo: 'spa',
  arroz: 'rice_bowl',
  tomate: 'nutrition',
  'frijol-terciopelo': 'local_florist',
  cafe: 'coffee',
  platano: 'nature',
  palma: 'park',
  cana: 'energy_savings_leaf',
  melon: 'grocery',
  tabaco: 'nest_eco_leaf',
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
