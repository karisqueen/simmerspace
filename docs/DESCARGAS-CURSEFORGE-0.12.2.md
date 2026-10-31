# Descargas de CurseForge en simmerspace 0.12.2

Investigación hecha el 2026-10-31 contra la API real, con la clave de desarrollo del proyecto y en carpetas temporales.

## Flujo actual

1. Se lee el proyecto (`GET /v1/mods/{modId}`) y el archivo (`GET /v1/mods/{modId}/files/{fileId}`).
2. Si el archivo trae `downloadUrl`, se usa. Si no, se pregunta siempre a `GET /v1/mods/{modId}/files/{fileId}/download-url`.
3. El archivo se descarga por streaming a una carpeta temporal, calculando SHA-1, MD5 y SHA-256.
4. Se comprueban tamaño, checksum y que no sea una página web.
5. Solo entonces se escribe en Mods, sin sobrescribir nada, y se registra en la biblioteca.

## Clave en el CDN

CurseForge anunció el 2026-06-10 que `edge.forgecdn.net` exigiría la clave en la cabecera `x-api-key` desde el 16 de julio.
El 2026-10-31 el CDN respondió igual sin clave, con clave válida y con clave inválida: redirección 302 a `mediafilez.forgecdn.net`,
y después 200 con el ZIP. simmerspace cumple el requisito de todos modos:

- En modo directo envía la clave solo a `edge.forgecdn.net`, nunca a la redirección.
- La app instalada no contiene la clave. La Edge Function `curseforge-proxy` tiene la ruta nueva `/cdn-resolve`, que sigue
  esa redirección en el servidor y devuelve la dirección final. El archivo no pasa por la función.
- Si esa ruta no está desplegada, la app hace una petición normal, que funciona mientras el CDN no aplique la exigencia.
  Si la aplicara, el error sería `CF_CDN_AUTH`. **Hay que desplegar la función actualizada antes de publicar.**

## Errores

| Código | Significado |
| --- | --- |
| `CF_UNAUTHORIZED` | La API rechazó la autenticación |
| `CF_DOWNLOAD_NOT_ALLOWED` | El proyecto tiene la distribución desactivada **y** el endpoint negó el enlace |
| `CF_LINK_DENIED` | El endpoint negó el enlace, pero el proyecto no lo prohíbe |
| `CF_NO_LINK` | CurseForge no dio enlace, sin prohibición del proyecto |
| `CF_FILE_UNAVAILABLE` | `isAvailable` es falso |
| `CF_CDN_AUTH` | El CDN respondió 401 o 403 |
| `CF_CDN_NOT_FOUND` | El CDN respondió 404 o 410 |
| `CF_CDN_FAILED` | Error 5xx u otro del CDN (con reintentos) |
| `CF_NOT_A_FILE` | Llegó una página web en vez del archivo |
| `CF_NETWORK`, `CF_OFFLINE`, `CF_TIMEOUT` | Corte, sin conexión o sin respuesta (con reintentos) |
| `CF_HASH_MISMATCH` | El archivo no coincide (se repite una vez) |
| `CF_TRAY_CONTENT` | El contenido va en la carpeta Tray, no en Mods |

## Prueba real: MC Command Center (663350, archivo 8823491)

| Paso | Resultado |
| --- | --- |
| `GET /v1/mods/663350` | 200, `allowModDistribution: false`, `isAvailable: true` |
| `GET /v1/mods/663350/files` | 200, `downloadUrl: null` en los 3 archivos |
| `GET /v1/mods/663350/files/8823491` | 200, `isAvailable: true`, `fileStatus: 4`, `downloadUrl: null` |
| `POST /v1/mods/files` | 200, `downloadUrl: null` |
| `GET .../download-url` | **403** con esta clave |
| Control con la misma clave, proyecto 682796 | `download-url` 200 y descarga válida |

No se construyó ninguna dirección del CDN a mano: sería saltarse la decisión de quien creó el proyecto.

