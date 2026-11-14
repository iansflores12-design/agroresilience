/* Cards de rotaciones para poner debajo del mapa. Comparan la rotación
   actual (repetir el cultivo) con las alternativas para el departamento,
   cultivo y escenario seleccionados en el mapa. Al tocar una card se abre
   su detalle; al tocarla de nuevo se cierra. */
import { CULTIVOS, ESCENARIOS } from './agro-datos.js';
import { colorDe } from './agro-modelo.js';

const barra = (valor, color) =>
  `<span class="agm-barra"><span style="width:${Math.max(0, Math.min(100, valor))}%;background:${color}"></span></span>`;
const lista = items => `<ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>`;

/**
 * opciones:
 *   seleccion   id del cultivo de postrera abierto al inicio (por defecto ninguno)
 *   onSeleccion función (rotacion | null) llamada al abrir o cerrar una card
 */
export function crearRotacionesAgro(contenedor, mapa, opciones = {}) {
  const el = typeof contenedor === 'string' ? document.querySelector(contenedor) : contenedor;
  if (!el) throw new Error('AgroRotaciones: no existe el contenedor');
  el.classList.add('agm-rotaciones');
  let abierta = opciones.seleccion || null;

  function card(r) {
    const tipo = r.actual ? 'Tu rotación actual' : r.mejor ? 'Recomendada' : 'Alternativa';
    return `<button type="button" data-rotacion="${r.id}" aria-expanded="${r.id === abierta}"
        class="agm-rot-card${r.id === abierta ? ' agm-rot-card--abierta' : ''}${r.mejor ? ' agm-rot-card--mejor' : ''}">
      ${r.mejor ? '<span class="agm-rot-cinta">Mejor puntaje</span>' : ''}
      <span class="agm-sobretitulo">${tipo}</span>
      <span class="agm-rot-nombre">${r.nombre}</span>
      <span class="agm-rot-pie">
        <b style="color:${r.total >= 55 ? '#1b4332' : '#9e2a2b'}">${r.total}</b>
        <span>/ 100${r.actual ? '' : ` · <i class="${r.diferencia >= 0 ? 'agm-sube' : 'agm-baja'}">${r.diferencia >= 0 ? '+' : ''}${r.diferencia}</i>`}</span>
        <span class="agm-chip agm-conf-${r.confianza}">Confianza ${r.confianza}</span>
      </span>
      ${barra(r.total, r.color)}
    </button>`;
  }

  function detalle(r, depto) {
    const comparacion = r.actual
      ? 'Es lo que hacés hoy: sirve de base para comparar las alternativas.'
      : r.diferencia > 0 ? `Suma <b>${r.diferencia} puntos</b> frente a repetir el cultivo.`
      : r.diferencia < 0 ? `Queda <b>${-r.diferencia} puntos</b> por debajo de repetir el cultivo.`
      : 'Empata con repetir el cultivo.';
    return `<div class="agm-tarjeta agm-rot-detalle">
      <div class="agm-cabecera">
        <div>
          <span class="agm-sobretitulo">${depto} · detalle de la rotación</span>
          <h2>${r.nombre}</h2>
          <span class="agm-chip" style="background:${r.color}22;border-color:${r.color}">Aptitud ${r.etiqueta.toLowerCase()}</span>
          <span class="agm-chip agm-conf-${r.confianza}">Confianza ${r.confianza}</span>
        </div>
        <div class="agm-puntaje"><b style="color:${r.total >= 55 ? '#1b4332' : '#9e2a2b'}">${r.total}</b><span>/ 100</span></div>
      </div>
      <p class="agm-rot-resumen">${comparacion} Su punto fuerte es <b>${r.fuerte.nombre.toLowerCase()}</b> (${r.fuerte.valor}) y el más débil, <b>${r.debil.nombre.toLowerCase()}</b> (${r.debil.valor}).</p>

      <div class="agm-rot-columnas">
        <div>
          <h3>Puntaje por factor</h3>
          ${r.factores.map(f => `<div class="agm-factor">
            <div><span>${f.nombre} <i>· peso ${Math.round(f.peso * 100)}%</i></span><b>${f.valor}</b></div>
            ${barra(f.valor, colorDe(f.valor, 'aptitud'))}</div>`).join('')}
        </div>
        <div>
          <h3>Calendario</h3>
          <div class="agm-rot-calendario">
            ${r.calendario.map(c => `<div><span>${c.epoca} · ${c.meses}</span><b>${c.cultivo}</b><span>${c.ciclo} días de ciclo</span></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="agm-rot-columnas agm-rot-listas">
        <div><h3>A favor</h3>${lista(r.ventajas)}</div>
        <div><h3>Riesgos</h3>${lista(r.riesgos)}</div>
        <div><h3>Qué falta saber</h3>${lista(r.falta)}</div>
      </div>
    </div>`;
  }

  function pintar() {
    const s = mapa.estado(), d = mapa.detalle(), rots = mapa.rotaciones();
    if (!rots.some(r => r.id === abierta)) abierta = null;
    const cabecera = `<div class="agm-rot-titulo">
        <h3>Rotaciones para ${d.nombre}</h3>
        <span>${CULTIVOS[s.cultivo].nombre} de primera · escenario ${ESCENARIOS[s.escenario].nombre.toLowerCase()}</span>
      </div>`;
    if (!rots.length) {
      el.innerHTML = `${cabecera}<p class="agm-rot-vacio">${CULTIVOS[s.cultivo].nombre} es un cultivo perenne: no se rota de primera a postrera. Elegí un cultivo anual para comparar rotaciones.</p>`;
      return;
    }
    const sel = rots.find(r => r.id === abierta);
    el.innerHTML = `${cabecera}
      <div class="agm-rot-cards">${rots.map(card).join('')}</div>
      ${sel ? detalle(sel, d.nombre) : '<p class="agm-rot-ayuda">Tocá una rotación para ver el detalle.</p>'}`;
  }

  const alClic = e => {
    const b = e.target.closest('[data-rotacion]');
    if (!b) return;
    abierta = abierta === b.dataset.rotacion ? null : b.dataset.rotacion;
    pintar();
    if (opciones.onSeleccion) opciones.onSeleccion(mapa.rotaciones().find(r => r.id === abierta) || null);
  };
  el.addEventListener('click', alClic);
  const desuscribir = mapa.alCambiar(pintar);
  pintar();

  return {
    /** Abre la card de una rotación (id del cultivo de postrera) o cierra con null. */
    seleccionar(id) { abierta = id; pintar(); },
    destruir() {
      desuscribir();
      el.removeEventListener('click', alClic);
      el.innerHTML = '';
      el.classList.remove('agm-rotaciones');
    }
  };
}
