# Changelog

SimmerSpace is pre-beta. Versions follow this rule: a patch (0.6.**x**) for small or internal fixes, a minor version (0.**x**.0) for new user-facing features.

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