## Prueba real: muestra de 68 casos

Gameplay, script, Build/Buy, CAS, pelo, ropa, accesorios y poses, en tres franjas de popularidad, más un archivo antiguo.

| Distribución | Casos | `download-url` | Instalados |
| --- | --- | --- | --- |
| Permitida | 45 | 200 en 45 | 42, y 3 detenidos por el detector de duplicados |
| Desactivada | 23 | 403 en 23 | 0 |

Los 42 instalados pasaron checksum y cabecera (`DBPF` o `PK`): 115 archivos, 476 MB. No quedaron temporales.

## Auditoría completa de la muestra

1100 entradas de búsqueda, 1038 proyectos únicos. Tabla proyecto a proyecto en [muestra.csv](evidencia-0.12.2/muestra.csv).

| Resultado | Proyectos | Etapa | HTTP | Control |
| --- | --- | --- | --- | --- |
| Autorizado | 368 (35,5 %) | ninguna: CDN 302 y luego 200 | 200 | n/a |
| No autorizado | 670 (64,5 %) | `download-url` | 403, cuerpo vacío | CurseForge / autor |

Ningún caso se sale de esas dos filas. Los 670 tienen `allowModDistribution: false`, `isAvailable: true`, metadatos 200 y
`downloadUrl: null`. Los 177 archivos antiguos revisados en 120 de ellos tampoco tienen enlace. La API no da un motivo escrito:
la causa se establece por el indicador del proyecto y por la coincidencia total, no por un mensaje. La documentación oficial
tampoco describe este 403. La muestra no representa a toda la plataforma.

## Dos tipos de 403

| | Enlace denegado | Bloqueo perimetral |
| --- | --- | --- |
| Emisor | API de CurseForge | CloudFront |
| Cuerpo | vacío | HTML de 919 bytes |
| Afecta a | proyectos concretos | todas las peticiones, unos 3 minutos |
| Código en la app | `CF_DOWNLOAD_NOT_ALLOWED` | `CF_BLOCKED` |

El bloqueo lo provocó la auditoría con miles de peticiones seguidas. Una clave inválida también da 403 en los metadatos, por eso
el estado solo no basta y la app comprueba el contexto.

## Validación independiente de las instalaciones

Los 42 archivos instalados se volvieron a descargar y se abrieron con .NET, no con el lector de la app. En los 42 coinciden
tamaño, SHA-1 publicado, firma ZIP, destino, profundidad y registro; cada .package y .ts4script es idéntico por SHA-256 y todas
las cabeceras son válidas (115 archivos). Detalle en [validacion-instalaciones.json](evidencia-0.12.2/validacion-instalaciones.json).

## App de escritorio real

`scripts/e2e-downloads.cjs` maneja Electron real con perfil y Mods temporales: 22 de 22 comprobaciones. Sin iniciar sesión y en
modo directo, así que no cubre el proxy, el inicio de sesión ni la app instalada con NSIS.
Resultado en [app-escritorio.json](evidencia-0.12.2/app-escritorio.json).

## Autorización de la clave

La comparación con otro gestor instalado en este PC mostró que descargó proyectos que hoy tienen la distribución desactivada,
usando la misma API oficial y el campo `downloadUrl`. Lo más probable es que CurseForge conceda enlaces según la clave o el
acuerdo de cada aplicación, y que la clave de simmerspace no tenga ese acceso. No se ha podido demostrar por completo ni se ha
usado ninguna credencial ajena. La vía correcta es preguntárselo a CurseForge. simmerspace no necesita cambios para aprovecharlo:
si la API devuelve el enlace, el archivo se instala directamente.

## Instalación asistida

Si la API no autoriza la descarga, simmerspace abre la página exacta del archivo. El jugador lo descarga allí, simmerspace lo
detecta en Descargas, comprueba el checksum que publica CurseForge e instala por la vía normal. El archivo descargado no se toca.
