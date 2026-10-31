# SimmerSpace

**A cozy, bilingual Sims 4 mod manager for Windows, developed in the open. / Un gestor acogedor y bilingüe de mods de Los Sims 4 para Windows, desarrollado de forma abierta.**

SimmerSpace helps players find, install, organize and care for their Sims 4 mods and custom content. Its full source code is public in this repository, so anyone can read how it works. See [Licensing](#licensing) for what that does and does not allow. / SimmerSpace ayuda a encontrar, instalar, organizar y cuidar los mods y el contenido personalizado de Los Sims 4. Todo su código fuente es público en este repositorio, así que cualquiera puede leer cómo funciona. Consulta [Licensing](#licensing) para saber qué permite y qué no.

SimmerSpace is an independent fan project and is not affiliated with, endorsed by, or sponsored by Electronic Arts or Maxis. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.

SimmerSpace is provided as-is. Back up important files before using any mod-management software.

## Current beta features

- **A SimmerSpace account is required (0.10.0).** Sign up with a username, email and password (at least 8 characters with letters and numbers, checked as you type), confirm with a 6-digit email code, reset a forgotten password with a code. A session saved on this PC opens again without internet. Accounts use the project's Supabase backend; see [docs/SUPABASE.md](docs/SUPABASE.md).
- **Eight themes**: pink, purple, green and blue, each in light and dark, with a contrasting accent color. Comfortable or compact density and reduced motion.
- **New look**: two-tone lowercase “simmerspace” wordmark with “the fold”, a ribbon folded into an S, as the symbol and app icon (see the [brand guide](docs/brand/index.html)), and a duotone icon family with category icons.
- **Navigation**: an icon rail that expands on hover (or with the menu button on touch screens): Home, Explore, My CC, Creators, Collections, Inspiration, Settings. Descriptions appear after a short pause and can be turned off in Settings.
- **First-launch tutorial** (next, back, skip, progress) that also explains how to choose the Mods folder. It can be replayed from Settings.
- **My CC**: folder strip with the Mods path and last scan, a “Library” section with list, category or creator views, a collapsible file list, a badge for mods installed by SimmerSpace versus external ones (no invented update info), and an optional one-by-one classifier (category, creator, tags, skip, skip all). Files without a category or creator are grouped under “Uncategorized” / “No creator”; changing the view never deletes tags.
- **Explore (CurseForge)**: search the Sims 4 catalog with collapsible filters by content, age, style and more, or see only the creators you follow. Install into `Mods\CurseForge - <name>` with progress and checksum verification. When an author only allows downloads on the website, SimmerSpace opens the exact file and installs your download after verifying it.
- **Library Care (0.12.2)**: find duplicates by content, empty folders and stray files, restore original file names, add local preview images and custom tags. Tags now follow files that are renamed or moved. Deleting here is permanent, shown in full beforehand and always asks first.
- **The Sims 4 settings (0.12.2)**: review and change the game's three mod settings when opening SimmerSpace, before launching the game, or in Settings.
- **Creators**: CurseForge creators twelve per page, with search and sorting, and a Following list stored on this PC. Patreon is not connected yet; a dismissible notice says so.
- **Inspiration**: a community feed. Share an image (JPG, PNG, WebP or GIF up to 10 MB; large images are reduced to 1920 px) with a caption and a category, filter by category or person, open profiles, load more, and delete your own posts (the image is deleted too).
- **Profile**: username and profile photo (reduced to 512 px WebP). **Feedback** form with suggestion, problem, new feature, donations and other.
- Everything from earlier versions stays: read-only Mods scan, tags, import without overwriting, enable/disable, rename, Recycle Bin, organize into folders with a full preview, collections, Launch The Sims 4.

### Limitations

- Windows only. The build is not code-signed yet, so Windows SmartScreen shows a warning.
- CurseForge is integrated but still in beta: some things are still being polished.
- Patreon is not connected.

## Funciones actuales (español)

- **Hace falta una cuenta de SimmerSpace (0.10.0).** Registro con nombre de usuario, correo y contraseña (mínimo 8 caracteres con letras y números, comprobado mientras escribes), confirmación con un código de 6 dígitos y recuperación de contraseña con código. Una sesión guardada en el equipo se abre también sin internet. Consulta [docs/SUPABASE.md](docs/SUPABASE.md).
- **Ocho temas**: rosa, morado, verde y azul, cada uno claro y oscuro, con un color de acento que contrasta. Densidad cómoda o compacta y movimiento reducido.
- **Nueva imagen**: logotipo “simmerspace” en minúsculas y a dos tonos con “el pliegue”, una cinta doblada en forma de S, como símbolo e icono de la app (ver la [guía de marca](docs/brand/index.html)) y una familia de iconos bicolor con iconos por categoría.
- **Navegación**: barra de iconos que se despliega al pasar el cursor (o con el botón de menú en pantallas táctiles): Inicio, Explorar, Mi CC, Creadores, Colecciones, Inspiración, Ajustes. Las descripciones aparecen tras una breve pausa y se pueden desactivar en Ajustes.
- **Tutorial inicial** (siguiente, anterior, omitir, progreso) que explica también cómo elegir la carpeta Mods. Se puede repetir desde Ajustes.
- **Mi CC**: franja con la ruta de Mods y el último escaneo, sección “Biblioteca” con vista de lista, por categoría o por creador, lista de archivos plegable, insignia para distinguir los mods instalados con SimmerSpace de los externos (sin inventar actualizaciones) y un clasificador opcional uno a uno (categoría, creador, etiquetas, omitir, omitir todos). Lo que no tiene categoría o creador se agrupa en “Sin categoría” / “Sin creador”; cambiar de vista nunca borra etiquetas.
- **Explorar (CurseForge)**: busca en el catálogo de Los Sims 4 con filtros plegables por contenido, edad, estilo y más, o mira solo a los creadores que sigues. Instala en `Mods\CurseForge - <nombre>` con progreso y verificación. Cuando el autor solo permite descargar en su sitio, SimmerSpace abre el archivo exacto e instala tu descarga tras comprobarla.
- **Cuidado de la biblioteca (0.12.2)**: busca duplicados por contenido, carpetas vacías y archivos extraños, restaura nombres originales y añade vistas previas locales y etiquetas propias. Las etiquetas siguen a los archivos renombrados o movidos. Borrar aquí es permanente, se muestra antes por completo y siempre pregunta.
- **Ajustes de Los Sims 4 (0.12.2)**: revisa y cambia los tres ajustes de mods del juego al abrir SimmerSpace, antes de iniciar el juego o en Ajustes.
- **Creadores**: creadores de CurseForge de doce en doce, con búsqueda y orden, y una lista de seguidos guardada en el equipo. Patreon todavía no está conectado; un aviso descartable lo explica.
- **Inspiración**: feed de la comunidad. Comparte una imagen (JPG, PNG, WebP o GIF hasta 10 MB; las grandes se reducen a 1920 px) con descripción y categoría, filtra por categoría o persona, abre perfiles, carga más y elimina tus publicaciones (también se borra la imagen).
- **Perfil**: nombre de usuario y foto (reducida a 512 px en WebP). **Comentarios** con sugerencia, problema, nueva función, donaciones y otro.
- Se mantiene todo lo anterior: escaneo de solo lectura, etiquetas, importar sin reemplazar, activar/desactivar, renombrar, Papelera, organizar en carpetas con vista previa, colecciones e Iniciar Los Sims 4.

### Limitaciones

- Solo Windows. La compilación todavía no tiene firma de código, así que Windows SmartScreen muestra una advertencia.
- CurseForge ya está integrado, pero sigue en beta: aún hay cosas por pulir.
- Patreon no está conectado.

## Windows installation warnings / Avisos de Windows al instalar

Windows or other security software may show a warning when you install or open SimmerSpace. The app is not digitally signed, so Windows cannot verify an established publisher. An unknown-publisher warning does not, by itself, mean that an app is malicious. The source code is public here for anyone to inspect. Download only from the official [Releases](https://github.com/karisqueen/simmerspace/releases) page.

Windows u otro software de seguridad puede mostrar un aviso al instalar o abrir SimmerSpace. La app no tiene firma digital, así que Windows no puede verificar a un editor reconocido. Un aviso de editor desconocido no significa por sí solo que una app sea maliciosa. El código fuente es público aquí para que cualquiera lo revise. Descarga solo desde la página oficial de [Releases](https://github.com/karisqueen/simmerspace/releases).

## Get the app

Download the Windows installer from the [SimmerSpace page](https://karisqueen.github.io/simmerspace/) or from [Releases](https://github.com/karisqueen/simmerspace/releases/latest). The source archive from **Code → Download ZIP** is for inspecting or building the project; it is not a ready-to-run app. / Descarga el instalador para Windows desde la [página de SimmerSpace](https://karisqueen.github.io/simmerspace/) o desde [Releases](https://github.com/karisqueen/simmerspace/releases/latest).

To run from source, install Node.js and pnpm, then run:

```powershell
pnpm install
pnpm start
```

Put development keys in a `.env.local` file next to `package.json` (ignored by git; see `.env.example`). Only copies run from source read it. / Las claves de desarrollo van en `.env.local` junto a `package.json` (ignorado por git; consulta `.env.example`). Solo lo leen las copias ejecutadas desde el código fuente.

To check the code before a build:

```powershell
pnpm test    # unit tests: file service, settings, IPC, CurseForge (mocked), accounts and Inspiration (mocked), migration, library, filters, translations
pnpm check   # syntax check of every script, page file references, and no remote fonts or styles
```

To create a Windows build on Windows:

```powershell
pnpm dist:dir       # unpacked folder: dist\win-unpacked\SimmerSpace.exe
pnpm dist:portable  # single portable .exe: dist\SimmerSpace-<version>-portable.exe
pnpm dist           # installer
```

The desktop application does not need Node.js or pnpm after it has been built. The build scripts are configured for Windows.

### Testing with a separate profile

Set `SIMMERSPACE_PROFILE_DIR` to an empty folder to run the app with its own settings, tags and folder choices, without touching your normal SimmerSpace data:

```powershell
$env:SIMMERSPACE_PROFILE_DIR = "$env:TEMP\simmerspace-test"; pnpm start
```

Point the test profile at a copy of a Mods folder, not your real one, when trying actions that change files.

### Project layout

- `electron/`: the main process. `main.cjs` creates the window and registers IPC; `mods-service.cjs` holds every file operation; `settings-store.cjs` saves folder locations; `ipc.cjs` validates the sender and the arguments of every request; `preload.cjs` exposes the small `simmerSpace` API to the page. `app-config.cjs` reads integration settings, `curseforge-service.cjs` talks to the CurseForge API, `zip-reader.cjs` unpacks downloads safely, `account-service.cjs` handles SimmerSpace accounts and `game-launcher.cjs` starts the game. `library-metadata.cjs` remembers each file by its contents, `library-tools.cjs` holds Library Care and `sims4-config.cjs` edits the game's Options.ini.
- `renderer/`: the page. `js/core.js` and `js/i18n.js` hold shared helpers and all English and Spanish text; `js/ui.js` holds dialogs and toasts; `js/appearance.js` applies personalization; `js/icons.js` draws icons and the brand mark; `app.js`, `mods-manager.js`, `library.js`, `library-care.js`, `game-config.js`, `organizer.js`, `folders.js`, `curseforge.js`, `creators.js`, `account.js`, `inspiration.js` and `tour.js` render the pages. Styles: `tokens.css` (all colors and sizes), `base.css`, `components.css`, `layout.css`, `pages.css`, `mods-manager.css` and `community.css`. Brand files are in `renderer/brand`. Fonts are bundled in `renderer/fonts` under the SIL Open Font License: DM Sans for text and Fredoka for the logo. No EA fonts or logo artwork are included.
- `supabase/`: the migration for the existing Supabase project (row level security and storage policies), SQL checks for a local PostgreSQL and the CurseForge proxy function.
- `tests/`: Node test runner tests (`node --test`).

## Privacy and file access

- Folder paths, tags, collections, followed creators and interface preferences are stored only on this PC.
- The Mods scan reads folder listings and filenames. To recognize renamed files and find duplicates, SimmerSpace then calculates a checksum of each file on this PC. Folder paths, filenames, checksums and preview images are never uploaded.
- Your account (email, username, profile photo), your Inspiration posts and the feedback you send are stored in SimmerSpace's Supabase project, protected by row level security: everyone signed in can see profiles and posts; only you can change or delete yours.
- The session is saved encrypted with Windows protection (Electron safeStorage); if that is not available it is kept in memory only.
- CurseForge requests send your searches and the mod and file ids to the project's Supabase function, which forwards them to CurseForge.
- Import, rename, enable/disable, organization and deletion are explicit local actions. The Sims 4 settings change only when you apply them.

## Project status

Current version: **0.12.2 beta**: more reliable CurseForge downloads, Library Care, tags that survive updates and renames, Explore filters, full creator browsing, account deletion and The Sims 4 settings; 0.12.1: Inspiration tags, private boards, comments with replies and following simlings; a redesigned library with Organize folders by category or creator; creator styles; clearer update messages; 0.12.0: Windows installer with automatic updates that ask first, a social-style profile page, username changes confirmed with the password once every 30 days, new brand identity; 0.11.1: no sample content, new plumbob-S icon; CurseForge integrated: explore and install mods after signing in; redesign with eight themes, required SimmerSpace accounts, the Inspiration community feed, real CurseForge creators and the reorganized My CC page. See [CHANGELOG.md](CHANGELOG.md). / Versión actual: **0.12.2 beta**: descargas de CurseForge más fiables, Cuidado de la biblioteca, etiquetas que sobreviven a actualizaciones y renombrados, filtros en Explorar, creadores paginados, eliminación de cuenta y ajustes de Los Sims 4; 0.12.1: etiquetas en Inspiración, tableros privados, comentarios con respuestas y seguir a simlings; biblioteca rediseñada con Organizar carpetas por categoría o creador; estilos de creadores; mensajes de actualización más claros; 0.12.0: instalador para Windows con actualizaciones automáticas que preguntan antes, perfil con estilo de red social y cambio de nombre confirmado con contraseña una vez cada 30 días, nueva identidad de marca; 0.11.1: sin contenido de ejemplo, nuevo icono plumbob-S; CurseForge integrado: explora e instala mods al iniciar sesión; rediseño con ocho temas, cuentas obligatorias, feed de Inspiración, creadores reales de CurseForge y Mi CC reorganizado.

Bug reports and suggestions can be sent from **Settings → About → Feedback** or opened as GitHub Issues. Please do not include personal folder paths, account credentials, or private files.

## Licensing

**SimmerSpace has no open-source license.** This is intentional. Not choosing a license does not mean the original SimmerSpace source code and materials are free to reuse: default copyright rules apply, and no general permission is granted to copy, republish, distribute, sell, or incorporate them into another project.

Because this repository is public, GitHub allows people to view and fork it on GitHub under GitHub's Terms of Service. That platform permission is not a general license to reuse or redistribute SimmerSpace outside GitHub. If you want to reuse the original project elsewhere, ask the maintainer for written permission first. Making this repository private later will not remove copies or forks that others have already made.

This notice states the project's permissions; it cannot technically prevent someone from copying public code or automatically resolve a dispute. Please do not present SimmerSpace's original code or design as your own.

This notice applies only to original SimmerSpace materials. Third-party dependencies, trademarks, and other materials remain subject to their respective owners' rights and license terms. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.; SimmerSpace is an independent fan project.

**Español:** SimmerSpace no tiene una licencia de código abierto, de forma intencional. El código y los materiales originales no se ofrecen para reutilizarlos, republicarlos, distribuirlos, venderlos ni incorporarlos a otro proyecto sin permiso escrito de quien mantiene el proyecto. Al ser público, GitHub permite ver y bifurcar el repositorio dentro de GitHub conforme a sus Términos de servicio; eso no concede permiso general para reutilizar SimmerSpace fuera de GitHub. Si luego se vuelve privado, las copias y bifurcaciones existentes no se eliminan automáticamente. Esta nota expresa los permisos del proyecto, pero no puede impedir técnicamente que alguien copie código público ni resolver por sí sola un conflicto. No presentes el código ni el diseño original de SimmerSpace como propios. Las dependencias y marcas de terceros conservan sus propias licencias y derechos.

References: [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) · [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
