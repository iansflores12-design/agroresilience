import { useNavigate } from 'react-router-dom'
import { Icono } from '../../componentes/Icono'
import type { NombreIcono } from '../../componentes/iconos'
import { Control } from '../../componentes/Control'
import { clases } from '../../componentes/clases'
import { Heroe } from '../../componentes/Heroe'
import { SelectorDeslizable } from '../../componentes/SelectorDeslizable'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarCultivo, cultivos, etapaEnSemana, type Cultivo } from '../../datos/cultivos'
import { rotaciones, type PasoRotacion, type Rotacion } from '../../datos/rotaciones'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { confirmar } from '../../lib/sonido'
import estilos from './Cultivos.module.css'
import { DondeSeDa } from './DondeSeDa'

const NOMBRES_MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const ICONO_CULTIVO: Record<string, NombreIcono> = {
  maiz: 'grain',
  frijol: 'eco',
  sorgo: 'spa',
  arroz: 'rice_bowl',
  tomate: 'nutrition',
  'frijol-terciopelo': 'local_florist',
}

const ICONO_TEMPORADA: Record<PasoRotacion['temporada'], NombreIcono> = {
  primera: 'rainy',
  postrera: 'water_drop',
  verano: 'wb_sunny',
}

/** "Mayo a agosto" */
function mesesEnPalabras(paso: PasoRotacion): string {
  const inicio = NOMBRES_MESES[paso.mesInicio - 1]
  const fin = NOMBRES_MESES[paso.mesFin - 1]
  return `${inicio[0].toUpperCase()}${inicio.slice(1)} a ${fin}`
}

function TarjetaRotacion({
  rotacion,
  cultivoId,
  alElegir,
}: {
  rotacion: Rotacion
  cultivoId: string | null
  alElegir: (id: string) => void
}) {
  const titulo = `rotacion-${rotacion.id}`
  return (
    <Tarjeta como="li" variante="relleno" className={estilos.rotacion}>
      <h3 id={titulo} className="tipo-titulo">
        {rotacion.nombre}
      </h3>
      <p className={estilos.beneficio}>{rotacion.beneficio}</p>
      <ol className={estilos.pasos} aria-labelledby={titulo}>
        {rotacion.pasos.flatMap((paso) => {
          const cultivo = buscarCultivo(paso.cultivoId)
          if (!cultivo) return []
          const elegido = cultivo.id === cultivoId
          return (
            <li key={`${paso.cultivoId}-${paso.temporada}`}>
              <Control
                className={clases(estilos.paso, elegido && estilos.pasoElegido, 'capa-estado')}
                aria-label={`${cultivo.nombre}, ${paso.temporada}, ${mesesEnPalabras(paso).toLowerCase()}`}
                aria-pressed={elegido}
                onClick={() => alElegir(cultivo.id)}
              >
                <span className={estilos.iconoPaso}>
                  <Icono nombre={ICONO_TEMPORADA[paso.temporada]} tamano={22} />
                </span>
                <span className={estilos.textoPaso}>
                  <span className={estilos.nombrePaso}>{cultivo.nombre}</span>
                  <span className="tipo-nota">{mesesEnPalabras(paso)}</span>
                </span>
                {elegido && <Icono nombre="check" tamano={22} />}
              </Control>
            </li>
          )
        })}
      </ol>
    </Tarjeta>
  )
}

function TiraEtapas({ cultivo, semana }: { cultivo: Cultivo; semana: number }) {
  const actual = etapaEnSemana(cultivo, semana)
  const descripcion = `Etapas del ciclo: ${cultivo.etapas.map((e) => e.nombre).join(', ')}. Etapa actual: ${actual.nombre}.`
  return (
    <div className={estilos.etapas} role="img" aria-label={descripcion}>
      {cultivo.etapas.map((e) => (
        <span
          key={e.id}
          className={e.id === actual.id ? `${estilos.etapa} ${estilos.etapaActual}` : estilos.etapa}
          style={{ flexGrow: e.hastaSemana - e.desdeSemana + 1 }}
          title={e.nombre}
        />
      ))}
    </div>
  )
}

export default function Cultivos() {
  const { cultivoId, edadSemanas, elegirCultivo, fijarEdad } = useEstadoApp()
  const navegar = useNavigate()
  const cultivo = buscarCultivo(cultivoId)
  const semana = cultivo ? Math.min(edadSemanas, cultivo.cicloSemanas) : 0

  const elegir = (id: string) => {
    const elegido = buscarCultivo(id)
    if (!elegido || id === cultivoId) return
    elegirCultivo(id)
    confirmar()
    avisar.exito({
      titulo: `Cultivo: ${elegido.nombre}`,
      descripcion: 'Se usará en el mapa, la tierra y las preguntas.',
      accion: { texto: 'Ver mapa', alPulsar: () => navegar('/mapa') },
    })
  }

  return (
    <div className="pantalla">
      <div className={estilos.medio}>
        <h1 className={estilos.pregunta}>¿Qué sembró?</h1>

        <section className={estilos.seccion} aria-labelledby="titulo-todos">
          <h2 id="titulo-todos" className="solo-lectores">
            Elegir cultivo
          </h2>
          <ul className={estilos.cultivos}>
            {cultivos.map((c) => {
              const elegido = c.id === cultivoId
              return (
                <li key={c.id}>
                  <Control
                    className={clases(estilos.cultivo, elegido && estilos.cultivoElegido, 'capa-estado')}
                    aria-pressed={elegido}
                    onClick={() => elegir(c.id)}
                  >
                    <span className={estilos.iconoCultivo}>
                      <Icono nombre={ICONO_CULTIVO[c.id] ?? 'grass'} tamano={32} />
                    </span>
                    <span className={estilos.nombreCultivo}>{c.nombre}</span>
                    <span className="tipo-nota">Unas {c.cicloSemanas} semanas</span>
                    {elegido && (
                      <span className={estilos.visto}>
                        <Icono nombre="check" tamano={20} />
                      </span>
                    )}
                  </Control>
                </li>
              )
            })}
          </ul>
        </section>

        {cultivo && (
          <section className={estilos.edad} aria-labelledby="titulo-edad">
            <h2 id="titulo-edad" className="tipo-titulo">
              ¿Hace cuánto sembró?
            </h2>
            <Heroe
              valor={semana}
              unidad="semanas desde la siembra"
              nota={`Está en la etapa de ${etapaEnSemana(cultivo, semana).nombre.toLowerCase()}`}
            />
            <SelectorDeslizable
              etiqueta="Edad del cultivo"
              valor={semana}
              min={0}
              max={cultivo.cicloSemanas}
              paso={1}
              marcaMayorCada={4}
              unidad="semanas"
              alCambiar={fijarEdad}
              textoValor={(v) => `${v} semanas, etapa ${etapaEnSemana(cultivo, v).nombre}`}
            />
            <TiraEtapas cultivo={cultivo} semana={semana} />
          </section>
        )}

        {cultivo && <DondeSeDa key={cultivo.id} cultivo={cultivo} />}

        <section className={estilos.seccion} aria-labelledby="titulo-rotaciones">
          <h2 id="titulo-rotaciones" className="tipo-titulo">
            Qué sembrar después
          </h2>
          <ul className={estilos.rotaciones}>
            {rotaciones.map((r) => (
              <TarjetaRotacion key={r.id} rotacion={r} cultivoId={cultivoId} alElegir={elegir} />
            ))}
          </ul>
          <p className="tipo-nota">Calendario de referencia. Consulte a su técnico.</p>
        </section>
      </div>
    </div>
  )
}
