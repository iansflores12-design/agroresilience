/* ============================================================
   DATOS DEL MAPA — VALORES DE EJEMPLO (no reales).
   Este es el único archivo que hay que cambiar cuando existan los
   datos procesados: mantener las mismas claves y unidades.

   DEPTOS: clave = código ISO 3166-2 del departamento (coincide con
   la propiedad shapeISO del GeoJSON de límites).
     lluvia   mm por año          temp     °C media
     alt      msnm media          hum      % humedad de suelo
     ndvi     0 a 1               canicula días secos seguidos
     ph       pH del suelo        seco     pertenece al Corredor Seco
   ============================================================ */
export const DEPTOS = {
  'HN-AT': { nombre: 'Atlántida',         lluvia: 2800, temp: 26.5, alt: 150,  hum: 38, ndvi: 0.78, canicula: 5,  ph: 5.6, seco: false },
  'HN-CH': { nombre: 'Choluteca',         lluvia: 1650, temp: 28.5, alt: 120,  hum: 19, ndvi: 0.46, canicula: 32, ph: 6.4, seco: true  },
  'HN-CL': { nombre: 'Colón',             lluvia: 2500, temp: 26.5, alt: 180,  hum: 36, ndvi: 0.76, canicula: 6,  ph: 5.7, seco: false },
  'HN-CM': { nombre: 'Comayagua',         lluvia: 1200, temp: 23.5, alt: 750,  hum: 24, ndvi: 0.58, canicula: 22, ph: 6.3, seco: true  },
  'HN-CP': { nombre: 'Copán',             lluvia: 1600, temp: 21.5, alt: 950,  hum: 30, ndvi: 0.70, canicula: 12, ph: 5.8, seco: false },
  'HN-CR': { nombre: 'Cortés',            lluvia: 1900, temp: 26.0, alt: 250,  hum: 33, ndvi: 0.68, canicula: 9,  ph: 6.2, seco: false },
  'HN-EP': { nombre: 'El Paraíso',        lluvia: 1150, temp: 22.5, alt: 850,  hum: 23, ndvi: 0.57, canicula: 26, ph: 6.2, seco: true  },
  'HN-FM': { nombre: 'Francisco Morazán', lluvia: 1050, temp: 22.0, alt: 1050, hum: 22, ndvi: 0.54, canicula: 27, ph: 6.1, seco: true  },
  'HN-GD': { nombre: 'Gracias a Dios',    lluvia: 3000, temp: 27.0, alt: 60,   hum: 41, ndvi: 0.80, canicula: 4,  ph: 5.2, seco: false },
  'HN-IN': { nombre: 'Intibucá',          lluvia: 1500, temp: 18.5, alt: 1600, hum: 29, ndvi: 0.66, canicula: 16, ph: 5.6, seco: true  },
  'HN-IB': { nombre: 'Islas de la Bahía', lluvia: 2400, temp: 27.5, alt: 30,   hum: 34, ndvi: 0.70, canicula: 5,  ph: 6.5, seco: false },
  'HN-LP': { nombre: 'La Paz',            lluvia: 1250, temp: 21.0, alt: 1200, hum: 23, ndvi: 0.56, canicula: 28, ph: 6.0, seco: true  },
  'HN-LE': { nombre: 'Lempira',           lluvia: 1550, temp: 20.5, alt: 1300, hum: 28, ndvi: 0.65, canicula: 17, ph: 5.7, seco: true  },
  'HN-OC': { nombre: 'Ocotepeque',        lluvia: 1450, temp: 20.0, alt: 1350, hum: 27, ndvi: 0.64, canicula: 15, ph: 5.9, seco: false },
  'HN-OL': { nombre: 'Olancho',           lluvia: 1400, temp: 24.0, alt: 600,  hum: 29, ndvi: 0.67, canicula: 14, ph: 6.3, seco: false },
  'HN-SB': { nombre: 'Santa Bárbara',     lluvia: 1800, temp: 23.5, alt: 650,  hum: 32, ndvi: 0.72, canicula: 10, ph: 6.0, seco: false },
  'HN-VA': { nombre: 'Valle',             lluvia: 1500, temp: 29.0, alt: 80,   hum: 18, ndvi: 0.43, canicula: 35, ph: 6.5, seco: true  },
  'HN-YO': { nombre: 'Yoro',              lluvia: 1300, temp: 24.5, alt: 550,  hum: 26, ndvi: 0.61, canicula: 18, ph: 6.2, seco: false }
};

