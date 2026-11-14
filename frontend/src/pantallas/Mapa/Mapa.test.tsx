import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { aptitud, condiciones, buscarDepartamento, palabraNivel, ranking, rotacionesPara } from '../../datos/aptitud'
import { consejosPara } from '../../datos/consejos'
import { humedadPorcentaje, zonas } from '../../datos/zonas'
import { avisar } from '../../lib/avisos'
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
    expect(screen.getByText('Toque un punto del mapa o un lugar de la lista.')).toBeInTheDocument()
    // Sin cultivo no hay puntajes: se invita a elegirlo.
    expect(screen.getByRole('button', { name: 'Departamento de Olancho' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Elegir cultivo' })).toHaveAttribute('href', '/')
  })

  it('sin cultivo no hay numeros ni top 3, y la lista de departamentos es alfabetica', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/mapa')
    expect(container.querySelectorAll('[data-departamento]')).toHaveLength(0)
    expect(screen.queryByRole('region', { name: /^Los 3 mejores/ })).not.toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Los 18 departamentos' })
    const botones = within(lista).getAllByRole('button')
    expect(botones).toHaveLength(18)
    const nombres = botones.map((b) => b.getAttribute('aria-label')!.replace('Elegir ', ''))
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')))
    expect(lista).not.toHaveTextContent('de 100')
    // Se puede elegir un departamento aunque todavia no haya cultivo.
    await usuario.click(within(lista).getByRole('button', { name: 'Elegir Olancho' }))
    expect(within(lista).getByRole('button', { name: 'Elegir Olancho' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Departamento de Olancho' })).toHaveAttribute('aria-pressed', 'true')
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
      const esperado = aptitud('HN-CH', 'maiz', 'normal')!
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

    it('cambiar el tipo de año cambia el puntaje', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const seco = aptitud('HN-CH', 'maiz', 'seco')!
      expect(seco.total).not.toBe(aptitud('HN-CH', 'maiz', 'normal')!.total)
      await usuario.click(screen.getByRole('button', { name: 'Año seco' }))
      expect(screen.getByRole('button', { name: 'Año seco' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(`${seco.total} de 100. Puesto ${seco.puesto} de 18 departamentos.`)).toBeInTheDocument()
    })

    it('lista que sembrar despues y abre y cierra el detalle de una opcion', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const opciones = rotacionesPara('HN-CH', 'maiz', 'normal')
      const seccion = screen.getByRole('region', { name: 'Qué sembrar después en Choluteca' })
      // El nombre accesible es "tipo, nombre, nivel, puntaje": se ancla en el nivel para no confundir
      // "frijol" con "frijol terciopelo".
      const tarjetaDe = (nombre: string) =>
        within(seccion).getByRole('button', {
          name: new RegExp(`${nombre.replace(/[()]/g, '\\$&')} ?(Buena|Regular|Difícil) ?[0-9]+ de 100$`),
        })
      for (const r of opciones) expect(tarjetaDe(r.nombre)).toBeInTheDocument()
      expect(within(seccion).getByText('Toque una opción para ver por qué.')).toBeInTheDocument()
      expect(within(seccion).getByRole('heading', { level: 3, name: opciones.find((r) => r.mejor)!.nombre })).toBeInTheDocument()

      const mejor = opciones.find((r) => r.mejor)!
      const tarjeta = tarjetaDe(mejor.nombre)
      await usuario.click(tarjeta)
      expect(tarjeta).toHaveAttribute('aria-expanded', 'true')
      const detalle = within(seccion).getByRole('region', { name: new RegExp(mejor.nombre.replace(/[()]/g, '\\$&')) })
      expect(within(detalle).getByText(mejor.ventajas[0])).toBeInTheDocument()
      expect(within(detalle).getByText(mejor.riesgos[0])).toBeInTheDocument()
      expect(within(detalle).getByText('Septiembre a diciembre.', { exact: false })).toBeInTheDocument()

      await usuario.click(tarjeta)
      expect(tarjeta).toHaveAttribute('aria-expanded', 'false')
      expect(within(seccion).queryByText('A favor')).not.toBeInTheDocument()
    })

    it('muestra los 3 mejores en orden, con su puntaje, y coinciden con el ranking', () => {
      renderizarApp('/mapa')
      const mejores = ranking('maiz', 'normal').slice(0, 3)
      const tarjeta = screen.getByRole('region', { name: 'Los 3 mejores para maíz' })
      expect(within(tarjeta).getByText('En un año normal, estos son los que mejor se dan.')).toBeInTheDocument()
      const filas = within(tarjeta).getAllByRole('button')
      expect(filas).toHaveLength(3)
      mejores.forEach((p, i) => {
        expect(filas[i]).toHaveAccessibleName(`Puesto ${i + 1}: ${p.nombre}, ${p.total} de 100, ${palabraNivel[p.nivel].toLowerCase()}`)
        expect(filas[i]).toHaveTextContent(p.nombre)
        expect(filas[i]).toHaveTextContent(`${p.total}de 100`)
      })
    })

    it('el top cambia con el tipo de año y la tarjeta lo dice', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      await usuario.click(screen.getByRole('button', { name: 'Año seco' }))
      const tarjeta = screen.getByRole('region', { name: 'Los 3 mejores para maíz' })
      expect(within(tarjeta).getByText(/^En un año seco/)).toBeInTheDocument()
      const filas = within(tarjeta).getAllByRole('button')
      ranking('maiz', 'seco')
        .slice(0, 3)
        .forEach((p, i) => expect(filas[i]).toHaveAccessibleName(new RegExp(`^Puesto ${i + 1}: ${p.nombre}, ${p.total} de 100`)))
    })

    it('tocar una fila del top elige ese departamento: mapa, lista y detalle', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const segundo = ranking('maiz', 'normal')[1]
      const tarjeta = screen.getByRole('region', { name: 'Los 3 mejores para maíz' })
      await usuario.click(within(tarjeta).getAllByRole('button')[1])
      expect(within(tarjeta).getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: new RegExp(`^Departamento de ${segundo.nombre}:`) })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('heading', { level: 2, name: `¿Se da bien el maíz en ${segundo.nombre}?` })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: `Consejos para ${segundo.nombre}` })).toBeInTheDocument()
      const lista = screen.getByRole('list', { name: 'Los 18 departamentos' })
      const marcados = within(lista).getAllByRole('button', { pressed: true })
      expect(marcados).toHaveLength(1)
      expect(marcados[0]).toHaveAccessibleName(new RegExp(`^Elegir ${segundo.nombre}:`))
    })

    it('la lista tiene los 18 departamentos de mejor a peor con su puntaje y marca el elegido', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      const orden = ranking('maiz', 'normal')
      const lista = screen.getByRole('list', { name: 'Los 18 departamentos' })
      const botones = within(lista).getAllByRole('button')
      expect(botones).toHaveLength(18)
      orden.forEach((p, i) => {
        expect(botones[i]).toHaveAccessibleName(
          `Elegir ${p.nombre}: puesto ${i + 1}, ${p.total} de 100, ${palabraNivel[p.nivel].toLowerCase()}`,
        )
        expect(botones[i]).toHaveAttribute('aria-pressed', String(p.id === 'HN-CH'))
      })
      // Con el mismo puntaje, por orden alfabetico.
      orden.slice(1).forEach((p, i) => {
        if (p.total === orden[i].total) expect(orden[i].nombre.localeCompare(p.nombre, 'es')).toBeLessThan(0)
      })
      await usuario.click(botones[orden.findIndex((p) => p.id === 'HN-OL')])
      expect(screen.getByRole('heading', { level: 2, name: '¿Se da bien el maíz en Olancho?' })).toBeInTheDocument()
      expect(within(lista).getAllByRole('button', { pressed: true })).toHaveLength(1)
      expect(screen.getByRole('button', { name: /^Departamento de Olancho:/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('cada departamento muestra su numero en el mapa y cambia con el tipo de año', async () => {
      const usuario = userEvent.setup()
      const { container } = renderizarApp('/mapa')
      const numeros = () =>
        Object.fromEntries(
          [...container.querySelectorAll<HTMLElement>('[data-departamento]')].map((e) => [
            e.dataset.departamento,
            e.querySelector('[class*="numero"]')?.textContent,
          ]),
        )
      const normal = numeros()
      for (const p of ranking('maiz', 'normal')) expect(normal[p.id]).toBe(String(p.total))
      await usuario.click(screen.getByRole('button', { name: 'Año seco' }))
      const seco = numeros()
      for (const p of ranking('maiz', 'seco')) expect(seco[p.id]).toBe(String(p.total))
      expect(seco).not.toEqual(normal)
    })

    it('muestra las condiciones del lugar ajustadas al año, con unidades', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      await usuario.click(screen.getByRole('button', { name: 'Año seco' }))
      const c = condiciones(buscarDepartamento('HN-CH')!, 'seco')
      const detalle = screen.getByText('Ver las condiciones del lugar').closest('details')!
      expect(within(detalle).getByText('Lluvia del año').nextSibling).toHaveTextContent(`${Math.round(c.lluvia)} mm`)
      expect(within(detalle).getByText('Temperatura media').nextSibling).toHaveTextContent(`${c.temp.toFixed(1)} °C`)
      expect(within(detalle).getByText('Altura del terreno').nextSibling).toHaveTextContent(`${Math.round(c.alt)} m`)
      expect(within(detalle).getByText('Agua en la tierra').nextSibling).toHaveTextContent(`${c.hum.toFixed(1)} %`)
      expect(within(detalle).getByText(/Días seguidos sin lluvia/).nextSibling).toHaveTextContent(`${Math.round(c.canicula)} días`)
      expect(within(detalle).getByText(/de ejemplo/)).toBeInTheDocument()
    })

    it('muestra los consejos del lugar, con el detalle tecnico y el aviso fijo', async () => {
      const usuario = userEvent.setup()
      renderizarApp('/mapa')
      await usuario.click(screen.getByRole('button', { name: 'Año seco' }))
      const consejos = consejosPara('HN-CH', 'maiz', 'seco')
      const tarjeta = screen.getByRole('region', { name: 'Consejos para Choluteca' })
      for (const c of consejos) {
        expect(within(tarjeta).getByRole('heading', { level: 3, name: c.titulo })).toBeInTheDocument()
        expect(within(tarjeta).getByText(c.texto)).toBeInTheDocument()
        expect(within(tarjeta).getByText(c.detalle)).toBeInTheDocument()
      }
      expect(within(tarjeta).getAllByText('Ver el detalle técnico')).toHaveLength(consejos.length)
      expect(
        within(tarjeta).getByText('Puntajes y consejos de ejemplo, todavía sin validar con técnicos. Consulte a su técnico.'),
      ).toBeInTheDocument()
    })
  })
})
