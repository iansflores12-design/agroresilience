# Diseño del frontend de AgroResilience

Fuente única de decisiones de diseño y de contratos entre módulos. Si el código y este
documento no coinciden, se corrige uno de los dos en el mismo cambio.

Revisión 2 (2026-11-14). Sustituye a la primera versión en las secciones 0, 1, 2, 3, 6 y 8.

Sistema: Material 3 Expressive (https://m3.material.io/) con su sistema de contraste, más
los principios de diseño de Apple (`apple-design`: propósito, simplicidad, familiaridad,
flexibilidad, retroalimentación y movimiento físico). Sin efecto vidrio: nada de
`backdrop-filter`, desenfoques ni superficies translúcidas (de la skill de Apple se excluye
a propósito la sección de materiales translúcidos). Las superficies son opacas y la
jerarquía se da por tono de superficie, forma, tamaño y sombra.

## 0. Para quién es

Agricultores, productores y técnicos de campo de Honduras. Muchos leen poco o con
esfuerzo, usan un teléfono Android de gama media, a veces bajo el sol, con las manos
sucias o mojadas y con conexión lenta. Todo lo demás se decide desde aquí:

- **Leer lo menos posible.** Cada pantalla responde una sola pregunta, escrita arriba con
  palabras de todos los días: "¿Qué sembró?", "¿Dónde está su parcela?", "¿Cómo está la
  tierra?", "Pregunte lo que quiera". El dato importante se entiende sin leer el párrafo:
  número grande, una palabra de estado y un medidor con icono y color.
- **Nada de jerga en la vista principal.** No se muestran "m3/m3", "percentil",
  "anomalía", "SPL3SMP_E" ni coordenadas en el primer nivel. Las fuentes y los detalles
  técnicos viven un nivel más abajo, en un desplegable "Ver de dónde sale este dato", para
  el agrónomo que los quiere.
- **Texto que se lee bajo el sol.** Texto de cuerpo de 16 px como mínimo y nada por
  debajo de 14 px. Esquema de color con contraste medio de M3 (ver sección 2).
- **Dedos, no punteros.** Zona táctil mínima de 48 px y 56 px en las acciones principales.
- **Icono más palabra.** Toda acción y todo destino lleva icono y texto visible. Ningún
  botón importante es solo un icono.
- **Fechas humanas.** "Hace 2 días (12 de noviembre)" en lugar de `2026-11-12`.
- **Sin cortar palabras.** Ningún nombre de cultivo o zona se trunca con puntos
  suspensivos: se reorganiza el diseño para que quepa.

## 1. Reglas de composición

1. **Lo común primero.** Cada pantalla muestra primero la acción o el dato que la mayoría
   busca; lo avanzado va más abajo o en un desplegable.
2. **Tres planos, sin adorno.** Fondo (papel), sujeto (el dato o el contenido) y controles
   flotantes. La primera versión ponía una palabra gigante decorativa de fondo; se quita
   porque no informa nada y compite con el dato para quien lee con esfuerzo. Lo enorme de
   cada pantalla es ahora el dato mismo (el número de humedad, las semanas del cultivo).
3. **Un solo color de señal.** La familia `primary` significa únicamente "esto se puede
   tocar": botones, chips, indicador de navegación, aguja del selector, enlaces. Todo lo
   demás es tinta sobre papel. Los datos usan `agua` y `tierra`; los estados usan el
   medidor de la sección 2. Algo que no se toca jamás lleva el color de señal.
4. **Una cosa enorme por pantalla, sin tamaños intermedios de relleno.** La escala
   tipográfica de la sección 2 es corta a propósito.
5. **Cada elemento se gana su lugar.** Si no ayuda a decidir qué hacer en la parcela o a
   moverse por la app, se quita. Lo que se quitó en esta revisión y por qué está en la
   sección 8.

## 2. Tokens

Todos viven en `src/tema/`. Los componentes solo usan tokens; ningún color, radio, sombra
o duración se escribe a mano fuera de `src/tema/`.

### Color (`colores.css`, generado por `scripts/generar_tema.mjs`)

- Semilla `#1E7B3C` con `SchemeFidelity` de `@material/material-color-utilities`.
- **Contraste medio (nivel 0.5) por defecto**, porque la app se usa a pleno sol en
  pantallas de gama media. Con `prefers-contrast: more`, contraste alto (nivel 1.0).
  Esquemas claro y oscuro de cada nivel.
- Se emiten todos los roles M3 como `--md-sys-color-<rol>`, y los colores propios `agua`
  (`#1976D2`) y `tierra` (`#B5532A`) armonizados como `--agro-color-*`.
- **Medidor de estado** (para humedad y lluvia frente a lo normal), siempre con icono y
  palabra además del color, para que lo entienda también quien no distingue colores:
  `seco` usa la familia `tierra` con icono `wb_sunny` y la palabra "Seca";
  `normal` usa `surface-container-highest` con tinta e icono `check_circle` y la palabra
  "Normal"; `humedo` usa la familia `agua` con icono `water_drop` y la palabra "Húmeda".
- El archivo generado se versiona. `npm run tema` lo regenera.

### Tipografía (`tokens.css`)

Google Sans Flex variable (`@fontsource-variable/google-sans-flex`, licencia OFL) en
**toda** la interfaz: texto, botones, avisos de Sileo, etiquetas dentro de SVG y gráficas.
Nunca otra familia. Ejes usados: peso, ancho, tamaño óptico (`font-optical-sizing: auto`)
y redondez (`ROND`) si la variante la trae.

| Token | Tamaño / interlineado | Peso | Uso |
| --- | --- | --- | --- |
| `--tipo-heroe` | `clamp(4rem, 16vw, 8rem)` / 0.9 | 700, ancho 100 | El dato principal de la pantalla |
| `--tipo-pregunta` | 28 / 36 | 600 | La pregunta que encabeza cada pantalla |
| `--tipo-titulo` | 20 / 28 | 600 | Títulos de sección y de tarjeta |
| `--tipo-cuerpo` | 16 / 24 | 400 | Texto |
| `--tipo-cuerpo-fuerte` | 16 / 24 | 600 | Palabra de estado, nombres |
| `--tipo-etiqueta` | 16 / 24 | 600 | Botones, chips grandes, navegación activa |
| `--tipo-nota` | 14 / 20 | 500 | Fechas, fuentes, ayudas. Mínimo absoluto |

- Prohibido cualquier texto por debajo de 14 px. Se borran `--tipo-micro` y `--tipo-fondo`.
- Interletraje según tamaño (regla de Apple): el héroe con `-0.02em`, la pregunta con
  `-0.01em`, el texto de 14 a 20 px con `0` y nunca negativo en tamaños pequeños.
- Tamaños en `rem`, para respetar el tamaño de letra que el usuario eligió en su teléfono.
- Números con `font-variant-numeric: tabular-nums`.

### Forma

`--forma-xs: 4px`, `-sm: 8px`, `-md: 12px`, `-lg: 16px`, `-lg-mas: 20px`, `-xl: 28px`,
`-xl-mas: 32px`, `-xxl: 48px`, `-completa: 9999px`. Cambio de forma M3 Expressive en los
controles: reposo redondo, presionado `md`, seleccionado `lg`. Tarjetas `xl`.

### Movimiento (M3 Expressive y Apple)

- Por defecto, resorte sin rebote (amortiguamiento 1.0): `--curva-estandar` con
  `--mov-rapido` 200 ms, `--mov-medio` 300 ms y `--mov-lento` 450 ms.
- Rebote leve (amortiguamiento 0.8) solo donde hay un gesto con impulso: el selector
  deslizable y el cambio de forma al presionar. `--curva-resorte`.
- Efectos de color y opacidad: `--mov-efecto` 150 ms, sin rebote.
- Solo se animan `transform`, `opacity`, `border-radius` y `clip-path`. Toda animación
  se puede interrumpir.
- Con `prefers-reduced-motion: reduce`, solo fundidos cortos.
- Sonido, vibración y cambio visual ocurren en el mismo cuadro y solo en momentos con
  causa clara (marca del selector, asentar, confirmar).

### Elevación, estados, espaciado

- Sombras `--elevacion-1` a `--elevacion-3` de M3, solo en lo que flota.
- Capa de estado M3 (hover 8 %, foco y presionado 10 %). Foco visible: anillo de 3 px.
- Rejilla de 4 y 8: `--esp-1: 4px` a `--esp-16: 64px`. Zona táctil mínima 48 px;
  `--alto-accion: 56px` para acciones principales.
- Clases de ventana M3: compacta menor a 600 px, media de 600 a 839, expandida desde 840.
  Contenido con ancho máximo legible (`--ancho-lectura: 40rem`) en ventanas grandes.

## 3. Estructura y navegación

Cuatro rutas con `react-router-dom`. Las etiquetas nombran lo que hay dentro, con palabras
de todos los días:

| Ruta | Pantalla | Etiqueta | Icono (Material Symbols Rounded) | Pregunta de la pantalla |
| --- | --- | --- | --- | --- |
| `/` | `pantallas/Inicio` | Plan | `grass` | ¿Qué quiere lograr? (antes, el cuestionario) |
| `/rotacion/:id` | `pantallas/Rotacion` | (parte de Plan) | — | Nombre de la rotación |
| `/mapa` | `pantallas/Mapa` | Mapa | `map` | ¿Dónde está su parcela? |
| `/zona` | `pantallas/Zona` | Tierra | `water_drop` | ¿Cómo está la tierra en <zona>? |
| `/chat` | `pantallas/Chat` | Preguntar | `forum` | Pregunte lo que quiera |

- Una sola librería de iconos: Material Symbols Rounded (`@material-symbols/svg-400`),
  contorno en reposo y relleno en lo activo. Ningún otro set ni SVG hecho a mano, salvo
  las gráficas.
- `componentes/Estructura.tsx`: enlace "Saltar al contenido", barra superior,
  `<main id="contenido">` y navegación.
- Navegación: barra inferior en compacta y media (80 px más área segura, icono 24 px,
  etiqueta siempre visible en `--tipo-nota` con peso 600 en el activo), riel lateral en
  expandida. `aria-current="page"` en el activo.
- Barra superior: nombre de la app, botón de sonido con icono y la **tira de contexto**:
  dos chips que dicen en palabras completas lo elegido ("Maíz, semana 17" y
  "Comayagua"), o "Elegir cultivo" / "Elegir lugar". Tocar un chip lleva a donde se elige.
- **Sin FAB.** La primera versión tenía un botón flotante "Preguntar" que repetía el
  destino de la navegación y tapaba contenido. Se quita. En su lugar, la hoja de la tierra
  termina con un botón "Preguntar sobre esta tierra" que abre `/chat?desde=zona`.
- Al cambiar de ruta el foco pasa al `<main>` y la página vuelve arriba.

## 4. Estado compartido

`src/estado/EstadoApp.tsx` (contexto de React, persistido en `localStorage` con la clave
`agroresilience.estado.v1`; tolera almacenamiento ausente o JSON inválido):

```ts
interface EstadoApp {
  cultivoId: string | null
  zonaId: string | null
  edadSemanas: number      // semanas desde la siembra
  sonido: boolean          // por defecto true
}
function useEstadoApp(): EstadoApp & {
  elegirCultivo(id: string): void   // reinicia edadSemanas a 0 si cambia el cultivo
  elegirZona(id: string): void
  fijarEdad(semanas: number): void
  alternarSonido(): void
}
```

`src/estado/Conversacion.tsx` guarda los mensajes del chat a nivel de aplicación (memoria
más `sessionStorage`) para que la discusión siga al cambiar de vista:

```ts
interface MensajeChat { id: string; rol: 'usuario' | 'asistente'; texto: string; fecha: string }
function useConversacion(): {
  mensajes: MensajeChat[]
  agregar(m: Omit<MensajeChat, 'id' | 'fecha'>): MensajeChat
  reemplazar(mensajes: MensajeChat[]): void
  borrar(): void
}
```

## 5. Datos

- `src/datos/cultivos.ts` y `src/datos/rotaciones.ts`: contenido **ilustrativo** para la
  interfaz, pendiente de validar con el equipo agronómico (se dice en el archivo y, en
  letra pequeña, en la pantalla).

```ts
interface EtapaCultivo { id: string; nombre: string; desdeSemana: number; hastaSemana: number; sensibilidadAgua: 'baja' | 'media' | 'alta' }
interface Cultivo { id: string; nombre: string; nombreCientifico: string; familia: 'gramínea' | 'leguminosa' | 'hortaliza' | 'cobertura'; cicloSemanas: number; etapas: EtapaCultivo[] }
interface PasoRotacion { cultivoId: string; temporada: 'primera' | 'postrera' | 'verano'; mesInicio: number; mesFin: number }  // meses 1 a 12
interface Rotacion { id: string; nombre: string; resumen: string; beneficio: string; pasos: PasoRotacion[] }
export const cultivos: Cultivo[]; export function buscarCultivo(id: string | null): Cultivo | null
export function etapaEnSemana(cultivo: Cultivo, semana: number): EtapaCultivo
export const rotaciones: Rotacion[]
```

  Cultivos: maíz (17 semanas), frijol (12), sorgo o maicillo (16), arroz (18), tomate (16),
  frijol terciopelo como cobertura (20). Rotaciones: "Milpa de ladera" (maíz de primera,
  frijol de postrera, frijol terciopelo en verano), "Granos del corredor seco" (maíz de
  primera, sorgo de postrera), "Valle con riego" (arroz, frijol, tomate) y "Hortaliza y
  grano" (tomate en verano, maíz de primera, frijol de postrera). Temporadas de Honduras:
  primera de mayo a agosto, postrera de septiembre a diciembre, verano de enero a abril.

- `src/datos/aptitud.ts`: puntaje **ilustrativo** de qué tan bien se da cada cultivo en cada
  departamento y de qué sembrar de postrera. Pendiente de validar; no sale de
  `data/processed/`. Expone `departamentos`, `buscarDepartamento`, `departamentoDeZona`,
  `tieneAptitud`, `escenarios`, `factores`, `nivelDePuntaje`, `palabraNivel`, `ranking`,
  `aptitud` y `rotacionesPara`. `src/datos/departamentos.geo.json` son los límites **reales**
  de los 18 departamentos (geoBoundaries y OpenStreetMap, licencia ODbL), simplificados.

- `src/datos/zonas.generado.json`: datos **reales** resumidos de `data/processed/` por
  `scripts/generar_datos_zonas.py` (SMAP, IMERG, POWER, SoilGrids). Forma:

```ts
interface Zona {
  id: string; nombre: string; lat: number; lon: number
  humedad: { valor: number; fecha: string; unidad: 'm3/m3'; serie: [string, number][]; normal: number | null; anomalia: number | null; percentil: number | null; muestras: number } | null
  lluvia30d: { valor_mm: number; hasta: string; normal_mm: number | null } | null
  temperatura: { valor_c: number; hasta: string } | null
  suelo: { arena_pct: number; limo_pct: number; arcilla_pct: number; ph: number } | null
}
interface DatosZonas { generado: string; fuentes: Record<string, string>; caja: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }; zonas: Zona[] }
```

- `src/datos/zonas.ts` expone `zonas`, `cajaHonduras`, `fuentes`, `buscarZona(id)`,
  `humedadPorcentaje(zona)` (valor por 100, un decimal) y `estadoHumedad(zona)`, que
  compara con lo normal para esa zona y época usando el percentil: menor a 20 "Más seca de
  lo normal", de 20 a 80 "Dentro de lo normal", mayor a 80 "Más húmeda de lo normal", y
  "Sin referencia histórica" si el percentil es nulo.

## 6. Avisos (Sileo) y sonido

- `src/lib/avisos.ts` es la única puerta a Sileo:
  `avisar.exito | info | alerta | error ({ titulo, descripcion?, accion?: { texto, alPulsar } })`
  y `avisar.promesa(...)`. Un solo `<Toaster>` en `App.tsx`, arriba al centro, con
  `sileo/styles.css` importado, los colores `inverse-surface` / `inverse-on-surface` de
  M3 y Google Sans Flex.
- Regla de Apple: un aviso solo cuando confirma algo que no se ve en pantalla o cuando
  ofrece el siguiente paso. Si el cambio ya se ve, no hay aviso.
- Avisos que quedan: elegir cultivo (con "Ver mapa"), elegir lugar (con "Ver la tierra"),
  controles del mapa que dependen del mapa real, lectura de humedad de hace más de 7 días,
  copiar el resumen, error del asistente (con "Reintentar") y borrar la conversación (con
  "Deshacer").
- Avisos que se quitan: activar o silenciar sonido (el icono ya cambia), cambio de etapa
  al soltar el selector (la etapa ya se ve debajo del número), entrar a la hoja sin
  cultivo (se muestra en la página) y modo de demostración del chat (ya hay una insignia
  fija).
- `src/lib/sonido.ts` (WebAudio, sin archivos de audio; el contexto se crea con el primer
  gesto del usuario; sin efecto si el sonido está apagado o no hay WebAudio):
  `tic(mayor?: boolean)`, `asentar()`, `confirmar()` y `vibrar(ms)`.

## 7. Selector deslizable (`componentes/SelectorDeslizable`)

Regla horizontal que se desliza bajo una aguja fija al centro (color de señal).

```ts
interface PropsSelectorDeslizable {
  etiqueta: string; valor: number; min: number; max: number
  paso?: number            // 1
  marcaMayorCada?: number  // 4
  unidad: string           // "semanas"
  alCambiar(valor: number): void
  alSoltar?(valor: number): void
  textoValor?(valor: number): string   // para aria-valuetext
}
```

- Arrastre con puntero siguiendo el dedo 1 a 1 (captura de puntero), inercia al soltar y
  ajuste con resorte a la marca más cercana. Clic en una marca o número lleva a ese valor.
  Rueda o desplazamiento horizontal cambian el valor. Botones de menos y más.
- Teclado: `role="slider"` con `aria-valuemin/max/now/text`; flechas un paso, Re Pág y Av
  Pág un salto mayor, Inicio y Fin los extremos.
- Cada marca cruzada suena `tic()` (más grave en las marcas mayores) y vibra 3 ms; al
  asentarse suena `asentar()`. Respeta el interruptor de sonido.
- La regla se mueve solo con `transform`.

## 8. Pantallas

Cada pantalla empieza con su pregunta en `--tipo-pregunta`. Se quita `PlanoFondo` de las
cuatro pantallas (sección 1, regla 2).

### Plan (`/`) y Gemini Decision (revisión 3, 2026-11-15)

Sustituye a la pantalla Cultivo descrita abajo (se conserva como historia).

1. **Cuestionario, una pregunta por pantalla** (`Inicio/Cuestionario.tsx`), solo si faltan datos o
   al tocar "Cambiar datos": lugar ("Usar mi ubicación" arriba: escala de parcela, ver
   `lib/decision/escala.ts`; o uno de los 11 lugares con punto de Kharis), terreno (plano, elevado, bajo,
   ondulado), cultivo y temporada de siembra (primera, postrera, verano). Al tocar una respuesta
   pasa a la siguiente.
2. **"¿Qué quiere lograr?"**: siete objetivos que se marcan y desmarcan (ahorrar agua, mejorar la
   tierra, frenar la erosión, ganar más, comida para animales, abono natural, cortar plagas). Cada
   objetivo triplica el peso de su parte del puntaje.
2b. **"¿Qué sembró?" y "¿Hace cuánto sembró?"**: la rejilla de cultivos y el selector deslizable
   de semanas de la revisión 2 vuelven tal cual (`componentes/decision/SuCultivo.tsx`). Cambiar el
   cultivo vuelve a calcular el ranking. El cuestionario usa la misma rejilla.
3. **Rotaciones recomendadas**: tarjetas pequeñas con icono del cultivo que agrega, nombre,
   puntaje en porcentaje y rating (Alta 80+, Buena 65–79, Intermedia 50–64, Baja <50). Marca "La
   mejor" y "Lo que hace hoy" (repetir el cultivo, siempre incluida para comparar).
4. **Detalle** (`/rotacion/:id`), con patrones de M3: barra superior pequeña con "Volver"; tarjeta
   héroe con indicador circular del puntaje (en tinta), rating y diferencia frente a lo de hoy;
   "Por qué" como lista con icono por parte; "Su año de siembra" como línea de tiempo con barra de
   lluvia contra agua que pide (color `agua`); "Cómo se calculó" con indicadores lineales de M3
   Expressive e insignia "Su objetivo"; pestañas A favor / Cuidado / Falta saber; tarjeta
   expandible "De dónde salen los datos"; análisis de Gemini con chip de estado; chat de
   seguimiento con campo de texto relleno.

**Backend** (`api/`, funciones de Vercel; en local las sirve Vite):

- `POST /api/decision { entrada }` → `Decision`. Gemini Decision (`src/lib/decision/motor.ts`) es
  determinista: lee `public/kharis/<punto>.json` (lluvia, ET0, temperatura máxima, señales P2, P4,
  P7, P8) y puntúa cada rotación. Si el backend no responde, el navegador corre el mismo código.
- `POST /api/analisis { entrada, rotacionId }` → NDJSON en vivo (`paso`, `decision`, `texto`,
  `fin`, `error`). Gemini explica los números; no los cambia.
- `POST /api/chat { mensajes, contexto }` → `{ texto }`; con `contexto.consulta` recibe el ranking.
- Línea de tiempo (`src/lib/decision/estadoAnalisis.ts`, límite de 6 s): si el primer texto llega
  antes, se muestra en vivo; si no, resumen rápido, y al terminar aviso "Análisis a fondo listo";
  si falla, resumen rápido y "Reintentar". Cuota de 15 análisis al día por teléfono; un intento
  fallido no cuenta; los análisis hechos se guardan y no vuelven a gastar.
- Variables del servidor: `GEMINI_API_KEY`, `GEMINI_MODELO` (por defecto `gemini-3.8-flash`),
  `GEMINI_PENSAMIENTO` (opcional, por defecto `minimal`). Ver `.env.example`. El razonamiento
  del modelo cuenta contra el tope de tokens: si Gemini llega al tope, el servidor manda
  `error` con causa `cortado` y la pantalla ofrece reintentar en vez de mostrar texto a medias.

### Cultivo (`/`): "¿Qué sembró?" (revisión 2, reemplazada)
1. **Elegir cultivo, primero.** Rejilla de tarjetas grandes y tocables, una por cultivo
   (dos columnas en compacta, tres o más en expandida), con un icono de Material Symbols
   que lo represente lo mejor posible, el nombre común completo en `--tipo-etiqueta` y,
   en `--tipo-nota`, cuánto dura ("Unas 17 semanas"). La elegida queda marcada con
   `aria-pressed`, forma `lg`, borde de señal y un visto. Sustituye a la fila de chips
   "Todos los cultivos" de la versión 1.
2. **¿Hace cuánto sembró?** Solo con cultivo elegido: el número de semanas en
   `--tipo-heroe`, "semanas desde la siembra" debajo, la etapa en palabras ("Está
   floreciendo") y el selector deslizable. Sin cultivo, esta sección no se muestra.
3. **¿Dónde se da mejor el <cultivo>?** Solo con cultivo elegido: el mismo mapa por
   departamento de la pantalla Mapa, sin los puntos de lugares, con su leyenda, una frase
   ("Se da mejor en ..." o el puntaje del departamento tocado) y el botón "Ver el mapa
   completo".
4. **Qué sembrar después (rotaciones).** Una tarjeta por rotación con su nombre, su
   beneficio en una frase y sus pasos como lista vertical: icono de temporada, nombre
   completo del cultivo (botón que lo elige) y meses en palabras ("Mayo a agosto"). La
   regla de 12 iniciales de la versión 1 se quita: las iniciales sueltas no se leen y
   obligaban a cortar nombres. Nota: "Calendario de referencia. Consulte a su técnico".

### Mapa (`/mapa`): "¿Dónde está su parcela?"
- El mapa ocupa el alto disponible. `componentes/mapa/ContenedorMapa.tsx` le da tamaño, forma
  y recorte (contrato `PropsMapa`) y dentro va `MapaHonduras.tsx`: Honduras por departamento
  con Leaflet, **sin teselas de fondo** (solo los límites, que viajan con la app en
  `datos/departamentos.geo.json`), para que cargue igual con conexión lenta.
- Con cultivo elegido, cada departamento se pinta según qué tan bien se da ese cultivo. El
  puntaje (0 a 100) solo aparece, en una pastilla, sobre el departamento que se toca. Tres niveles, siempre con icono y
  palabra en la leyenda (`NivelAptitud`): `buena` usa `primary-container` con `check_circle`
  y "Buena"; `regular` usa `surface-container-highest` con `remove` y "Regular"; `dificil` usa
  la familia `tierra` con `warning` y "Difícil". Los departamentos se tocan, por eso pueden
  llevar el color de señal. Sin cultivo van en `surface-container-high` y sin puntaje.
- Los departamentos son botones (ratón, dedo y teclado, con `aria-pressed`). Cada lugar con
  datos reales es un punto tocable con zona táctil de 48 px; el elegido muestra su nombre.
- Controles flotantes: "Acercar", "Alejar" y "Mi ubicación" (elige el lugar más cercano; si
  no se puede saber la ubicación, avisa y remite a la lista). En teléfono, arrastrar solo
  mueve el mapa cuando está acercado; si no, desplaza la página.
- Lista de lugares debajo del mapa en compacta, al lado en expandida: botones grandes con
  el nombre completo del lugar y su estado en palabras con el medidor ("Seca", "Normal",
  "Húmeda"). Es la forma de elegir para quien no lee mapas.
- Tarjeta del lugar elegido con su estado y el botón "Ver cómo está la tierra" (`/zona`).
  Las coordenadas pasan al desplegable de detalles.
- **"¿Se da bien el <cultivo> en <departamento>?"** (solo con cultivo): chips "Año seco",
  "Año normal" y "Año lluvioso", el nivel en grande, "74 de 100. Puesto 16 de 18
  departamentos.", lo que más le cuesta en una frase y el desplegable "Ver el puntaje por
  partes". El departamento es el que se tocó o, si no, el del lugar elegido.
- **"Qué sembrar después en <departamento>"**: una tarjeta por opción de postrera (repetir el
  cultivo primero, luego las demás de mejor a peor) con nombre en palabras ("Maíz y después
  frijol"), nivel y puntaje. Tocar una abre su detalle debajo (`aria-expanded`): cuándo se
  siembra, puntaje por partes, a favor, cuidados y qué falta saber. Tocarla otra vez lo cierra.
- Los puntajes son **ilustrativos** (`datos/aptitud.ts`) y se dice en la pantalla.

### Tierra (`/zona`): "¿Cómo está la tierra en <zona>?"
- Selector de lugar arriba (chips con nombre completo; el elegido siempre visible).
- **Respuesta en una línea, primero:** el medidor grande con icono y palabra
  ("Más seca que lo normal para esta época") en `--tipo-titulo`.
- **El número:** humedad en `--tipo-heroe` con "% de agua en la tierra" y, en
  `--tipo-nota`, "Lo normal en estas fechas: 29.8 %" y "Medido hace 2 días (12 de
  noviembre)".
- **Gráfica de 4 meses:** línea en `agua`, franja de lo normal sombreada en lugar de una
  línea punteada, etiquetas "Hace 4 meses" y "Hoy". Sin ejes técnicos.
- **Tres fichas en palabras:** Lluvia ("265 mm en 30 días, más del doble de lo normal"),
  Temperatura ("21 °C en promedio esta semana"), Tipo de tierra ("Franco arcillosa, pH
  6.7, poco ácida"; la clase de textura se calcula con el triángulo de texturas USDA).
- Si hay cultivo: "Maíz, semana 17: madurando. Necesita poca agua en esta etapa."
  Sin cultivo: "Sin cultivo elegido" y el chip "Elegir cultivo".
- **Desplegable "Ver de dónde salen estos datos"** con fuentes, fechas exactas,
  coordenadas, percentil y los avisos técnicos (SoilGrids no verificado como agrícola,
  SMAP mide solo los primeros 5 cm).
- Acciones: "Preguntar sobre esta tierra" (`/chat?desde=zona`) y "Copiar resumen".
- Debajo, `componentes/fenomeno/EspacioFenomeno.tsx` (`data-placeholder="fenomeno"`,
  comentario `PLACEHOLDER(fenomeno)`, contrato `PropsFenomeno`), con el título
  "¿Por qué pasa esto?".
- Expandida: dos columnas (respuesta, número y gráfica a la izquierda; fichas y acciones
  a la derecha).

### Preguntar (`/chat`): "Pregunte lo que quiera"
- Tira "El asistente sabe que": cultivo y semana, lugar y estado de la tierra en palabras
  (no la fecha cruda).
- Vacío: de tres a cuatro preguntas sugeridas como botones anchos de una línea completa,
  sin cortar el texto (pueden ocupar dos líneas).
- Burbujas de 16 px; el asistente con su etiqueta. Redactor fijo con botón de enviar con
  icono y texto "Enviar" en ventanas medianas y grandes, solo icono con nombre accesible
  en compacta.
- Insignia fija "Modo de prueba: todavía sin conexión al asistente real" en el modo de
  demostración. El contrato con el backend no cambia.
- Ancho máximo de lectura en expandida.

## 9. Accesibilidad y calidad

- Contraste de texto 4.5:1 como mínimo y 7:1 en el texto de cuerpo cuando el esquema de
  contraste medio lo permite (lo garantizan los pares de roles M3; no se combinan roles
  fuera de sus pares).
- Texto nunca menor de 14 px; la app sigue usable con la letra del sistema al 200 %.
- Todo control tiene nombre accesible; los iconos decorativos llevan `aria-hidden`.
- Textos de interfaz en español. Sin emojis en código, comentarios ni interfaz.
- Cada módulo trae pruebas con Vitest y Testing Library. `npm run build`,
  `npm run typecheck` y `npm test` deben terminar en verde.

## 10. Componentes base disponibles

Todo lo siguiente existe y está probado. Las pantallas reales se construyen solo con esto y
con los tokens; no hace falta tocar `iconos.ts`, `tema/` ni `estado/`.

### Componentes (`src/componentes/`)

Los controles tocables comparten `PropsControl` (`Control.tsx`): `to?: string` (renderiza un
`Link` del router), `onClick`, `disabled`, `type`, `className`, `id`, `title`, `children` y
cualquier `aria-*`.

```ts
Icono({ nombre: NombreIcono; relleno?: boolean; tamano?: number /* 24 */; className?: string; titulo?: string })
  // Decorativo (aria-hidden) salvo que se dé `titulo`. `relleno` solo afecta a grass, map, water_drop, forum.
Boton({ variante?: 'relleno' | 'tonal' | 'contorno' | 'texto'; icono?: NombreIcono } & PropsControl)
BotonIcono({ icono: NombreIcono; etiqueta: string /* aria-label, obligatoria */;
  variante?: 'estandar' | 'relleno' | 'tonal' | 'contorno'; seleccionado?: boolean;
  rellenoAlSeleccionar?: boolean } & PropsControl)
  // Si se pasa `seleccionado` (aunque sea false) es un interruptor y lleva aria-pressed.
Chip({ variante?: 'asistente' | 'filtro'; seleccionado?: boolean; icono?: NombreIcono } & PropsControl)
  // El filtro seleccionado muestra `check` si no tiene icono y lleva aria-pressed.
Tarjeta({ variante?: 'relleno' | 'elevada' | 'contorno'; como?: 'div' | 'section' | 'article' | 'li' | 'aside' } & div)
Fab({ icono: NombreIcono; etiqueta: string; extendido?: boolean } & PropsControl)
BarraFlotante(div)      // opaca, elevación 3, clase plano-superior; el posicionamiento es de quien la usa
PlanoFondo({ texto: string })
Heroe({ valor: string | number; unidad?: string; nota?: string })
```

Armazón: `Estructura` (enlace de salto, `BarraSuperior`, `TiraContexto`, `BarraNavegacion`,
FAB "Preguntar", foco al `<main id="contenido">`), `Rutas.tsx` (las cuatro rutas) y
`destinos.ts` (`destinos`, `destinoActual`, tipo `Vista`). Helper interno `clases(...)`.

Notas de forma: los controles descansan en radio igual a la mitad de su alto (equivale a
`completa`, pero se puede animar sin el salto de `9999px`), pasan a `md` al presionar y a `lg`
al seleccionarse; el chip, de 32 px de alto, pasa a `md` al seleccionarse porque `lg` no se
distinguiría del reposo.

Mapa (`src/componentes/mapa/`): `ContenedorMapa(PropsMapa)`, `MapaHonduras` (Leaflet; expone
`ControlMapa` por `ref`: `acercar`, `alejar`, `verTodo`, `irA`), `NivelAptitud({ nivel,
grande? })`, `LeyendaAptitud`, `Partes({ partes, etiqueta })` y `useEscenario()` (tipo de año,
compartido entre pantallas en `sessionStorage`).

### Iconos registrados (`componentes/iconos.ts`)

grass, map, water_drop, forum (los cuatro con versión `-fill`), volume_up, volume_off, add,
remove, send, arrow_forward, arrow_back, layers, my_location, content_copy, thermostat, rainy,
landscape, delete, info, check, close, chevron_right, undo, refresh, calendar_month, warning,
psychiatry, stop, location_on, expand_more (alias de `keyboard_arrow_down`, porque
`expand_more` no existe en el paquete), science, schedule, person. Tipo `NombreIcono`.

### Estado, datos y librerías

- `useEstadoApp()` y `ProveedorEstadoApp` (`estado/EstadoApp.tsx`); `useConversacion()` y
  `ProveedorConversacion` (`estado/Conversacion.tsx`). Contratos de la sección 4.
- `lib/avisos.ts`: `avisar.exito | info | alerta | error(aviso)`, `avisar.promesa(promesa,
  { cargando, exito, error })`, `avisar.cerrar(id)`, `avisar.limpiar()`. `Aviso =
  { titulo; descripcion?; accion?: { texto; alPulsar } }`.
- `lib/sonido.ts`: `tic(mayor?)`, `asentar()`, `confirmar()`, `vibrar(ms)`,
  `configurarSonido(activo)` (lo sincroniza el estado; no hace falta llamarlo).
- `datos/cultivos.ts`: `cultivos`, `buscarCultivo`, `etapaEnSemana`. `datos/rotaciones.ts`:
  `rotaciones`. `datos/zonas.ts`: `zonas`, `cajaHonduras`, `fuentes`, `fechaGeneracion`,
  `buscarZona`, `humedadPorcentaje`, `estadoHumedad` y los tipos `Zona`, `HumedadZona`,
  `DatosZonas`, `EstadoHumedad`.

### Clases utilitarias globales (`tema/base.css`)

`plano-fondo`, `plano-medio`, `plano-superior` (tres planos), `pantalla` (contenedor de pantalla:
`position: relative; flex: 1`), `capa-estado` (hover, foco y presionado; añadir a todo control
tocable), `zona-tactil` (extiende el área de toque a 48 px), `solo-lectores`, `tipo-titulo`,
`tipo-nota`.

### Tokens (`tema/tokens.css` y `tema/colores.css`)

- Color: `--md-sys-color-*` (todos los roles de la sección 2) y `--agro-color-{agua,tierra}`,
  `-on-*`, `-*-container`, `-on-*-container`.
- Tipografía: `--fuente`, `--tipo-fondo`, `--tipo-heroe` (tamaños) con `--tipo-fondo-peso`,
  `--tipo-fondo-ancho`, `--tipo-heroe-peso`, `--tipo-heroe-ancho`, `--tipo-gigante-alto`,
  `--tipo-gigante-espaciado`; y como abreviatura de `font`: `--tipo-titulo`, `--tipo-cuerpo`,
  `--tipo-etiqueta`, `--tipo-nota`, `--tipo-micro` (uso: `font: var(--tipo-nota)`).
- Forma: `--forma-xs|sm|md|lg|lg-mas|xl|xl-mas|xxl|completa`.
- Movimiento: `--curva-resorte`, `--mov-espacial-rapido|espacial|espacial-lento`,
  `--curva-efecto`, `--mov-efecto`. Con movimiento reducido valen 1 ms (efecto 100 ms).
- Elevación: `--elevacion-1|2|3`. Estado: `--estado-hover|foco|presionado|deshabilitado`,
  `--anillo-foco`, `--anillo-foco-separacion`.
- Espaciado: `--esp-1|2|3|4|6|8|12|16`, `--zona-tactil`.
- Armazón: `--alto-barra-superior`, `--alto-navegacion`, `--ancho-riel`, `--alto-fab`,
  `--ancho-lectura`, `--z-medio`, `--z-superior`.
- Breakpoints: media 600 px y expandida 840 px (`--bp-media`, `--bp-expandida` son solo
  informativos; en `@media` se escriben los valores).

### Cómo se genera el tema

`npm run tema` ejecuta `scripts/generar_tema.mjs`, que carga
`scripts/registrar_resolver.mjs` porque `@material/material-color-utilities` 0.4.0 importa
módulos sin extensión y Node no los resuelve solo.
