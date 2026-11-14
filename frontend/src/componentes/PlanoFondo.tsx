import estilos from './PlanoFondo.module.css'

export interface PropsPlanoFondo {
  /** Palabra gigante decorativa. */
  texto: string
}

/** Plano de fondo: tipografia gigante decorativa, recortada por los bordes. */
export function PlanoFondo({ texto }: PropsPlanoFondo) {
  return (
    <div className="plano-fondo" aria-hidden="true">
      <span className={estilos.texto}>{texto}</span>
    </div>
  )
}
