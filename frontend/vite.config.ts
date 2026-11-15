import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { loadEnv, type Plugin } from 'vite'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

/**
 * En desarrollo, sirve las funciones de `api/` (las mismas que corre Vercel) dentro de Vite.
 * Cada archivo exporta `POST(request: Request): Promise<Response>`; las respuestas en vivo se
 * pasan trozo a trozo.
 */
function apiLocal(): Plugin {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res, next) => {
        const url = req.url ?? ''
        const ruta = /^\/api\/([a-z]+)(?:\?.*)?$/.exec(url)
        if (!ruta) return next()
        try {
          const modulo: Record<string, unknown> = await server.ssrLoadModule(`/api/${ruta[1]}.ts`)
          const manejador = modulo[req.method ?? 'GET']
          if (typeof manejador !== 'function') {
            res.statusCode = 405
            res.end()
            return
          }
          const trozos: Buffer[] = []
          for await (const t of req) trozos.push(t as Buffer)
          const cabeceras = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cabeceras.set(k, v)
          const corte = new AbortController()
          res.on('close', () => {
            if (!res.writableEnded) corte.abort()
          })
          const peticion = new Request(`http://${req.headers.host ?? 'localhost'}${url}`, {
            method: req.method,
            headers: cabeceras,
            body: trozos.length ? Buffer.concat(trozos) : undefined,
            signal: corte.signal,
          })
          const respuesta = (await manejador(peticion)) as Response
          res.statusCode = respuesta.status
          respuesta.headers.forEach((v, k) => res.setHeader(k, v))
          if (respuesta.body) {
            const lector = respuesta.body.getReader()
            for (;;) {
              const { done, value } = await lector.read()
              if (done) break
              res.write(value)
            }
          }
          res.end()
        } catch (e) {
          if (e instanceof Error) server.ssrFixStacktrace(e)
          server.config.logger.error(String(e instanceof Error ? e.stack : e))
          if (!res.headersSent) res.statusCode = 500
          res.end()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Variables del servidor (sin prefijo VITE_): GEMINI_API_KEY, GEMINI_MODELOS, GEMINI_PENSAMIENTO.
  // Se leen de .env.local y nunca se mandan al navegador.
  const entorno = loadEnv(mode, process.cwd(), 'GEMINI_')
  for (const [k, v] of Object.entries(entorno)) process.env[k] ??= v

  return {
    plugins: [react(), svgr(), apiLocal()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/pruebas/configuracion.ts'],
    },
  }
})
