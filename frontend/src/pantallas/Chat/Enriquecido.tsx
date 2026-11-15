import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { Boton } from '../../componentes/Boton'
import { ContenedorMapa } from '../../componentes/mapa/ContenedorMapa'
import { NivelAptitud } from '../../componentes/mapa/NivelAptitud'
import { aptitud, departamentoDeZona, tieneAptitud } from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { cajaHonduras } from '../../datos/zonas'
import estilos from './Enriquecido.module.css'

export interface PasoAnimacion {
  texto: string
  /** De 0 a 100: dibuja una barra que crece. Null = solo texto. */
  valor: number | null
}

export type Trozo =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'mapa'; cultivoId: string }
  | { tipo: 'animacion'; titulo: string; pasos: PasoAnimacion[] }

const ETIQUETA = /\[\[(mapa|animacion):([^\]]*)\]\]/g
const MAX_PASOS = 6

/**
 * Parte la respuesta del asistente en texto y piezas visuales. El asistente puede pedir:
 *   [[mapa:maiz]]                                     el mapa de Honduras para ese cultivo
 *   [[animacion:Título|Paso uno|Lluvia prevista=72]]  una explicación animada, paso a paso;
 *                                                     "=72" dibuja una barra hasta 72 de 100
 * Una etiqueta mal escrita o de un cultivo desconocido se descarta: nunca se muestra en crudo.
 */
export function partirMensaje(texto: string): Trozo[] {
  const trozos: Trozo[] = []
  const agregarTexto = (t: string) => {
    const limpio = t.trim()
    if (limpio) trozos.push({ tipo: 'texto', texto: limpio })
  }
  let desde = 0
  for (const m of texto.matchAll(ETIQUETA)) {
    agregarTexto(texto.slice(desde, m.index))
    desde = m.index + m[0].length
    const cuerpo = m[2].trim()
    if (m[1] === 'mapa') {
      if (tieneAptitud(cuerpo) && buscarCultivo(cuerpo)) trozos.push({ tipo: 'mapa', cultivoId: cuerpo })
      continue
    }
    const [titulo, ...resto] = cuerpo.split('|').map((x) => x.trim())
    const pasos = resto
      .filter(Boolean)
      .slice(0, MAX_PASOS)
      .map((p): PasoAnimacion => {
        const conValor = /^(.*?)\s*=\s*(\d{1,3})\s*%?$/.exec(p)
        return conValor ? { texto: conValor[1], valor: Math.min(100, Number(conValor[2])) } : { texto: p, valor: null }
      })
    if (titulo && pasos.length) trozos.push({ tipo: 'animacion', titulo, pasos })
  }
  agregarTexto(texto.slice(desde))
  return trozos
}

const SIN_LUGARES: never[] = []
const sinAccion = () => {}

/** El mapa dentro del chat: el país pintado para un cultivo, con el enfoque en el departamento del productor. */
function MapaChat({ cultivoId, zonaId }: { cultivoId: string; zonaId: string | null }) {
  const { t } = useTranslation()
  const cultivo = buscarCultivo(cultivoId)
  const [tocado, fijarTocado] = useState<string | null>(null)
  if (!cultivo) return null
  const departamentoId = tocado ?? departamentoDeZona(zonaId)
  const resultado = aptitud(departamentoId, cultivoId, 'normal')
  return (
    <figure className={estilos.figura}>
      <div className={estilos.mapa}>
        <ContenedorMapa
          zonas={SIN_LUGARES}
          caja={cajaHonduras}
          zonaSeleccionadaId={null}
          cultivoId={cultivoId}
          alSeleccionarZona={sinAccion}
          departamentoId={departamentoId}
          alSeleccionarDepartamento={fijarTocado}
          enfocar
        />
      </div>
      <figcaption className={estilos.pie}>
        {resultado ? (
          <>
            <NivelAptitud nivel={resultado.nivel} />
            <span>
              {t('dondeSeDa.resultado', { cultivo: t(`cultivos.${cultivo.id}.nombre`), departamento: resultado.departamento.nombre, total: resultado.total })}
              {t('dondeSeDa.ejemplo')}
            </span>
          </>
        ) : (
          <span>{t('dondeSeDa.enCada', { el: t(`cultivos.${cultivo.id}.el`) })}</span>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * Explicación animada: los pasos entran uno tras otro y las barras crecen hasta su valor.
 * "Repetir" la vuelve a correr. Con movimiento reducido todo aparece de una vez.
 */
function Animacion({ titulo, pasos }: { titulo: string; pasos: PasoAnimacion[] }) {
  const { t } = useTranslation()
  const [vuelta, fijarVuelta] = useState(0)
  return (
    <figure className={estilos.figura}>
      <figcaption className={estilos.tituloAnimacion}>{titulo}</figcaption>
      <ol key={vuelta} className={estilos.pasos}>
        {pasos.map((p, i) => (
          <li key={i} className={estilos.paso} style={{ '--i': i } as React.CSSProperties}>
            <span className={estilos.numero} aria-hidden="true">
              {i + 1}
            </span>
            <span className={estilos.textoPaso}>
              <span>{p.texto}</span>
              {p.valor !== null && (
                <span className={estilos.medida}>
                  <span className={estilos.barra} aria-hidden="true">
                    <span style={{ '--valor': p.valor / 100 } as React.CSSProperties} />
                  </span>
                  <span className={estilos.cifra}>{t('comun.deCien', { valor: p.valor })}</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <Boton variante="texto" icono="replay" onClick={() => fijarVuelta((v) => v + 1)}>
        {t('dondeSeDa.repetir')}
      </Boton>
    </figure>
  )
}

const LETRAS_POR_PASO = 4
const PASO_MS = 16

/**
 * La respuesta que acaba de llegar se va escribiendo a la vista. Mientras se escribe solo va el
 * texto; al terminar aparecen el mapa o la animación que haya pedido. Con movimiento reducido
 * sale completa de una vez.
 */
export function MensajeEscribiendose({ texto, zonaId }: { texto: string; zonaId: string | null }) {
  const plano = useMemo(() => texto.replace(new RegExp(ETIQUETA.source, 'g'), '').trim(), [texto])
  const [letras, fijarLetras] = useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? plano.length : 0,
  )
  useEffect(() => {
    if (letras >= plano.length) return
    const reloj = window.setTimeout(() => fijarLetras((n) => Math.min(plano.length, n + LETRAS_POR_PASO)), PASO_MS)
    return () => window.clearTimeout(reloj)
  }, [letras, plano.length])

  if (letras >= plano.length) return <ContenidoMensaje texto={texto} zonaId={zonaId} />
  return (
    <p className={estilos.texto}>
      {plano.slice(0, letras)}
      <span className={estilos.cursor} aria-hidden="true" />
    </p>
  )
}

/** El contenido de una respuesta del asistente: texto y, si lo pidió, mapa o explicación animada. */
export function ContenidoMensaje({ texto, zonaId }: { texto: string; zonaId: string | null }) {
  const trozos = partirMensaje(texto)
  if (trozos.length === 0) return <p className={estilos.texto}>{texto}</p>
  return (
    <>
      {trozos.map((t, i) => {
        if (t.tipo === 'texto') return <p key={i} className={estilos.texto}>{t.texto}</p>
        if (t.tipo === 'mapa') return <MapaChat key={i} cultivoId={t.cultivoId} zonaId={zonaId} />
        return <Animacion key={i} titulo={t.titulo} pasos={t.pasos} />
      })}
    </>
  )
}
