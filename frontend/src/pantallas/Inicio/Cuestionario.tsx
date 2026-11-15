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
import type { Objetivo, Temporada, Terreno } from '../../lib/decision/tipos'
import type { Perfil } from '../../estado/EstadoApp'
import { confirmar } from '../../lib/sonido'
import { Objetivos } from './Objetivos'
import estilos from './Inicio.module.css'

interface Opcion {
  id: string
  nombre: string
  nota?: string
  icono: NombreIcono
}

type Respuestas = Partial<Perfil>

export type ClavePregunta = 'zonaId' | 'terreno' | 'cultivoId' | 'temporada' | 'objetivos'

interface Pregunta {
  clave: ClavePregunta
  titulo: string
  /** Vacio en las preguntas con control propio (objetivos). */
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
  { clave: 'objetivos', titulo: '¿Qué quiere lograr?', opciones: [] },
]

const ULTIMA = PREGUNTAS.length - 1

/** "Danlí" y "danli" deben encontrarse igual. */
const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Las preguntas de Gemini Decision, una por pantalla. Lugar, terreno y temporada pasan solas a
 * la siguiente al tocar una respuesta. El cultivo no: al elegirlo se abre debajo "¿Hace cuánto
 * sembró?" con el selector de semanas, y se sigue con "Siguiente". Los objetivos son la última:
 * se marcan varios (o ninguno) y "Ver mis rotaciones" guarda el perfil.
 *
 * Con `soloPaso` se muestra una sola pregunta, para cambiar un dato desde el Plan: al
 * contestarla se guarda y se vuelve.
 */
