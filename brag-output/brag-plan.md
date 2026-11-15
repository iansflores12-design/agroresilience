# Plan del video: AgroResilience

## Las preguntas

- **Qué es:** una app web que convierte datos de satélite de la NASA en respuestas de campo: cómo está la tierra y qué conviene sembrar después.
- **Para quién:** agricultores, productores y técnicos de campo de Honduras, con teléfono de gama media y poca paciencia para la jerga.
- **Qué la distingue:** cada pantalla responde una sola pregunta con palabras de todos los días ("¿Qué sembró?", "¿Cómo está la tierra?"). El dato técnico existe, pero vive un nivel más abajo.
- **El dato más fuerte:** Comayagua, 12 de noviembre: 19.1 % de agua en la tierra cuando lo normal es 29.8 %. Es una medición real de SMAP que la app ya muestra.
- **Gancho visual:** el número gigante que cae de 29.8 a 19.1 y la etiqueta "Seca".
- **Flujo real que se muestra:** elegir cultivo (Maíz), ver el mapa por departamento, ver la tierra en Comayagua, tocar "Recomiéndeme" y leer la rotación recomendada.
- **Tono:** `default`, limpio y directo, con la identidad M3 Expressive de la app en modo oscuro.
- **Frase para compartir:** "El satélite ya sabe cómo está su tierra. AgroResilience se lo dice en palabras de campo."

## Ángulo

El satélite ya tiene la respuesta; lo que faltaba era decirla en español de campo. El video
arranca con el dato crudo (la tierra está seca), plantea la pregunta del agricultor ("¿Y
ahora qué siembro?") y recorre la app contestándola en cuatro toques.

## Identidad visual

- Fondo `#101510` (surface oscuro de la app), tinta blanca, señal `#96f0a4` (primary),
  `tierra` `#ffb784` / `#713700` y `agua` `#90cdff`.
- Google Sans Flex variable, la misma fuente de la interfaz.
- Pantallas reales de la app capturadas en Chrome (412x880, DPR 3) dentro de un teléfono.
- Mapa de Honduras dibujado con el `departamentos.geo.json` del proyecto y las 11 zonas.
- Iconos Material Symbols del propio proyecto.

## Datos personales y cifras

No aparece ningún dato personal. Las ciudades son nombres públicos. Los puntajes de
rotación y de aptitud son los de la app, que ella misma marca como "de ejemplo, todavía sin
validar"; el video no añade ninguna afirmación sobre su exactitud. La explicación local del
chat sale en "modo de prueba" (sin clave de Gemini en esta máquina), así que ese rótulo no
se encuadra y el chat se menciona solo con su propio título.

## Música

"Lucky Acoustic" de Jesse Keller (CC BY 3.0), encontrada en Openverse (fuente Jamendo).
Guitarra acústica instrumental. Se usa el tramo final de la pista para que el video cierre
con su acorde final real, con el tempo bajado un 3 % (de 93 a 90 pulsos por minuto) para
que cada corte y cada toque caigan en pulso o en corchea (rejilla de 0.333 s). Los primeros
4 s suenan filtrados y la pista se abre justo en la revelación. Sin efectos sintetizados.

## Guion (34 s, 51 pulsos a 90 por minuto)

| # | Tiempo | Escena | En pantalla |
|---|---|---|---|
| 1 | 0.0 - 4.0 | Gancho | "Comayagua, Honduras. Medido por satélite." El número cae de 29.8 a 19.1 "% de agua en la tierra", aparece "Seca". En 2.0: "¿Y ahora qué siembro?" "Seca" entra en 1.33. |
| 2 | 4.0 - 8.0 | Revelación | Logo y nombre. "Datos de satélite de la NASA, en palabras de campo." "Para agricultores de Honduras." El mapa de Honduras se dibuja con sus 11 zonas. |
| 3 | 8.0 - 12.0 | Cultivo | Teléfono con la pantalla real. Toque en Maíz en 9.33. "¿Qué sembró? Elija su cultivo con un toque." |
| 4 | 12.0 - 16.0 | Mapa | Mapa por departamento con puntajes; toque en Comayagua en 14.0. "¿Dónde se da mejor? Los 18 departamentos, con puntaje." |
| 5 | 16.0 - 21.0 | Tierra | 19.1 %, gráfica de 4 meses, lluvia, temperatura, tipo de tierra y el dibujo de la sequía. "¿Cómo está la tierra? Humedad, lluvia y temperatura, medidas por satélite." |
| 6 | 21.0 - 26.0 | Qué sembrar | Toque en "Recomiéndeme" en 22.0; la pantalla baja a "Maíz y después frijol, Buena, 85 de 100". "¿Qué sembrar después? Compara rotaciones y le dice cuál conviene." En 23.33: "Y pregunte lo que quiera", con Gemini. |
| 7 | 26.0 - 30.0 | De dónde sale el dato | "De dónde sale el dato." Fichas: Humedad, NASA SMAP. Lluvia y temperatura, NASA POWER. Tipo de tierra, SoilGrids. Cómo viene el año, NOAA ONI. |
| 8 | 30.0 - 34.0 | Cierre | "El satélite ya lo sabe. Ahora usted también." Logo, AgroResilience, "NASA Space Apps 2026, equipo Honduras" sobre el acorde final (32.0) y el crédito de la música. |

Dura más que los 20 s habituales porque el encargo es explicar el proyecto completo.
