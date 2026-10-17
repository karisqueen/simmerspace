# SimmerSpace

**A cozy, bilingual Sims 4 mod manager prototype. / Un prototipo acogedor y bilingüe para gestionar mods de Los Sims 4.**

SimmerSpace is a pre-beta Windows desktop app for managing a player's local Sims 4 content library. This repository contains the application source code and synthetic demo content.

SimmerSpace is an independent fan project and is not affiliated with, endorsed by, or sponsored by Electronic Arts or Maxis. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.

SimmerSpace is provided as-is. Back up important files before using any mod-management software.

## Current pre-beta features

- Spanish and English interface with six color themes.
- Local Sims 4 folder settings: Mods, user Documents, game installation, and optional Sims 4 Studio.
- Manual, read-only scan of `.package` and `.ts4script` filenames in the selected Mods folder and its subfolders.
- Demo Discover filters, creator profiles, Inspiration boards, and CC collections.
- Manually add public Patreon profile links to a local creator catalog and follow profiles on this device.
- Local preferences and demo collections stored on this computer.

This pre-beta does not connect to external content platforms or install mods.

Catalog entries and demo creator profiles are synthetic examples used to demonstrate the interface. Manually added Patreon profile links are saved only on this device; they are not sent to Patreon or synchronized. Example links, dates, popularity values, and references do not represent real CurseForge listings or real downloads. The creator names in the sample data are fictional.

## Get the app

The source archive from GitHub's **Code → Download ZIP** is for inspecting or building the project; it is not a ready-to-run Windows app. Any Windows build published by the project owner will be listed separately in **Releases**.

To run from source, install Node.js and pnpm, then run:

```powershell
pnpm install
pnpm start
```

To create a Windows build on Windows:

```powershell
pnpm dist:dir
pnpm dist
```

The desktop application does not need Node.js or pnpm after it has been built. The build scripts are configured for Windows.

## Privacy and file access

- SimmerSpace stores selected folder paths and interface preferences locally on this PC.
- Manually added Patreon profile links and the creator follow list are also stored locally; this pre-beta does not fetch creator posts.
- The Mods scan reads folder listings and filenames ending in `.package` or `.ts4script`; it does not open or change those files.
- This pre-beta does not send folder paths or scanned filenames to a server.
- Folder selection and scanning are not installation or deletion features. They are local setup and read-only inspection only.
- There is no account sign-in or cross-device sync in this version.

## Current status

Third-party platform connections, automatic Patreon posts, downloads, and mod installation are not available in this pre-beta. No API key or user credential is included in this repository. A future Patreon connection would use API v2. Patreon requires the `campaigns.posts` scope to list campaign posts and directs apps seeking access to other creators' campaign data to contact its developers forum. SimmerSpace will not scrape Patreon or put API secrets in the desktop interface.

See [the Patreon integration plan](docs/PATREON-INTEGRATION.md) for the proposed Sims 4 creator directory, public-post discovery, optional patron linking, and the approvals required before member-only posts can be shown.

## Project status

Current version: **0.5.3 pre-beta**.

Bug reports and suggestions can be opened as GitHub Issues. Please do not include personal folder paths, account credentials, or private files in an issue.

## Licensing

**SimmerSpace has no open-source license.** This is intentional. Not choosing a license does not mean the original SimmerSpace source code and materials are free to reuse: default copyright rules apply, and no general permission is granted to copy, republish, distribute, sell, or incorporate them into another project.

Because this repository is public, GitHub allows people to view and fork it on GitHub under GitHub's Terms of Service. That platform permission is not a general license to reuse or redistribute SimmerSpace outside GitHub. If you want to reuse the original project elsewhere, ask the maintainer for written permission first. Making this repository private later will not remove copies or forks that others have already made.

This notice states the project's permissions; it cannot technically prevent someone from copying public code or automatically resolve a dispute. Please do not present SimmerSpace's original code or design as your own.

This notice applies only to original SimmerSpace materials. Third-party dependencies, trademarks, and other materials remain subject to their respective owners' rights and license terms. The Sims and The Sims 4 are trademarks of Electronic Arts Inc.; SimmerSpace is an independent fan project.

**Español:** SimmerSpace no tiene una licencia de código abierto, de forma intencional. El código y los materiales originales no se ofrecen para reutilizarlos, republicarlos, distribuirlos, venderlos ni incorporarlos a otro proyecto sin permiso escrito de quien mantiene el proyecto. Al ser público, GitHub permite ver y bifurcar el repositorio dentro de GitHub conforme a sus Términos de servicio; eso no concede permiso general para reutilizar SimmerSpace fuera de GitHub. Si luego se vuelve privado, las copias y bifurcaciones existentes no se eliminan automáticamente. Esta nota expresa los permisos del proyecto, pero no puede impedir técnicamente que alguien copie código público ni resolver por sí sola un conflicto. No presentes el código ni el diseño original de SimmerSpace como propios. Las dependencias y marcas de terceros conservan sus propias licencias y derechos.

References: [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) · [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
