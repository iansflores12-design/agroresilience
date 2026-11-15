import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdioma } from '../i18n'
import { urlApi } from '../lib/chat'
import { Boton } from './Boton'
import { Icono } from './Icono'
import estilos from './VerificacionHumana.module.css'

/** Clave de sitio de prueba de Cloudflare: siempre aprueba. Solo en desarrollo. */
const CLAVE_PRUEBA = '1x00000000000000000000AA'
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
export const CLAVE_SESION = 'agroresilience.humano.v1'
/** Igual que la cookie del servidor: 12 horas. */
const DURACION_MS = 12 * 60 * 60 * 1000

interface Turnstile {
  render(el: HTMLElement, opciones: Record<string, unknown>): string
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

export function claveSitio(): string | null {
  const v: unknown = import.meta.env.VITE_TURNSTILE_SITE_KEY
  if (typeof v === 'string' && v.trim()) return v.trim()
  return import.meta.env.DEV ? CLAVE_PRUEBA : null
}

function yaVerificado(): boolean {
  try {
    return Number(window.sessionStorage.getItem(CLAVE_SESION)) > Date.now()
  } catch {
    return false
  }
}

function recordar() {
  try {
    window.sessionStorage.setItem(CLAVE_SESION, String(Date.now() + DURACION_MS))
  } catch {
    // Sin almacenamiento se vuelve a verificar al recargar.
  }
}

let cargando: Promise<Turnstile> | null = null
function cargarTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  cargando ??= new Promise((listo, fallo) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? listo(window.turnstile) : fallo(new Error('Turnstile no cargo')))
    s.onerror = () => {
      cargando = null
      fallo(new Error('Turnstile no cargo'))
    }
    document.head.appendChild(s)
  })
  return cargando
}

const IDIOMA_TURNSTILE = { es: 'es', pt: 'pt-br', en: 'en' } as const

type Estado = 'esperando' | 'validando' | 'error'

/**
 * Al abrir el sitio, Cloudflare Turnstile comprueba que es una persona; el servidor confirma el
 * token (/api/verificar) y deja una cookie de 12 horas. Mientras dura, no se vuelve a pedir en
 * esta pestaña. Sin clave de sitio en produccion, el sitio abre sin verificacion.
 */
export function VerificacionHumana({
  children,
  saltar = import.meta.env.MODE === 'test',
}: {
  children: ReactNode
  /** En las pruebas de la app no se pide la verificacion. */
  saltar?: boolean
}) {
  const clave = claveSitio()
  const [listo, fijarListo] = useState(() => saltar || !clave || yaVerificado())
  const alPasar = useCallback(() => fijarListo(true), [])
  if (listo) return <>{children}</>
  return <PantallaVerificacion clave={clave!} alPasar={alPasar} />
}

function PantallaVerificacion({ clave, alPasar }: { clave: string; alPasar: () => void }) {
  const { t } = useTranslation()
  const idioma = useIdioma()
  const caja = useRef<HTMLDivElement>(null)
  const [estado, fijarEstado] = useState<Estado>('esperando')
  const [intento, fijarIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    let id: string | null = null
    async function alToken(token: string) {
      fijarEstado('validando')
      try {
        const r = await fetch(`${urlApi().replace(/\/+$/, '')}/verificar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token }),
        })
        if (!vivo) return
        if (!r.ok) throw new Error(String(r.status))
        recordar()
        alPasar()
      } catch {
        if (vivo) fijarEstado('error')
      }
    }
    cargarTurnstile()
      .then((ts) => {
        if (!vivo || !caja.current) return
        id = ts.render(caja.current, {
          sitekey: clave,
          theme: 'auto',
          language: IDIOMA_TURNSTILE[idioma],
          callback: (token: string) => void alToken(token),
          'error-callback': () => fijarEstado('error'),
          'expired-callback': () => fijarEstado('esperando'),
        })
      })
      .catch(() => vivo && fijarEstado('error'))
    return () => {
      vivo = false
      if (id) window.turnstile?.remove(id)
    }
  }, [clave, idioma, intento, alPasar])

  return (
    <main className={estilos.pantalla} aria-labelledby="titulo-verificacion">
      <div className={estilos.tarjeta}>
        <span className={estilos.logo} aria-hidden="true">
          <Icono nombre="grass" relleno tamano={32} />
        </span>
        <h1 id="titulo-verificacion" className={estilos.titulo}>
          {t('verificacion.titulo')}
        </h1>
        <p className={estilos.texto}>{t('verificacion.texto')}</p>
        <div ref={caja} key={intento} className={estilos.widget} />
        <p className={estilos.estado} role="status">
          {estado === 'validando' ? t('verificacion.validando') : estado === 'error' ? t('verificacion.error') : ''}
        </p>
        {estado === 'error' && (
          <Boton
            variante="tonal"
            icono="refresh"
            onClick={() => {
              fijarEstado('esperando')
              fijarIntento((i) => i + 1)
            }}
          >
            {t('comun.reintentar')}
          </Boton>
        )}
      </div>
    </main>
  )
}
