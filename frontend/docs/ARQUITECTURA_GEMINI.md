# Arquitectura Gemini de AgroResilience

Documento de arquitectura. Describe los dos componentes basados en Gemini, cómo se relacionan y por dónde pasan los datos. No define ni implementa un modelo de predicción.

## Componentes

| Componente | Endpoint | Archivo de servidor | Modelo por defecto | Salida |
|---|---|---|---|---|
| Prior de decisión (Gemini con decision prior) | `POST /api/decision` | `api/decision.ts` | `gemini-3.5-flash-lite` | JSON validado por esquema: `rotacionId`, `enfoquePrincipal`, `aviso` |
| Gemini estándar | `POST /api/explicacion` y `POST /api/chat` | `api/explicacion.ts`, `api/chat.ts` | `gemini-3.6-flash` | Texto en flujo: resumen, línea `---`, detalle |

Ambos llaman a la API REST de Gemini mediante el cliente mínimo de `api/_lib/gemini.ts`, sin SDK. La clave de la API vive solo en el servidor y nunca llega al navegador. Los modelos, el nivel de razonamiento y la clave se configuran por variables de entorno; los nombres están en el archivo de ejemplo de configuración del frontend.

### Prior de decisión

- Recibe el contexto, los enfoques elegidos, el escenario, los candidatos de rotación y la perspectiva anual.
- Solo elige entre los candidatos que llegan en la petición. Si hay un único candidato, no llama al modelo.
- Parámetros: temperatura 0, máximo 80 tokens, tiempo límite de 4 s en el servidor.
- Cualquier respuesta fuera de los ids o valores permitidos se rechaza con error 502.
- El enfoque principal debe ser uno de los que eligió la persona; si no, queda en `null`.

### Gemini estándar

- Escribe la explicación a fondo y atiende el chat de seguimiento.
- Parámetros de la explicación: temperatura 0.4, máximo 450 tokens, tiempo límite de 25 s en el servidor.
- Usa flujo (`streamGenerateContent`) para que el texto llegue por partes.
- En el chat, el contexto viaja dentro del último mensaje de la persona, nunca en la instrucción de sistema.

## Relación entre componentes

El frontend usa el orquestador (`src/lib/recomendacion/orquestador.ts`), que combina tres capas:

1. **Motor local** (`motor.ts`): puntaje instantáneo sin red. Siempre da una respuesta inicial.
2. **Prior de decisión**: confirma o cambia la opción del motor. Límite de espera `LIMITE_DECISION_MS` = 2500 ms contados desde el toque; si no llega, se queda la opción del motor.
3. **Gemini estándar**: explicación. Límite `LIMITE_EXPLICACION_MS` = 6000 ms desde el toque; si no llega, se muestra el resumen rápido guardado y el análisis completo aparece después con un aviso.

Los dos componentes son independientes: no se pasan datos entre ellos. Ambos reciben los datos de dominio desde el frontend.

## Flujo de datos

```
Persona toca "ver recomendación"
  |
  +--> Motor local ------------------------------> pantalla (respuesta inmediata)
  |
  +--> POST /api/decision   (hasta 2500 ms)
  |       candidatos + enfoques + escenario + perspectiva
  |       -> Gemini (prior de decisión)
  |       -> { rotacionId, enfoquePrincipal, aviso }
  |       -> si llega a tiempo, confirma o cambia la opción
  |
  +--> POST /api/explicacion   (flujo de texto)
          datos de la opción elegida
          -> Gemini estándar
          -> resumen, línea "---", detalle
          -> a tiempo (hasta 6000 ms): análisis a fondo desde el inicio
          -> tarde: resumen rápido y aviso al terminar

Chat de seguimiento: POST /api/chat -> Gemini estándar.
```

## Fallas y reintentos

- Error de Gemini o cuota agotada: el resumen rápido se queda en pantalla y hay botón de reintento.
- Un intento fallido no cuenta en la cuota.

## Configuración

Variables de entorno del servidor (nombres en `frontend/.env.example`; los valores nunca se guardan en el repo):

| Variable | Uso | Valor por defecto |
|---|---|---|
| `GEMINI_API_KEY` | Clave de la API de Gemini, solo en el servidor | sin valor |
| `GEMINI_MODELO_DECISION` | Modelo del prior de decisión | `gemini-3.5-flash-lite` |
| `GEMINI_MODELO_NORMAL` | Modelo del Gemini estándar | `gemini-3.6-flash` |
| `GEMINI_RAZONAMIENTO` | Nivel de razonamiento (`MINIMAL`, `LOW`...) | `MINIMAL` en el ejemplo |

## Explicación visual

El diagrama "Qué ve el usuario según el tiempo" (escenarios A, Gemini rápido, y B, Gemini lento, más el caso de falla) está en `docs/tiempos-gemini.png`.

## Pendiente de decisión

- El diagrama muestra un único límite de 6 s, que coincide con la explicación. El límite del prior de decisión (2500 ms en el código) no aparece en el diagrama. Hay que confirmar cuál debe mostrarse.
- Los límites son de ejemplo y se ajustan con mediciones reales.