/* Rangos por cultivo: [mínimo, óptimo desde, óptimo hasta, máximo].
   sens = sensibilidad a la canícula (0 aguanta, 1 no aguanta). */
export const CULTIVOS = {
  maiz:   { nombre: 'Maíz',           lluvia: [500, 800, 1600, 2500],   temp: [14, 20, 28, 34], alt: [0, 0, 1500, 2400],      ph: [5.0, 5.8, 7.0, 7.8], sens: 0.80 },
  frijol: { nombre: 'Frijol rojo',    lluvia: [400, 700, 1500, 2200],   temp: [12, 17, 25, 30], alt: [200, 500, 1700, 2300],  ph: [5.2, 6.0, 7.0, 7.5], sens: 0.60 },
  sorgo:  { nombre: 'Sorgo/Maicillo', lluvia: [350, 500, 1200, 2000],   temp: [18, 25, 32, 38], alt: [0, 0, 900, 1600],       ph: [5.2, 5.8, 7.5, 8.3], sens: 0.25 },
  cafe:   { nombre: 'Café',           lluvia: [1100, 1500, 2200, 3200], temp: [14, 18, 23, 26], alt: [600, 1000, 1700, 2100], ph: [4.5, 5.0, 6.0, 6.6], sens: 0.70 },
  arroz:  { nombre: 'Arroz',          lluvia: [1200, 1800, 3000, 4000], temp: [20, 24, 30, 35], alt: [0, 0, 500, 1000],       ph: [4.8, 5.5, 6.8, 7.5], sens: 0.90 }
};

/* Datos de cada cultivo para armar rotaciones primera → postrera (de ejemplo).
     familia     graminea | leguminosa (alternar familias cuida el suelo)
     perenne     true = no se rota (no aparece en rotaciones)
     mercado     0-100, qué tan seguro es venderlo a buen precio
     confianza   alta | media | baja, según qué tan buenos son los datos de mercado
     ciclo       días de siembra a cosecha
     sufijo      texto extra en el nombre de la rotación cuando va de postrera */
export const ROTACION = {
  maiz: {
    familia: 'graminea', mercado: 70, confianza: 'media', ciclo: 120,
    ventajas: ['Semilla y manejo ya conocidos', 'Grano básico para la casa'],
    riesgos: ['Pide mucha agua justo en la canícula', 'Repetir gramínea gasta el nitrógeno y sube las plagas'],
    falta: ['Fecha real de siembra de la primera según las lluvias locales']
  },
  frijol: {
    familia: 'leguminosa', mercado: 74, confianza: 'alta', ciclo: 75,
    ventajas: ['Ciclo corto: escapa a parte de la canícula', 'Fija nitrógeno para el siguiente ciclo', 'Diversifica el grano de la familia'],
    riesgos: ['Una canícula de más de 20 días le quita la ventaja', 'Si la semilla certificada llega tarde, se atrasa la siembra'],
    falta: ['Precio local del frijol esta temporada']
  },
  sorgo: {
    familia: 'graminea', mercado: 55, confianza: 'baja', ciclo: 110, sufijo: ' + cobertura', bonoSuelo: 8,
    ventajas: ['Es el que mejor aguanta la sequía', 'Sirve como forraje de respaldo', 'Con cobertura protege el suelo'],
    riesgos: ['Faltan compradores locales consolidados', 'Vale menos como alimento directo'],
    falta: ['Precio y compradores locales de sorgo']
  },
  arroz: {
    familia: 'graminea', mercado: 65, confianza: 'media', ciclo: 130,
    ventajas: ['Buen precio donde el agua está asegurada'],
    riesgos: ['Necesita mucha agua y es muy sensible a la canícula', 'Poco viable sin riego en zonas secas'],
    falta: ['Disponibilidad de riego en la parcela']
  },
  cafe: { perenne: true }
};

