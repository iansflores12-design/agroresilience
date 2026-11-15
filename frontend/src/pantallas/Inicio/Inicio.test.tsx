import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import choluteca from '../../../public/kharis/choluteca.json'
import { CLAVE_ESTADO } from '../../estado/EstadoApp'
import { vaciarCacheDecision } from '../../estado/useDecision'
import { decidir } from '../../lib/decision/motor'
import { TOP3, datosParaGemini, respuestaRapida, resumenRapido } from '../../lib/decision/textos'
import type { EntradaDecision, PuntoKharis } from '../../lib/decision/tipos'
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/sonido', () => ({
  tic: vi.fn(),
  asentar: vi.fn(),
  vibrar: vi.fn(),
  confirmar: vi.fn(),
  configurarSonido: vi.fn(),
}))

const meta = { fechaBase: '2026-11-10', modelo: 'v007' }
const punto = choluteca as unknown as PuntoKharis

// La decisión se calcula con el motor real y el punto de Choluteca; el análisis de Gemini queda sin respuesta.
vi.mock('../../lib/decision/cliente', () => ({
  pedirDecision: vi.fn(async (entrada: EntradaDecision) => decidir(entrada, punto, meta)),
  pedirAnalisis: vi.fn(() => new Promise(() => {})),
}))

const perfil = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: ['agua'], edadSemanas: 6, sonido: true }
const decision = decidir({ zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: ['agua'] }, punto, meta)

function guardado() {
  return JSON.parse(window.localStorage.getItem(CLAVE_ESTADO) ?? '{}')
}

describe('Pantalla Plan', () => {
  beforeEach(() => {
    vaciarCacheDecision()
    window.localStorage.clear()
    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify(perfil))
  })

  it('pone primero el cultivo en etiquetas y el mapa, después las tres mejores, las demás en cuadrados y al final Gemini', async () => {
    renderizarApp('/')
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué sembrar después?' })).toBeInTheDocument()
    const etiquetas = screen.getByRole('group', { name: 'Su cultivo' })
    expect(within(etiquetas).getByRole('button', { name: 'Maíz' })).toHaveAttribute('aria-pressed', 'true')

    const mejores = await screen.findByRole('list', { name: 'Las tres mejores' })
    const tres = within(mejores).getAllByRole('link')
    expect(tres).toHaveLength(3)
    expect(tres[0]).toHaveAccessibleName(new RegExp(`^${decision.rotaciones[0].nombre}\\. ${decision.rotaciones[0].puntaje} de 100.*La mejor`))

    const otras = within(screen.getByRole('list', { name: 'Más opciones' })).getAllByRole('link')
    expect(otras).toHaveLength(decision.rotaciones.length - 3)
    expect(otras[0]).toHaveTextContent(`${decision.rotaciones[3].puntaje}%`)

    const titulos = screen.getAllByRole('heading').map((h) => h.textContent)
    const orden = ['¿Dónde se da mejor el maíz?', 'Las tres mejores', 'Más opciones', 'Por qué estas tres'].map((t) => titulos.indexOf(t))
    expect(orden.every((i) => i >= 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })

  it('cambiar de cultivo en las etiquetas cambia el mapa', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(within(screen.getByRole('group', { name: 'Su cultivo' })).getByRole('button', { name: 'Arroz' }))
    expect(await screen.findByRole('heading', { name: '¿Dónde se da mejor el arroz?' })).toBeInTheDocument()
    expect(guardado().cultivoId).toBe('arroz')
  })

  it('tocar una respuesta abre solo esa pregunta y al contestarla vuelve al Plan', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: 'Terreno plano. Cambiar' }))
    expect(screen.getByRole('heading', { level: 1, name: '¿Cómo es su terreno?' })).toBeInTheDocument()
    expect(screen.queryByText(/^Pregunta \d de/)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /^Ondulado/ }))
    expect(await screen.findByRole('heading', { level: 1, name: '¿Qué sembrar después?' })).toBeInTheDocument()
    expect(guardado().terreno).toBe('ondulado')
    expect(guardado().edadSemanas).toBe(6)
  })
})

describe('Cuestionario previo', () => {
  beforeEach(() => {
    vaciarCacheDecision()
    window.localStorage.clear()
  })

  it('se puede escribir el lugar para encontrarlo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.type(screen.getByRole('searchbox', { name: 'Escriba su lugar' }), 'danli')
    expect(screen.getByRole('button', { name: 'Danlí' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choluteca' })).not.toBeInTheDocument()
  })

  it('al elegir el cultivo se abre debajo el selector de semanas; después se eligen los objetivos', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(screen.getByRole('button', { name: 'Choluteca' }))
    await usuario.click(screen.getByRole('button', { name: /^Plano/ }))

    expect(screen.queryByRole('slider', { name: 'Edad del cultivo' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /^Frijol\s*Unas/ }))
    // No cambia de pregunta: se abre "¿Hace cuánto sembró?" debajo del cultivo.
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué siembra ahora?' })).toBeInTheDocument()
    const selector = screen.getByRole('slider', { name: 'Edad del cultivo' })
    selector.focus()
    await usuario.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(selector).toHaveAttribute('aria-valuenow', '3'))

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))
    await usuario.click(screen.getByRole('button', { name: /^De postrera/ }))

    expect(screen.getByRole('heading', { level: 1, name: '¿Qué quiere lograr?' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /^Ahorrar agua/ }))
    await usuario.click(screen.getByRole('button', { name: /^Ganar más/ }))
    await usuario.click(screen.getByRole('button', { name: 'Ver mis rotaciones' }))

    expect(await screen.findByRole('heading', { level: 1, name: '¿Qué sembrar después?' })).toBeInTheDocument()
    expect(guardado()).toMatchObject({ zonaId: 'choluteca', terreno: 'plano', cultivoId: 'frijol', temporada: 'postrera', edadSemanas: 3 })
    expect(guardado().objetivos).toEqual(['agua', 'ingreso'])
    expect(screen.getByRole('button', { name: 'Cultivo: Frijol, 3 semanas. Cambiar' })).toBeInTheDocument()
  })
})

describe('Resúmenes rápidos de respaldo', () => {
  it('el del top 3 nombra las tres mejores con su puntaje', () => {
    const t = resumenRapido(decision, TOP3)
    for (const r of decision.rotaciones.slice(0, 3)) expect(t).toContain(`${r.nombre}, ${r.puntaje} de 100`)
  })

  it('los datos del top 3 para Gemini traen la evidencia de las tres', () => {
    const t = datosParaGemini(decision, TOP3)
    expect(t).toContain('Puesto 1:')
    expect(t).toContain('Puesto 3:')
    expect(t.match(/Evidencia del motor:/g)).toHaveLength(3)
  })

  it('el chat tiene respuesta preparada según la pregunta, sin Gemini', () => {
    const mejor = decision.rotaciones[0]
    expect(respuestaRapida(decision, TOP3, '¿Y si llueve menos de lo previsto?')).toMatch(/^Resumen rápido, sin Gemini\. .*mm de lluvia/)
    expect(respuestaRapida(decision, mejor.id, '¿Por qué la primera es la mejor?')).toContain(`${mejor.nombre}: ${mejor.puntaje} de 100`)
    expect(respuestaRapida(decision, mejor.id, '¿Qué necesito para empezar?')).toContain('Calendario:')
  })
})
