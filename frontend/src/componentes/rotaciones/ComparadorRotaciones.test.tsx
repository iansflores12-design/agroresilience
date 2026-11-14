import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { rotacionesPara } from '../../datos/aptitud'
import { ComparadorRotaciones } from './ComparadorRotaciones'

const rotaciones = rotacionesPara('HN-CH', 'maiz', 'seco')
const otra = rotaciones.find((r) => !r.actual)!
const actual = rotaciones.find((r) => r.actual)!
const TITULOS = ['La tierra', 'Las plagas', 'Las enfermedades', 'La cosecha']

describe('ComparadorRotaciones: que cambia al sembrar', () => {
  it('al abrir una opcion no actual con actualId muestra los 4 bloques', async () => {
    render(<ComparadorRotaciones rotaciones={rotaciones} actualId="maiz" />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(otra.nombre) }))
    const region = screen.getByRole('region')
    expect(screen.getByRole('heading', { name: new RegExp(`Qué cambia al sembrar ${otra.nombre.toLowerCase()}`) })).toBeInTheDocument()
    const titulos = [...region.querySelectorAll('strong')].map((e) => e.textContent?.replace(/:$/, ''))
    expect(titulos).toEqual(TITULOS)
    expect(region).toHaveTextContent(/Ayuda|Depende|Perjudica/)
  })

  it('al abrir la opcion actual no aparece la seccion', async () => {
    render(<ComparadorRotaciones rotaciones={rotaciones} actualId="maiz" />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(actual.nombre) }))
    expect(screen.getByRole('region')).toBeInTheDocument()
    expect(screen.queryByText(/Qué cambia al sembrar/)).not.toBeInTheDocument()
  })

  it('sin actualId no aparece la seccion', async () => {
    render(<ComparadorRotaciones rotaciones={rotaciones} />)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(otra.nombre) }))
    expect(screen.getByRole('region')).toBeInTheDocument()
    expect(screen.queryByText(/Qué cambia al sembrar/)).not.toBeInTheDocument()
  })
})
