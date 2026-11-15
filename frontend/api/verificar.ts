// POST /api/verificar  { token }  ->  { ok: true } y la cookie de verificacion, o { error }
// El token sale del widget de Turnstile que se muestra al abrir el sitio.

import { COOKIE, DURACION_S, crearSello, secreto, validarToken } from './_turnstile.js'

const json = (dato: unknown, estado = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(dato), { status: estado, headers: { 'Content-Type': 'application/json', ...extra } })

export async function POST(request: Request): Promise<Response> {
  const cuerpo = (await request.json().catch(() => null)) as { token?: unknown } | null
  const token = typeof cuerpo?.token === 'string' ? cuerpo.token.trim() : ''
  // Cloudflare acepta tokens de hasta 2048 caracteres.
  if (!token || token.length > 2048) return json({ error: 'sin_token' }, 400)

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const r = await validarToken(token, ip)
  if (!r.ok) {
    if (r.causa !== 'rechazado') console.error(`[verificar] ${r.causa}`)
    return json({ error: r.causa }, r.causa === 'rechazado' ? 403 : r.causa === 'sin_clave' ? 503 : 502)
  }
  const seguro = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  const cookie = `${COOKIE}=${crearSello(secreto()!)}; Max-Age=${DURACION_S}; Path=/; HttpOnly; SameSite=Lax${seguro}`
  return json({ ok: true }, 200, { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' })
}
