/* Library Care: duplicate, empty-folder and stray-file scans, permanent deletion, restoring original file names and
   local preview images. Scans only read. Deleting is limited to what the latest scan found and the player selected;
   there is no recycle bin or recovery here, by design, and folders are only removed when they are still empty. */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');
const { modType, pathIsInside, moveNoOverwrite } = require('./mods-service.cjs');
const { activeName } = require('./library-metadata.cjs');

const PREVIEW_FOLDER = 'library-previews';
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_ID = /^[0-9a-f-]{36}$/i;
const YIELD_EVERY = 500;

// Why a file outside the game's own formats is in the list, and what to do about it. Unknown extensions fall through
// to "unrecognized". Anything that could be part of a mod is "review", never "unnecessary".
const FILE_KINDS = [
  { kind: 'unnecessary', reason: 'temporary', extensions: ['.tmp', '.temp', '.part', '.crdownload', '.download', '.bak', '.old', '.log', '.dmp'] },
  { kind: 'unnecessary', reason: 'system', names: ['thumbs.db', 'desktop.ini', '.ds_store'] },
  { kind: 'unnecessary', reason: 'installer', extensions: ['.exe', '.msi', '.bat', '.cmd', '.lnk', '.url'] },
  { kind: 'unnecessary', reason: 'document', extensions: ['.txt', '.md', '.rtf', '.pdf', '.doc', '.docx', '.htm', '.html'] },
  { kind: 'unnecessary', reason: 'image', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'] },
  { kind: 'review', reason: 'archive', extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
  { kind: 'review', reason: 'modSupport', extensions: ['.cfg', '.ini', '.json', '.xml', '.py', '.pyc', '.pyo', '.dll', '.sims3pack', '.trayitem', '.blueprint', '.householdbinary', '.hhi', '.sgi', '.bpi', '.room', '.rmi'] }
];
// Files with the game's formats whose first bytes do not match need a look: they will not load.
const MAGIC = { '.package': ['DBPF'], '.ts4script': ['PK'] };

function classify(name) {
  const lower = name.toLowerCase();
  if (lower === 'resource.cfg') return { kind: 'recognized', reason: 'gameConfig' };
  const extension = path.extname(lower);
  for (const rule of FILE_KINDS) {
    if (rule.names?.includes(lower) || rule.extensions?.includes(extension)) return { kind: rule.kind, reason: rule.reason };
  }
  return { kind: 'unrecognized', reason: 'unknownType' };
}

async function readMagic(file, length) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.toString('latin1', 0, bytesRead);
  } finally {
    await handle.close();
  }
}

