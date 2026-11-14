import { rotacionesPara, type Escenario, type RotacionPuntuada } from '../../datos/aptitud'
import { buscarCultivo } from '../../datos/cultivos'
import { pesosDeEnfoques } from './pesos'
import { tipoCambioDe } from './situacion'
import {
  ENFOQUES,
  type AvisoDecision,
  type CandidatoDecision,
  type Decision,
  type Enfoque,
  type PerspectivaResumen,
} from './tipos'

const ESCENARIOS: Escenario[] = ['seco', 'normal', 'lluvioso']
const AVISOS: AvisoDecision[] = ['ninguno', 'canicula', 'lluvia_fuerte', 'tierra_seca']
const MARGEN_MAXIMO = 10

export function escenarioParaPuntuar(
  escenario: Escenario,
  enfoques: Enfoque[],
  perspectiva: PerspectivaResumen | null,
): Escenario {
  if (enfoques.includes('seguro') && perspectiva?.usable && perspectiva.prob.seco >= 0.4) return 'seco'
  return escenario
}

export function candidatosPara(args: {
  departamentoId: string | null
  cultivoId: string | null
  escenario: Escenario
  enfoques: Enfoque[]
  perspectiva: PerspectivaResumen | null
}): { candidatos: CandidatoDecision[]; rotaciones: RotacionPuntuada[]; escenarioUsado: Escenario } {
  const { departamentoId, cultivoId, enfoques } = args
  const escenarioUsado = escenarioParaPuntuar(args.escenario, enfoques, args.perspectiva)
  const pesos = pesosDeEnfoques(enfoques)
  const rotaciones = rotacionesPara(departamentoId, cultivoId, escenarioUsado, { pesos })
  const primera = buscarCultivo(cultivoId)
  if (!primera) return { candidatos: [], rotaciones, escenarioUsado }

  const totales = Object.fromEntries(
    ESCENARIOS.map((e) => [e, new Map(rotacionesPara(departamentoId, cultivoId, e, { pesos }).map((r) => [r.id, r.total]))]),
  ) as Record<Escenario, Map<string, number>>

  const candidatos = [...rotaciones]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .flatMap((r) => {
      const siguiente = buscarCultivo(r.id)
      if (!siguiente) return []
      return [
        {
          id: r.id,
          nombre: r.nombre,
          actual: r.actual,
          total: r.total,
          porEscenario: {
            seco: totales.seco.get(r.id) ?? r.total,
            normal: totales.normal.get(r.id) ?? r.total,
            lluvioso: totales.lluvioso.get(r.id) ?? r.total,
          },
          partes: r.partes.map((p) => ({ clave: p.clave as CandidatoDecision['partes'][number]['clave'], valor: p.valor })),
          tipoCambio: tipoCambioDe(primera, siguiente),
        },
      ]
    })
  return { candidatos, rotaciones, escenarioUsado }
}

export function decisionDelMotor(candidatos: CandidatoDecision[], enfoques: Enfoque[]): Decision {
  const mejor = candidatos.reduce<CandidatoDecision | null>((m, c) => (m === null || c.total > m.total ? c : m), null)
  return { rotacionId: mejor?.id ?? '', enfoquePrincipal: enfoques[0] ?? null, aviso: 'ninguno', origen: 'motor' }
}

export function validarDecision(respuesta: unknown, candidatos: CandidatoDecision[], enfoques: Enfoque[]): Decision {
  const motor = decisionDelMotor(candidatos, enfoques)
  if (typeof respuesta !== 'object' || respuesta === null) return motor
  const r = respuesta as Record<string, unknown>
  if (typeof r.rotacionId !== 'string') return motor
  const elegido = candidatos.find((c) => c.id === r.rotacionId)
  if (!elegido) return motor
  const mejor = Math.max(...candidatos.map((c) => c.total))
  if (elegido.total < mejor - MARGEN_MAXIMO) return motor
  const enfoque = ENFOQUES.find((e) => e.id === r.enfoquePrincipal)?.id ?? null
  const aviso = AVISOS.find((a) => a === r.aviso) ?? 'ninguno'
  return { rotacionId: elegido.id, enfoquePrincipal: enfoque, aviso, origen: 'gemini' }
}
