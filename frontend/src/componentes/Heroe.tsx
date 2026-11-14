import estilos from './Heroe.module.css'

export interface PropsHeroe {
  valor: string | number
  unidad?: string
  nota?: string
}

/** El dato enorme de una seccion, con su unidad y su nota en letra pequena. */
export function Heroe({ valor, unidad, nota }: PropsHeroe) {
  return (
    <div className={estilos.heroe}>
      <p className={estilos.valor}>{valor}</p>
      {unidad && <p className={estilos.unidad}>{unidad}</p>}
      {nota && <p className={estilos.nota}>{nota}</p>}
    </div>
  )
}
