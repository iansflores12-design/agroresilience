export type NivelMedidor = 'seco' | 'normal' | 'humedo' | 'sin'

/** Convierte el percentil de la zona en un nivel del medidor. */
export function nivelDePercentil(percentil: number | null | undefined): NivelMedidor {
  if (percentil === null || percentil === undefined) return 'sin'
  if (percentil < 20) return 'seco'
  if (percentil > 80) return 'humedo'
  return 'normal'
}
