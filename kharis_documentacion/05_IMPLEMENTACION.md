# Cómo implementar Kharis Engine

Guía práctica: instalar, comprobar, operar con datos nuevos y conectar el sitio web. El detalle técnico está en `README.md`.

## 1. Qué trae el zip

| Carpeta o archivo | Para qué |
|---|---|
| `kharis/`, `run_kharis.py` | el motor y su línea de comandos |
| `artefactos/` | el modelo ya entrenado (`kharis_engine.pt`, versión activa v007), el ONNX y las 7 versiones |
| `datos/kharis_entrada.csv.gz` | copia limpia de los datos 1996–2026 (30 puntos). Con ella todo corre sin la carpeta `processed/` |
| `salidas/` | pronóstico a 365 días, física, señales P1–P10 y `salidas/web/` para el sitio |
| `reports/` | gráficas y métricas de la corrida final |
| `web_ejemplo/index.html` | página de ejemplo que lee `salidas/web/` |
| `tests/` | 38 pruebas |
| `runs/` | registro de TensorBoard de la corrida final |
| `../kharis_documentacion/` | junto al motor en el zip: cambios, las 38 pruebas, resultados, guía del sitio, imágenes y HTML (empieza por `LEEME.md`) |

No hace falta entrenar para empezar: el modelo viene listo.

## 2. Instalar (una vez)

Requiere Python 3.10 o más nuevo. Desde la carpeta donde descomprimiste el zip:

```bash
python -m venv .venv_kharis
```

Con tarjeta NVIDIA (recomendado para entrenar):

```bash
.venv_kharis\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cu130
```

Sin tarjeta NVIDIA (servidor o laptop; alcanza para pronosticar y actualizar):

```bash
.venv_kharis\Scripts\python -m pip install torch
```

Y el resto:

```bash
.venv_kharis\Scripts\python -m pip install -r kharis_engine\requirements.txt
```

En Linux o Mac cambia `.venv_kharis\Scripts\python` por `.venv_kharis/bin/python`.

## 3. Comprobar que funciona

Desde `kharis_engine/`:

```bash
..\.venv_kharis\Scripts\python tests\correr_pruebas.py
```

Deben pasar las 38 (unos 35 segundos con GPU).

```bash
..\.venv_kharis\Scripts\python run_kharis.py --versiones
```

Debe listar v001 a v007, con v007 activa y datos hasta 2026-11-10.

```bash
..\.venv_kharis\Scripts\python run_kharis.py --pronosticar
```

Regenera `salidas/` y `salidas/web/` con el modelo activo. Tarda 1 minuto con GPU.

## 4. Operación: del dato nuevo al sitio

El ciclo normal tiene tres pasos y ninguno necesita reentrenar:

1. **Traer datos nuevos.** Actualiza la carpeta `processed/` como siempre (`scripts/pipeline.py` del proyecto). El motor la lee tal como está.
2. **Actualizar el motor.**

   ```bash
   ..\.venv_kharis\Scripts\python run_kharis.py --actualizar
   ```

   Detecta qué días son nuevos, mide la deriva de los datos, recalibra, ajusta los pesos, guarda una versión nueva y regenera pronóstico, ONNX y `salidas/web/`. Si la versión candidata empeora en los días reservados, se queda la anterior.
3. **Publicar.** Copia `salidas/web/` a la carpeta de archivos estáticos del sitio (sección 5).

Qué esperar según cuántos días lleguen (probado con los datos reales):

| Llegan | Qué hace el motor |
|---|---|
| Pocos días (menos de unas 6 semanas) | No crea versión. Los días se acumulan para la próxima vez. El pronóstico ya parte del último día. |
| Semanas o meses | Recalibra y ajusta. Crea una versión nueva (v008, v009…). |
| Nada nuevo | Avisa que no hay días nuevos y solo regenera el pronóstico. |

Sin `--data`, el motor busca `../processed`. Si no existe, usa `datos/kharis_entrada.csv.gz`. Para otra ruta: `--data RUTA`.

### Automatizarlo

Programa el paso 2 después de tu descarga de datos (una vez al día o a la semana). En Windows, con el Programador de tareas, la acción es:

```text
Programa:   C:\ruta\.venv_kharis\Scripts\python.exe
Argumentos: run_kharis.py --actualizar
Iniciar en: C:\ruta\kharis_engine
```

Esta parte no se probó en este equipo: verifica la primera ejecución a mano.

## 5. Conectar el sitio web

### La idea: el sitio lee, no calcula

Una app del clima abre al instante porque el pronóstico ya está calculado en un servidor y el teléfono solo lo descarga. Kharis funciona igual:

- **El cálculo pesado ocurre antes**, cuando llegan datos (paso 2 de la sección 4). Tarda 1 minuto y nadie lo espera.
- **El sitio solo descarga un archivo pequeño** por punto y lo dibuja.

Medido con la página de ejemplo:

| Qué | Tamaño | Tiempo |
|---|---|---|
| `indice.json` (lista de puntos) | 5 KB | una vez |
| `<punto>.json` (90 días de historia + 365 de pronóstico + física + señales) | 69 KB, 21 KB con gzip | 5–10 ms en local |

Por internet es una sola petición de 21 KB: lo mismo que una imagen pequeña.

### Qué publicar

Copia la carpeta `salidas/web/` completa a los archivos estáticos del sitio (en Vite o Next, dentro de `public/`, por ejemplo `public/kharis/`). No necesita base de datos ni servidor de Python.

