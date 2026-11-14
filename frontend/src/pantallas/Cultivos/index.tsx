import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip } from '../../componentes/Chip'
import { Heroe } from '../../componentes/Heroe'
import { PlanoFondo } from '../../componentes/PlanoFondo'
import { SelectorDeslizable } from '../../componentes/SelectorDeslizable'
import { Tarjeta } from '../../componentes/Tarjeta'
import { buscarCultivo, cultivos, etapaEnSemana, type Cultivo } from '../../datos/cultivos'
import { rotaciones, type PasoRotacion, type Rotacion } from '../../datos/rotaciones'
import { useEstadoApp } from '../../estado/EstadoApp'
import { avisar } from '../../lib/avisos'
import { confirmar } from '../../lib/sonido'
import estilos from './Cultivos.module.css'

const INICIALES_MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
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

interface Tramo {
  /** Columna inicial y final (inclusive) en la regla de 12 meses. */
  desde: number
  hasta: number
  continuacion: boolean
}

/** Un paso ocupa sus meses; si cruza de diciembre a enero se parte en dos tramos. */
function tramosDe(paso: PasoRotacion): Tramo[] {
  if (paso.mesFin >= paso.mesInicio) return [{ desde: paso.mesInicio, hasta: paso.mesFin, continuacion: false }]
  return [
    { desde: paso.mesInicio, hasta: 12, continuacion: false },
    { desde: 1, hasta: paso.mesFin, continuacion: true },
  ]
}

function etiquetaPaso(nombre: string, paso: PasoRotacion, continuacion: boolean): string {
  const meses = `de ${NOMBRES_MESES[paso.mesInicio - 1]} a ${NOMBRES_MESES[paso.mesFin - 1]}`
  return `${nombre}, ${paso.temporada}, ${meses}${continuacion ? ' (continúa)' : ''}`
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
      <p className="tipo-nota">{rotacion.resumen}</p>
      <p className="tipo-nota">{rotacion.beneficio}</p>
      <div className={estilos.regla}>
        {rotacion.pasos.flatMap((paso) => {
          const cultivo = buscarCultivo(paso.cultivoId)
          if (!cultivo) return []
          return tramosDe(paso).map((t) => (
            <div
              key={`${paso.cultivoId}-${paso.temporada}-${t.desde}`}
              className={estilos.barra}
              style={{ gridColumn: `${t.desde} / ${t.hasta + 1}` }}
            >
              <Chip
                variante="filtro"
                seleccionado={cultivo.id === cultivoId}
                aria-label={etiquetaPaso(cultivo.nombre, paso, t.continuacion)}
                title={`${cultivo.nombre}, ${paso.temporada}`}
                onClick={() => alElegir(cultivo.id)}
              >
                {cultivo.nombre}
              </Chip>
            </div>
          ))
        })}
        {INICIALES_MESES.map((inicial, i) => (
          <span key={NOMBRES_MESES[i]} className={estilos.mes} aria-hidden="true">
            {inicial}
          </span>
        ))}
      </div>
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
  // Etapa vigente al soltar el selector por ultima vez (o al elegir el cultivo).
  const etapaBase = useRef<string | null>(cultivo ? etapaEnSemana(cultivo, semana).id : null)

  const elegir = (id: string) => {
    const elegido = buscarCultivo(id)
    if (!elegido || id === cultivoId) return
    elegirCultivo(id)
    etapaBase.current = etapaEnSemana(elegido, 0).id
    confirmar()
    avisar.exito({
      titulo: `Cultivo: ${elegido.nombre}`,
      descripcion: 'Se usará en el mapa, la hoja de zona y el asistente.',
      accion: { texto: 'Ver mapa', alPulsar: () => navegar('/mapa') },
    })
  }

  const alSoltarEdad = (valor: number) => {
    if (!cultivo) return
    const etapa = etapaEnSemana(cultivo, valor)
    if (etapaBase.current !== etapa.id) {
      avisar.info({ titulo: `Etapa: ${etapa.nombre}`, descripcion: `Semana ${valor} de ${cultivo.cicloSemanas}` })
    }
    etapaBase.current = etapa.id
  }

  return (
    <div className="pantalla">
      {/* La clave reinicia la animacion de entrada cuando cambia la palabra. */}
      <div key={cultivo?.id ?? 'ninguno'} className={estilos.fondo}>
        <PlanoFondo texto={cultivo?.nombre ?? 'Cultivos'} />
      </div>
      <div className={`plano-medio ${estilos.medio}`}>
        <h1 className="tipo-titulo">Cultivos</h1>

        <section className={estilos.seccion} aria-labelledby="titulo-rotaciones">
          <h2 id="titulo-rotaciones" className="tipo-titulo">
            Rotaciones
          </h2>
          <ul className={estilos.rotaciones}>
            {rotaciones.map((r) => (
              <TarjetaRotacion key={r.id} rotacion={r} cultivoId={cultivoId} alElegir={elegir} />
            ))}
          </ul>
          <p className="tipo-nota">Calendario de referencia, pendiente de validación agronómica.</p>
        </section>

        <section className={estilos.seccion} aria-labelledby="titulo-edad">
          <h2 id="titulo-edad" className="tipo-titulo">
            Edad del cultivo
          </h2>
          {cultivo ? (
            <div className={estilos.edad}>
              <Heroe
                valor={semana}
                unidad="semanas desde la siembra"
                nota={`Etapa: ${etapaEnSemana(cultivo, semana).nombre}. ${cultivo.nombreCientifico}`}
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
                alSoltar={alSoltarEdad}
                textoValor={(v) => `${v} semanas, etapa ${etapaEnSemana(cultivo, v).nombre}`}
              />
              <TiraEtapas cultivo={cultivo} semana={semana} />
            </div>
          ) : (
            <p className="tipo-nota">Elige un cultivo en alguna rotación para indicar cuántas semanas lleva sembrado.</p>
          )}
        </section>

        <section className={estilos.seccion} aria-labelledby="titulo-todos">
          <h2 id="titulo-todos" className="tipo-titulo">
            Todos los cultivos
          </h2>
          <ul className={estilos.chips}>
            {cultivos.map((c) => (
              <li key={c.id}>
                <Chip variante="filtro" seleccionado={c.id === cultivoId} onClick={() => elegir(c.id)}>
                  {c.nombre}
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
