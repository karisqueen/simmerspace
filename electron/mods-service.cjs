/* File operations for the user's Mods folder. Scanning only reads folder listings; every change is an explicit action. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { AppError, toAppError } = require('./errors.cjs');

const MOD_TYPES = new Map([
  ['.package', { extension: '.package', enabled: true }],
  ['.packageoff', { extension: '.package', enabled: false }],
  ['.ts4script', { extension: '.ts4script', enabled: true }],
  ['.ts4scriptoff', { extension: '.ts4script', enabled: false }]
]);
const DISABLED_SUFFIX = 'off';
const INVALID_WINDOWS_NAME = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;
const MAX_BATCH = 30000;
const PROGRESS_EVERY = 1000;
// How deep the game looks for files inside Mods: scripts one folder down, packages five.
const GAME_DEPTH_LIMIT = { '.ts4script': 1, '.package': 5 };
const ORGANIZE_LAYOUTS = ['keep', 'flatten'];
const DUPLICATE_MODES = ['skip', 'rename'];
// Codes from a failed hard link that mean "this drive cannot do it", so a checked rename is used instead.
const LINK_UNSUPPORTED = new Set(['EPERM', 'EACCES', 'ENOTSUP', 'EXDEV', 'EINVAL', 'ENOSYS', 'EMLINK', 'UNKNOWN']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function modType(fileName) {
  return MOD_TYPES.get(path.extname(fileName).toLowerCase()) || null;
}

function safeName(value, label = 'Name') {
  if (typeof value !== 'string') throw new AppError('NAME_INVALID', `${label} is invalid.`);
  const name = value.trim();
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.length > 180 ||
    INVALID_WINDOWS_NAME.test(name) ||
    /[. ]$/.test(name) ||
    RESERVED_WINDOWS_NAME.test(name)
  ) {
    throw new AppError('NAME_INVALID', `${label} contains characters Windows cannot use.`);
  }
  return name;
}

function normalizeRelative(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || path.isAbsolute(value)) {
    throw new AppError('INVALID_PATH', 'Invalid mod file path.');
  }
  const relative = path.normalize(value);
  const parts = relative.split(path.sep);
  if (parts.some(part => !part || part === '.' || part === '..')) throw new AppError('INVALID_PATH', 'Invalid mod file path.');
  const absolute = path.resolve(root, relative);
  if (!pathIsInside(root, absolute) || samePath(root, absolute)) {
    throw new AppError('OUTSIDE_ROOT', 'The file must stay inside the selected Mods folder.');
  }
  return { relative, absolute };
}

// Windows paths are case-insensitive, so comparisons are too.
function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function pathIsInside(parent, candidate) {
  const base = path.resolve(parent).toLowerCase();
  const full = path.resolve(candidate).toLowerCase();
  return full === base || full.startsWith(base.endsWith(path.sep) ? base : `${base}${path.sep}`);
}

function relativeDepth(relative) {
  return relative.split(/[\\/]/).filter(Boolean).length - 1;
}

function toggledName(absolute, enabled) {
  return enabled ? absolute.slice(0, -DISABLED_SUFFIX.length) : `${absolute}${DISABLED_SUFFIX}`;
}

function stringList(value, label) {
  if (!Array.isArray(value)) throw new AppError('INVALID_INPUT', `${label} must be a list.`);
  return value.slice(0, MAX_BATCH);
}

function failure(error) {
  const appError = toAppError(error);
  return { ok: false, code: appError.code, error: error instanceof AppError ? appError.message : 'The operation could not be completed.' };
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertFree(file, message = 'A file with the destination name already exists; nothing was changed.') {
  if (await exists(file)) throw new AppError('NAME_CONFLICT', message);
}

// Moves a file without ever replacing an existing one. A hard link claims the destination name atomically
// (it fails if the name is taken); only then is the old name removed. Drives without hard links (FAT, some
// network shares) fall back to a rename after checking the destination is free.
async function moveNoOverwrite(source, destination) {
  try {
    await fs.link(source, destination);
  } catch (error) {
    if (error.code === 'EEXIST') throw new AppError('NAME_CONFLICT', 'A file with that name already exists there; nothing was changed.');
    if (!LINK_UNSUPPORTED.has(error.code)) throw error;
    await assertFree(destination, 'A file with that name already exists there; nothing was changed.');
    await fs.rename(source, destination);
    return;
  }
  try {
    await fs.unlink(source);
  } catch (error) {
    // The original could not be released (for example the game has it open): undo the new name.
    await fs.unlink(destination).catch(() => {});
    throw error;
  }
}

function organizeOptions(input) {
  const source = input && typeof input === 'object' ? input : {};
  const categoryFolders = Array.isArray(source.categoryFolders)
    ? source.categoryFolders.filter(value => typeof value === 'string' && value.length <= 180).slice(0, 500)
    : [];
  return {
    layout: ORGANIZE_LAYOUTS.includes(source.layout) ? source.layout : 'flatten',
    duplicates: DUPLICATE_MODES.includes(source.duplicates) ? source.duplicates : 'skip',
    categoryFolders: new Set(categoryFolders.map(name => name.trim().toLowerCase()).filter(Boolean))
  };
}

function numberedName(fileName, index) {
  const extension = path.extname(fileName);
  return `${fileName.slice(0, -extension.length)} (${index})${extension}`;
}

function normalizeCatalog(input) {
  const source = input && typeof input === 'object' ? input : {};
  const files = Object.create(null);
  if (source.files && typeof source.files === 'object' && !Array.isArray(source.files)) {
    for (const [relativePath, raw] of Object.entries(source.files).slice(0, 100000)) {
      if (!raw || typeof raw !== 'object' || relativePath.length > 2048) continue;
      const tags = {};
      for (const key of ['categoryId', 'creatorId', 'gender', 'age']) {
        if (typeof raw[key] === 'string' && raw[key] && raw[key].length <= 180) tags[key] = raw[key];
      }
      if (Object.keys(tags).length) files[relativePath] = tags;
    }
  }
  const cleanList = (value, limit) =>
    Array.isArray(value)
      ? value.slice(0, limit).flatMap(item => {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 100 || typeof item.name !== 'string') {
            return [];
          }
          const name = item.name.trim().slice(0, 120);
          return name ? [{ id: item.id, name }] : [];
        })
      : [];
  const folderNames = Object.create(null);
  if (source.folderNames && typeof source.folderNames === 'object' && !Array.isArray(source.folderNames)) {
    for (const [id, value] of Object.entries(source.folderNames).slice(0, 500)) {
      if (typeof value !== 'string') continue;
      try {
        folderNames[id] = safeName(value, 'Folder name');
      } catch {}
    }
  }
  return {
    files,
    categories: cleanList(source.categories, 500),
    creators: cleanList(source.creators, 10000),
    folderCategories: Array.isArray(source.folderCategories)
      ? [...new Set(source.folderCategories.filter(value => typeof value === 'string' && value.length <= 100))].slice(0, 500)
      : [],
    folderNames
  };
}

function createModsService({ app, dialog, shell, getModsRoot, getWindow = () => undefined, report = () => {}, reportOrganize = () => {} }) {
  let activeScan = null;
  let activeOrganize = null;
  let organizePlan = null;
  let pendingCatalogWrites = 0;
  let catalogWriteQueue = Promise.resolve();
  const catalogFile = () => path.join(app.getPath('userData'), 'mods-catalog.json');

  async function selectedRoot() {
    const root = await getModsRoot();
    if (typeof root !== 'string' || !root.trim()) throw new AppError('MODS_ROOT_NOT_SET', 'Choose your Mods folder in Settings first.');
    const absolute = path.resolve(root);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isDirectory()) throw new AppError('MODS_ROOT_UNAVAILABLE', 'The selected Mods folder is unavailable. Check its path in Settings.');
    return absolute;
  }

  async function readCatalogStore() {
    try {
      const store = JSON.parse(await fs.readFile(catalogFile(), 'utf8'));
      return store && store.roots && typeof store.roots === 'object' ? store : { version: 1, roots: {} };
    } catch {
      return { version: 1, roots: {} };
    }
  }

  async function writeCatalogStore(store) {
    const file = catalogFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(store), 'utf8');
    await fs.rename(temp, file);
  }

  function queueCatalogWrite(operation) {
    pendingCatalogWrites++;
    const next = catalogWriteQueue.then(operation).finally(() => {
      pendingCatalogWrites--;
    });
    catalogWriteQueue = next.catch(() => {});
    return next;
  }

  // Moves saved tags to the files' new paths in the stored catalog, so tags survive even if the page
  // never gets the chance to save its own copy.
  function remapCatalogPaths(root, pairs) {
    return queueCatalogWrite(async () => {
      const store = await readCatalogStore();
      const entry = store.roots[root.toLowerCase()];
      if (!entry?.files || typeof entry.files !== 'object') return;
      let changed = false;
      for (const [oldPath, newPath] of pairs) {
        if (oldPath === newPath || !Object.prototype.hasOwnProperty.call(entry.files, oldPath)) continue;
        entry.files[newPath] = entry.files[oldPath];
        delete entry.files[oldPath];
        changed = true;
      }
      if (changed) await writeCatalogStore(store);
    });
  }

  // Read-only walk of the Mods folder. Symbolic links and junctions are not followed.
  async function walk(root, token) {
    const stack = [{ absolute: root, relative: '' }];
    const files = [];
    let visited = 0;
    let folders = 0;
    let unreadableFolders = 0;
    while (stack.length && !token.cancelled) {
      const current = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(current.absolute, { withFileTypes: true });
        folders++;
      } catch {
        unreadableFolders++;
        continue;
      }
      for (const entry of entries) {
        if (token.cancelled) break;
        visited++;
        const relativePath = current.relative ? path.join(current.relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
          stack.push({ absolute: path.join(current.absolute, entry.name), relative: relativePath });
        } else if (entry.isFile()) {
          const type = modType(entry.name);
          if (type) {
            files.push({
              name: entry.name,
              relativePath,
              extension: type.extension.slice(1),
              enabled: type.enabled,
              depth: relativeDepth(relativePath)
            });
          }
        }
        if (visited % PROGRESS_EVERY === 0) {
          report({ visited, found: files.length, folders, unreadableFolders });
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
    files.sort((a, b) => collator.compare(a.relativePath, b.relativePath));
    report({ visited, found: files.length, folders, unreadableFolders, done: true });
    return { files, visited, folders, unreadableFolders, cancelled: token.cancelled };
  }

  async function scan() {
    if (activeScan) throw new AppError('SCAN_IN_PROGRESS', 'A scan is already running.');
    const token = { cancelled: false };
    activeScan = token;
    try {
      return await walk(await selectedRoot(), token);
    } finally {
      activeScan = null;
    }
  }

  async function resolveModInRoot(root, relativePath, canonicalRoot = null) {
    const target = normalizeRelative(root, relativePath);
    const stat = await fs.lstat(target.absolute).catch(() => null);
    if (!stat) throw new AppError('NOT_FOUND', 'This file is no longer in the Mods folder. Scan again to refresh the list.');
    if (!stat.isFile() || stat.isSymbolicLink() || !modType(target.absolute)) {
      throw new AppError('NOT_A_MOD', 'This is not a supported Sims 4 mod file.');
    }
    const realRoot = canonicalRoot || (await fs.realpath(root));
    const realTarget = await fs.realpath(target.absolute);
    if (!pathIsInside(realRoot, realTarget)) throw new AppError('OUTSIDE_ROOT', 'The file resolves outside the selected Mods folder.');
    return { root, ...target, stat };
  }

  async function resolveMod(relativePath) {
    return resolveModInRoot(await selectedRoot(), relativePath);
  }

  async function withUniqueName(folder, fileName) {
    const extension = path.extname(fileName);
    const stem = fileName.slice(0, -extension.length);
    for (let index = 1; index <= 10000; index++) {
      const candidate = index === 1 ? fileName : `${stem} (${index})${extension}`;
      const absolute = path.join(folder, candidate);
      if (!(await exists(absolute))) return absolute;
    }
    throw new AppError('NAME_CONFLICT', 'Could not find an unused file name.');
  }

  async function ensureSafeFolder(root, folderPath) {
    const realRoot = await fs.realpath(root);
    if (samePath(folderPath, root)) return root;
    const target = normalizeRelative(root, path.relative(root, folderPath));
    await fs.mkdir(target.absolute, { recursive: true });
    const stat = await fs.lstat(target.absolute);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AppError('UNSAFE_FOLDER', 'A category folder cannot be a symbolic link.');
    const realFolder = await fs.realpath(target.absolute);
    if (!pathIsInside(realRoot, realFolder)) {
      throw new AppError('OUTSIDE_ROOT', 'The destination folder resolves outside the selected Mods folder.');
    }
    return target.absolute;
  }

  async function collectImportSources(sourceFolder) {
    const sources = [];
    const stack = [sourceFolder];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(absolute);
        else if (entry.isFile() && modType(entry.name)) sources.push(absolute);
      }
    }
    return sources.sort(collator.compare);
  }

  // Copies files into Mods. Existing files are never overwritten; a numbered name is used instead.
  async function importMods(kind) {
    if (!['files', 'folder'].includes(kind)) throw new AppError('INVALID_INPUT', 'Choose files or a folder to import.');
    const root = await selectedRoot();
    const options =
      kind === 'folder'
        ? { title: 'Choose a folder containing Sims 4 mods', properties: ['openDirectory'] }
        : {
            title: 'Choose Sims 4 mod files',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Sims 4 mods', extensions: ['package', 'ts4script', 'packageoff', 'ts4scriptoff'] }]
          };
    const result = await dialog.showOpenDialog(getWindow(), options);
    if (result.canceled || !result.filePaths?.length) return { imported: 0, skipped: 0, files: [], failures: [], canceled: true };

    let sources;
    let sourceFolder = null;
    let unsupported = 0;
    if (kind === 'files') {
      sources = result.filePaths.filter(file => !!modType(file));
      unsupported = result.filePaths.length - sources.length;
    } else {
      sourceFolder = path.resolve(result.filePaths[0]);
      if (pathIsInside(root, sourceFolder) || pathIsInside(sourceFolder, root)) {
        throw new AppError('IMPORT_INSIDE_ROOT', 'Choose an import folder outside the selected Mods folder.');
      }
      sources = await collectImportSources(sourceFolder);
    }

    const imported = [];
    const failures = [];
    for (const source of sources) {
      const name = path.basename(source);
      try {
        const sourceStat = await fs.lstat(source).catch(() => null);
        if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) throw new AppError('NOT_A_MOD', 'This is not a regular mod file.');
        if (pathIsInside(root, source)) throw new AppError('IMPORT_INSIDE_ROOT', 'This file is already inside the Mods folder.');
        let destinationFolder = root;
        if (sourceFolder) {
          const safeFolder = safeName(path.basename(sourceFolder), 'Folder name');
          destinationFolder = path.join(root, 'Imported', safeFolder, path.dirname(path.relative(sourceFolder, source)));
        }
        await ensureSafeFolder(root, destinationFolder);
        const destination = await withUniqueName(destinationFolder, name);
        await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
        imported.push(path.relative(root, destination));
      } catch (error) {
        failures.push({ name, ...failure(error) });
      }
    }
    return { imported: imported.length, skipped: failures.length + unsupported, unsupported, files: imported, failures };
  }

  async function renameInPlace(file, nextAbsolute) {
    await moveNoOverwrite(file.absolute, nextAbsolute);
    return path.relative(file.root, nextAbsolute);
  }

  async function toggleMod(relativePath) {
    const file = await resolveMod(relativePath);
    const type = modType(file.absolute);
    const newPath = await renameInPlace(file, toggledName(file.absolute, !type.enabled));
    await remapCatalogPaths(file.root, [[file.relative, newPath]]).catch(() => {});
    return { oldPath: file.relative, newPath, enabled: !type.enabled };
  }

  async function renameMod(relativePath, newBaseName) {
    const file = await resolveMod(relativePath);
    const name = safeName(newBaseName, 'File name');
    const type = modType(file.absolute);
    const oldExtension = path.extname(file.absolute);
    const base = name.toLowerCase().endsWith(oldExtension.toLowerCase()) ? name.slice(0, -oldExtension.length) : name;
    safeName(base, 'File name');
    const nextAbsolute = path.join(path.dirname(file.absolute), `${base}${oldExtension}`);
    if (nextAbsolute === file.absolute) return { oldPath: file.relative, newPath: file.relative, enabled: type.enabled };
    if (samePath(nextAbsolute, file.absolute)) {
      // Case-only rename: go through a temporary name so Windows records the new capitalization.
      const temp = `${file.absolute}.${Date.now()}.renaming`;
      await assertFree(temp);
      await fs.rename(file.absolute, temp);
      await fs.rename(temp, nextAbsolute);
      const newPath = path.relative(file.root, nextAbsolute);
      await remapCatalogPaths(file.root, [[file.relative, newPath]]).catch(() => {});
      return { oldPath: file.relative, newPath, enabled: type.enabled };
    }
    const newPath = await renameInPlace(file, nextAbsolute);
    await remapCatalogPaths(file.root, [[file.relative, newPath]]).catch(() => {});
    return { oldPath: file.relative, newPath, enabled: type.enabled };
  }

  // Builds the list of moves for "Organize" without touching any file. Each entry is
  // { relativePath, folderName }; options choose whether subfolders are kept and how name clashes are handled.
  async function planOrganize(entries, options) {
    const items = stringList(entries, 'Files to organize');
    const { layout, duplicates, categoryFolders } = organizeOptions(options);
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const claimed = new Set(); // destinations already used by earlier moves in this plan (lower case)
    const planned = [];
    for (const [index, item] of items.entries()) {
      const source = typeof item?.relativePath === 'string' ? item.relativePath : '';
      try {
        const file = await resolveModInRoot(root, source, realRoot);
        const folder = safeName(item?.folderName, 'Category folder');
        if (folder.toLowerCase() === 'mods') throw new AppError('NAME_RESERVED', 'A folder named Mods cannot be created inside Mods.');
        const extension = path.extname(file.absolute).toLowerCase().replace(/off$/, '');
        const name = path.basename(file.absolute);
        let subfolders = [];
        let flattenedForGame = false;
        if (layout === 'keep') {
          subfolders = path.dirname(file.relative).split(path.sep).filter(part => part && part !== '.');
          // A file that already sits in a category folder keeps the path below it, not the old category name.
          if (subfolders.length && categoryFolders.has(subfolders[0].toLowerCase())) subfolders = subfolders.slice(1);
          if (1 + subfolders.length > (GAME_DEPTH_LIMIT[extension] ?? 5)) {
            subfolders = [];
            flattenedForGame = true;
          }
        }
        let destination = path.join(folder, ...subfolders, name);
        normalizeRelative(root, destination);
        if (samePath(path.join(root, destination), file.absolute)) {
          planned.push({ index, source: file.relative, destination: file.relative, status: 'unchanged' });
          continue;
        }
        let renamed = false;
        const taken = async candidate => claimed.has(candidate.toLowerCase()) || (await exists(path.join(root, candidate)));
        if (await taken(destination)) {
          if (duplicates === 'skip') {
            planned.push({ index, source: file.relative, destination, status: 'duplicate', code: 'DUPLICATE_SKIPPED' });
            continue;
          }
          const folderPart = path.dirname(destination);
          let candidate = destination;
          for (let number = 2; (await taken(candidate)) && number <= 10000; number++) candidate = path.join(folderPart, numberedName(name, number));
          if (await taken(candidate)) throw new AppError('NAME_CONFLICT', 'Could not find an unused file name.');
          destination = candidate;
          renamed = true;
        }
        claimed.add(destination.toLowerCase());
        planned.push({
          index,
          source: file.relative,
          destination,
          status: 'move',
          renamed,
          flattenedForGame,
          size: file.stat.size,
          mtimeMs: file.stat.mtimeMs
        });
      } catch (error) {
        planned.push({ index, source, destination: '', status: 'error', ...failure(error) });
      }
    }
    const id = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    organizePlan = { id, root, items: planned };
    const count = status => planned.filter(item => item.status === status).length;
    return {
      planId: id,
      layout,
      duplicates,
      items: planned.map(({ size, mtimeMs, ...item }) => item),
      counts: { move: count('move'), unchanged: count('unchanged'), duplicate: count('duplicate'), error: count('error'), renamed: planned.filter(item => item.renamed).length }
    };
  }

  // Carries out the most recent plan exactly as previewed. Every file is checked again first: if it was moved,
  // changed or locked since the preview, or its destination name was taken meanwhile, it is left where it is.
  async function applyOrganize(planId) {
    if (activeOrganize) throw new AppError('ORGANIZE_IN_PROGRESS', 'Files are already being organized.');
    if (!organizePlan || organizePlan.id !== planId) throw new AppError('PLAN_EXPIRED', 'This preview is out of date. Open Organize again.');
    const plan = organizePlan;
    organizePlan = null;
    const token = { cancelled: false };
    activeOrganize = token;
    try {
      const root = await selectedRoot();
      if (!samePath(root, plan.root)) throw new AppError('PLAN_EXPIRED', 'The Mods folder changed since the preview.');
      const realRoot = await fs.realpath(root);
      const total = plan.items.filter(item => item.status === 'move').length;
      const readyFolders = new Set();
      const results = [];
      let done = 0;
      let moved = 0;
      let lastReport = 0;
      const progress = final => {
        const now = Date.now();
        if (!final && now - lastReport < 100) return;
        lastReport = now;
        reportOrganize({ done, total, moved, finished: final === true });
      };
      progress();
      for (const item of plan.items) {
        if (item.status === 'unchanged') {
          results.push({ oldPath: item.source, newPath: item.source, ok: true, unchanged: true });
          continue;
        }
        if (item.status !== 'move') {
          results.push({ oldPath: item.source, newPath: item.destination, ok: false, code: item.code || 'UNKNOWN', error: item.error || '' });
          continue;
        }
        if (token.cancelled) {
          results.push({ oldPath: item.source, newPath: item.destination, ok: false, code: 'CANCELLED', error: 'Stopped before this file was moved.' });
          continue;
        }
        try {
          const file = await resolveModInRoot(root, item.source, realRoot);
          if (file.stat.size !== item.size || file.stat.mtimeMs !== item.mtimeMs) {
            throw new AppError('CHANGED_SINCE_PREVIEW', 'This file changed after the preview, so it was left where it is.');
          }
          const target = normalizeRelative(root, item.destination);
          const folder = path.dirname(target.absolute);
          if (!readyFolders.has(folder.toLowerCase())) {
            await ensureSafeFolder(root, folder);
            readyFolders.add(folder.toLowerCase());
          }
          await moveNoOverwrite(file.absolute, target.absolute);
          results.push({ oldPath: item.source, newPath: target.relative, ok: true, moved: true, renamed: !!item.renamed });
          moved++;
        } catch (error) {
          results.push({ oldPath: item.source, newPath: item.destination, ...failure(error) });
        }
        done++;
        progress();
      }
      progress(true);
      const movedPairs = results.filter(item => item.ok && item.moved).map(item => [item.oldPath, item.newPath]);
      if (movedPairs.length) await remapCatalogPaths(root, movedPairs).catch(() => {});
      return {
        moved: movedPairs.length,
        unchanged: results.filter(item => item.unchanged).length,
        skipped: results.filter(item => !item.ok).length,
        cancelled: token.cancelled,
        results
      };
    } finally {
      activeOrganize = null;
    }
  }

  // One-step organize (no separate preview): kept for callers and tests that pass entries directly.
  async function organizeMods(entries, options) {
    const plan = await planOrganize(entries, options);
    return applyOrganize(plan.planId);
  }

  async function toggleMods(relativePaths, enabled) {
    const items = stringList(relativePaths, 'Files');
    const wantEnabled = enabled === true;
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    for (const relativePath of items) {
      try {
        const file = await resolveModInRoot(root, relativePath, realRoot);
        const type = modType(file.absolute);
        if (type.enabled === wantEnabled) {
          results.push({ oldPath: file.relative, newPath: file.relative, enabled: type.enabled, ok: true, unchanged: true });
          continue;
        }
        const newPath = await renameInPlace(file, toggledName(file.absolute, wantEnabled));
        results.push({ oldPath: file.relative, newPath, enabled: wantEnabled, ok: true });
      } catch (error) {
        results.push({ oldPath: typeof relativePath === 'string' ? relativePath : '', ...failure(error) });
      }
    }
    const changedPairs = results.filter(item => item.ok && !item.unchanged).map(item => [item.oldPath, item.newPath]);
    if (changedPairs.length) await remapCatalogPaths(root, changedPairs).catch(() => {});
    return {
      changed: results.filter(item => item.ok && !item.unchanged).length,
      skipped: results.filter(item => !item.ok).length,
      results
    };
  }

  function requireRecycleBin() {
    if (!shell?.trashItem) throw new AppError('RECYCLE_BIN_UNAVAILABLE', 'Windows Recycle Bin support is unavailable.');
  }

  async function trashMods(relativePaths) {
    const items = stringList(relativePaths, 'Files');
    requireRecycleBin();
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    for (const relativePath of items) {
      try {
        const file = await resolveModInRoot(root, relativePath, realRoot);
        await shell.trashItem(file.absolute);
        results.push({ relativePath: file.relative, ok: true });
      } catch (error) {
        results.push({ relativePath: typeof relativePath === 'string' ? relativePath : '', ...failure(error) });
      }
    }
    return { deleted: results.filter(item => item.ok).length, skipped: results.filter(item => !item.ok).length, results };
  }

  async function trashMod(relativePath) {
    requireRecycleBin();
    const file = await resolveMod(relativePath);
    await shell.trashItem(file.absolute);
    return { relativePath: file.relative };
  }

  async function loadCatalog() {
    const root = await selectedRoot();
    const store = await readCatalogStore();
    return normalizeCatalog(store.roots[root.toLowerCase()]);
  }

  // Not async on purpose: the write is counted as pending the moment it is requested, so quitting waits for it.
  function saveCatalog(input) {
    const rootRequest = selectedRoot();
    rootRequest.catch(() => {});
    const catalog = normalizeCatalog(input);
    return queueCatalogWrite(async () => {
      const key = (await rootRequest).toLowerCase();
      const store = await readCatalogStore();
      store.version = 1;
      store.roots[key] = catalog;
      await writeCatalogStore(store);
      return { saved: true, files: Object.keys(catalog.files).length };
    });
  }

  async function createCategoryFolders(folderNames) {
    const names = stringList(folderNames, 'Category folders').slice(0, 500);
    const root = await selectedRoot();
    const created = [];
    const seen = new Set();
    for (const value of names) {
      const name = safeName(value, 'Category folder');
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      if (name.toLowerCase() === 'mods') throw new AppError('NAME_RESERVED', 'A folder named Mods cannot be created inside Mods.');
      await ensureSafeFolder(root, path.join(root, name));
      created.push(name);
    }
    return { created: created.length, folders: created };
  }

  return {
    selectedRoot,
    scan,
    cancel: () => {
      if (activeScan) activeScan.cancelled = true;
    },
    isScanning: () => !!activeScan,
    importMods,
    toggleMod,
    renameMod,
    organizeMods,
    planOrganize,
    applyOrganize,
    cancelOrganize: () => {
      if (activeOrganize) activeOrganize.cancelled = true;
    },
    isOrganizing: () => !!activeOrganize,
    toggleMods,
    trashMod,
    trashMods,
    loadCatalog,
    saveCatalog,
    createCategoryFolders,
    hasPendingWrites: () => pendingCatalogWrites > 0,
    whenIdle: () => catalogWriteQueue
  };
}

module.exports = { createModsService, modType, normalizeCatalog, relativeDepth, safeName, pathIsInside, moveNoOverwrite };
