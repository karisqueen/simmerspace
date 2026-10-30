# Configurar CurseForge en SimmerSpace

SimmerSpace usa la **API oficial de CurseForge** (`https://api.curseforge.com`) desde el proceso de escritorio. La página de la app nunca ve la clave. Sin clave, la página CurseForge muestra “CurseForge no está configurado” y no hace ninguna petición.

## 1. Conseguir la clave

1. Solicita acceso en la consola de CurseForge para desarrolladores (<https://console.curseforge.com/>) y acepta los términos de la API para terceros.
2. Cuando aprueben la aplicación, copia la clave desde **API Keys** en la consola.
3. Formato: se usa **tal cual**, sin prefijo (nada de `Bearer`). SimmerSpace la envía en la cabecera `x-api-key`. Suele parecerse a `$2a$10$…` (unos 60 caracteres). Si en tu consola tiene otro aspecto, úsala igualmente tal cual.

## 2. Dónde ponerla (elige una)

SimmerSpace busca la clave en este orden. La primera que encuentre gana.

**A. Variable de entorno `CURSEFORGE_API_KEY`** (recomendado para desarrollo)

En PowerShell, con **comillas simples** (con comillas dobles, PowerShell trata `$2a` como variable y rompe la clave):

```powershell
$env:CURSEFORGE_API_KEY = 'pega-aquí-tu-clave'
pnpm start
```

Solo dura en esa ventana de PowerShell. Para dejarla fija para tu usuario de Windows: `[Environment]::SetEnvironmentVariable('CURSEFORGE_API_KEY', 'pega-aquí-tu-clave', 'User')` y vuelve a abrir la terminal o la app.

**B. Archivo local `simmerspace.config.json`** (sirve también para la versión portable o instalada)

Crea el archivo en la carpeta de datos de la app, con el formato de [`simmerspace.config.example.json`](../simmerspace.config.example.json):

```json
{ "curseforge": { "apiKey": "pega-aquí-tu-clave" } }
```

La carpeta es `%APPDATA%\simmerspace` (por ejemplo `C:\Users\<tú>\AppData\Roaming\simmerspace`), tanto con `pnpm start` como en la versión portable. La forma segura de abrirla: inicia SimmerSpace en modo desarrollador (`pnpm start -- --developer`, o con `$env:SIMMERSPACE_DEV = '1'`) y pulsa **Ajustes → Herramientas de desarrollo → Abrir carpeta de configuración**. Si usas `SIMMERSPACE_PROFILE_DIR`, el archivo va dentro de esa carpeta.

**No pongas la clave** en `electron/public-config.json`, en el código, en tests ni en capturas: todo lo que se empaqueta con la app se puede extraer, así que SimmerSpace **ignora** una clave de CurseForge que esté ahí (el panel de desarrollo lo avisa). `simmerspace.config.json`, `.env` y `electron/public-config.json` están en `.gitignore`.

Opcionales: `CURSEFORGE_API_BASE_URL` (por defecto `https://api.curseforge.com`), `CURSEFORGE_GAME_ID` (normalmente no hace falta: se descubre con el slug `sims4`) y `CURSEFORGE_PROXY_URL` (ver punto 4).

## 3. Comprobar sin exponer la clave

1. Abre **Ajustes → CurseForge** y pulsa **Probar conexión**. Debe decir “Conectado”.
2. En modo desarrollador, **Herramientas de desarrollo** muestra solo el *origen* de la clave (`env` o `file`) y su *longitud*, nunca la clave. Compara la longitud con la de la consola.
3. Errores habituales: “clave rechazada” (401/403: clave mal copiada o app no aprobada), “sin conexión”, “demasiadas peticiones” (CurseForge pidió esperar; la app respeta `Retry-After`).

## 4. Versión para repartir: proxy en Supabase (lo que usa el .exe desde 0.11.0)

Una clave en el PC de cada jugador se puede extraer, así que el ejecutable no la lleva. Usa la función
`supabase/functions/curseforge-proxy`: guarda la clave como secreto de Supabase y solo responde a personas con sesión
iniciada en SimmerSpace, y solo deja pasar las rutas de lectura que usa la app. Los pasos están en
[SUPABASE.md](SUPABASE.md) (sección 5b). Con `proxyUrl` configurado, la app usa el proxy aunque haya una clave local.

## Qué hace y qué no

- Busca, muestra detalles, capturas, autores, categorías, versiones del juego y archivos.
- Instala solo cuando CurseForge devuelve `downloadUrl` (el autor permite distribución a terceros). Si no, abre la página del mod en CurseForge.
- Descarga solo desde `*.forgecdn.net` / `*.curseforge.com`, comprueba tamaño y hash, descomprime ZIP de forma segura y nunca reemplaza archivos.
- No hay inicio de sesión de CurseForge: la API usa la clave de la aplicación, no tu cuenta personal de CurseForge.
- Requiere aprobación de CurseForge o pasos aparte: distribuir públicamente una app con acceso a la API, mostrar contenido fuera de lo que permiten sus términos, o pedir límites de uso mayores.
