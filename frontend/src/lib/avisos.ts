// Unica puerta a Sileo (DISENO.md, seccion 6). El Toaster y los estilos se montan en App.tsx.
import { sileo, type SileoOptions } from 'sileo'

export interface AccionAviso {
  texto: string
  alPulsar: () => void
}

export interface Aviso {
  titulo: string
  descripcion?: string
  accion?: AccionAviso
}

/** Color de fondo del aviso: inverse-surface de M3 (el de la tinta es inverse-on-surface). */
const FONDO = 'var(--md-sys-color-inverse-surface)'

function aOpciones(aviso: Aviso): SileoOptions {
  return {
    title: aviso.titulo,
    description: aviso.descripcion,
    fill: FONDO,
    button: aviso.accion ? { title: aviso.accion.texto, onClick: aviso.accion.alPulsar } : undefined,
  }
}

export const avisar = {
  exito: (aviso: Aviso) => sileo.success(aOpciones(aviso)),
  info: (aviso: Aviso) => sileo.info(aOpciones(aviso)),
  alerta: (aviso: Aviso) => sileo.warning(aOpciones(aviso)),
  error: (aviso: Aviso) => sileo.error(aOpciones(aviso)),
  promesa: <T>(
    promesa: Promise<T> | (() => Promise<T>),
    textos: {
      cargando: Aviso
      exito: Aviso | ((dato: T) => Aviso)
      error: Aviso | ((causa: unknown) => Aviso)
    },
  ): Promise<T> =>
    sileo.promise(promesa, {
      loading: aOpciones(textos.cargando),
      success: (dato) => aOpciones(typeof textos.exito === 'function' ? textos.exito(dato) : textos.exito),
      error: (causa) => aOpciones(typeof textos.error === 'function' ? textos.error(causa) : textos.error),
    }),
  cerrar: (id: string) => sileo.dismiss(id),
  limpiar: () => sileo.clear(),
}
