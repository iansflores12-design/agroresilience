# AgroResilience, frontend

Interfaz web de AgroResilience (NASA Space Apps 2026, equipo Honduras). Vite, React 19,
TypeScript, react-router-dom y Material 3 Expressive. Las reglas de diseño y los contratos
entre módulos están en [DISENO.md](./DISENO.md).

## Instalar y correr

```sh
npm install
npm run dev        # servidor de desarrollo
npm run build      # tsc -b && vite build
npm test           # vitest (jsdom)
npm run typecheck  # tsc -b --noEmit
npm run lint       # oxlint
npm run tema       # regenera src/tema/colores.css desde scripts/generar_tema.mjs
```

Si `npm` falla por certificados, antepón `NODE_EXTRA_CA_CERTS=<ruta al cert.pem>`; no
desactives la verificación TLS.

## Estructura

```
scripts/            generar_tema.mjs (colores M3), generar_datos_zonas.py (datos reales)
src/
  tema/             colores.css (generado), tokens.css, base.css, sileo.css
  componentes/      componentes base (Boton, Chip, Fab, Tarjeta...), Estructura y navegación
    mapa/           ContenedorMapa y MapaHonduras (Leaflet, por departamento), leyenda y puntajes
    fenomeno/       EspacioFenomeno.tsx: espacio reservado del fenómeno (lo construye otro agente)
  estado/           EstadoApp (cultivo, zona, edad, sonido) y Conversacion (chat)
  lib/              avisos.ts (Sileo), sonido.ts (WebAudio), chat/ (cliente del asistente)
  datos/            cultivos, rotaciones, zonas (+ zonas.generado.json), aptitud (+ departamentos.geo.json)
  pantallas/        Cultivos, Mapa, Zona, Chat (una carpeta por ruta)
  pruebas/          configuración de Vitest y ayudantes
```

## Espacios reservados

- **Fenómeno:** `src/componentes/fenomeno/EspacioFenomeno.tsx`, con
  `data-placeholder="fenomeno"` y el contrato `PropsFenomeno`.

El mapa ya está integrado (`src/componentes/mapa/`); queda reservado el espacio del fenómeno.

## Datos

Los puntajes de `aptitud.ts` (qué tan bien se da un cultivo en cada departamento y qué sembrar
después) son ilustrativos y están pendientes de validación. `departamentos.geo.json` son los
límites reales de geoBoundaries y OpenStreetMap (ODbL), simplificados.

El contenido de `cultivos.ts` y `rotaciones.ts` es ilustrativo y está pendiente de validación
agronómica. `zonas.generado.json` lo produce `scripts/generar_datos_zonas.py` a partir de
`data/processed/`; no se edita a mano.
