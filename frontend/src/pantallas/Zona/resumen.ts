import { humedadPorcentaje, type Zona } from '../../datos/zonas'
import { traductor } from '../../i18n/traductor'
import { claveEstadoHumedad, decimal, fechaLarga } from './formato'

/** Texto corto para el portapapeles: zona, humedad, fecha y fuentes. */
export function textoResumen(zona: Zona, fuentes: Record<string, string>, idioma?: string | null): string {
  const t = traductor(idioma)
  const fuente = (clave: string) => fuentes[clave] ?? t('comun.sinFuente')
  const lineas = [`AgroResilience - ${zona.nombre}`]
  const pct = humedadPorcentaje(zona)
  if (zona.humedad && pct !== null) {
    lineas.push(
      t('zona.resumen.humedad', {
        pct: decimal(pct),
        estado: t(`zona.estado.${claveEstadoHumedad(zona)}`).toLowerCase(),
        fecha: fechaLarga(zona.humedad.fecha, idioma),
        fuente: fuente('humedad'),
      }),
    )
  } else {
    lineas.push(t('zona.resumen.sinHumedad'))
  }
  if (zona.lluvia30d) {
    lineas.push(t('zona.resumen.lluvia', { mm: decimal(zona.lluvia30d.valor_mm), fecha: fechaLarga(zona.lluvia30d.hasta, idioma), fuente: fuente('lluvia') }))
  }
  if (zona.temperatura) {
    lineas.push(t('zona.resumen.temperatura', { c: decimal(zona.temperatura.valor_c), fecha: fechaLarga(zona.temperatura.hasta, idioma), fuente: fuente('temperatura') }))
  }
  return lineas.join('\n')
}
