import type { Cultivo } from '../../datos/cultivos'
import type { Enfoque, TipoCambio } from './tipos'

export function tipoCambioDe(actual: Cultivo, siguiente: Cultivo): TipoCambio {
  if (actual.id === siguiente.id) return 'repetir'
  if (siguiente.familia === 'cobertura') return 'cobertura'
  if (siguiente.familia === 'leguminosa') return 'leguminosa'
  if (siguiente.familia === 'hortaliza') return 'hortaliza'
  return 'graminea'
}

export function situacionDe(enfoque: Enfoque | null, tipo: TipoCambio): string {
  return `${enfoque ?? 'general'}.${tipo}`
}
