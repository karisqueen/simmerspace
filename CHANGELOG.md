# Changelog

## 0.10.0 (2026-10-25)

### Redesign

- **One design system.** All colors, sizes, radii and motion come from shared tokens (`renderer/styles/tokens.css`). The old `app.css`, `refinements.css` and `rework.css` layers were replaced by `base.css`, `components.css`, `layout.css` and `pages.css`.
- **New wordmark.** “Simmer” in rounded Fredoka, “Space” lighter and wider in the second accent, next to a two-tone plumbob mark. DM Sans is now the only text font; Playfair Display and Nunito Sans are no longer used.
- **Buttons and controls.** Primary, secondary, tertiary, danger, icon and small buttons share sizes, focus rings and disabled states. Filters, segmented controls and swatches are keyboard accessible and announce their state.
- **Page headers** keep just the title and a short count; the large subtitles (“Make your game feel like yours”, “Your CC library”, …) are gone.
- **Empty, loading and error states** everywhere, including skeleton cards and offline and rate-limit messages.
- **Responsive.** Below about 980 px the sidebar becomes an icon rail; dialogs, cards and settings reflow on narrow windows.

### Personalization

- New collapsible **Personalization** section: theme (Simmer Soft or **Sims Blue**, each in light and dark), Light / Dark / Match Windows, a main accent and an optional second accent, comfortable or compact density, and motion (follow Windows, reduced, full). One accent is always enough.
- The main accent is used for actions, selection, focus and links; the second accent only for highlights (active page marker, counts, badges, the “Space” of the logo).
- Settings from 0.7.x (`soft-rose`, `dark-sage`, …) and the main and second colors from 0.8.x / 0.9.x are carried over.

### Navigation and settings

- Sidebar groups: Browse (Discover, CurseForge), Library (My CC, Favorites, Creators, Inspiration), a collapsible Collections list with color plumbobs, then **Launch The Sims 4**, Settings and the account chip.
- Settings are collapsible sections that remember whether they are open: Personalization, General, Game folders, SimmerSpace account, CurseForge connection and About.
- Technical CurseForge details moved to a **developer section** that only appears when SimmerSpace is started with `--developer` or `SIMMERSPACE_DEV=1`. It never shows the key, only its source and length.

### Filters

- One shared chip filter for every filter group. Create a Sim parts for Body, Clothing (now with swimwear and outerwear), Accessories (now with gloves and socks) and Animals use the same multi-select chips.
- Extra filters (gender, life stage, style, source, supernatural) sit behind **More filters**; active filters show as removable tokens with one **Reset**. Life stages now run from newborns to elders, and the supernatural filter is smaller and lighter with ten types.

### Collections and boards

- Every collection has a color, shown on its plumbob in the sidebar. Invalid colors fall back to the palette. The ten pastel colors from 0.7.1 still work, and a custom color can be picked.
- Collection search, sort (custom, A–Z, recently opened), drag to reorder and cover images are kept from 0.7.1–0.9.0, as are board sorting and Show all boards.

### CurseForge (needs your own API key)

