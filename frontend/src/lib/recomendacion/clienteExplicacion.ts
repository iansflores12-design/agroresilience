import type { PeticionExplicacion } from './clienteDecision'

/**
 * Lee un flujo de bytes como texto UTF-8. Usa `stream: true` para que una letra con tilde
 * partida entre dos fragmentos no se rompa. Lanza si se aborta.
 */
export async function leerFlujoTexto(flujo: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<string> {
  const lector = flujo.getReader()
  const decodificador = new TextDecoder('utf-8')
  const alAbortar = () => {
    void lector.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', alAbortar, { once: true })
  let texto = ''
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Peticion cancelada', 'AbortError')
      const { done, value } = await lector.read()
      if (done) break
      texto += decodificador.decode(value, { stream: true })
    }
    texto += decodificador.decode()
    if (signal?.aborted) throw new DOMException('Peticion cancelada', 'AbortError')
    return texto
  } finally {
    signal?.removeEventListener('abort', alAbortar)
  }
}

/** POST /explicacion: devuelve el texto completo (resumen, linea `---`, detalle). Lanza si falla. */
export async function pedirExplicacion(urlBase: string, peticion: PeticionExplicacion, signal?: AbortSignal): Promise<string> {
  const respuesta = await fetch(`${urlBase.replace(/\/+$/, '')}/explicacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(peticion),
    signal,
  })
  if (!respuesta.ok) throw new Error(`El servidor respondio ${respuesta.status}`)
  if (respuesta.body) return leerFlujoTexto(respuesta.body, signal)
  return respuesta.text()
}
