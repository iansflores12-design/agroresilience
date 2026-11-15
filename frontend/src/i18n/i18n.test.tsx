import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '.'
import { CLAVE_ESTADO } from '../estado/EstadoApp'
import { decidir, validarEntrada } from '../lib/decision/motor'
import { instruccionesGemini, fechaEnPalabras } from '../lib/decision/textos'
import type { PuntoKharis } from '../lib/decision/tipos'
import { renderizarApp } from '../pruebas/renderizar'
import { IDIOMAS, normalizarIdioma } from './idiomas'
import en from './recursos/en'
import es from './recursos/es'
import pt from './recursos/pt'
import { traductor } from './traductor'

/** Todas las rutas de un objeto de textos, con las variables {{x}} de cada una. */
function rutas(o: unknown, base = ''): Map<string, string[]> {
  const salida = new Map<string, string[]>()
  if (typeof o === 'string') {
    salida.set(base, [...o.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort())
  } else if (Array.isArray(o)) {
    salida.set(`${base}#largo`, [String(o.length)])
    o.forEach((x, i) => rutas(x, `${base}[${i}]`).forEach((v, k) => salida.set(k, v)))
  } else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) rutas(v, base ? `${base}.${k}` : k).forEach((x, r) => salida.set(r, x))
  }
  return salida
}

describe('recursos de traduccion', () => {
  const base = rutas(es)
  it.each([['pt', pt], ['en', en]] as const)('%s tiene las mismas claves y variables que es', (_, recurso) => {
    const otro = rutas(recurso)
    expect([...otro.keys()].sort()).toEqual([...base.keys()].sort())
    for (const [clave, variables] of base) expect([clave, otro.get(clave)]).toEqual([clave, variables])
  })

  it('ningun texto queda vacio', () => {
    for (const recurso of [es, pt, en]) {
      for (const clave of rutas(recurso).keys()) expect(clave).not.toBe('')
      expect(JSON.stringify(recurso)).not.toContain('""')
    }
  })
})

describe('idiomas', () => {
  it('normaliza variantes regionales y cae al español', () => {
    expect(normalizarIdioma('pt-BR')).toBe('pt')
    expect(normalizarIdioma('en_US')).toBe('en')
    expect(normalizarIdioma('fr')).toBe('es')
    expect(normalizarIdioma(undefined)).toBe('es')
    expect(IDIOMAS).toEqual(['es', 'pt', 'en'])
  })

  it('el traductor sin React da cada idioma', () => {
    expect(traductor('es')('nav.tierra')).toBe('Tierra')
    expect(traductor('pt')('nav.tierra')).toBe('Solo')
    expect(traductor('en')('nav.tierra')).toBe('Soil')
    expect(fechaEnPalabras('2026-11-10')).toBe('10 de noviembre')
    expect(fechaEnPalabras('2026-11-10', 'en')).toBe('November 10')
    expect(instruccionesGemini('pt')).toContain('português')
  })
})

describe('motor de decision traducido', () => {
  const dias = 420
  const serie = (v: number) => Array.from({ length: dias }, () => v)
  const banda = (v: number) => ({ media: serie(v), p10: serie(v - 1), p90: serie(v + 1) })
  const punto: PuntoKharis = {
    punto: 'choluteca', lat: 13.3, lon: -87.2, elevacion: 50,
    pronostico: { inicio: '2026-11-01', dias, T2M_MAX: banda(33), PRECTOTCORR: banda(4) },
    fisica: { et0: serie(4), prob_lluvia_intensa: serie(0.1) },
    senales: [{ temporada: 2027, fraccion_pronosticada: 1, P2: { valor: 1, percentil: 50, probabilidad: 0.3, activo: false } }],
  }
  const entrada = { zonaId: 'choluteca', terreno: 'plano', cultivoId: 'maiz', temporada: 'primera', objetivos: ['agua'] } as const
  const meta = { fechaBase: '2026-11-10', modelo: 'v1' }

  it('validarEntrada conserva solo idiomas conocidos', () => {
    expect(validarEntrada({ ...entrada, idioma: 'pt' })?.idioma).toBe('pt')
    expect(validarEntrada({ ...entrada, idioma: 'xx' })?.idioma).toBeUndefined()
  })

  it('los mismos puntajes en los tres idiomas, con textos distintos', () => {
    const [d, p, i] = (['es', 'pt', 'en'] as const).map((idioma) => decidir({ ...entrada, objetivos: ['agua'], idioma }, punto, meta))
    expect(p.rotaciones.map((r) => [r.id, r.puntaje])).toEqual(d.rotaciones.map((r) => [r.id, r.puntaje]))
    expect(i.rotaciones.map((r) => [r.id, r.puntaje])).toEqual(d.rotaciones.map((r) => [r.id, r.puntaje]))
    const actual = (x: typeof d) => x.rotaciones.find((r) => r.actual)!
    expect(actual(d).nombre).toBe('Maíz y otra vez maíz')
    expect(actual(p).nombre).toBe('Milho e de novo milho')
    expect(actual(i).nombre).toBe('Corn, then corn again')
    for (const x of [p, i]) {
      const texto = JSON.stringify(x.rotaciones)
      expect(texto).not.toMatch(/{{|}}/)
      expect(texto).not.toContain('lo que hace hoy')
    }
    expect(i.avisos[2]).toContain('thinking aid')
  })
})

describe('selector de idioma', () => {
  beforeEach(() => window.localStorage.clear())

  it('cambia la interfaz, el atributo lang y recuerda la eleccion', async () => {
    renderizarApp('/mapa')
    expect(screen.getByRole('link', { name: 'Mapa' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en')
    expect(screen.getByRole('link', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Where is your plot?' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('agroresilience.idioma')).toBe('en')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'pt')
    expect(screen.getByRole('heading', { level: 1, name: 'Onde fica a sua parcela?' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('pt')
  })

  it('traduce los datos del dominio (cultivo y etapa) en la pantalla Tierra', async () => {
    window.localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ cultivoId: 'maiz', zonaId: 'choluteca', edadSemanas: 9 }))
    renderizarApp('/zona')
    expect(screen.getByText('Maíz, semana 9: floración')).toBeInTheDocument()
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByText('Corn, week 9: flowering')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How is the soil in Choluteca?')
  })
})
