const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

const MOD_TYPES = new Map([
  ['.package', { extension: '.package', enabled: true }],
  ['.packageoff', { extension: '.package', enabled: false }],
  ['.ts4script', { extension: '.ts4script', enabled: true }],
  ['.ts4scriptoff', { extension: '.ts4script', enabled: false }]
]);
const INVALID_WINDOWS_NAME = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;

function modType(fileName) {
  return MOD_TYPES.get(path.extname(fileName).toLowerCase()) || null;
}

function safeName(value, label = 'Name') {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`);
  const name = value.trim();
  if (!name || name === '.' || name === '..' || name.length > 180 || INVALID_WINDOWS_NAME.test(name) || /[. ]$/.test(name) || RESERVED_WINDOWS_NAME.test(name)) {
    throw new Error(`${label} contains characters Windows cannot use.`);
  }
  return name;
}

function normalizeRelative(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || path.isAbsolute(value)) {
    throw new Error('Invalid mod file path.');
  }
  const relative = path.normalize(value);
  const parts = relative.split(path.sep);
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid mod file path.');
  const absolute = path.resolve(root, relative);
  const rootPrefix = `${path.resolve(root)}${path.sep}`.toLowerCase();
  if (!absolute.toLowerCase().startsWith(rootPrefix)) throw new Error('The file must stay inside the selected Mods folder.');
  return { relative, absolute };
}

function pathIsInside(parent, candidate) {
  const base = path.resolve(parent).toLowerCase();
  const full = path.resolve(candidate).toLowerCase();
  return full === base || full.startsWith(`${base}${path.sep.toLowerCase()}`);
}

function relativeDepth(relative) {
  return relative.split(/[\\/]/).filter(Boolean).length - 1;
}

function normalizeCatalog(input) {
  const source = input && typeof input === 'object' ? input : {};
  const files = Object.create(null);
  if (source.files && typeof source.files === 'object' && !Array.isArray(source.files)) {
    for (const [relativePath, raw] of Object.entries(source.files).slice(0, 100000)) {
      if (!raw || typeof raw !== 'object') continue;
      const tags = {};
      for (const key of ['categoryId', 'creatorId', 'gender', 'age']) {
        if (typeof raw[key] === 'string' && raw[key].length <= 180) tags[key] = raw[key];
      }
      if (Object.keys(tags).length) files[relativePath] = tags;
    }
  }
  const cleanList = (value, limit) => Array.isArray(value)
    ? value.slice(0, limit).flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 100 || typeof item.name !== 'string') return [];
      const name = item.name.trim().slice(0, 120);
      return name ? [{ id: item.id, name }] : [];
    })
    : [];
  const folderNames = Object.create(null);
  if (source.folderNames && typeof source.folderNames === 'object' && !Array.isArray(source.folderNames)) {
    for (const [id, value] of Object.entries(source.folderNames).slice(0, 500)) {
      if (typeof value !== 'string') continue;
      try { folderNames[id] = safeName(value, 'Folder name'); } catch {}
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

function createModsService({ app, dialog, shell, getModsRoot, getWindow = () => undefined, report = () => {} }) {
  let cancelScan = false;
  let catalogWriteQueue = Promise.resolve();
  const catalogFile = () => path.join(app.getPath('userData'), 'mods-catalog.json');

  async function selectedRoot() {
    const root = await getModsRoot();
    if (typeof root !== 'string' || !root.trim()) throw new Error('Choose your Mods folder in Settings first.');
    const absolute = path.resolve(root);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isDirectory()) throw new Error('The selected Mods folder is unavailable. Check its path in Settings.');
    return absolute;
  }

  async function readCatalogStore() {
    try {
      const store = JSON.parse(await fs.readFile(catalogFile(), 'utf8'));
      return store && store.roots && typeof store.roots === 'object' ? store : { version: 1, roots: {} };
    } catch { return { version: 1, roots: {} }; }
  }

  async function writeCatalogStore(store) {
    const file = catalogFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(store), 'utf8');
    await fs.rename(temp, file);
  }

  function queueCatalogWrite(operation) {
    const next = catalogWriteQueue.then(operation);
    catalogWriteQueue = next.catch(() => {});
    return next;
  }

  async function scan() {
    const root = await selectedRoot();
    const stack = [{ absolute: root, relative: '' }];
    const files = [];
    let visited = 0;
    let unreadableFolders = 0;
    cancelScan = false;
    while (stack.length && !cancelScan) {
      const current = stack.pop();
      let entries;
      try { entries = await fs.readdir(current.absolute, { withFileTypes: true }); }
      catch { unreadableFolders++; continue; }
      for (const entry of entries) {
        if (cancelScan) break;
        visited++;
        const relativePath = current.relative ? path.join(current.relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
          stack.push({ absolute: path.join(current.absolute, entry.name), relative: relativePath });
        } else if (entry.isFile()) {
          const type = modType(entry.name);
          if (type) files.push({
            name: entry.name,
            relativePath,
            extension: type.extension.slice(1),
            enabled: type.enabled,
            depth: relativeDepth(relativePath)
          });
        }
        if (visited % 1000 === 0) {
          report({ visited, found: files.length, unreadableFolders });
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
    return { files, visited, unreadableFolders, cancelled: cancelScan };
  }

  async function resolveModInRoot(root, relativePath, canonicalRoot = null) {
    const target = normalizeRelative(root, relativePath);
    const stat = await fs.lstat(target.absolute).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || !modType(target.absolute)) throw new Error('This is not a supported Sims 4 mod file.');
    const realRoot = canonicalRoot || await fs.realpath(root);
    const realTarget = await fs.realpath(target.absolute);
    if (!pathIsInside(realRoot, realTarget)) throw new Error('The file resolves outside the selected Mods folder.');
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
      try { await fs.access(absolute); } catch { return absolute; }
    }
    throw new Error('Could not find an unused file name.');
  }

  async function ensureSafeFolder(root, folderPath) {
    const realRoot = await fs.realpath(root);
    if (path.resolve(folderPath).toLowerCase() === path.resolve(root).toLowerCase()) return root;
    const relative = path.relative(root, folderPath);
    const target = normalizeRelative(root, relative);
    await fs.mkdir(target.absolute, { recursive: true });
    const stat = await fs.lstat(target.absolute);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('A category folder cannot be a symbolic link.');
    const realFolder = await fs.realpath(target.absolute);
    if (!pathIsInside(realRoot, realFolder)) throw new Error('The destination folder resolves outside the selected Mods folder.');
    return target.absolute;
  }

  async function importMods(kind) {
    if (!['files', 'folder'].includes(kind)) throw new Error('Choose files or a folder to import.');
    const root = await selectedRoot();
    const options = kind === 'folder'
      ? { title: 'Choose a folder containing Sims 4 mods', properties: ['openDirectory'] }
      : { title: 'Choose Sims 4 mod files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Sims 4 mods', extensions: ['package', 'ts4script', 'packageoff', 'ts4scriptoff'] }] };
    const result = await dialog.showOpenDialog(getWindow(), options);
    if (result.canceled || !result.filePaths?.length) return { imported: 0, skipped: 0, files: [] };

    let sources = [];
    let sourceFolder = null;
    if (kind === 'files') {
      sources = result.filePaths.filter(file => !!modType(file));
    } else {
      sourceFolder = path.resolve(result.filePaths[0]);
      if (pathIsInside(root, sourceFolder) || pathIsInside(sourceFolder, root)) throw new Error('Choose an import folder outside the selected Mods folder.');
      const stack = [sourceFolder];
      while (stack.length) {
        const current = stack.pop();
        let entries;
        try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
          const absolute = path.join(current, entry.name);
          if (entry.isDirectory()) stack.push(absolute);
          else if (entry.isFile() && modType(entry.name)) sources.push(absolute);
        }
      }
    }

    const imported = [];
    let skipped = 0;
    for (const source of sources) {
      const sourceStat = await fs.lstat(source).catch(() => null);
      if (!sourceStat?.isFile() || sourceStat.isSymbolicLink() || pathIsInside(root, source)) { skipped++; continue; }
      let destinationFolder = root;
      if (sourceFolder) {
        const safeFolder = safeName(path.basename(sourceFolder), 'Folder name');
        const internal = path.relative(sourceFolder, source);
        destinationFolder = path.join(root, 'Imported', safeFolder, path.dirname(internal));
      }
      try { await ensureSafeFolder(root, destinationFolder); }
      catch { skipped++; continue; }
      const destination = await withUniqueName(destinationFolder, path.basename(source));
      try { await fs.copyFile(source, destination, constants.COPYFILE_EXCL); }
      catch (error) { if (error.code === 'EEXIST') { skipped++; continue; } throw error; }
      imported.push(path.relative(root, destination));
    }
    return { imported: imported.length, skipped, files: imported };
  }

  async function toggleMod(relativePath) {
    const file = await resolveMod(relativePath);
    const type = modType(file.absolute);
    const nextName = type.enabled ? `${file.absolute}off` : file.absolute.slice(0, -3);
    try { await fs.access(nextName); throw new Error('A file with the destination name already exists; nothing was changed.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(file.absolute, nextName);
    return { oldPath: file.relative, newPath: path.relative(file.root, nextName), enabled: !type.enabled };
  }

  async function renameMod(relativePath, newBaseName) {
    const file = await resolveMod(relativePath);
    const name = safeName(newBaseName, 'File name');
    const type = modType(file.absolute);
    const lower = name.toLowerCase();
    const oldExtension = path.extname(file.absolute);
    const isCompatibleExtension = lower.endsWith(oldExtension);
    const base = isCompatibleExtension ? name.slice(0, -oldExtension.length) : name;
    safeName(base, 'File name');
    const nextName = path.join(path.dirname(file.absolute), `${base}${oldExtension}`);
    if (nextName.toLowerCase() === file.absolute.toLowerCase()) return { oldPath: file.relative, newPath: file.relative };
    try { await fs.access(nextName); throw new Error('A file with the destination name already exists; nothing was changed.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(file.absolute, nextName);
    return { oldPath: file.relative, newPath: path.relative(file.root, nextName), enabled: type.enabled };
  }

  async function organizeMods(entries) {
    if (!Array.isArray(entries)) throw new Error('Choose mod files to organize.');
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    const madeFolders = new Set();
    for (const item of entries.slice(0, 30000)) {
      try {
        const file = await resolveModInRoot(root, item?.relativePath, realRoot);
        const folder = safeName(item?.folderName, 'Category folder');
        if (folder.toLowerCase() === 'mods') throw new Error('A folder named Mods cannot be created inside Mods.');
        const destinationFolder = path.join(root, folder);
        const destination = path.join(destinationFolder, path.basename(file.absolute));
        if (destination.toLowerCase() === file.absolute.toLowerCase()) {
          results.push({ oldPath: file.relative, newPath: file.relative, ok: true, unchanged: true });
          continue;
        }
        try { await fs.access(destination); throw new Error('A file with the same name already exists in that category folder.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!madeFolders.has(folder)) {
          await ensureSafeFolder(root, destinationFolder);
          madeFolders.add(folder);
        }
        await fs.rename(file.absolute, destination);
        results.push({ oldPath: file.relative, newPath: path.relative(root, destination), ok: true });
      } catch (error) {
        results.push({ oldPath: item?.relativePath || '', ok: false, error: error.message });
      }
    }
    return { moved: results.filter(item => item.ok && !item.unchanged).length, skipped: results.filter(item => !item.ok).length, results };
  }

  async function toggleMods(relativePaths, enabled) {
    if (!Array.isArray(relativePaths)) throw new Error('Choose mod files first.');
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    for (const relativePath of relativePaths.slice(0, 30000)) {
      try {
        const file = await resolveModInRoot(root, relativePath, realRoot);
        const type = modType(file.absolute);
        if (type.enabled === !!enabled) {
          results.push({ oldPath: file.relative, newPath: file.relative, enabled: type.enabled, ok: true, unchanged: true });
          continue;
        }
        const nextName = enabled ? file.absolute.slice(0, -3) : `${file.absolute}off`;
        try { await fs.access(nextName); throw new Error('A file with the destination name already exists; nothing was changed.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await fs.rename(file.absolute, nextName);
        results.push({ oldPath: file.relative, newPath: path.relative(root, nextName), enabled: !!enabled, ok: true });
      } catch (error) {
        results.push({ oldPath: relativePath, ok: false, error: error.message });
      }
    }
    return { changed: results.filter(item => item.ok && !item.unchanged).length, skipped: results.filter(item => !item.ok).length, results };
  }

  async function trashMods(relativePaths) {
    if (!Array.isArray(relativePaths)) throw new Error('Choose mod files first.');
    if (!shell?.trashItem) throw new Error('Windows Recycle Bin support is unavailable.');
    const root = await selectedRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    for (const relativePath of relativePaths.slice(0, 30000)) {
      try {
        const file = await resolveModInRoot(root, relativePath, realRoot);
        await shell.trashItem(file.absolute);
        results.push({ relativePath: file.relative, ok: true });
      } catch (error) {
        results.push({ relativePath, ok: false, error: error.message });
      }
    }
    return { deleted: results.filter(item => item.ok).length, skipped: results.filter(item => !item.ok).length, results };
  }

  async function trashMod(relativePath) {
    const file = await resolveMod(relativePath);
    if (!shell?.trashItem) throw new Error('Windows Recycle Bin support is unavailable.');
    await shell.trashItem(file.absolute);
    return { relativePath: file.relative };
  }

  async function loadCatalog() {
    const root = await selectedRoot();
    const store = await readCatalogStore();
    const key = path.resolve(root).toLowerCase();
    return normalizeCatalog(store.roots[key]);
  }

  async function saveCatalog(input) {
    const root = await selectedRoot();
    const key = path.resolve(root).toLowerCase();
    const catalog = normalizeCatalog(input);
    return queueCatalogWrite(async () => {
      const store = await readCatalogStore();
      store.version = 1;
      store.roots[key] = catalog;
      await writeCatalogStore(store);
      return { saved: true, files: Object.keys(catalog.files).length };
    });
  }

  async function createCategoryFolders(folderNames) {
    const root = await selectedRoot();
    if (!Array.isArray(folderNames)) throw new Error('Choose category folders first.');
    const created = [];
    for (const value of [...new Set(folderNames)].slice(0, 500)) {
      const name = safeName(value, 'Category folder');
      if (name.toLowerCase() === 'mods') throw new Error('A folder named Mods cannot be created inside Mods.');
      await ensureSafeFolder(root, path.join(root, name));
      created.push(name);
    }
    return { created: created.length, folders: created };
  }

  return {
    scan,
    cancel: () => { cancelScan = true; },
    importMods,
    toggleMod,
    renameMod,
    organizeMods,
    toggleMods,
    trashMod,
    trashMods,
    loadCatalog,
    saveCatalog,
    createCategoryFolders
  };
}

module.exports = { createModsService, modType, normalizeCatalog, relativeDepth, safeName };
