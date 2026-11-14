/** Nombre corto de una zona: sin el departamento entre parentesis ("Nacaome (Valle)" -> "Nacaome"). */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/\s*\(.*\)\s*$/, '')
}

/** Latitud como "14° N" (o "S"). */
export function etiquetaLatitud(lat: number, decimales = 0): string {
  return `${Math.abs(lat).toFixed(decimales)}° ${lat >= 0 ? 'N' : 'S'}`
}

/** Longitud como "87° O" (o "E"). */
export function etiquetaLongitud(lon: number, decimales = 0): string {
  return `${Math.abs(lon).toFixed(decimales)}° ${lon <= 0 ? 'O' : 'E'}`
}

/** "13.30° N, 87.19° O". */
export function coordenadas(lat: number, lon: number): string {
  return `${etiquetaLatitud(lat, 2)}, ${etiquetaLongitud(lon, 2)}`
}
