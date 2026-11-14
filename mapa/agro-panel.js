/* Panel de detalle de la pantalla "Mapa": controles, puntaje desglosado,
   datos de la zona y rankings. Se conecta a un mapa creado con crearMapaAgro
   y se mantiene sincronizado con él. Opcional: la pantalla de inicio puede
   usar solo el mapa. */
import { DEPTOS, CULTIVOS, ESCENARIOS } from './agro-datos.js';
import { colorDe } from './agro-modelo.js';

const barra = (valor, color) =>
  `<span class="agm-barra"><span style="width:${Math.max(0, Math.min(100, valor))}%;background:${color}"></span></span>`;

/**
 * opciones:
 *   controles   true muestra los selectores de departamento, cultivo y escenario (por defecto true)
 */
export function crearPanelAgro(contenedor, mapa, opciones = {}) {
  const el = typeof contenedor === 'string' ? document.querySelector(contenedor) : contenedor;
  if (!el) throw new Error('AgroPanel: no existe el contenedor');
  el.classList.add('agm-panel');

  function pintar() {
    const s = mapa.estado(), d = mapa.detalle(), c = d.condiciones, k = CULTIVOS[s.cultivo];
    const cultivo = k.nombre.toLowerCase();
    const opcionesDe = (tabla, actual) => Object.entries(tabla)
      .sort((a, b) => tabla === DEPTOS ? a[1].nombre.localeCompare(b[1].nombre, 'es') : 0)
      .map(([id, x]) => `<option value="${id}"${id === actual ? ' selected' : ''}>${x.nombre}</option>`).join('');
    const dato = (valor, texto) => `<div class="agm-dato"><b>${valor}</b><span>${texto}</span></div>`;
    const fila = (attr, id, nombre, total, activo, pos) =>
      `<button type="button" ${attr}="${id}" class="agm-fila${activo ? ' agm-fila--activa' : ''}">
        ${pos ? `<span class="agm-fila-pos">${pos}</span>` : ''}<span class="agm-fila-nombre">${nombre}</span>
        ${barra(total, colorDe(total, 'aptitud'))}<span class="agm-fila-valor">${total}</span></button>`;

    el.innerHTML = `
      ${opciones.controles === false ? '' : `
      <div class="agm-tarjeta">
        <div class="agm-controles">
          <select data-campo="depto" aria-label="Departamento">${opcionesDe(DEPTOS, s.depto)}</select>
          <select data-campo="cultivo" aria-label="Cultivo">${opcionesDe(CULTIVOS, s.cultivo)}</select>
        </div>
        <div class="agm-escenarios">
          ${Object.entries(ESCENARIOS).map(([id, e]) =>
            `<button type="button" data-escenario="${id}" class="${id === s.escenario ? 'agm-activo' : ''}">${e.nombre}</button>`).join('')}
        </div>
      </div>`}

      <div class="agm-tarjeta">
        <div class="agm-cabecera">
          <div>
            <span class="agm-sobretitulo">${k.nombre} · escenario ${ESCENARIOS[s.escenario].nombre.toLowerCase()}</span>
            <h2>${d.nombre}</h2>
            <span class="agm-chip" style="background:${d.color}22;border-color:${d.color}">Aptitud ${d.etiqueta.toLowerCase()}</span>
            ${d.corredorSeco ? '<span class="agm-chip agm-chip--seco">Corredor Seco</span>' : ''}
          </div>
          <div class="agm-puntaje">
            <b style="color:${d.total >= 55 ? '#1b4332' : '#9e2a2b'}">${d.total}</b>
            <span>/ 100 · puesto ${d.puesto} de ${d.totalDeptos}</span>
          </div>
        </div>
        ${d.factores.map(f => `<div class="agm-factor">
          <div><span>${f.nombre} <i>· peso ${Math.round(f.peso * 100)}%</i></span><b>${f.valor}</b></div>
          ${barra(f.valor, colorDe(f.valor, 'aptitud'))}</div>`).join('')}
        <p class="agm-limitante"><b>Lo que más limita:</b> ${d.limitante.limite} (${d.limitante.valor}/100).</p>
      </div>

      <div class="agm-tarjeta">
        <h3>Datos de la zona</h3>
        <div class="agm-datos">
          ${dato(Math.round(c.lluvia / 10) * 10 + ' mm', 'Lluvia anual')}
          ${dato(c.temp.toFixed(1) + ' °C', 'Temperatura media')}
          ${dato(c.alt + ' m', 'Altitud media')}
          ${dato(Math.round(c.hum) + ' %', 'Humedad suelo (SMAP)')}
          ${dato(c.ndvi.toFixed(2), 'NDVI (vigor vegetal)')}
          ${dato(Math.round(c.canicula) + ' días', 'Canícula esperada')}
          ${dato(c.ph.toFixed(1), 'pH del suelo')}
          ${dato(k.lluvia[1] + '–' + k.lluvia[2], 'mm que pide ' + cultivo)}
          ${dato(k.temp[1] + '–' + k.temp[2] + ' °C', 'Temp. óptima cultivo')}
        </div>
      </div>

      <div class="agm-tarjeta">
        <h3>Qué cultivo rinde mejor en ${d.nombre}</h3>
        ${d.porCultivo.map(x => fila('data-cultivo', x.id, x.nombre, x.total, x.id === s.cultivo)).join('')}
      </div>

      <div class="agm-tarjeta">
        <h3>Los ${d.totalDeptos} departamentos para ${cultivo}</h3>
        ${mapa.ranking().map((r, i) => fila('data-depto', r.iso, r.nombre, r.total, r.iso === s.depto, i + 1)).join('')}
      </div>`;
  }

  const alClic = e => {
    const b = e.target.closest('[data-escenario],[data-cultivo],[data-depto]');
    if (!b) return;
    const { escenario, cultivo, depto } = b.dataset;
    mapa.set({ escenario, cultivo, depto });
  };
  const alElegir = e => {
    if (e.target.dataset.campo) mapa.set({ [e.target.dataset.campo]: e.target.value });
  };
  el.addEventListener('click', alClic);
  el.addEventListener('change', alElegir);
  const desuscribir = mapa.alCambiar(pintar);
  pintar();

  return {
    destruir() {
      desuscribir();
      el.removeEventListener('click', alClic);
      el.removeEventListener('change', alElegir);
      el.innerHTML = '';
      el.classList.remove('agm-panel');
    }
  };
}