### Cómo leerlo

```js
const BASE = "/kharis/";
const indice = await (await fetch(BASE + "indice.json")).json();
// indice.puntos = [{ punto, lat, lon, elevacion, archivo }, ...]

const p = await (await fetch(BASE + indice.puntos[0].archivo)).json();
p.historia.T2M_MAX;            // últimos 90 días observados
p.pronostico.T2M_MAX.media;    // 365 valores: el día k es p.pronostico.inicio + k días
p.pronostico.PRECTOTCORR.p90;  // banda alta de lluvia
p.fisica.reserva;              // agua en el suelo (mm), sigue desde lo observado
p.senales[0].P2;               // { valor, percentil, probabilidad, activo }
```

`web_ejemplo/index.html` es una página completa que hace esto: elige punto y variable, dibuja observado, pronóstico y banda, y lista las señales. Para verla:

```bash
..\.venv_kharis\Scripts\python -m http.server 8090 --bind 127.0.0.1
```

y abre `http://localhost:8090/web_ejemplo/index.html`. No funciona abriendo el archivo con doble clic: el navegador bloquea la lectura de archivos locales.

### Para que se sienta instantáneo

1. **Compresión** gzip o brotli en el servidor. Vercel, Netlify, Cloudflare Pages y GitHub Pages la aplican solos.
2. **Caché.** Los archivos solo cambian cuando corres `--actualizar`. Sirve `indice.json` con caché corta (5 minutos) y los puntos con caché de 1 hora o más.
3. **Carga el índice primero** y el punto elegido después. No descargues los 30 puntos al abrir.
4. **Precarga el punto probable** (el último que vio el usuario o el más cercano) mientras se pinta la página.
5. **Dibuja con los arreglos tal cual.** Ya vienen redondeados y ordenados por día.

### Las propuestas (fase siguiente)

La misma regla sirve para las recomendaciones de cultivo: calcúlalas una vez por punto cuando cambian los datos, guárdalas junto al JSON del punto y que la página solo las lea. Llamar a un modelo de lenguaje en cada visita la haría lenta y cara. Las señales P1–P10 de `salidas/web/<punto>.json` y `salidas/senales_p1_p10.csv` son la entrada de esa fase.

### Si necesitas inferir en vivo

Para un punto nuevo o una simulación, `artefactos/kharis_engine.onnx` pesa 1.5 MB y corre en el navegador con `onnxruntime-web` o en el servidor con `onnxruntime`. Entradas: `clima_ventana [lote, 64, 44]` y `climatologia_futura [lote, 7, 7]`. Salidas: `prediccion` y `cuantiles` a 7 días. Preparar esas entradas requiere el mismo escalado del motor, así que para el sitio normal conviene la salida ya calculada.

## 6. Volver a una versión anterior

```bash
..\.venv_kharis\Scripts\python run_kharis.py --versiones
```

```bash
..\.venv_kharis\Scripts\python run_kharis.py --rollback v006
```

No borra nada: solo cambia la versión activa y regenera el ONNX. Después corre `--pronosticar` para rehacer las salidas.

## 7. Reentrenar desde cero

Solo hace falta si cambian las variables, los puntos o quieres rehacer la climatología base:

```bash
..\.venv_kharis\Scripts\python run_kharis.py --export-onnx --tensorboard
```

Entrena con 1996–2020, hace el backtesting 2021–2026, las pruebas de estrés y la prueba congelada, y deja todo de nuevo. En una RTX 3070 tarda unos 8 minutos. Reinicia el historial de versiones.

Para probar el flujo completo en segundos, sin datos reales:

```bash
..\.venv_kharis\Scripts\python run_kharis.py --demo-synthetic --export-onnx --tensorboard
```

## 8. Cómo saber que sigue bien

| Qué mirar | Dónde | Qué debe decir |
|---|---|---|
| Índice de deriva | `reports/metrics_summary.json` → `prueba_congelada.indice_deriva` | `0.0` |
| Error a 1 día contra climatología | `reports/prueba_2021_2026.csv` | menor en temperatura y humedad |
| Real contra predicho | `reports/prueba_2021_2026.png` | las líneas azul y negra van juntas |
| Deriva de los datos nuevos | salida de `--actualizar` | "deriva: no" la mayoría de las veces |
| Versión activa y fecha | `--versiones` | "datos hasta" igual al último día descargado |

## 9. Problemas comunes

| Síntoma | Causa y arreglo |
|---|---|
| El proceso termina con código `0xC0000005` | PyTorch 2.14 con Python 3.15 en Windows falla al cerrar tras usar la GPU. `run_kharis.py` y las pruebas ya lo evitan. Un script nuevo que use la GPU debe salir con `os._exit`. |
| "onnxruntime no instalado" | No hay instalador para Python 3.15. El ONNX se verifica con el evaluador de referencia de `onnx`. Con Python 3.10–3.13: `pip install onnxruntime`. |
| "Las columnas de los datos no coinciden con las del modelo guardado" | Cambiaron las variables de `processed/`. Reentrena (sección 7). |
| La página de ejemplo dice que no pudo leer el índice | La abriste como archivo. Usa el servidor de la sección 5. |
| El equipo se reinicia al entrenar | Pasó una vez con dos tareas pesadas a la vez. Corre una sola. |
