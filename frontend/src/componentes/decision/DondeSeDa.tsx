import { useState } from 'react'
import { aptitud, buscarDepartamento, departamentoDeZona, ranking, tieneAptitud } from '../../datos/aptitud'
import type { Cultivo } from '../../datos/cultivos'
import { cajaHonduras } from '../../datos/zonas'
import { Boton } from '../Boton'
import { ContenedorMapa } from '../mapa/ContenedorMapa'
import { useEscenario } from '../mapa/escenario'
import { LeyendaAptitud, NivelAptitud } from '../mapa/NivelAptitud'
import estilos from './DondeSeDa.module.css'

const SIN_LUGARES: never[] = []
const sinAccion = () => {}

/**
 * Honduras entera pintada según qué tan bien se da el cultivo, con la mirada puesta en el
 * departamento de la parcela: es el único que va entero y con su puntaje encima. Al tocar
 * otro departamento, el enfoque pasa a ese.
 */
export function DondeSeDa({ cultivo, zonaId }: { cultivo: Cultivo; zonaId: string | null }) {
  const [escenario] = useEscenario()
  const [tocado, fijarTocado] = useState<string | null>(null)
  if (!tieneAptitud(cultivo.id)) return null

  const nombre = cultivo.nombre.toLowerCase()
  const propio = departamentoDeZona(zonaId)
  const departamentoId = tocado ?? propio
  const resultado = aptitud(departamentoId, cultivo.id, escenario)
  const mejores = ranking(cultivo.id, escenario).slice(0, 3)
  const enOtro = tocado !== null && propio !== null && tocado !== propio

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-donde">
      <h2 id="titulo-donde" className="tipo-titulo">
        ¿Dónde se da mejor el {nombre}?
      </h2>
      <div className={estilos.mapa}>
        <ContenedorMapa
          zonas={SIN_LUGARES}
          caja={cajaHonduras}
          zonaSeleccionadaId={null}
          cultivoId={cultivo.id}
          alSeleccionarZona={sinAccion}
          departamentoId={departamentoId}
          alSeleccionarDepartamento={fijarTocado}
          escenario={escenario}
          enfocar
        />
      </div>
      {resultado ? (
        <p className={estilos.resultado} aria-live="polite">
          <NivelAptitud nivel={resultado.nivel} />
          <span>
            {resultado.departamento.nombre}: {resultado.total} de 100 para {nombre}
            {departamentoId === propio ? ', donde está su parcela.' : '.'}
          </span>
        </p>
      ) : (
        <p className={estilos.resultado}>Toque un departamento para ver su puntaje.</p>
      )}
      <LeyendaAptitud />
      <p className={estilos.apoyo}>
        Se da mejor en {mejores[0].nombre}, {mejores[1].nombre} y {mejores[2].nombre}.
      </p>
      <div className={estilos.acciones}>
        {enOtro && (
          <Boton variante="tonal" icono="my_location" onClick={() => fijarTocado(null)}>
            Volver a {buscarDepartamento(propio)?.nombre ?? 'mi departamento'}
          </Boton>
        )}
        <Boton to="/mapa" variante="texto" icono="map">
          Ver el mapa completo
        </Boton>
      </div>
      <p className="tipo-nota">Puntajes de ejemplo por departamento, todavía sin validar. Consulte a su técnico.</p>
    </section>
  )
}
