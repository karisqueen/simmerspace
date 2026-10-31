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

En 1100 entradas de búsqueda, 378 permitían la distribución (34 %), con grandes diferencias por franja: 6 % en el pelo más
popular y 66 % en los accesorios más populares. Es una muestra con repeticiones, no una cifra de toda la plataforma.

## Instalación asistida

Si la API no autoriza la descarga, simmerspace abre la página exacta del archivo. El jugador lo descarga allí, simmerspace lo
detecta en Descargas, comprueba el checksum que publica CurseForge e instala por la vía normal. El archivo descargado no se toca.
