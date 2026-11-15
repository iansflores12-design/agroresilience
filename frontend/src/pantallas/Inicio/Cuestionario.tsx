import { useEffect, useRef, useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { Control } from '../../componentes/Control'
import { Icono } from '../../componentes/Icono'
import { clases } from '../../componentes/clases'
import type { NombreIcono } from '../../componentes/iconos'
import { EdadCultivo, SelectorCultivo } from '../../componentes/decision/SuCultivo'
import { buscarCultivo } from '../../datos/cultivos'
import { zonas } from '../../datos/zonas'
import { dentroDeHonduras, distanciaKm } from '../../lib/decision/escala'
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
  const [gps, fijarGps] = useState<'listo' | 'buscando' | string>('listo')
  const titulo = useRef<HTMLHeadingElement>(null)
  const pregunta = PREGUNTAS[paso]
  const valor = respuestas[pregunta.clave]
  const elegida = typeof valor === 'string' ? valor : null
  const conGps = pregunta.clave === 'zonaId' && Boolean(respuestas.parcela)

  useEffect(() => {
    titulo.current?.focus()
  }, [paso])

  function avanzar(nuevas: Respuestas) {
    fijarRespuestas(nuevas)
    confirmar()
    if (paso < PREGUNTAS.length - 1) {
      fijarPaso(paso + 1)
      return
    }
    const { zonaId, terreno, cultivoId, temporada, parcela, edadSemanas } = nuevas
    if (zonaId && terreno && cultivoId && temporada) alTerminar({ zonaId, terreno, cultivoId, temporada, parcela: parcela ?? null, edadSemanas })
  }

  const cultivoElegido = pregunta.clave === 'cultivoId' ? buscarCultivo(respuestas.cultivoId ?? null) : null

  function elegir(id: string) {
    // Elegir un lugar de la lista quita la ubicacion GPS: se usa el punto de ese lugar.
    avanzar({ ...respuestas, [pregunta.clave]: id, ...(pregunta.clave === 'zonaId' ? { parcela: null } : {}) })
  }

  function usarUbicacion() {
    if (!('geolocation' in navigator)) {
      fijarGps('Este teléfono no da la ubicación. Elija su lugar en la lista.')
      return
    }
    fijarGps('buscando')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000
        const lon = Math.round(pos.coords.longitude * 1000) / 1000
        if (!dentroDeHonduras(lat, lon)) {
          fijarGps('Su ubicación está fuera de Honduras. Elija su lugar en la lista.')
          return
        }
        // El lugar del sitio mas cercano da el nombre y la tierra; el pronostico usa el punto de Kharis mas cercano.
        const cerca = zonas.filter((z) => LUGARES[z.id]).reduce((a, b) => (distanciaKm({ lat, lon }, a) <= distanciaKm({ lat, lon }, b) ? a : b))
        fijarGps('listo')
        avanzar({ ...respuestas, zonaId: cerca.id, parcela: { lat, lon } })
      },
      () => fijarGps('No se pudo leer la ubicación. Revise el permiso o elija su lugar en la lista.'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    )
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
      {pregunta.clave === 'zonaId' && (
        <div className={estilos.gps}>
          <Control
            className={clases(estilos.opcion, conGps && estilos.opcionMarcada, 'capa-estado')}
            aria-pressed={conGps}
            onClick={usarUbicacion}
            disabled={gps === 'buscando'}
          >
            <span className={estilos.iconoOpcion}>
              <Icono nombre="my_location" tamano={28} />
            </span>
            <span className={estilos.textoOpcion}>
              <span className={estilos.nombreOpcion}>{gps === 'buscando' ? 'Buscando su ubicación…' : 'Usar mi ubicación'}</span>
              <span className="tipo-nota">Más preciso: ajusta el pronóstico a la altura de su parcela</span>
            </span>
            {conGps && <Icono nombre="check" tamano={22} />}
          </Control>
          {gps !== 'listo' && gps !== 'buscando' && (
            <p className={estilos.ayuda} role="alert">
              {gps}
            </p>
          )}
          <p className="tipo-nota">O elija el lugar más cercano:</p>
        </div>
      )}
      {pregunta.clave === 'cultivoId' ? (
        <>
          {/* Como en la pantalla original: al elegir el cultivo se abre abajo el selector de semanas. */}
          <SelectorCultivo
            elegido={elegida}
            alElegir={(id) => {
              if (id !== respuestas.cultivoId) fijarRespuestas({ ...respuestas, cultivoId: id, edadSemanas: 0 })
              confirmar()
            }}
          />
          {cultivoElegido && (
            <EdadCultivo
              cultivo={cultivoElegido}
              semanas={respuestas.edadSemanas ?? 0}
              alCambiar={(s) => fijarRespuestas((r) => ({ ...r, edadSemanas: s }))}
            />
          )}
        </>
      ) : (
      <ul className={estilos.opciones}>
        {pregunta.opciones.map((o) => {
          const marcada = o.id === elegida && !conGps
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
