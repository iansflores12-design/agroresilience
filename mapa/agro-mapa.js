/* Componente de mapa: Honduras por departamento, coloreado por puntaje.
   No depende de ningún framework. Necesita Leaflet 1.9 (global L, o
   pasado en opciones.L) y agro-mapa.css. */
import { DEPTOS, CULTIVOS, ESCENARIOS, CAPAS, URL_LIMITES } from './agro-datos.js';
import { ESTADO_INICIAL, valorCapa, colorDe, detalle, ranking, rotaciones } from './agro-modelo.js';

const LIMITES_HN = [[12.95, -89.4], [16.55, -83.1]];
const VALIDOS = { depto: DEPTOS, cultivo: CULTIVOS, escenario: ESCENARIOS, capa: CAPAS };
const descargas = new Map();

function cargarLimites(url) {
  if (!descargas.has(url)) {
    descargas.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error('No se pudieron cargar los límites (' + r.status + ')');
      return r.json();
    }));
    descargas.get(url).catch(() => descargas.delete(url));
  }
  return descargas.get(url);
}

/**
 * Crea el mapa dentro de `contenedor` (elemento o selector). El contenedor
 * debe tener altura; el mapa lo llena y se ajusta solo si cambia de tamaño
 * o pasa de oculto a visible.
 *
 * opciones:
 *   depto, cultivo, escenario, capa   selección inicial
 *   selectorCapas   true muestra los botones de capa sobre el mapa (por defecto false)
 *   leyenda         true = flotante dentro del mapa (por defecto) · false = sin leyenda
 *                   · un elemento = la leyenda se dibuja ahí, en horizontal
 *   etiquetas       true muestra el valor sobre cada departamento (por defecto true)
 *   geojsonUrl      ruta de los límites departamentales (por defecto, la copia en línea)
 *   L               instancia de Leaflet si no está como global
 *   onCambio        función (estado, detalle) llamada en cada cambio de selección
 */
