import type { Consejo, TemaConsejo } from '../../datos/consejos'
import { Icono } from '../Icono'
import type { NombreIcono } from '../iconos'
import { Tarjeta } from '../Tarjeta'
import estilos from './ConsejosLugar.module.css'

const ICONO_TEMA: Record<TemaConsejo, NombreIcono> = {
  agua: 'water_drop',
  siembra: 'calendar_month',
  tierra: 'landscape',
  calor: 'thermostat',
  cultivo: 'grass',
}

/** Tarjeta "Consejos para <departamento>": cada consejo en palabras de campo y su detalle tecnico abajo. */
export function ConsejosLugar({ nombreDepartamento, consejos }: { nombreDepartamento: string; consejos: Consejo[] }) {
  if (consejos.length === 0) return null
  return (
    <Tarjeta como="section" variante="relleno" className={estilos.tarjeta} aria-labelledby="titulo-consejos">
      <h2 id="titulo-consejos" className="tipo-titulo">
        Consejos para {nombreDepartamento}
      </h2>
      <ul className={estilos.lista}>
        {consejos.map((c) => (
          <li key={c.id} className={estilos.consejo} data-tema={c.tema}>
            <span className={estilos.icono}>
              <Icono nombre={c.id === 'tecnico' ? 'person' : ICONO_TEMA[c.tema]} />
            </span>
            <div className={estilos.cuerpo}>
              <h3 className={estilos.titulo}>{c.titulo}</h3>
              <p className={estilos.texto}>{c.texto}</p>
              <details className={estilos.detalle}>
                <summary>Ver el detalle técnico</summary>
                <p className="tipo-nota">{c.detalle}</p>
              </details>
            </div>
          </li>
        ))}
      </ul>
      <p className="tipo-nota">Puntajes y consejos de ejemplo, todavía sin validar con técnicos. Consulte a su técnico.</p>
    </Tarjeta>
  )
}
