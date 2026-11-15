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

## Idiomas (i18n)

La aplicación está en español, portugués e inglés con [i18next](https://www.i18next.com/) y
`react-i18next`. El idioma se elige en la barra superior y se recuerda en `localStorage`
(`agroresilience.idioma`). Al entrar se usa, en este orden: `?lang=pt` en la URL, lo guardado y el
idioma del navegador; si no es ninguno de los tres, español.

- `src/i18n/recursos/es.ts`, `pt.ts`, `en.ts`: los textos. `es.ts` es la base; `pt` y `en` se tipan
  con su forma (`Recursos`), así que **si falta una clave, `npm run typecheck` falla**. La prueba
  `src/i18n/i18n.test.tsx` comprueba además que las variables `{{x}}` coincidan.
- `src/i18n/index.ts`: instancia del navegador (React + detección). En componentes:
  `const { t } = useTranslation()`; `useIdioma()` da el idioma actual.
- `src/i18n/traductor.ts`: `traductor(idioma)` sin React ni DOM. Lo usan el motor de decisión, los
  textos de Gemini y las funciones de `api/`.
- `src/i18n/dominio.ts`: nombres de cultivos, etapas y partes del puntaje. Los datos de `src/datos/`
  siguen en español y se traducen al mostrarlos, por su id.

La entrada de Gemini Decision lleva un campo opcional `idioma`: el motor escribe razones, riesgos y
evidencia en ese idioma (los puntajes no cambian) y Gemini recibe sus instrucciones en él. Los nombres
de lugares y departamentos no se traducen.

Para agregar un idioma: copiar `es.ts`, traducirlo, registrarlo en `IDIOMAS` y `LOCALE`
(`src/i18n/idiomas.ts`), en `recursos` (`src/i18n/traductor.ts`) y en `app.idiomas` de cada recurso.
