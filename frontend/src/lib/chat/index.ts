import { crearClienteDemo } from './clienteDemo'
import { crearClienteHttp } from './clienteHttp'
import type { ClienteChat } from './tipos'

export * from './tipos'
export { armarContexto } from './contexto'

function urlApi(): string {
  const v: unknown = import.meta.env.VITE_API_URL
  return typeof v === 'string' ? v.trim() : ''
}

export function esModoDemo(): boolean {
  return urlApi() === ''
}

export function crearClienteChat(): ClienteChat {
  const url = urlApi()
  return url ? crearClienteHttp(url) : crearClienteDemo()
}
