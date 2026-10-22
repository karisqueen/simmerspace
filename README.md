# SimmerSpace

**A cozy, bilingual Sims 4 mod manager prototype. / Un prototipo acogedor y bilingüe para gestionar mods de Los Sims 4.**

SimmerSpace is a pre-beta Windows desktop app for managing a player's local Sims 4 content library. This repository contains the application source code and synthetic demo content.

SimmerSpace is an independent fan project and is not affiliated with, endorsed by, or sponsored by Electronic Arts or Maxis. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.

SimmerSpace is provided as-is. Back up important files before using any mod-management software.

## Current pre-beta features

- Spanish and English interface with six color themes (three light, three dark).
- Local Sims 4 folder settings: Mods, user Documents, game installation, and optional Sims 4 Studio. Only the Mods folder is used by features in this version.
- **Read-only scan** of `.package`, `.ts4script`, `.packageoff` and `.ts4scriptoff` files in the Mods folder and all its subfolders, with progress and a Stop button. Scanning never opens, moves or changes files.
- Tags saved only in SimmerSpace: category, creator, gender and age, for single files or many at once. Tags follow a file when SimmerSpace renames, enables, disables or moves it.
- Copy supported files or folders into Mods (import never overwrites; a numbered name is used instead).
- Enable and disable files by changing their extension in place; rename files while keeping their extension; send files to the Windows Recycle Bin.
- **Organize into folders (new in 0.7.0):** move tagged files, including files deep inside nested folders, into the category folders you choose. Before anything moves you see every file's current and new path. You choose whether to keep subfolders (`Hair\Creator\file.package`) or put files straight into the category folder (`Hair\file.package`), and whether a file whose name is already taken is skipped or moved with a number added. Existing files are never replaced. Script mods are kept within the one-folder depth the game loads. Moving shows progress, can be stopped after the current file, and ends with a per-file list of what moved and what did not, and why. Each file is checked again just before it moves: files that changed, disappeared or are in use since the preview are left where they are.
- Demo Discover filters, creator profiles, Inspiration boards, and CC collections, clearly labelled as sample data.
- Manually add public Patreon profile links to a local creator catalog and follow profiles on this device.

### Limitations

- Windows only. The build is not code-signed yet, so Windows SmartScreen shows a warning.
- Tags are linked to file paths. Files moved or renamed outside SimmerSpace lose their tags until they are tagged again.
- Organize leaves emptied folders in place; delete them in File Explorer if you like.
- Default category folder names are in Spanish (for example `Cabello`) in both languages, so folders made by earlier versions keep matching. You can rename them in **Categories & folders**.
- Discover, creators, Inspiration and collections use fictional sample data. There is no connection to CurseForge, Patreon or any other platform, no downloads, and no automatic installation.

The mod manager makes local file changes only after the user chooses an action and confirms it. The app does not install mods into the game automatically or connect to external content platforms.

Catalog entries and demo creator profiles are synthetic examples used to demonstrate the interface. Manually added Patreon profile links are saved only on this device; they are not sent to Patreon or synchronized. Example links, dates, popularity values, and references do not represent real CurseForge listings or real downloads. The creator names in the sample data are fictional.

## Funciones actuales (español)

- Interfaz en español e inglés con seis temas de color (tres claros y tres oscuros).
- Ajustes de carpetas de Los Sims 4: Mods, Documentos del usuario, instalación del juego y, opcionalmente, Sims 4 Studio. En esta versión solo la carpeta Mods se usa en funciones.
- **Escaneo de solo lectura** de archivos `.package`, `.ts4script`, `.packageoff` y `.ts4scriptoff` en Mods y todas sus subcarpetas, con progreso y botón para detener. El escaneo nunca abre, mueve ni cambia archivos.
- Etiquetas guardadas solo en SimmerSpace: categoría, creador, género y edad, para uno o muchos archivos. Las etiquetas siguen al archivo cuando SimmerSpace lo renombra, activa, desactiva o mueve.
- Copiar archivos o carpetas compatibles a Mods (importar nunca reemplaza; se usa un nombre numerado).
- Activar y desactivar archivos cambiando su extensión; renombrar conservando la extensión; enviar archivos a la Papelera de reciclaje de Windows.
- **Organizar en carpetas (nuevo en 0.7.0):** mueve archivos etiquetados, también los que están dentro de carpetas anidadas, a las carpetas de categoría que elijas. Antes de mover nada ves la ruta actual y la nueva de cada archivo. Eliges si conservar las subcarpetas (`Cabello\Creador\archivo.package`) o poner los archivos directamente en la carpeta de la categoría (`Cabello\archivo.package`), y si un archivo cuyo nombre ya existe se omite o se mueve con un número añadido. Nunca se reemplaza un archivo existente. Los mods de script se mantienen a una carpeta de profundidad, como exige el juego. El movimiento muestra el progreso, se puede detener después del archivo actual y termina con una lista por archivo de lo que se movió y lo que no, con el motivo. Cada archivo se vuelve a revisar justo antes de moverlo: si cambió, desapareció o está en uso desde la vista previa, se deja donde está.
- Filtros de Descubrir, perfiles de creadores, tableros de Inspiración y colecciones de demostración, marcados claramente como datos de ejemplo.
- Añadir manualmente enlaces públicos de perfiles de Patreon a un catálogo local de creadores y seguir perfiles en este dispositivo.

