import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { aptitud, rotacionesPara } from '../../datos/aptitud'
import { humedadPorcentaje, zonas } from '../../datos/zonas'
import { avisar } from '../../lib/avisos'
import { detectarAnio } from '../../componentes/mapa/escenario'

const anioCholuteca = () => detectarAnio(zonas.find((z) => z.id === 'choluteca') ?? null).escenario
import { renderizarApp } from '../../pruebas/renderizar'

vi.mock('../../lib/avisos', () => ({
  avisar: { exito: vi.fn(), info: vi.fn(), alerta: vi.fn(), error: vi.fn() },
}))

describe('Mapa', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('muestra el mapa, un boton por zona y la invitacion a elegir', () => {
    renderizarApp('/mapa')
    expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
    for (const z of zonas) expect(screen.getByRole('button', { name: z.nombre })).toBeInTheDocument()
    expect(screen.getByText('Toque un punto del mapa o use su ubicación.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no eligió un lugar.')).toBeInTheDocument()
    // En telefono (jsdom no es ancho) la lista de lugares empieza plegada.
    expect(screen.getByText(`Todos los lugares (${zonas.length})`).closest('details')).not.toHaveAttribute('open')
    // Sin cultivo no hay puntajes: se invita a elegirlo.
    expect(screen.getByRole('button', { name: 'Departamento de Olancho' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Elegir cultivo' })).toHaveAttribute('href', '/')
  })

  it('elegir un punto cambia la zona del estado, avisa y muestra la tarjeta', async () => {
    const usuario = userEvent.setup()
    const zona = zonas[2]
    renderizarApp('/mapa')
    await usuario.click(screen.getByRole('button', { name: zona.nombre }))
    expect(screen.getByRole('button', { name: zona.nombre })).toHaveAttribute('aria-pressed', 'true')
    expect(avisar.exito).toHaveBeenCalledWith(expect.objectContaining({ titulo: `Lugar: ${zona.nombre}` }))
    const tarjeta = screen.getByRole('complementary', { name: 'Lugar elegido' })
    expect(within(tarjeta).getByText(zona.nombre)).toBeInTheDocument()
    expect(within(tarjeta).getByText(`${humedadPorcentaje(zona)?.toFixed(1)} % de agua en la tierra`)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Ver cómo está la tierra' })).toHaveAttribute('href', '/zona')
    // El estado compartido llega a la tira de contexto.
    expect(within(screen.getByRole('group', { name: 'Contexto elegido' })).getByText(zona.nombre)).toBeInTheDocument()
  })

  it('la accion "Ver la tierra" del aviso lleva a /zona', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/mapa')
    await usuario.click(screen.getByRole('button', { name: zonas[0].nombre }))
    const aviso = vi.mocked(avisar.exito).mock.calls[0][0]
    expect(aviso.accion?.texto).toBe('Ver la tierra')
    aviso.accion?.alPulsar()
    expect(await screen.findByRole('heading', { level: 1, name: /^¿Cómo está la tierra/ })).toBeInTheDocument()
  })

  it('tiene controles para acercar y alejar, y avisa si no puede saber la ubicacion', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/mapa')
    const controles = screen.getByRole('group', { name: 'Controles del mapa' })
    await usuario.click(within(controles).getByRole('button', { name: 'Acercar' }))
    await usuario.click(within(controles).getByRole('button', { name: 'Alejar' }))
    // jsdom no tiene geolocalizacion.
    await usuario.click(within(controles).getByRole('button', { name: 'Mi ubicación' }))
    expect(avisar.alerta).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'No se pudo saber dónde está' }))
  })

  describe('con cultivo elegido', () => {
    beforeEach(() => {
      window.localStorage.setItem(
        'agroresilience.estado.v1',
        JSON.stringify({ cultivoId: 'maiz', zonaId: 'choluteca', edadSemanas: 4, sonido: false }),
      )
    })

    it('pinta cada departamento con su puntaje y muestra el del lugar elegido', () => {
      renderizarApp('/mapa')
      const esperado = aptitud('HN-CH', 'maiz', anioCholuteca())!
      const choluteca = screen.getByRole('button', {
        name: new RegExp(`^Departamento de Choluteca: .* para maíz, ${esperado.total} de 100$`),
      })
      expect(choluteca).toHaveAttribute('aria-pressed', 'true')
      expect(choluteca).toHaveAttribute('data-nivel', esperado.nivel)
      const seccion = screen.getByRole('region', { name: '¿Se da bien el maíz en Choluteca?' })
      expect(
        within(seccion).getByText(`${esperado.total} de 100. Puesto ${esperado.puesto} de 18 departamentos.`),
      ).toBeInTheDocument()
    })

    it('elegir otro departamento con el teclado cambia el puntaje y las opciones de siembra', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const olancho = screen.getByRole('button', { name: /^Departamento de Olancho:/ })
      olancho.focus()
      await usuario.keyboard('{Enter}')
      expect(olancho).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('heading', { level: 2, name: '¿Se da bien el maíz en Olancho?' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Qué sembrar después en Olancho' })).toBeInTheDocument()
    })

    it('el tipo de año sale solo de la lluvia del último mes', () => {
      renderizarApp('/mapa')
      const seccion = screen.getByRole('region', { name: '¿Se da bien el maíz en Choluteca?' })
      expect(within(seccion).queryByRole('button', { name: 'Seco' })).not.toBeInTheDocument()
      const nombre = { seco: 'Seco', normal: 'Normal', lluvioso: 'Lluvioso' }[anioCholuteca()]
      expect(within(seccion).getByText(nombre)).toBeInTheDocument()
      expect(within(seccion).getByText(/Lluvia del último mes en Choluteca/)).toBeInTheDocument()
    })

    it('el chip de cultivo lo cambia sin salir del mapa', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      await usuario.click(screen.getByRole('button', { name: /^Cultivo: / }))
      await usuario.click(screen.getByRole('button', { name: 'Sorgo (maicillo)' }))
      expect(screen.getByRole('heading', { level: 2, name: '¿Se da bien el sorgo (maicillo) en Choluteca?' })).toBeInTheDocument()
    })

    it('lista que sembrar despues y abre y cierra el detalle de una opcion', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const opciones = rotacionesPara('HN-CH', 'maiz', anioCholuteca())
      const seccion = screen.getByRole('region', { name: 'Qué sembrar después en Choluteca' })
      // El nombre accesible es "tipo, nombre, nivel, puntaje": se ancla en el nivel para no confundir
      // "frijol" con "frijol terciopelo".
      const tarjetaDe = (nombre: string) =>
        within(seccion).getByRole('button', {
          name: new RegExp(`${nombre.replace(/[()]/g, '\\$&')} ?(Buena|Regular|Difícil) ?[0-9]+ de 100$`),
        })
      for (const r of opciones) expect(tarjetaDe(r.nombre)).toBeInTheDocument()
      expect(within(seccion).getByText('Toque una opción para ver más.')).toBeInTheDocument()

      const mejor = opciones.find((r) => r.mejor)!
      const tarjeta = tarjetaDe(mejor.nombre)
      await usuario.click(tarjeta)
      expect(tarjeta).toHaveAttribute('aria-expanded', 'true')
      const detalle = within(seccion).getByRole('article', { name: mejor.nombre })
      expect(within(detalle).getByText(mejor.ventajas[0])).toBeInTheDocument()
      expect(within(detalle).getByText(mejor.riesgos[0])).toBeInTheDocument()
      expect(within(detalle).getByText('Septiembre a diciembre.', { exact: false })).toBeInTheDocument()

      await usuario.click(tarjeta)
      expect(tarjeta).toHaveAttribute('aria-expanded', 'false')
      expect(within(seccion).queryByRole('article')).not.toBeInTheDocument()
    })
  })
})
