import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLAVE_SESION, VerificacionHumana } from './VerificacionHumana'

function turnstileQue(respuesta: 'token' | 'error') {
  const render = vi.fn((_el: HTMLElement, o: Record<string, (x?: string) => void>) => {
    queueMicrotask(() => (respuesta === 'token' ? o.callback('token-de-prueba') : o['error-callback']()))
    return 'w1'
  })
  window.turnstile = { render, remove: vi.fn() }
  return render
}

describe('VerificacionHumana', () => {
  beforeEach(() => window.sessionStorage.clear())
  afterEach(() => {
    delete window.turnstile
    vi.unstubAllGlobals()
  })

  it('pide la verificacion al abrir y, si el servidor la confirma, muestra el sitio', async () => {
    const render_ = turnstileQue('token')
    const fetch_ = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch_)
    render(
      <VerificacionHumana saltar={false}>
        <p>Contenido del sitio</p>
      </VerificacionHumana>,
    )
    expect(screen.getByRole('heading', { name: 'Un momento' })).toBeInTheDocument()
    expect(await screen.findByText('Contenido del sitio')).toBeInTheDocument()
    expect(render_.mock.calls[0][1]).toMatchObject({ sitekey: expect.any(String), theme: 'auto', language: 'es' })
    expect(fetch_).toHaveBeenCalledWith('/api/verificar', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'token-de-prueba' }) }))
    expect(Number(window.sessionStorage.getItem(CLAVE_SESION))).toBeGreaterThan(Date.now())
  })

  it('si el servidor rechaza, no abre el sitio y ofrece reintentar', async () => {
    turnstileQue('token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'rechazado' }), { status: 403 })))
    render(
      <VerificacionHumana saltar={false}>
        <p>Contenido del sitio</p>
      </VerificacionHumana>,
    )
    expect(await screen.findByText(/No se pudo verificar/)).toBeInTheDocument()
    expect(screen.queryByText('Contenido del sitio')).not.toBeInTheDocument()
    turnstileQue('token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('Contenido del sitio')).toBeInTheDocument())
  })

  it('con una verificacion vigente en la pestana no la vuelve a pedir', () => {
    window.sessionStorage.setItem(CLAVE_SESION, String(Date.now() + 60_000))
    render(
      <VerificacionHumana saltar={false}>
        <p>Contenido del sitio</p>
      </VerificacionHumana>,
    )
    expect(screen.getByText('Contenido del sitio')).toBeInTheDocument()
  })
})
