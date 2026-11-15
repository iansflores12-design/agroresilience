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

## App nativa de Android (rama `mobile`)

La misma interfaz, móvil primero, empaquetada con [Capacitor](https://capacitorjs.com) en
`android/` (id `hn.agroresilience.app`). Requiere Node 22 o superior y Android Studio con su SDK.

```sh
npm run build:android   # compila en modo "android" y copia dist/ al proyecto nativo
npm run android         # lo anterior y abre el proyecto en Android Studio (Run ▶ para el teléfono)
npm run apk             # APK de depuración en android/app/build/outputs/apk/debug/
```

- **Backend:** la app corre desde `https://localhost`, así que `VITE_API_URL` va en
  `.env.android` con URL absoluta (`https://<dominio>/api`). `vercel.json` y `api/_comun.ts`
  (`OPTIONS`) permiten ese origen. Vacía, la app funciona sin red: la decisión se calcula en el
  teléfono y el chat queda en modo demostración.
- **Ubicación:** el manifiesto pide `ACCESS_FINE_LOCATION`; Android pregunta la primera vez que
  se toca "Usar mi ubicación".
- Tras cambiar la web, `npm run build:android` otra vez; `android/app/src/main/assets/public` se
  regenera y no se versiona.

## Gemini Decision y backend

`api/` tiene las funciones del backend (`decision`, `analisis`, `chat`). En local, `npm run dev`
las sirve dentro de Vite; en Vercel corren como funciones. Para el análisis a fondo, crear
`frontend/.env.local` con `GEMINI_API_KEY=...` (nunca se manda al navegador). Sin clave, el
ranking funciona igual y el análisis muestra el resumen rápido con botón de reintento.

`public/kharis/` es copia de `kharis_engine/salidas/web/`. Tras correr el motor, copiar de nuevo.
Detalle del flujo en DISENO.md, sección 8, "Plan y Gemini Decision".

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
