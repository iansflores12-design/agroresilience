import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SelectorDeslizable } from './SelectorDeslizable'

vi.mock('../../lib/sonido', () => ({ tic: vi.fn(), asentar: vi.fn(), vibrar: vi.fn(), confirmar: vi.fn() }))

import { asentar, tic, vibrar } from '../../lib/sonido'

function Controlado({
  inicial = 5,
  max = 12,
  alSoltar,
  alCambiar,
}: {
  inicial?: number
  max?: number
  alSoltar?: (v: number) => void
  alCambiar?: (v: number) => void
}) {
  const [v, setV] = useState(inicial)
  return (
    <SelectorDeslizable
      etiqueta="Edad del cultivo"
      valor={v}
      min={0}
      max={max}
      unidad="semanas"
      alCambiar={(n) => {
        setV(n)
        alCambiar?.(n)
      }}
      alSoltar={alSoltar}
    />
  )
}

describe('SelectorDeslizable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expone role slider con sus atributos aria', () => {
    render(<Controlado inicial={7} max={20} />)
    const s = screen.getByRole('slider', { name: 'Edad del cultivo' })
    expect(s).toHaveAttribute('aria-valuemin', '0')
    expect(s).toHaveAttribute('aria-valuemax', '20')
    expect(s).toHaveAttribute('aria-valuenow', '7')
    expect(s).toHaveAttribute('aria-valuetext', '7 semanas')
  })

  it('usa textoValor para aria-valuetext cuando viene', () => {
    render(
      <SelectorDeslizable
        etiqueta="Edad"
        valor={3}
        min={0}
        max={12}
        unidad="semanas"
        alCambiar={() => {}}
        textoValor={(v) => `semana ${v} de 12`}
      />,
    )
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'semana 3 de 12')
  })

  it('cambia con flechas, salta con Re Pag y Av Pag y va a los extremos', async () => {
    const usuario = userEvent.setup()
    const alSoltar = vi.fn()
    render(<Controlado inicial={5} alSoltar={alSoltar} />)
    const s = screen.getByRole('slider')
    s.focus()
    await usuario.keyboard('{ArrowRight}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '6'))
    await usuario.keyboard('{ArrowLeft}{ArrowLeft}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '4'))
    await usuario.keyboard('{PageUp}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '8'))
    await usuario.keyboard('{PageDown}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '4'))
    await usuario.keyboard('{End}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '12'))
    await usuario.keyboard('{Home}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '0'))
    await waitFor(() => expect(alSoltar).toHaveBeenLastCalledWith(0))
  })

  it('no pasa de los limites', async () => {
    const usuario = userEvent.setup()
    render(<Controlado inicial={12} />)
    const s = screen.getByRole('slider')
    s.focus()
    await usuario.keyboard('{ArrowRight}{ArrowUp}')
    expect(s).toHaveAttribute('aria-valuenow', '12')
    await usuario.keyboard('{Home}')
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '0'))
    await usuario.keyboard('{ArrowLeft}{ArrowDown}')
    expect(s).toHaveAttribute('aria-valuenow', '0')
  })

  it('los botones de menos y mas cambian el valor y se deshabilitan en los extremos', async () => {
    const usuario = userEvent.setup()
    const alSoltar = vi.fn()
    render(<Controlado inicial={1} alSoltar={alSoltar} />)
    const s = screen.getByRole('slider')
    const menos = screen.getByRole('button', { name: 'Disminuir edad del cultivo' })
    const mas = screen.getByRole('button', { name: 'Aumentar edad del cultivo' })
    await usuario.click(mas)
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '2'))
    await usuario.click(menos)
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '1'))
    await usuario.click(menos)
    await waitFor(() => expect(s).toHaveAttribute('aria-valuenow', '0'))
    expect(menos).toBeDisabled()
    await waitFor(() => expect(alSoltar).toHaveBeenCalledWith(0))
  })

  it('llama alSoltar una sola vez, tic y vibrar por marca cruzada y asentar al terminar', async () => {
    const usuario = userEvent.setup()
    const alSoltar = vi.fn()
    const alCambiar = vi.fn()
    render(<Controlado inicial={3} alSoltar={alSoltar} alCambiar={alCambiar} />)
    screen.getByRole('slider').focus()
    await usuario.keyboard('{PageUp}')
    await waitFor(() => expect(alSoltar).toHaveBeenCalledTimes(1))
    expect(alSoltar).toHaveBeenCalledWith(7)
    expect(alCambiar.mock.calls.map((c) => c[0])).toEqual([4, 5, 6, 7])
    expect(tic).toHaveBeenCalledTimes(4)
    expect(vibrar).toHaveBeenCalledWith(3)
    // La marca 4 es mayor (multiplo de marcaMayorCada) y las demas, menores.
    expect(vi.mocked(tic).mock.calls.map((c) => c[0])).toEqual([true, false, false, false])
    expect(asentar).toHaveBeenCalledTimes(1)
  })

  it('con movimiento reducido salta directo al valor sin animar', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: true, media: q }) as MediaQueryList) as typeof window.matchMedia
    try {
      const usuario = userEvent.setup()
      const alSoltar = vi.fn()
      const alCambiar = vi.fn()
      render(<Controlado inicial={2} alSoltar={alSoltar} alCambiar={alCambiar} />)
      screen.getByRole('slider').focus()
      await usuario.keyboard('{End}')
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '12')
      expect(alCambiar).toHaveBeenCalledTimes(1)
      expect(alSoltar).toHaveBeenCalledWith(12)
    } finally {
      window.matchMedia = original
    }
  })

  it('refleja un valor cambiado desde fuera', () => {
    const { rerender } = render(
      <SelectorDeslizable etiqueta="Edad" valor={2} min={0} max={20} unidad="semanas" alCambiar={() => {}} />,
    )
    rerender(<SelectorDeslizable etiqueta="Edad" valor={9} min={0} max={20} unidad="semanas" alCambiar={() => {}} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '9')
  })
})
