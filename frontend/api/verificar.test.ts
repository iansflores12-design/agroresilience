import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIE, crearSello, humanoVerificado } from './_turnstile.js'
import { POST } from './verificar.js'

const pedir = (cuerpo: unknown) => POST(new Request('https://agro.test/api/verificar', { method: 'POST', body: JSON.stringify(cuerpo) }))

describe('/api/verificar (Turnstile)', () => {
  let enviado: URLSearchParams
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'secreto-de-prueba'
  })
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY
    vi.unstubAllGlobals()
  })
  const cloudflare = (success: boolean) =>
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      enviado = init.body as URLSearchParams
      return new Response(JSON.stringify({ success }), { status: 200 })
    }))

  it('confirma el token con Cloudflare y deja una cookie firmada', async () => {
    cloudflare(true)
    const r = await pedir({ token: 'abc' })
    expect(r.status).toBe(200)
    expect(enviado.get('secret')).toBe('secreto-de-prueba')
    expect(enviado.get('response')).toBe('abc')
    const cookie = r.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(new RegExp(`^${COOKIE}=\\d+\\.[\\w-]+; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax; Secure$`))
    const conCookie = new Request('https://agro.test/api/chat', { headers: { cookie: cookie.split(';')[0] } })
    expect(humanoVerificado(conCookie)).toBe(true)
  })

  it('rechaza tokens invalidos, ausentes y cookies alteradas o vencidas', async () => {
    cloudflare(false)
    expect((await pedir({ token: 'malo' })).status).toBe(403)
    expect((await pedir({})).status).toBe(400)
    const sello = crearSello('secreto-de-prueba')
    const [vence, firma] = sello.split('.')
    const con = (v: string) => new Request('https://agro.test/', { headers: { cookie: `otra=1; ${COOKIE}=${v}` } })
    expect(humanoVerificado(con(sello))).toBe(true)
    expect(humanoVerificado(con(`${Number(vence) + 999}.${firma}`))).toBe(false)
    expect(humanoVerificado(con(crearSello('secreto-de-prueba', 0)))).toBe(false)
    expect(humanoVerificado(new Request('https://agro.test/'))).toBe(false)
  })
})