- Search the Sims 4 catalog with categories, sorting and pages; see details, screenshots, authors, game versions and files.
- **Install** a file when its author allows third-party distribution: downloads only from CurseForge's CDN, checked against size and hash, ZIPs unpacked safely (only `.package` and `.ts4script`, no paths outside the folder), placed in `Mods\CurseForge - <name>` without overwriting anything, and recorded on this PC. Files that can only be downloaded on the website open the CurseForge page instead.
- **Installed** tab with update checks and one-click updates (the old files go to the Recycle Bin).
- The key is read only by the desktop process (environment variable or a local config file in the app's data folder), never shipped in the app, and never shown on screen. An optional Supabase Edge Function proxy keeps the key off the PC. Requests have timeouts, a small cache, a concurrency limit and honor CurseForge's `Retry-After`.
- The 0.9.0 search API (`searchMods`, `getModFiles`, `getDownloadUrl`) is still available in the service with its tests.

### SimmerSpace accounts (optional, needs your own Supabase project)

- Sign up with an emailed code, sign in, sign out, reset the password with a code, and edit the display name. Guest mode is the default and keeps everything on this PC.
- **Sync** merges preferences, favorites and collections between this PC and the account; nothing is deleted by a sync. Covers, tags, folder paths and scanned files are never uploaded.
- The session is stored encrypted with Windows' data protection; if encryption is unavailable you stay signed in only until SimmerSpace closes.
- `supabase/migrations` creates the `profiles`, `user_settings` and `collections` tables with row level security, so each person can only reach their own rows.

### Under the hood

- New main-process modules: `app-config.cjs`, `account-service.cjs`, `game-launcher.cjs`, `zip-reader.cjs`; `curseforge-service.cjs` rewritten.
- New desktop requests: `cf:*`, `account:*`, `integrations:status`, `app:set-window-background`. `collections:choose-cover` and `game:launch` are kept.
- Dependency: `@supabase/supabase-js` 2.117.3 (main process only).
- Tests: 76, including mocked CurseForge and account services, the account migration, appearance migration and filters. Two 0.9.0 CurseForge tests and the 0.9.0 translation check were failing before this release; they pass now (one test fixture listed a reply the code never requested and was corrected without changing its assertions).

## 0.9.0 (2026-10-24)

- Added a live CurseForge Sims 4 catalog search page, safely bridged through validated Electron IPC.
- Added project file-list and download-URL API operations for the follow-on download flow. Search results remain in memory only and are never written to disk.
- The app reads `CURSEFORGE_API_KEY` from the process environment. The key is not included in the source or packaged application, and no user-account OAuth is represented as available.
- CurseForge access still requires the owner's application approval and API key. Review `CURSEFORGE-INTEGRATION.md` before using the API or distributing a build.
- Bumped the application to 0.9.0.

## 0.8.0 (2026-10-22)

- Reworked the desktop visual system with a calmer layout, consistent typography, refreshed controls, and a redesigned SimmerSpace wordmark.
- Added a Sims-inspired blue palette in light and dark modes. Personalization now combines one or two of the four colors.
- Grouped settings into clear expandable sections and removed the technical CurseForge readiness explanation from the user-facing settings.
- Moved Launch The Sims 4 into the sidebar below collections, added color-matched Plumbob collection icons, simplified the Discover header, and changed CAS, animal, and occult filters to compact chips.
- Prepared a local integration plan for CurseForge. Live search, downloads, user sign-in, and SimmerSpace accounts are not connected in this release; no API key is embedded.

## 0.7.1 (2026-10-22)

- Collections now support search, ten pastel color swatches, image covers, consistent cover sizing, alphabetical/recent/custom sorting, and drag-and-drop custom order.
- Inspiration boards can be sorted by name, recent use, or custom order; show all boards or return to the six most recent.
- Discover adds age choices through Infants, Babies and Elders; CAS clothing/accessory quick subfilters; animal CC type filters; and supernatural-type filters. These refine the existing sample catalog and will become useful with matching tagged catalog data.
- Settings can launch Sims 4 from the selected installation folder.
- This release prepares the product boundary for future online catalogs; CurseForge remains inactive until its API access and compliant secure service are approved.


SimmerSpace is in beta. Versions follow this rule: a patch (0.6.**x**) for small or internal fixes, a minor version (0.**x**.0) for new user-facing features.

## 0.7.0 (2026-10-19)

### New: organize mods from nested folders

- **Organize into folders** now opens a preview first. It lists every file's current path and new path, and nothing moves until you confirm.
- **Subfolder choice.** Keep subfolders (`Hair\Creator\file.package`) or put files straight into the category folder (`Hair\file.package`).
- **Category folders are not nested twice.** A file that already sits in another category folder moves without carrying the old category name along.
- **Duplicate names.** Skip the file, or move it with a number added (`name (2).package`). An existing file is never replaced, even one that appears after the preview.
- **Game depth limits.** A script mod that would end up deeper than the game loads (one folder) is placed directly in its category folder, and the preview says so.
- **Progress, Stop and results.** Moving shows progress, can be stopped after the current file, and ends with a list of moved files and of files left in place, each with a reason.
- **Changed files are left alone.** Each file is checked again just before it moves. If it changed, disappeared or is in use since the preview, it stays where it is.
- **Tags follow their files.** Tags now move with a file when it is organized, renamed, enabled or disabled, in the saved catalog as well as on screen.

### Interface

- **Discover filters.**
  - The quick-filter dropdowns share one style in all six themes, and their arrows show again.
  - A dropdown you changed is highlighted.
- **Theme scrollbar.** The main window scrollbar follows the active theme instead of staying lavender.
- **New logo font.** “simmer” in the logo now uses Fredoka, a bundled, openly licensed rounded font. Proprietary font names were removed.
- **Scan errors.** A failed scan now offers **Try again**, or **Change folder** when the Mods folder is missing.
- **Gender tag label.** The gender tag was labelled “Style”; it now reads “Gender” / “Género”. The values (Female, Male, Unisex, Neutral) and saved tags are unchanged.
- **Bulk tag fields.** The fields are wider, so “Leave unchanged” is no longer cut off.
- **Focus after dialogs.** Closing a dialog returns focus to the right control, even after the list behind it was refreshed.

### Under the hood

- New desktop requests:
  - `mods:plan-organize` (read-only)
  - `mods:apply-organize`
  - `mods:cancel-organize`
  - an organize progress event
- The old one-step `mods:organize` request was removed.
- Renames and moves claim the new name with a hard link before the old name is removed, so an existing file can never be replaced. Drives without hard links use a checked rename instead.
- Quitting while files are being organized stops after the current file and saves tag changes first.
- Added 11 organizer tests and a validator test.

## 0.6.1

- Cleanup and hardening:
  - IPC sender and argument checks
  - Content Security Policy
  - bundled fonts, with no network requests
  - read-only scans with progress and cancel
  - batch results for each file
- Accessibility work: readable contrast, focus handling and in-app confirmations, in English and Spanish.
