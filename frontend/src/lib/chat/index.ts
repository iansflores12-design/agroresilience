import { crearClienteHttp } from './clienteHttp'
import { crearClienteResistente } from './clienteResistente'
import type { ClienteChat } from './tipos'

export * from './tipos'
export { armarContexto } from './contexto'
export { respuestaLocal } from './clienteResistente'

/** Base de la API: VITE_API_URL o, si no se definio al compilar, /api del mismo sitio (Vercel). */
export function urlApi(): string {
  const v: unknown = import.meta.env.VITE_API_URL
  return (typeof v === 'string' && v.trim()) || '/api'
}

export function crearClienteChat(): ClienteChat {
  return crearClienteResistente(crearClienteHttp(urlApi()))
}
