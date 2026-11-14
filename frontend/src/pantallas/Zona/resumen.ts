import { estadoHumedad, humedadPorcentaje, type Zona } from '../../datos/zonas'
import { decimal, fechaLarga } from './formato'

/** Texto corto para el portapapeles: zona, humedad, fecha y fuentes. */
export function textoResumen(zona: Zona, fuentes: Record<string, string>): string {
  const lineas = [`AgroResilience - ${zona.nombre}`]
  const pct = humedadPorcentaje(zona)
  if (zona.humedad && pct !== null) {
    lineas.push(
      `Humedad del suelo (0 a 5 cm): ${decimal(pct)} %, ${estadoHumedad(zona).toLowerCase()}. Lectura del ${fechaLarga(zona.humedad.fecha)}. Fuente: ${fuentes.humedad ?? 'sin fuente'}.`,
    )
  } else {
    lineas.push('Humedad del suelo: sin lectura.')
  }
  if (zona.lluvia30d) {
    lineas.push(
      `Lluvia de 30 días: ${decimal(zona.lluvia30d.valor_mm)} mm hasta el ${fechaLarga(zona.lluvia30d.hasta)}. Fuente: ${fuentes.lluvia ?? 'sin fuente'}.`,
    )
  }
  if (zona.temperatura) {
    lineas.push(
      `Temperatura media de 7 días: ${decimal(zona.temperatura.valor_c)} °C hasta el ${fechaLarga(zona.temperatura.hasta)}. Fuente: ${fuentes.temperatura ?? 'sin fuente'}.`,
    )
  }
  return lineas.join('\n')
}