### Limitaciones

- Solo Windows. La compilación todavía no tiene firma de código, así que Windows SmartScreen muestra una advertencia.
- Las etiquetas están ligadas a la ruta del archivo. Si mueves o renombras archivos fuera de SimmerSpace, pierden sus etiquetas hasta que los etiquetes de nuevo.
- Organizar deja en su sitio las carpetas que quedan vacías; puedes borrarlas en el Explorador de archivos.
- Los nombres predeterminados de las carpetas de categoría están en español (por ejemplo `Cabello`) en ambos idiomas, para que las carpetas creadas por versiones anteriores sigan coincidiendo. Puedes cambiarlos en **Categorías y carpetas**.
- Descubrir, creadores, Inspiración y colecciones usan datos ficticios de ejemplo. No hay conexión con CurseForge, Patreon ni otras plataformas, ni descargas, ni instalación automática.

## Get the app

The source archive from GitHub's **Code → Download ZIP** is for inspecting or building the project; it is not a ready-to-run Windows app. Any Windows build published by the project owner will be listed separately in **Releases**.

To run from source, install Node.js and pnpm, then run:

```powershell
pnpm install
pnpm start
```

To check the code before a build:

```powershell
pnpm test    # unit tests for the file service, settings, IPC validation, shared helpers and translations
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

- `electron/`: the main process. `main.cjs` creates the window and registers IPC; `mods-service.cjs` holds every file operation; `settings-store.cjs` saves folder locations; `ipc.cjs` validates the sender and the arguments of every request; `preload.cjs` exposes the small `simmerSpace` API to the page.
- `renderer/`: the page. `js/core.js` and `js/i18n.js` hold shared helpers and all English and Spanish text; `js/ui.js` holds dialogs and toasts; `app.js`, `mods-manager.js`, `organizer.js` and `folders.js` render the pages. Fonts are bundled in `renderer/fonts` under the SIL Open Font License: DM Sans, Nunito Sans, Playfair Display, and Fredoka, a rounded display face used only for “simmer” in the logo. No EA fonts or logo artwork are included.
- `tests/`: Node test runner tests (`node --test`).

## Privacy and file access

- SimmerSpace stores selected folder paths and interface preferences locally on this PC.
- Manually added Patreon profile links and the creator follow list are also stored locally; this pre-beta does not fetch creator posts.
- The Mods scan reads folder listings and filenames for supported active and disabled extensions; it does not open file contents.
- This pre-beta does not send folder paths or scanned filenames to a server.
- Import, rename, enable/disable, organization, and deletion are explicit local actions. Category/creator tags are stored in this device's SimmerSpace data and keyed to file paths.
- There is no account sign-in or cross-device sync in this version.

## Current status

Third-party platform connections, automatic Patreon posts, downloads, and mod installation are not available in this pre-beta. No API key or user credential is included in this repository. A future Patreon connection would use API v2. Patreon requires the `campaigns.posts` scope to list campaign posts and directs apps seeking access to other creators' campaign data to contact its developers forum. SimmerSpace will not scrape Patreon or put API secrets in the desktop interface.

## Project status

Current version: **0.7.0 pre-beta**. See [CHANGELOG.md](CHANGELOG.md) for what changed. / Versión actual: **0.7.0 pre-beta**.

Bug reports and suggestions can be opened as GitHub Issues. Please do not include personal folder paths, account credentials, or private files in an issue.

## Licensing

**SimmerSpace has no open-source license.** This is intentional. Not choosing a license does not mean the original SimmerSpace source code and materials are free to reuse: default copyright rules apply, and no general permission is granted to copy, republish, distribute, sell, or incorporate them into another project.

Because this repository is public, GitHub allows people to view and fork it on GitHub under GitHub's Terms of Service. That platform permission is not a general license to reuse or redistribute SimmerSpace outside GitHub. If you want to reuse the original project elsewhere, ask the maintainer for written permission first. Making this repository private later will not remove copies or forks that others have already made.

This notice states the project's permissions; it cannot technically prevent someone from copying public code or automatically resolve a dispute. Please do not present SimmerSpace's original code or design as your own.

This notice applies only to original SimmerSpace materials. Third-party dependencies, trademarks, and other materials remain subject to their respective owners' rights and license terms. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.; SimmerSpace is an independent fan project.

**Español:** SimmerSpace no tiene una licencia de código abierto, de forma intencional. El código y los materiales originales no se ofrecen para reutilizarlos, republicarlos, distribuirlos, venderlos ni incorporarlos a otro proyecto sin permiso escrito de quien mantiene el proyecto. Al ser público, GitHub permite ver y bifurcar el repositorio dentro de GitHub conforme a sus Términos de servicio; eso no concede permiso general para reutilizar SimmerSpace fuera de GitHub. Si luego se vuelve privado, las copias y bifurcaciones existentes no se eliminan automáticamente. Esta nota expresa los permisos del proyecto, pero no puede impedir técnicamente que alguien copie código público ni resolver por sí sola un conflicto. No presentes el código ni el diseño original de SimmerSpace como propios. Las dependencias y marcas de terceros conservan sus propias licencias y derechos.

References: [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) · [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
