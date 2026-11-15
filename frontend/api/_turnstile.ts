// Verificacion humana con Cloudflare Turnstile. Solo corre en el servidor: TURNSTILE_SECRET_KEY nunca
// llega al navegador. https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

import { createHmac, timingSafeEqual } from 'node:crypto'

const URL_VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
/** Clave secreta de prueba de Cloudflare: siempre aprueba. Solo fuera de produccion. */
export const SECRETO_PRUEBA = '1x0000000000000000000000000000000AA'
export const COOKIE = 'ar_humano'
/** La verificacion dura 12 horas. */
export const DURACION_S = 12 * 60 * 60

export function secreto(): string | null {
  const propio = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (propio) return propio
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' ? null : SECRETO_PRUEBA
}

export type ResultadoTurnstile = { ok: true } | { ok: false; causa: 'sin_clave' | 'rechazado' | 'red' }

/** Pregunta a Cloudflare si el token del widget es valido. */
export async function validarToken(token: string, ip?: string | null): Promise<ResultadoTurnstile> {
  const clave = secreto()
  if (!clave) return { ok: false, causa: 'sin_clave' }
  const cuerpo = new URLSearchParams({ secret: clave, response: token })
  if (ip) cuerpo.set('remoteip', ip)
  try {
    const r = await fetch(URL_VERIFICAR, { method: 'POST', body: cuerpo })
    const dato = (await r.json().catch(() => null)) as { success?: boolean } | null
    return dato?.success === true ? { ok: true } : { ok: false, causa: 'rechazado' }
  } catch {
    return { ok: false, causa: 'red' }
  }
}

function firmar(texto: string, clave: string): string {
  return createHmac('sha256', clave).update(texto).digest('base64url')
}

/** Valor de la cookie: vencimiento (segundos) y su firma con la clave secreta. */
export function crearSello(clave: string, ahoraS = Math.floor(Date.now() / 1000)): string {
  const vence = String(ahoraS + DURACION_S)
  return `${vence}.${firmar(vence, clave)}`
}

/**
 * La peticion trae una verificacion vigente. Sirve para que otras funciones de `api/` exijan haber
 * pasado Turnstile antes de responder.
 */
export function humanoVerificado(request: Request, ahoraS = Math.floor(Date.now() / 1000)): boolean {
  const clave = secreto()
  if (!clave) return false
  const cookie = request.headers.get('cookie') ?? ''
  const valor = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  if (!valor) return false
  const [vence, firma] = valor.split('.')
  if (!vence || !firma || Number(vence) < ahoraS) return false
  const esperada = Buffer.from(firmar(vence, clave))
  const recibida = Buffer.from(firma)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}