export function Cuestionario({
  inicial,
  alTerminar,
  alCancelar,
  soloPaso,
}: {
  inicial: Respuestas
  alTerminar: (p: Perfil) => void
  alCancelar?: () => void
  soloPaso?: ClavePregunta
}) {
  const [paso, fijarPaso] = useState(() => (soloPaso ? Math.max(0, PREGUNTAS.findIndex((p) => p.clave === soloPaso)) : 0))
  const [respuestas, fijarRespuestas] = useState<Respuestas>(inicial)
  const [gps, fijarGps] = useState<'listo' | 'buscando' | string>('listo')
  const [busqueda, fijarBusqueda] = useState('')
  const pidioGps = useRef(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const pie = useRef<HTMLDivElement>(null)
  const pregunta = PREGUNTAS[paso]
  const valor = respuestas[pregunta.clave]
  const elegida = typeof valor === 'string' ? valor : null
  const conGps = pregunta.clave === 'zonaId' && Boolean(respuestas.parcela)
  const cultivo = pregunta.clave === 'cultivoId' ? buscarCultivo(respuestas.cultivoId ?? null) : null

  useEffect(() => {
    titulo.current?.focus()
  }, [paso])

  // La primera vez, la ubicación se pide sola al llegar a la pregunta del lugar: el navegador
  // o la app muestran su permiso sin que haya que tocar nada. Si ya hay un lugar, no se pide.
  useEffect(() => {
    if (pregunta.clave !== 'zonaId' || pidioGps.current || inicial.zonaId) return
    pidioGps.current = true
    usarUbicacion(true)
    // Solo al entrar a la pregunta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregunta.clave])

  const buscado = sinTildes(busqueda.trim())
  const opciones =
    pregunta.clave === 'zonaId' && buscado ? pregunta.opciones.filter((o) => sinTildes(o.nombre).includes(buscado)) : pregunta.opciones

  function avanzar(nuevas: Respuestas) {
    fijarRespuestas(nuevas)
    confirmar()
    if (!soloPaso && paso < ULTIMA) {
      fijarPaso(paso + 1)
      return
    }
    const { zonaId, terreno, cultivoId, temporada, parcela, edadSemanas, objetivos } = nuevas
    if (zonaId && terreno && cultivoId && temporada) {
      alTerminar({ zonaId, terreno, cultivoId, temporada, parcela: parcela ?? null, edadSemanas: edadSemanas ?? 0, objetivos: objetivos ?? [] })
    }
  }

  /** Elegir cultivo no cambia de pregunta: abre debajo las semanas desde la siembra. */
  function elegirCultivo(id: string) {
    if (id === respuestas.cultivoId) return
    fijarRespuestas({ ...respuestas, cultivoId: id, edadSemanas: 0 })
    confirmar()
    // La seccion de semanas se abre debajo: se acerca a la vista, con "Siguiente" a mano.
    requestAnimationFrame(() => {
      const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      pie.current?.scrollIntoView?.({ block: 'nearest', behavior: quieto ? 'auto' : 'smooth' })
    })
  }

  function alternarObjetivo(o: Objetivo) {
    fijarRespuestas((r) => {
      const actuales = r.objetivos ?? []
      return { ...r, objetivos: actuales.includes(o) ? actuales.filter((x) => x !== o) : [...actuales, o] }
    })
  }

  function elegir(id: string) {
    // Elegir un lugar de la lista quita la ubicacion GPS: se usa el punto de ese lugar.
    avanzar({ ...respuestas, [pregunta.clave]: id, ...(pregunta.clave === 'zonaId' ? { parcela: null } : {}) })
  }

  /** `auto`: pedida sin que el productor toque nada; si falla, no se muestra error ni se cambia de pregunta. */
  function usarUbicacion(auto = false) {
    if (!('geolocation' in navigator)) {
      if (!auto) fijarGps('Este teléfono no da la ubicación. Elija su lugar en la lista.')
      return
    }
    fijarGps('buscando')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000
        const lon = Math.round(pos.coords.longitude * 1000) / 1000
        if (!dentroDeHonduras(lat, lon)) {
          fijarGps(auto ? 'listo' : 'Su ubicación está fuera de Honduras. Elija su lugar en la lista.')
          return
        }
        // El lugar del sitio mas cercano da el nombre y la tierra; el pronostico usa el punto de Kharis mas cercano.
        const cerca = zonas.filter((z) => LUGARES[z.id]).reduce((a, b) => (distanciaKm({ lat, lon }, a) <= distanciaKm({ lat, lon }, b) ? a : b))
        fijarGps('listo')
        if (auto) fijarRespuestas((r) => ({ ...r, zonaId: cerca.id, parcela: { lat, lon } }))
        else avanzar({ ...respuestas, zonaId: cerca.id, parcela: { lat, lon } })
      },
      () => fijarGps(auto ? 'listo' : 'No se pudo leer la ubicación. Revise el permiso o elija su lugar en la lista.'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    )
  }

  return (
    <section className={estilos.cuestionario} aria-labelledby="pregunta-cuestionario">
      {!soloPaso && (
        <div className={estilos.progreso}>
          <span className="tipo-nota">
            Pregunta {paso + 1} de {PREGUNTAS.length}
          </span>
          <span className={estilos.barraProgreso} aria-hidden="true">
            <span style={{ transform: `scaleX(${(paso + 1) / PREGUNTAS.length})` }} />
          </span>
        </div>
      )}
      {paso === 0 && !soloPaso && (
        <p className={estilos.intro}>
          Con cinco respuestas comparamos rotaciones con el pronóstico de su zona.
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
            onClick={() => usarUbicacion()}
            disabled={gps === 'buscando'}
          >
            <span className={estilos.iconoOpcion}>
              <Icono nombre="my_location" tamano={28} />
            </span>
            <span className={estilos.textoOpcion}>
              <span className={estilos.nombreOpcion}>
                {gps === 'buscando' ? 'Buscando su ubicación…' : conGps ? 'Usando su ubicación' : 'Usar mi ubicación'}
              </span>
              <span className="tipo-nota">
                {conGps && respuestas.zonaId
                  ? `Cerca de ${LUGARES[respuestas.zonaId].nombre}. El pronóstico se ajusta a la altura de su parcela`
                  : 'Más preciso: ajusta el pronóstico a la altura de su parcela'}
              </span>
            </span>
            {conGps && <Icono nombre="check" tamano={22} />}
          </Control>
          {gps !== 'listo' && gps !== 'buscando' && (
            <p className={estilos.ayuda} role="alert">
              {gps}
            </p>
          )}
          <label className={estilos.buscador}>
            <Icono nombre="search" tamano={24} />
            <span className="solo-lectores">Escriba su lugar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => fijarBusqueda(e.target.value)}
              placeholder="Escriba su lugar"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          {opciones.length === 0 && (
            <p className={estilos.ayuda} role="status">
              Ese lugar no está en la lista. Pruebe con el pueblo o la ciudad más cercana, o use su ubicación.
            </p>
          )}
        </div>
      )}
      {pregunta.clave === 'cultivoId' && (
        <>
          <SelectorCultivo elegido={elegida} alElegir={elegirCultivo} />
          {cultivo && (
            <div className={estilos.abre}>
              <EdadCultivo
                cultivo={cultivo}
                semanas={respuestas.edadSemanas ?? 0}
                alCambiar={(semanas) => fijarRespuestas((r) => ({ ...r, edadSemanas: semanas }))}
              />
            </div>
          )}
        </>
      )}
      {pregunta.clave === 'objetivos' && (
        <>
          <p className={estilos.ayuda}>Toque uno o varios. Las rotaciones se ordenan según lo que elija.</p>
          <Objetivos elegidos={respuestas.objetivos ?? []} alternar={alternarObjetivo} />
        </>
      )}
      {pregunta.opciones.length > 0 && pregunta.clave !== 'cultivoId' && (
      <ul className={estilos.opciones}>
        {opciones.map((o) => {
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
      <div ref={pie} className={estilos.accionesCuestionario}>
        {paso > 0 && !soloPaso ? (
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
        {!soloPaso && elegida && paso < ULTIMA && (
          <Boton
            variante={pregunta.clave === 'cultivoId' ? 'relleno' : 'tonal'}
            icono="arrow_forward"
            onClick={() => fijarPaso(paso + 1)}
          >
            Siguiente
          </Boton>
        )}
        {!soloPaso && paso === ULTIMA && (
          <Boton icono="check" onClick={() => avanzar(respuestas)}>
            Ver mis rotaciones
          </Boton>
        )}
        {soloPaso && (pregunta.clave === 'cultivoId' || pregunta.clave === 'objetivos') && (
          <Boton icono="check" onClick={() => avanzar(respuestas)}>
            Guardar
          </Boton>
        )}
      </div>
    </section>
  )
}
