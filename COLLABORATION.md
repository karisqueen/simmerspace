# SimmerSpace shared workspace

This repository folder is the single working copy for SimmerSpace shared between Codex and Claude.

- Application source, tests, documentation, and the bilingual GitHub Pages source live here.
- The GitHub Pages source is `docs/index.html`; the public project guide is `README.md`.
- The supplied Windows portable build is in `release-assets/SimmerSpace-0.7.0-windows-portable.zip`.
- Edit this folder directly in Claude after granting Claude access to this folder. Do not work from an extracted second copy or replace it with an older archive.
- Before editing, inspect `git status` and the diff. Preserve user changes and do not overwrite release assets.
- Keep version references aligned across `package.json`, `renderer/js/app.js`, `README.md`, `CHANGELOG.md`, and `docs/index.html`.
- Do not commit, push, publish a GitHub release, or alter repository settings unless the project owner asks.