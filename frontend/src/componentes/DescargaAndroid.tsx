import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Boton } from './Boton'
import { Icono } from './Icono'
import { Tarjeta } from './Tarjeta'
import estilos from './DescargaAndroid.module.css'

/** Donde se publica la app de Android: el APK va adjunto a un Release de GitHub. */
const REPO = 'iansflores12-design/agroresilience'
const PAGINA = `https://github.com/${REPO}/releases`
const ULTIMO = `https://api.github.com/repos/${REPO}/releases/latest`

type Estado =
  | { fase: 'buscando' }
  | { fase: 'lista'; url: string; mb: number | null }
  /** Todavia no hay ningun APK publicado. */
  | { fase: 'pronto' }
  /** No se pudo preguntar a GitHub: se enlaza la pagina de descargas. */
  | { fase: 'pagina' }

interface Adjunto {
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
}

/** El primer .apk del ultimo Release, o null si no trae ninguno. */
export function apkDe(release: unknown): { url: string; mb: number | null } | null {
  const adjuntos: unknown = (release as { assets?: unknown } | null)?.assets
  if (!Array.isArray(adjuntos)) return null
  for (const a of adjuntos as Adjunto[]) {
    if (typeof a?.name !== 'string' || !a.name.toLowerCase().endsWith('.apk')) continue
    if (typeof a.browser_download_url !== 'string' || !a.browser_download_url.startsWith(`https://github.com/${REPO}/`)) continue
    const mb = typeof a.size === 'number' && a.size > 0 ? Math.max(1, Math.round(a.size / 1_048_576)) : null
    return { url: a.browser_download_url, mb }
  }
  return null
}

function useApk(): Estado {
  const [estado, fijar] = useState<Estado>({ fase: 'buscando' })
  useEffect(() => {
    // En las pruebas no se sale a la red.
    if (import.meta.env.MODE === 'test') return
    const control = new AbortController()
    fetch(ULTIMO, { signal: control.signal, headers: { Accept: 'application/vnd.github+json' } })
      .then(async (r) => {
        if (r.status === 404) return fijar({ fase: 'pronto' })
        if (!r.ok) return fijar({ fase: 'pagina' })
        const apk = apkDe(await r.json())
        fijar(apk ? { fase: 'lista', ...apk } : { fase: 'pronto' })
      })
      .catch(() => {
        if (!control.signal.aborted) fijar({ fase: 'pagina' })
      })
    return () => control.abort()
  }, [])
  return estado
}

/**
 * Seccion para descargar la app de Android. El boton se activa solo cuando hay un .apk en el
 * ultimo Release del repositorio; mientras tanto dice que estara disponible pronto.
 */
export function DescargaAndroid() {
  const { t } = useTranslation()
  const estado = useApk()
  // Dentro de la app nativa no tiene sentido ofrecer su propia descarga.
  if (import.meta.env.MODE === 'android') return null
  const pronto = estado.fase === 'pronto'
  return (
    <Tarjeta como="section" variante="contorno" className={estilos.descarga} aria-labelledby="titulo-descarga">
      <span className={estilos.icono}>
        <Icono nombre="android" tamano={28} />
      </span>
      <div className={estilos.texto}>
        <h2 id="titulo-descarga" className="tipo-titulo">
          {t('plan.appTitulo')}
        </h2>
        <p className={estilos.apoyo}>{pronto ? t('plan.appProntoTexto') : t('plan.appTexto')}</p>
        {estado.fase === 'lista' && <p className="tipo-nota">{t('plan.appNota')}</p>}
      </div>
      <div className={estilos.accion} aria-busy={estado.fase === 'buscando'}>
        {estado.fase === 'lista' && (
          <Boton icono="download" href={estado.url}>
            {estado.mb === null ? t('plan.appDescargar') : t('plan.appDescargarPeso', { mb: estado.mb })}
          </Boton>
        )}
        {estado.fase === 'pagina' && (
          <Boton variante="tonal" icono="download" href={PAGINA}>
            {t('plan.appVerDescargas')}
          </Boton>
        )}
        {(pronto || estado.fase === 'buscando') && (
          <Boton variante="tonal" icono="download" disabled>
            {pronto ? t('plan.appPronto') : t('plan.appDescargar')}
          </Boton>
        )}
      </div>
    </Tarjeta>
  )
}