/* Factores del puntaje de una rotación. Los pesos suman 1. */
export const FACTORES_ROTACION = [
  { clave: 'agua',     nombre: 'Agua',     peso: 0.30 },
  { clave: 'suelo',    nombre: 'Suelo',    peso: 0.25 },
  { clave: 'clima',    nombre: 'Clima',    peso: 0.25 },
  { clave: 'economia', nombre: 'Economía', peso: 0.20 }
];

/* Multiplicadores que cada escenario aplica a las condiciones base. */
export const ESCENARIOS = {
  normal: { nombre: 'Normal', lluvia: 1.00, hum: 1.00, canicula: 1.0 },
  seco:   { nombre: 'Seco',   lluvia: 0.72, hum: 0.80, canicula: 1.4 },
  humedo: { nombre: 'Húmedo', lluvia: 1.25, hum: 1.15, canicula: 0.6 }
};

/* Factores del puntaje. Los pesos suman 1. */
export const FACTORES = [
  { clave: 'agua',    nombre: 'Agua (lluvia)',         peso: 0.20, limite: 'la lluvia disponible queda fuera del rango que pide el cultivo' },
  { clave: 'clima',   nombre: 'Temperatura',           peso: 0.20, limite: 'la temperatura media se aleja del rango óptimo del cultivo' },
  { clave: 'altitud', nombre: 'Altitud',               peso: 0.10, limite: 'la altitud de la zona no es la ideal para este cultivo' },
  { clave: 'suelo',   nombre: 'Suelo (pH y humedad)',  peso: 0.15, limite: 'el suelo retiene poca humedad o su pH no favorece al cultivo' },
  { clave: 'sequia',  nombre: 'Aguante a la canícula', peso: 0.35, limite: 'la canícula es larga y este cultivo la resiste mal' }
];

/* Capas del mapa: cortes de clase, un color por clase y formato de la etiqueta. */
export const CAPAS = {
  aptitud: { nombre: 'Aptitud',      titulo: 'Puntaje de aptitud',    cortes: [40, 55, 70, 82],
             colores: ['#9e2a2b', '#e07a3f', '#e9c46a', '#74c69d', '#2d6a4f'],
             etiquetas: ['Muy baja', 'Baja', 'Media', 'Buena', 'Muy buena'], fmt: v => String(Math.round(v)) },
  lluvia:  { nombre: 'Lluvia',       titulo: 'Lluvia anual (mm)',     cortes: [900, 1300, 1700, 2200],
             colores: ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d'], fmt: v => String(Math.round(v / 10) * 10) },
  humedad: { nombre: 'Humedad SMAP', titulo: 'Humedad de suelo (%)',  cortes: [18, 23, 28, 34],
             colores: ['#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e'], fmt: v => String(Math.round(v)) },
  ndvi:    { nombre: 'NDVI',         titulo: 'Vigor vegetal (NDVI)',  cortes: [0.5, 0.58, 0.66, 0.74],
             colores: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'], fmt: v => v.toFixed(2) },
  sequia:  { nombre: 'Canícula',     titulo: 'Canícula (días secos)', cortes: [8, 15, 22, 30],
             colores: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'], fmt: v => String(Math.round(v)) }
};

/* Límites departamentales (geoBoundaries / OpenStreetMap, licencia ODbL).
   Para no depender de internet, guardar una copia local y pasar su ruta
   en la opción geojsonUrl de crearMapaAgro. */
export const URL_LIMITES = 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/HND/ADM1/geoBoundaries-HND-ADM1_simplified.geojson';
