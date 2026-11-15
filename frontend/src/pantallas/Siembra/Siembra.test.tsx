import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Siembra from '.'

type Geo = Pick<Geolocation, 'getCurrentPosition'>

const geoOk: Geo = {
  getCurrentPosition: (ok) =>
    ok({ coords: { latitude: 14.65, longitude: -86.21, accuracy: 12 } } as GeolocationPosition),
}
const geoNegado: Geo = {
  getCurrentPosition: (_ok, err) => err?.({ code: 1 } as GeolocationPositionError),
}

const siguiente = () => userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

async function hastaUbicacion() {
  await userEvent.click(screen.getByRole('radio', { name: 'Maíz' }))
  await siguiente()
  await userEvent.type(screen.getByLabelText('Días desde la siembra'), '30')
  await siguiente()
  await userEvent.click(screen.getByRole('radio', { name: 'Ahorrar agua' }))
  await siguiente()
  await userEvent.click(screen.getByRole('radio', { name: 'Media (franca)' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Plana' }))
  await userEvent.click(screen.getByRole('radio', { name: 'El agua se va rápido' }))
  await userEvent.click(screen.getByRole('radio', { name: 'No' }))
  await siguiente()
}

describe('Pantalla Siembra', () => {
  it('flujo completo con GPS llega al resultado con datos de ejemplo', async () => {
    render(<Siembra geo={geoOk} />)
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
    await hastaUbicacion()
    expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }))
    expect(await screen.findByText(/14\.65000, -86\.21000/)).toBeInTheDocument()
    await siguiente()
    expect(screen.getByText(/Datos de ejemplo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar de nuevo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo' }))
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
  })

  it('Siguiente sin responder muestra el error y no avanza', async () => {
    render(<Siembra geo={geoOk} />)
    await siguiente()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument()
  })

  it('Atrás conserva las respuestas', async () => {
    render(<Siembra geo={geoOk} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Maíz' }))
    await siguiente()
    await userEvent.type(screen.getByLabelText('Días desde la siembra'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByRole('radio', { name: 'Maíz' })).toBeChecked()
    await siguiente()
    expect(screen.getByLabelText('Días desde la siembra')).toHaveValue('30')
  })

  it('con permiso negado muestra el mensaje y permite escribir coordenadas', async () => {
    render(<Siembra geo={geoNegado} />)
    await hastaUbicacion()
    await userEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }))
    expect(await screen.findByText(/No dio permiso/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('O escriba las coordenadas'), '14.65, -86.21')
    await userEvent.click(screen.getByRole('button', { name: 'Usar estas coordenadas' }))
    await siguiente()
    expect(screen.getByText(/Datos de ejemplo/)).toBeInTheDocument()
  })

  it('coordenadas manuales inválidas muestran error', async () => {
    render(<Siembra geo={geoNegado} />)
    await hastaUbicacion()
    await userEvent.type(screen.getByLabelText('O escriba las coordenadas'), 'hola')
    await userEvent.click(screen.getByRole('button', { name: 'Usar estas coordenadas' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/coordenadas/)
  })

  it('coordenadas manuales fuera de Honduras se avisan al momento', async () => {
    render(<Siembra geo={geoNegado} />)
    await hastaUbicacion()
    await userEvent.type(screen.getByLabelText('O escriba las coordenadas'), '40.4, -3.7')
    await userEvent.click(screen.getByRole('button', { name: 'Usar estas coordenadas' }))
    expect(screen.getByText('Esas coordenadas están fuera de Honduras. Revíselas.')).toBeInTheDocument()
    expect(screen.queryByText(/^Ubicación:/)).not.toBeInTheDocument()
  })
})
