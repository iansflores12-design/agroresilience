import { useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { useEscenario } from '../../componentes/mapa/escenario'
import { LeyendaAptitud, NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { aptitud, departamentoDeZona, ranking, tieneAptitud } from '../../datos/aptitud'
import type { Cultivo } from '../../datos/cultivos'
import { cajaHonduras } from '../../datos/zonas'
import { useEstadoApp } from '../../estado/EstadoApp'
import estilos from './Cultivos.module.css'

const SIN_LUGARES: never[] = []
const sinAccion = () => {}

/** Mapa de Honduras con los departamentos pintados segun que tan bien se da el cultivo elegido. */
export function DondeSeDa({ cultivo }: { cultivo: Cultivo }) {
  const { zonaId } = useEstadoApp()
  const [escenario] = useEscenario()
  const [tocado, fijarTocado] = useState<string | null>(null)
  if (!tieneAptitud(cultivo.id)) return null

  const nombre = cultivo.nombre.toLowerCase()
  const departamentoId = tocado ?? departamentoDeZona(zonaId)
  const resultado = aptitud(departamentoId, cultivo.id, escenario)
  const mejores = ranking(cultivo.id, escenario).slice(0, 3)

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-donde">
      <h2 id="titulo-donde" className="tipo-titulo">
        ¿Dónde se da mejor el {nombre}?
      </h2>
      <div className={estilos.mapaInicio}>
        <ContenedorMapa
          zonas={SIN_LUGARES}
          caja={cajaHonduras}
          zonaSeleccionadaId={null}
          cultivoId={cultivo.id}
          alSeleccionarZona={sinAccion}
          departamentoId={departamentoId}
          alSeleccionarDepartamento={fijarTocado}
          escenario={escenario}
        />
      </div>
      <LeyendaAptitud />
      {resultado ? (
        <p className={estilos.resultado}>
          <NivelAptitud nivel={resultado.nivel} />
          <span>
            En {resultado.departamento.nombre}: {resultado.total} de 100.
          </span>
        </p>
      ) : (
        <p className={estilos.resultado}>
          Se da mejor en {mejores[0].nombre}, {mejores[1].nombre} y {mejores[2].nombre}. Toque un departamento para ver el suyo.
        </p>
      )}
      <Boton to="/mapa" variante="tonal" icono="map" className={estilos.accion}>
        Ver el mapa completo
      </Boton>
      <p className="tipo-nota">Puntajes de ejemplo, todavía sin validar. Consulte a su técnico.</p>
    </section>
  )
}
