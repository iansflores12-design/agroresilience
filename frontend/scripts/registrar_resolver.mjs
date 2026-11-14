// @material/material-color-utilities 0.4.0 importa modulos sin extension, algo que el
// cargador ESM de Node no resuelve. Este gancho reintenta con ".js" cuando falla.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(especificador, contexto, siguiente) {
    try {
      return siguiente(especificador, contexto)
    } catch (error) {
      if (
        error?.code === 'ERR_MODULE_NOT_FOUND' &&
        especificador.startsWith('.') &&
        !/\.[a-z]+$/.test(especificador)
      ) {
        return siguiente(`${especificador}.js`, contexto)
      }
      throw error
    }
  },
})
