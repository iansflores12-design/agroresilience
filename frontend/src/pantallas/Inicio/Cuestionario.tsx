import { useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import type { NombreIcono } from '../../componentes/iconos'
import { SelectorCultivo } from '../../componentes/decision/SuCultivo'
import { ICONO_CULTIVO, ICONO_TEMPORADA, ICONO_TERRENO } from '../../componentes/decision/visual'
import { CULTIVOS, LUGARES, ORDEN_TEMPORADAS, TEMPORADAS, TERRENOS } from '../../lib/decision/parametros'
import type { Temporada, Terreno } from '../../lib/decision/tipos'
import type { Perfil } from '../../estado/EstadoApp'
import { confirmar } from '../../lib/sonido'
import estilos from './Inicio.module.css'

interface Opcion {
  id: string
  nombre: string
  nota?: string
  icono: NombreIcono
}

type Respuestas = Partial<Perfil>

interface Pregunta {
  clave: keyof Perfil
  titulo: string
  opciones: Opcion[]
}

const PREGUNTAS: Pregunta[] = [
  {
    clave: 'zonaId',
    titulo: '¿Dónde está su parcela?',
    opciones: Object.entries(LUGARES).map(([id, l]) => ({ id, nombre: l.nombre, icono: 'location_on' as const })),
  },
  {
    clave: 'terreno',
    titulo: '¿Cómo es su terreno?',
    opciones: (Object.keys(TERRENOS) as Terreno[]).map((id) => ({
      id,
      nombre: TERRENOS[id].nombre,
      nota: TERRENOS[id].descripcion,
      icono: ICONO_TERRENO[id],
    })),
  },
  {
    clave: 'cultivoId',
    titulo: '¿Qué siembra ahora?',
    opciones: Object.entries(CULTIVOS).map(([id, c]) => ({
      id,
      nombre: c.nombre,
      nota: `Unas ${c.cicloSemanas} semanas`,
      icono: ICONO_CULTIVO[id] ?? 'grass',
    })),
  },
  {
    clave: 'temporada',
    titulo: '¿Cuándo lo siembra?',
    opciones: ORDEN_TEMPORADAS.map((id: Temporada) => ({
      id,
      nombre: `De ${TEMPORADAS[id].nombre.toLowerCase()}`,
      nota: TEMPORADAS[id].texto,
      icono: ICONO_TEMPORADA[id],
    })),
  },
]

/**
 * Las preguntas de Gemini Decision, una por pantalla. Al tocar una respuesta pasa a la
 * siguiente; con la ultima se guarda el perfil.
 */
export function Cuestionario({
  inicial,
  alTerminar,
  alCancelar,
}: {
  inicial: Respuestas
  alTerminar: (p: Perfil) => void
  alCancelar?: () => void
}) {
  const [paso, fijarPaso] = useState(0)
  const [respuestas, fijarRespuestas] = useState<Respuestas>(inicial)
  const titulo = useRef<HTMLHeadingElement>(null)
  const pregunta = PREGUNTAS[paso]
  const elegida = respuestas[pregunta.clave]

  useEffect(() => {
    titulo.current?.focus()
  }, [paso])

  function elegir(id: string) {
    const nuevas = { ...respuestas, [pregunta.clave]: id }
    fijarRespuestas(nuevas)
    confirmar()
    if (paso < PREGUNTAS.length - 1) {
      fijarPaso(paso + 1)
      return
    }
    const { zonaId, terreno, cultivoId, temporada } = nuevas
    if (zonaId && terreno && cultivoId && temporada) alTerminar({ zonaId, terreno, cultivoId, temporada })
  }

  return (
    <section className={estilos.cuestionario} aria-labelledby="pregunta-cuestionario">
      <div className={estilos.progreso}>
        <span className="tipo-nota">
          Pregunta {paso + 1} de {PREGUNTAS.length}
        </span>
        <span className={estilos.barraProgreso} aria-hidden="true">
          <span style={{ transform: `scaleX(${(paso + 1) / PREGUNTAS.length})` }} />
        </span>
      </div>
      {paso === 0 && (
        <p className={estilos.intro}>
          Con cuatro respuestas, Gemini Decision compara rotaciones con el pronóstico de su zona.
        </p>
      )}
      <h1 id="pregunta-cuestionario" ref={titulo} tabIndex={-1} className={estilos.pregunta}>
        {pregunta.titulo}
      </h1>
      {pregunta.clave === 'cultivoId' ? (
        <SelectorCultivo elegido={elegida ?? null} alElegir={elegir} />
      ) : (
      <ul className={estilos.opciones}>
        {pregunta.opciones.map((o) => {
          const marcada = o.id === elegida
          return (
            <li key={o.id}>
              <Control
                className={clases(estilos.opcion, marcada && estilos.opcionMarcada, 'capa-estado')}
                aria-pressed={marcada}
                onClick={() => elegir(o.id)}
              >
                <span className={estilos.iconoOpcion}>
                  <Icono nombre={o.icono} tamano={28} />
                </span>
                <span className={estilos.textoOpcion}>
                  <span className={estilos.nombreOpcion}>{o.nombre}</span>
                  {o.nota && <span className="tipo-nota">{o.nota}</span>}
                </span>
                {marcada && <Icono nombre="check" tamano={22} />}
              </Control>
            </li>
          )
        })}
      </ul>
      )}
      <div className={estilos.accionesCuestionario}>
        {paso > 0 ? (
          <Boton variante="texto" icono="arrow_back" onClick={() => fijarPaso(paso - 1)}>
            Atrás
          </Boton>
        ) : (
          alCancelar && (
            <Boton variante="texto" icono="close" onClick={alCancelar}>
              Cancelar
            </Boton>
          )
        )}
        {elegida && paso < PREGUNTAS.length - 1 && (
          <Boton variante="tonal" icono="arrow_forward" onClick={() => fijarPaso(paso + 1)}>
            Siguiente
          </Boton>
        )}
      </div>
    </section>
  )
}
