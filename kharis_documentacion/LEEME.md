# Documentación de Kharis Engine

Todo lo necesario para entender, verificar e implementar Kharis Engine, el motor de pronóstico agroclimático de Agroresiliencia. Estado al 15-11-2026, versión del modelo v007, datos hasta 2026-11-10.

## Por dónde empezar

| Archivo | Para qué |
|---|---|
| [01_CAMBIOS.md](01_CAMBIOS.md) | Qué se corrigió (deriva, dispersión y P9, lotes cortos) con el antes y el después. |
| [02_PRUEBAS.md](02_PRUEBAS.md) | Las 38 pruebas, una por una, y su última corrida. |
| [03_RESULTADOS.md](03_RESULTADOS.md) | Cifras clave y qué es cada imagen, HTML y archivo de datos. |
| [04_GUIA_SITIO.md](04_GUIA_SITIO.md) | Cómo conectar el pronóstico al sitio (`frontend/`), paso a paso. |
| [05_IMPLEMENTACION.md](05_IMPLEMENTACION.md) | Instalar, operar con datos nuevos, volver a una versión, problemas comunes. |
| [06_REFUERZO.md](06_REFUERZO.md) | Refuerzo del 15-11-2026: lluvia medida con Brier, mezcla con la climatología, El Niño en la temporada y fuentes de los cultivos. |

## Carpetas

| Carpeta | Contenido |
|---|---|
| `imagenes/` | Gráficos del motor y capturas de los HTML. |
| `html/` | Gráficos interactivos 2021–2026 (incluidos los dos de Ian) y la página de ejemplo. |
| `datos/` | Métricas, deriva, versiones y señales en CSV y JSON. |
| `pruebas/` | Resultado de las 38 pruebas: `pruebas.json` (estado y tiempo de cada una) y la salida completa. |
| `web/` | Los 31 JSON que lee el sitio: `indice.json` y uno por punto. |
| `motor/` | `README.md` técnico completo, `followup.md` (estado y pendientes) y `requirements.txt`. |

## En una frase

Kharis le gana claro a la climatología en temperatura y humedad a 1 y 7 días. Su pronóstico largo ya no se desvía (índice de deriva 0) y sus bandas cubren lo que deben. La lluvia diaria exacta no se puede anticipar: ahí sirve por sus bandas y sus probabilidades de temporada.

## El motor

El código, el modelo entrenado y las salidas están en `kharis_engine/`, en el mismo zip. Comandos, desde esa carpeta:

```bash
..\.venv_kharis\Scripts\python.exe run_kharis.py --actualizar
```

```bash
..\.venv_kharis\Scripts\python.exe tests\correr_pruebas.py
```

## Pendiente (no bloquea)

1. Conectar el sitio (guía en 04).
2. Programar la actualización automática en Windows (descrita, sin probar).
3. Descargar `WS2M_MAX` de NASA POWER para tener ráfagas de viento.
4. Validar la climatología móvil de 10 años como ancla.
5. Fase siguiente: propuestas de cultivo calculadas una vez por punto a partir de P1–P10.