export function crearMapaAgro(contenedor, opciones = {}) {
  const L = opciones.L || globalThis.L;
  if (!L) throw new Error('AgroMapa: no se encontró Leaflet. Cargalo antes o pasalo en opciones.L');
  const el = typeof contenedor === 'string' ? document.querySelector(contenedor) : contenedor;
  if (!el) throw new Error('AgroMapa: no existe el contenedor');

  const estado = { ...ESTADO_INICIAL };
  for (const k in VALIDOS) if (opciones[k] in VALIDOS[k]) estado[k] = opciones[k];
  const oyentes = new Set();
  if (opciones.onCambio) oyentes.add(opciones.onCambio);

  // --- Estructura ---
  el.classList.add('agm-mapa');
  el.innerHTML = '<div class="agm-lienzo"></div><div class="agm-capas"></div><div class="agm-aviso" hidden></div>';
  const lienzo = el.querySelector('.agm-lienzo');
  const cajaCapas = el.querySelector('.agm-capas');
  const aviso = el.querySelector('.agm-aviso');
  cajaCapas.hidden = !opciones.selectorCapas;

  let cajaLeyenda = null;
  const leyendaExterna = opciones.leyenda instanceof HTMLElement;
  if (leyendaExterna) {
    cajaLeyenda = opciones.leyenda;
    cajaLeyenda.classList.add('agm-leyenda', 'agm-leyenda--fila');
  } else if (opciones.leyenda !== false) {
    cajaLeyenda = document.createElement('div');
    cajaLeyenda.className = 'agm-leyenda agm-leyenda--flotante';
    el.appendChild(cajaLeyenda);
  }

  // --- Leaflet ---
  const mapa = L.map(lienzo, { zoomSnap: 0.25, minZoom: 6, maxZoom: 11, maxBounds: [[11.5, -91.5], [18, -81]] });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Fondo: Esri · Límites: geoBoundaries/OSM'
  }).addTo(mapa);
  mapa.fitBounds(LIMITES_HN);

  let geo = null, destruido = false, tocado = false;
  ['mousedown', 'wheel', 'touchstart'].forEach(ev => lienzo.addEventListener(ev, () => { tocado = true; }, { passive: true }));

  // Recalcula el tamaño cuando el contenedor cambia o deja de estar oculto.
  const observador = new ResizeObserver(() => {
    if (!el.offsetWidth || !el.offsetHeight) return;
    mapa.invalidateSize();
    if (!tocado) mapa.fitBounds(LIMITES_HN);
  });
  observador.observe(el);

  const estilo = iso => {
    const sel = iso === estado.depto;
    return { fillColor: colorDe(valorCapa(iso, estado), estado.capa), fillOpacity: 0.85,
             color: sel ? '#0f172a' : '#ffffff', weight: sel ? 3 : 1.2 };
  };

  function pintar() {
    if (geo) geo.eachLayer(capa => {
      const iso = capa.feature.properties.shapeISO;
      capa.setStyle(estilo(iso));
      if (capa.getTooltip()) capa.setTooltipContent(CAPAS[estado.capa].fmt(valorCapa(iso, estado)));
      if (iso === estado.depto) capa.bringToFront();
    });

    cajaCapas.innerHTML = Object.entries(CAPAS).map(([id, c]) =>
      `<button type="button" data-capa="${id}" class="agm-pildora${id === estado.capa ? ' agm-pildora--activa' : ''}">${c.nombre}</button>`).join('');

    if (cajaLeyenda) {
      const k = CAPAS[estado.capa];
      const filas = k.colores.map((color, i) => {
        const rango = i === 0 ? `< ${k.cortes[0]}` : i === k.colores.length - 1 ? `≥ ${k.cortes[i - 1]}` : `${k.cortes[i - 1]} – ${k.cortes[i]}`;
        const texto = leyendaExterna && k.etiquetas ? k.etiquetas[i] : rango + (k.etiquetas ? ' · ' + k.etiquetas[i] : '');
        return `<span class="agm-leyenda-fila"><i style="background:${color}"></i>${texto}</span>`;
      });
      if (!leyendaExterna) filas.reverse();
      cajaLeyenda.innerHTML = `<b class="agm-leyenda-titulo">${k.titulo}</b>${filas.join('')}`;
    }
  }

  function avisar() {
    const d = detalle(estado.depto, estado);
    oyentes.forEach(fn => fn({ ...estado }, d));
  }

  function set(cambios) {
    let hubo = false;
    for (const k in VALIDOS) {
      if (cambios[k] !== undefined && cambios[k] in VALIDOS[k] && cambios[k] !== estado[k]) { estado[k] = cambios[k]; hubo = true; }
    }
    if (hubo) { pintar(); avisar(); }
    return api;
  }

  cajaCapas.addEventListener('click', e => {
    const boton = e.target.closest('[data-capa]');
    if (boton) set({ capa: boton.dataset.capa });
  });

  cargarLimites(opciones.geojsonUrl || URL_LIMITES).then(geojson => {
    if (destruido) return;
    geo = L.geoJSON(geojson, {
      filter: f => f.properties.shapeISO in DEPTOS,
      onEachFeature: (f, capa) => {
        const iso = f.properties.shapeISO;
        if (opciones.etiquetas !== false) capa.bindTooltip('', { permanent: true, direction: 'center', className: 'agm-etiqueta' });
        capa.on('click', () => set({ depto: iso }));
        capa.on('mouseover', () => { if (iso !== estado.depto) capa.setStyle({ weight: 2.5, color: '#334155' }); });
        capa.on('mouseout', () => capa.setStyle(estilo(iso)));
      }
    }).addTo(mapa);
    pintar();
  }).catch(error => {
    if (destruido) return;
    aviso.hidden = false;
    aviso.textContent = 'No se pudo cargar el mapa. Revisá la conexión.';
    console.error('AgroMapa:', error);
  });

  const api = {
    /** Cambia la selección: set({ depto, cultivo, escenario, capa }). Ignora valores desconocidos. */
    set,
    /** Copia de la selección actual. */
    estado: () => ({ ...estado }),
    /** Datos y puntaje de un departamento (por defecto, el seleccionado). */
    detalle: (iso = estado.depto) => detalle(iso, estado),
    /** Departamentos ordenados de mejor a peor para el cultivo actual. */
    ranking: () => ranking(estado.cultivo, estado.escenario),
    /** Rotaciones del cultivo actual en el departamento seleccionado (la actual primero). */
    rotaciones: () => rotaciones(estado.depto, estado.cultivo, estado.escenario),
    /** Suscribe fn(estado, detalle) a los cambios; devuelve una función para desuscribirse. */
    alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    /** Vuelve a encuadrar Honduras. */
    encuadrar() { tocado = false; mapa.invalidateSize(); mapa.fitBounds(LIMITES_HN); return api; },
    /** Mapa Leaflet interno, por si hace falta agregarle algo. */
    leaflet: mapa,
    /** Quita el mapa y libera todo (llamar al desmontar el componente). */
    destruir() {
      destruido = true;
      observador.disconnect();
      oyentes.clear();
      mapa.remove();
      el.innerHTML = '';
      el.classList.remove('agm-mapa');
      if (leyendaExterna) { cajaLeyenda.innerHTML = ''; cajaLeyenda.classList.remove('agm-leyenda', 'agm-leyenda--fila'); }
    }
  };

  pintar();
  return api;
}