function createLibraryTools({ getRoot, metadata, userDataPath, onPathsChanged = async () => {}, onDeleted = async () => {}, report = () => {}, moveFile = moveNoOverwrite }) {
  // Paths the latest scan of each kind found. Deleting anything else is refused.
  const findings = { files: new Set(), folders: new Set() };
  let active = null;

  async function track(work) {
    if (active) throw new AppError('TOOL_BUSY', 'Another scan is running.');
    const token = { cancelled: false };
    active = token;
    try {
      return await work(token);
    } finally {
      active = null;
    }
  }
  function remember(kind, list) {
    findings[kind] = new Set(list.map(item => item.toLowerCase()));
  }

  // Lists everything under the Mods folder without following links or junctions. Yields so nothing freezes.
  async function walk(root, token) {
    const files = [];
    const folders = [];
    const stack = [''];
    let visited = 0;
    while (stack.length && !token.cancelled) {
      const relative = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
      } catch {
        folders.push({ relative, unreadable: true, entries: 1 });
        continue;
      }
      const record = { relative, unreadable: false, entries: entries.length, subfolders: [] };
      folders.push(record);
      for (const entry of entries) {
        const child = relative ? path.join(relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
          stack.push(child);
          record.subfolders.push(child);
        } else {
          files.push({ relative: child, name: entry.name, regular: entry.isFile() });
        }
        if (++visited % YIELD_EVERY === 0) {
          report({ tool: 'walk', visited });
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
    return { files, folders };
  }

  // Exact duplicates share a SHA-256; files that only share a name are listed apart as "possible".
  async function findDuplicates() {
    return track(async token => {
      const root = await getRoot();
      const known = await metadata.entries(root);
      const { files } = await walk(root, token);
      const present = new Map(files.filter(file => file.regular && modType(file.name)).map(file => [file.relative.toLowerCase(), file]));
      const records = known.filter(entry => !entry.missingSince && present.has(entry.path.toLowerCase()));
      const describe = entry => ({ relativePath: entry.path, name: path.basename(entry.path), size: entry.size, source: entry.source?.name || '', originalName: entry.originalName });
      const byHash = new Map();
      const byName = new Map();
      for (const entry of records) {
        if (entry.sha256) byHash.set(entry.sha256, [...(byHash.get(entry.sha256) || []), entry]);
        const name = activeName(path.basename(entry.path)).toLowerCase();
        byName.set(name, [...(byName.get(name) || []), entry]);
      }
      const exact = [...byHash.entries()].filter(([, list]) => list.length > 1).map(([hash, list]) => ({ hash, size: list[0].size, files: list.map(describe) }));
      const possible = [...byName.entries()]
        .filter(([, list]) => list.length > 1 && new Set(list.map(entry => entry.sha256)).size > 1)
        .map(([name, list]) => ({ name, files: list.map(describe) }));
      const order = (a, b) => b.files.length - a.files.length;
      remember('files', [...exact, ...possible].flatMap(group => group.files.map(item => item.relativePath)));
      return { exact: exact.sort(order), possible: possible.sort(order), checked: records.length, unhashed: present.size - records.filter(entry => entry.sha256).length, cancelled: token.cancelled };
    });
  }

  // A folder is empty when it holds no files at all (hidden ones count) and only empty folders.
  async function findEmptyFolders() {
    return track(async token => {
      const root = await getRoot();
      const { files, folders } = await walk(root, token);
      const byPath = new Map(folders.map(folder => [folder.relative.toLowerCase(), folder]));
      const hasFile = new Set();
      for (const file of files) {
        let parent = path.dirname(file.relative);
        for (;;) {
          hasFile.add((parent === '.' ? '' : parent).toLowerCase());
          if (parent === '.' || !parent) break;
          parent = path.dirname(parent);
        }
      }
      const blocked = new Set();
      for (const folder of folders) {
        if (!folder.unreadable) continue;
        let parent = folder.relative;
        for (;;) {
          blocked.add(parent.toLowerCase());
          if (!parent) break;
          parent = path.dirname(parent) === '.' ? '' : path.dirname(parent);
        }
      }
      const empty = folders
        .filter(folder => folder.relative && !folder.unreadable && !hasFile.has(folder.relative.toLowerCase()) && !blocked.has(folder.relative.toLowerCase()) && byPath.has(folder.relative.toLowerCase()))
        .map(folder => folder.relative)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      remember('folders', empty);
      return { folders: empty, checked: folders.length, cancelled: token.cancelled };
    });
  }

  // Sorts everything that is not plainly Sims 4 content into three groups. Nothing here is deleted automatically.
  async function findStrayFiles() {
    return track(async token => {
      const root = await getRoot();
      const { files } = await walk(root, token);
      const groups = { unnecessary: [], unrecognized: [], review: [] };
      let recognized = 0;
      let index = 0;
      for (const file of files) {
        if (token.cancelled) break;
        if (++index % YIELD_EVERY === 0) {
          report({ tool: 'stray', done: index, total: files.length });
          await new Promise(resolve => setImmediate(resolve));
        }
        const absolute = path.join(root, file.relative);
        const type = modType(file.name);
        let verdict = null;
        if (type) {
          const [magic] = MAGIC[type.extension];
          const head = await readMagic(absolute, magic.length).catch(() => '');
          verdict = head === magic ? { kind: 'recognized' } : { kind: 'review', reason: 'damaged' };
        } else if (!file.regular) verdict = { kind: 'review', reason: 'link' };
        else verdict = classify(file.name);
        if (verdict.kind === 'recognized') {
          recognized++;
          continue;
        }
        const stat = await fs.lstat(absolute).catch(() => null);
        groups[verdict.kind].push({ relativePath: file.relative, name: file.name, extension: path.extname(file.name).toLowerCase(), size: stat?.size || 0, reason: verdict.reason });
      }
      remember('files', [...groups.unnecessary, ...groups.unrecognized, ...groups.review].map(item => item.relativePath));
      return { ...groups, recognized, checked: files.length, cancelled: token.cancelled };
    });
  }

  // Permanently deletes exactly what was selected from the latest scan and reports each item's outcome.
  async function deletePermanently({ files = [], folders = [] } = {}) {
    if (!Array.isArray(files) || !Array.isArray(folders)) throw new AppError('INVALID_INPUT', 'A list was expected.');
    const root = await getRoot();
    const realRoot = await fs.realpath(root);
    const results = [];
    const inside = async relative => {
      if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new AppError('INVALID_PATH', 'Invalid path.');
      const absolute = path.resolve(root, relative);
      if (!pathIsInside(root, absolute) || path.resolve(root) === absolute) throw new AppError('OUTSIDE_ROOT', 'That path is outside the Mods folder.');
      const parent = await fs.realpath(path.dirname(absolute));
      if (!pathIsInside(realRoot, parent)) throw new AppError('OUTSIDE_ROOT', 'That path is outside the Mods folder.');
      return absolute;
    };
    for (const relative of files) {
      try {
        if (!findings.files.has(String(relative).toLowerCase())) throw new AppError('NOT_IN_SCAN', 'Scan again before deleting this file.');
        const absolute = await inside(relative);
        const stat = await fs.lstat(absolute);
        if (stat.isDirectory()) throw new AppError('NOT_A_FILE', 'This is a folder, not a file.');
        await fs.unlink(absolute);
        findings.files.delete(relative.toLowerCase());
        results.push({ kind: 'file', relativePath: relative, ok: true, size: stat.size });
      } catch (error) {
        results.push({ kind: 'file', relativePath: String(relative), ok: false, code: error instanceof AppError ? error.code : error.code === 'ENOENT' ? 'NOT_FOUND' : error.code === 'EBUSY' || error.code === 'EPERM' ? 'FILE_LOCKED' : 'UNKNOWN' });
      }
    }
    // Deepest first, so a parent is empty by the time its turn comes. rmdir refuses anything that is not empty.
    for (const relative of [...folders].sort((a, b) => String(b).length - String(a).length)) {
      try {
        if (!findings.folders.has(String(relative).toLowerCase())) throw new AppError('NOT_IN_SCAN', 'Scan again before deleting this folder.');
        const absolute = await inside(relative);
        const stat = await fs.lstat(absolute);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AppError('NOT_A_FOLDER', 'This is not a folder.');
        await fs.rmdir(absolute);
        findings.folders.delete(relative.toLowerCase());
        results.push({ kind: 'folder', relativePath: relative, ok: true, size: 0 });
      } catch (error) {
        results.push({ kind: 'folder', relativePath: String(relative), ok: false, code: error instanceof AppError ? error.code : error.code === 'ENOTEMPTY' ? 'FOLDER_NOT_EMPTY' : error.code === 'ENOENT' ? 'NOT_FOUND' : 'UNKNOWN' });
      }
    }
    const deletedFiles = results.filter(item => item.ok && item.kind === 'file').map(item => item.relativePath);
    if (deletedFiles.length) {
      const removed = await metadata.forget(root, deletedFiles);
      await Promise.all(removed.filter(entry => entry.preview).map(entry => fs.unlink(previewPath(entry.preview.split('?')[0])).catch(() => {})));
      await onDeleted(root, deletedFiles);
    }
    return { deleted: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length, freed: results.reduce((sum, item) => sum + (item.ok ? item.size : 0), 0), results };
  }

  /* ---------- Original names ---------- */
  async function originalNameStatus(relativePath) {
    const root = await getRoot();
    const entry = (await metadata.entries(root)).find(item => item.path.toLowerCase() === String(relativePath).toLowerCase());
    if (!entry?.originalKnown) return { known: false, current: path.basename(relativePath), original: '' };
    const disabled = /off$/i.test(path.extname(relativePath));
    const original = `${entry.originalName}${disabled ? 'off' : ''}`;
    const destination = path.join(path.dirname(relativePath), original);
    const taken = destination.toLowerCase() !== relativePath.toLowerCase() && !!(await fs.lstat(path.join(root, destination)).catch(() => null));
    return { known: true, current: path.basename(relativePath), original, same: original === path.basename(relativePath), taken };
  }

  async function restoreOriginalName(relativePath) {
    const root = await getRoot();
    const status = await originalNameStatus(relativePath);
    if (!status.known) throw new AppError('ORIGINAL_NAME_UNKNOWN', 'The original name of this file was not recorded.');
    if (status.same) return { oldPath: relativePath, newPath: relativePath, changed: false };
    if (status.taken) throw new AppError('NAME_CONFLICT', 'A file with the original name already exists there; nothing was changed.');
    const newPath = path.join(path.dirname(relativePath), status.original);
    const source = path.join(root, relativePath);
    if (!pathIsInside(root, source) || !modType(path.basename(source))) throw new AppError('NOT_A_MOD', 'This is not a supported Sims 4 mod file.');
    await moveFile(source, path.join(root, newPath));
    await onPathsChanged(root, [[relativePath, newPath]]);
    return { oldPath: relativePath, newPath, changed: true };
  }

  /* ---------- Preview images (local only) ---------- */
  const previewFolder = () => path.join(userDataPath(), PREVIEW_FOLDER);
  const previewPath = name => path.join(previewFolder(), path.basename(name));

  // `data` is a JPEG the page prepared from the picked image. The original image is left where it was.
  async function savePreview(relativePath, data) {
    if (!ArrayBuffer.isView(data) || !data.byteLength) throw new AppError('INVALID_INPUT', 'An image was expected.');
    if (data.byteLength > PREVIEW_MAX_BYTES) throw new AppError('IMAGE_TOO_LARGE', 'The image is too large.');
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new AppError('IMAGE_TYPE', 'This image type is not supported.');
    const root = await getRoot();
    const entry = (await metadata.entries(root)).find(item => item.path.toLowerCase() === String(relativePath).toLowerCase());
    if (!entry) throw new AppError('LIBRARY_NOT_READY', 'Scan the library first.');
    await fs.mkdir(previewFolder(), { recursive: true });
    const name = `${entry.id}.jpg`;
    const temp = path.join(previewFolder(), `${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, previewPath(name));
    const preview = `${name}?v=${Date.now()}`;
    await metadata.setPreview(root, entry.id, preview);
    return { id: entry.id, preview };
  }
  async function removePreview(relativePath) {
    const root = await getRoot();
    const entry = (await metadata.entries(root)).find(item => item.path.toLowerCase() === String(relativePath).toLowerCase());
    if (!entry?.preview) return { removed: false };
    await fs.unlink(previewPath(entry.preview.split('?')[0])).catch(() => {});
    await metadata.setPreview(root, entry.id, '');
    return { removed: true };
  }
  // The file behind a simmer-preview:// address, or '' when the name is not one of ours.
  function previewFile(id) {
    return PREVIEW_ID.test(id) ? path.join(previewFolder(), `${id}.jpg`) : '';
  }

  return {
    findDuplicates,
    findEmptyFolders,
    findStrayFiles,
    deletePermanently,
    originalNameStatus,
    restoreOriginalName,
    savePreview,
    removePreview,
    previewFile,
    cancel: () => {
      if (active) active.cancelled = true;
    }
  };
}

module.exports = { createLibraryTools, classify };
