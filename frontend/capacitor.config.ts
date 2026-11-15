import type { CapacitorConfig } from '@capacitor/cli'

/**
 * App nativa de Android. Empaqueta `dist/` (compilado con `npm run build:android`) dentro de un
 * WebView; la app se sirve desde https://localhost, por eso el backend debe permitir ese origen
 * (ver vercel.json) y `VITE_API_URL` debe ser una URL absoluta (ver .env.android).
 */
const config: CapacitorConfig = {
  appId: 'hn.agroresilience.app',
  appName: 'AgroResilience',
  webDir: 'dist',
  android: {
    // Solo https: el WebView no carga contenido http mezclado.
    allowMixedContent: false,
  },
}

export default config
