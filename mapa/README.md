# AgroMapa — mapa de aptitud por departamento

Componente listo para integrar. No usa ningún framework ni Tailwind: son módulos ES + un CSS con prefijo `agm-`, así que funciona igual en HTML plano, React, Vue, etc.

> Los datos de `agro-datos.js` son **de ejemplo**. Los límites departamentales sí son reales.

## Archivos

| Archivo | Qué es |
|---|---|
| `agro-mapa.js` | El mapa (`crearMapaAgro`). Lo único obligatorio junto con el CSS. |
| `agro-rotaciones.js` | Cards de rotaciones para poner debajo del mapa (`crearRotacionesAgro`). Opcional. |
| `agro-panel.js` | Panel de detalle de la pantalla "Mapa" (`crearPanelAgro`). Opcional. |
| `agro-modelo.js` | Cálculo del puntaje, sin DOM. Sirve para usar los números en otras partes del sitio. |
| `agro-datos.js` | Departamentos, cultivos, escenarios y capas. Único archivo a cambiar cuando haya datos reales. |
| `agro-mapa.css` | Estilos. |
| `demo.html` | Ejemplo de las dos integraciones. |

## Requisitos

Leaflet 1.9 (CSS y JS) cargado antes, y que el contenedor del mapa tenga altura.

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<link rel="stylesheet" href="mapa/agro-mapa.css"/>
```

Con npm: `import L from 'leaflet'` y pasarlo como `opciones.L`.

## Pantalla de inicio (solo el mapa)

```html
<div id="mapa" style="height: 280px"></div>
<div id="leyenda"></div>

<script type="module">
  import { crearMapaAgro } from './mapa/agro-mapa.js';

  const mapa = crearMapaAgro('#mapa', {
    depto: 'HN-CH', cultivo: 'maiz', escenario: 'seco',
    leyenda: document.getElementById('leyenda'),   // o true (flotante) / false
    onCambio: (estado, detalle) => {
      // el usuario tocó un departamento o cambió algo: actualizar el resto de la pantalla
      console.log(detalle.nombre, detalle.total);
    }
  });

  // desde los controles propios de la pantalla:
  mapa.set({ cultivo: 'frijol' });
</script>
```

## Pantalla de mapa (mapa + panel)

```js
import { crearMapaAgro } from './mapa/agro-mapa.js';
import { crearPanelAgro } from './mapa/agro-panel.js';
import { crearRotacionesAgro } from './mapa/agro-rotaciones.js';

const mapa = crearMapaAgro('#mapa-detalle', { selectorCapas: true });
const rotaciones = crearRotacionesAgro('#rotaciones', mapa);   // debajo del mapa
const panel = crearPanelAgro('#panel-detalle', mapa);
```

### Rotaciones

`crearRotacionesAgro(contenedor, mapa, opciones)` dibuja una card por rotación (la actual, que es repetir el cultivo, y las alternativas ordenadas por puntaje) para el departamento, cultivo y escenario del mapa. Al tocar una card se abre su detalle debajo: puntaje por factor, calendario primera/postrera, puntos a favor, riesgos y qué falta saber. Tocarla de nuevo lo cierra.

- Opciones: `seleccion` (id del cultivo de postrera abierto al inicio) y `onSeleccion(rotacion | null)`.
- Devuelve `seleccionar(id | null)` y `destruir()`.
- Con un cultivo perenne (café) muestra un aviso en vez de cards.
- Los mismos datos, sin interfaz: `mapa.rotaciones()`.

## Opciones de `crearMapaAgro(contenedor, opciones)`

| Opción | Por defecto | |
|---|---|---|
| `depto` | `'HN-CH'` | Código ISO: `HN-AT`, `HN-CH`, `HN-CL`, `HN-CM`, `HN-CP`, `HN-CR`, `HN-EP`, `HN-FM`, `HN-GD`, `HN-IN`, `HN-IB`, `HN-LP`, `HN-LE`, `HN-OC`, `HN-OL`, `HN-SB`, `HN-VA`, `HN-YO` |
| `cultivo` | `'maiz'` | `maiz`, `frijol`, `sorgo`, `cafe`, `arroz` |
| `escenario` | `'seco'` | `normal`, `seco`, `humedo` |
| `capa` | `'aptitud'` | `aptitud`, `lluvia`, `humedad`, `ndvi`, `sequia` |
| `selectorCapas` | `false` | Botones de capa sobre el mapa |
| `leyenda` | `true` | `true` flotante, `false` sin leyenda, o un elemento donde dibujarla |
| `etiquetas` | `true` | Valor escrito sobre cada departamento |
| `geojsonUrl` | copia en línea | Ruta a una copia local de los límites |
| `L` | `window.L` | Instancia de Leaflet |
| `onCambio` | — | `(estado, detalle) => {}` |

## Lo que devuelve

| Método | |
|---|---|
| `set({ depto, cultivo, escenario, capa })` | Cambia la selección. Ignora valores desconocidos. |
| `estado()` | Selección actual. |
| `detalle(iso?)` | `{ nombre, total, etiqueta, color, puesto, totalDeptos, corredorSeco, condiciones, factores, limitante, porCultivo }` |
| `rotaciones()` | Rotaciones del cultivo actual en el departamento seleccionado, la actual primero. |
| `ranking()` | `[{ iso, nombre, total }]` de mejor a peor para el cultivo actual. |
| `alCambiar(fn)` | Suscribe a los cambios; devuelve la función para desuscribirse. |
| `encuadrar()` | Vuelve a centrar Honduras. |
| `leaflet` | El mapa Leaflet interno. |
| `destruir()` | Llamar al desmontar (por ejemplo en el cleanup de `useEffect`). |

El mapa se reajusta solo si el contenedor cambia de tamaño o pasa de oculto a visible.

## Sin conexión

Los límites se bajan de internet (300 KB). Para servirlos localmente, guardar el archivo de `URL_LIMITES` (en `agro-datos.js`) dentro del proyecto y pasar su ruta en `geojsonUrl`. El fondo gris del mapa (Esri) siempre necesita conexión; sin él los departamentos se ven igual.

## Ver la demo

Los módulos ES no cargan con doble clic (`file://`); hace falta un servidor:

```bash
python -m http.server 5173 --directory mapa
```

y abrir `http://localhost:5173/demo.html`.
