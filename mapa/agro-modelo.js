/* Cálculo del puntaje. Funciones puras: no tocan el DOM ni Leaflet,
   así el resto del frontend puede usarlas sin crear un mapa. */
import { DEPTOS, CULTIVOS, ESCENARIOS, FACTORES, CAPAS, ROTACION, FACTORES_ROTACION } from './agro-datos.js';

export const ESTADO_INICIAL = { depto: 'HN-CH', cultivo: 'maiz', escenario: 'seco', capa: 'aptitud' };

const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const trapecio = (v, [a, b, c, d]) => v < a || v > d ? 0 : v < b ? (v - a) / (b - a) : v <= c ? 1 : (d - v) / (d - c);

/** Condiciones del departamento ya ajustadas al escenario. */
export function condiciones(iso, escenario) {
  const d = DEPTOS[iso], e = ESCENARIOS[escenario];
  return { ...d, lluvia: d.lluvia * e.lluvia, hum: d.hum * e.hum, canicula: d.canicula * e.canicula };
}

/** Puntaje 0-100 de un cultivo en un departamento, con el desglose por factor. */
export function puntaje(iso, cultivo, escenario) {
  const c = condiciones(iso, escenario), k = CULTIVOS[cultivo];
  const sub = {
    agua:    100 * trapecio(c.lluvia, k.lluvia),
    clima:   100 * trapecio(c.temp, k.temp),
    altitud: 100 * trapecio(c.alt, k.alt),
    suelo:   60 * trapecio(c.ph, k.ph) + 40 * limitar((c.hum - 10) / 25, 0, 1),
    sequia:  100 - limitar(c.canicula * k.sens * 2.2, 0, 100)
  };
  const total = Math.round(FACTORES.reduce((s, f) => s + f.peso * sub[f.clave], 0));
  return { total, sub };
}

/** Valor que una capa muestra para un departamento. */
export function valorCapa(iso, { capa, cultivo, escenario }) {
  const c = condiciones(iso, escenario);
  switch (capa) {
    case 'lluvia':  return c.lluvia;
    case 'humedad': return c.hum;
    case 'ndvi':    return c.ndvi;
    case 'sequia':  return c.canicula;
    default:        return puntaje(iso, cultivo, escenario).total;
  }
}

/** Índice de clase (0 = la más baja) de un valor dentro de una capa. */
export function claseDe(valor, capa) {
  const cortes = CAPAS[capa].cortes;
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]) i++;
  return i;
}
export const colorDe = (valor, capa) => CAPAS[capa].colores[claseDe(valor, capa)];
export const etiquetaAptitud = total => CAPAS.aptitud.etiquetas[claseDe(total, 'aptitud')];

/** Departamentos ordenados de mejor a peor para un cultivo: [{ iso, nombre, total }]. */
export function ranking(cultivo, escenario) {
  return Object.keys(DEPTOS)
    .map(iso => ({ iso, nombre: DEPTOS[iso].nombre, total: puntaje(iso, cultivo, escenario).total }))
    .sort((a, b) => b.total - a.total);
}

/** Todo lo que se sabe de un departamento para la selección actual. */
export function detalle(iso, { cultivo, escenario }) {
  const p = puntaje(iso, cultivo, escenario);
  const rk = ranking(cultivo, escenario);
  const limitante = FACTORES.reduce((m, f) => p.sub[f.clave] < p.sub[m.clave] ? f : m);
  return {
    iso,
    nombre: DEPTOS[iso].nombre,
    corredorSeco: DEPTOS[iso].seco,
    condiciones: condiciones(iso, escenario),
    total: p.total,
    etiqueta: etiquetaAptitud(p.total),
    color: colorDe(p.total, 'aptitud'),
    factores: FACTORES.map(f => ({ ...f, valor: Math.round(p.sub[f.clave]) })),
    limitante: { ...limitante, valor: Math.round(p.sub[limitante.clave]) },
    puesto: rk.findIndex(r => r.iso === iso) + 1,
    totalDeptos: rk.length,
    porCultivo: Object.keys(CULTIVOS)
      .map(id => ({ id, nombre: CULTIVOS[id].nombre, total: puntaje(iso, id, escenario).total }))
      .sort((a, b) => b.total - a.total)
  };
}

/* ---------- Rotaciones primera → postrera ---------- */

function saludSuelo(primera, postrera) {
  const a = ROTACION[primera], b = ROTACION[postrera];
  const base = primera === postrera ? 40            // repetir el mismo cultivo
    : b.familia === 'leguminosa' ? 88               // entra una leguminosa
    : a.familia === 'leguminosa' ? 82               // gramínea después de leguminosa
    : 60;                                           // dos gramíneas distintas
  return base + (primera === postrera ? 0 : b.bonoSuelo || 0);
}

/**
 * Rotaciones posibles para el cultivo actual en un departamento.
 * Devuelve la rotación actual (repetir el cultivo) primero y luego las
 * alternativas de mejor a peor. Lista vacía si el cultivo es perenne.
 * Cada una: { id, nombre, actual, mejor, total, color, etiqueta, confianza,
 *             diferencia, factores, fuerte, debil, calendario, ventajas, riesgos, falta }
 */
export function rotaciones(iso, cultivo, escenario) {
  if (ROTACION[cultivo].perenne) return [];
  const lista = Object.keys(ROTACION).filter(id => !ROTACION[id].perenne).map(postrera => {
    const r = ROTACION[postrera], p = puntaje(iso, postrera, escenario), actual = postrera === cultivo;
    const sub = {
      agua:     (p.sub.agua + p.sub.sequia) / 2,
      suelo:    limitar(0.7 * saludSuelo(cultivo, postrera) + 0.3 * p.sub.suelo, 0, 100),
      clima:    p.total,
      economia: limitar(r.mercado + (actual ? 0 : 8), 0, 100)
    };
    const factores = FACTORES_ROTACION.map(f => ({ ...f, valor: Math.round(sub[f.clave]) }));
    const total = Math.round(FACTORES_ROTACION.reduce((s, f) => s + f.peso * sub[f.clave], 0));
    return {
      id: postrera,
      nombre: `${CULTIVOS[cultivo].nombre} → ${CULTIVOS[postrera].nombre}${actual ? '' : r.sufijo || ''}`,
      actual, total,
      color: colorDe(total, 'aptitud'),
      etiqueta: etiquetaAptitud(total),
      confianza: r.confianza,
      factores,
      fuerte: factores.reduce((m, f) => f.valor > m.valor ? f : m),
      debil: factores.reduce((m, f) => f.valor < m.valor ? f : m),
      calendario: [
        { epoca: 'Primera', meses: 'mayo – agosto', cultivo: CULTIVOS[cultivo].nombre, ciclo: ROTACION[cultivo].ciclo },
        { epoca: 'Postrera', meses: 'septiembre – diciembre', cultivo: CULTIVOS[postrera].nombre + (actual ? '' : r.sufijo || ''), ciclo: r.ciclo }
      ],
      ventajas: r.ventajas, riesgos: r.riesgos, falta: r.falta
    };
  });
  const propia = lista.find(r => r.actual);
  const mejor = Math.max(...lista.map(r => r.total));
  lista.forEach(r => { r.diferencia = r.total - propia.total; r.mejor = r.total === mejor; });
  return [propia, ...lista.filter(r => !r.actual).sort((a, b) => b.total - a.total)];
}
