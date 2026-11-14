import { PESOS_ROTACION, type ClaveParteRotacion } from '../../datos/aptitud'
import type { Enfoque } from './tipos'

const PARTE_DE_ENFOQUE: Record<Enfoque, ClaveParteRotacion> = {
  agua: 'agua',
  seguro: 'clima',
  tierra: 'suelo',
  venta: 'venta',
}

/** Cada enfoque elegido triplica el peso de su parte y luego todo se renormaliza a 1. */
export function pesosDeEnfoques(enfoques: Enfoque[]): Record<ClaveParteRotacion, number> {
  if (enfoques.length === 0) return { ...PESOS_ROTACION }
  const pesos = { ...PESOS_ROTACION }
  for (const e of new Set(enfoques)) pesos[PARTE_DE_ENFOQUE[e]] *= 3
  const suma = pesos.agua + pesos.suelo + pesos.clima + pesos.venta
  return { agua: pesos.agua / suma, suelo: pesos.suelo / suma, clima: pesos.clima / suma, venta: pesos.venta / suma }
}
