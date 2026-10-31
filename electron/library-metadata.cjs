/* The library's memory of each file, kept apart from the game files in the app's user-data folder (updates never
   touch it). Every file gets a stable id, its SHA-256, the name it arrived with and where it came from, plus a copy
   of its tags. Paths change; contents do not: when a file is renamed or moved, even outside SimmerSpace, its hash
   reconnects it to its tags and preview. Nothing is ever written into a .package or .ts4script.
   Rules: the file is replaced atomically, the previous good copy is kept as a backup, and a store that cannot be
   read is set aside and never overwritten. A file whose contents changed under a new name is treated as a new file:
   metadata only follows an exact hash match with a file that disappeared. */
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const STORE_FILE = 'library-metadata.json';
const BACKUP_FILE = 'library-metadata.backup.json';
const HASH_CONCURRENCY = 3;
const STAT_BATCH = 64;
const SAVE_EVERY = 500;
const MISSING_KEEP_MS = 365 * 24 * 60 * 60 * 1000; // a file gone for a year no longer keeps its entry
const TAG_KEYS = ['categoryId', 'creatorId', 'gender', 'age'];

function sha256File(file, token) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file, { highWaterMark: 1024 * 1024 });
    stream.on('data', chunk => {
      if (token?.cancelled) stream.destroy(new Error('cancelled'));
      else hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// The name without the "off" SimmerSpace adds to disabled files, so turning a file off is not a rename.
function activeName(name) {
  return String(name).replace(/\.(package|ts4script)off$/i, '.$1');
}

function createLibraryMetadata({ userDataPath, now = Date.now, hashFile = sha256File }) {
  const file = () => path.join(userDataPath(), STORE_FILE);
  const backup = () => path.join(userDataPath(), BACKUP_FILE);
  let store = null;
  let writing = Promise.resolve();
  let dirty = false;

  async function parse(target) {
    const data = JSON.parse(await fs.readFile(target, 'utf8'));
    if (!data || typeof data !== 'object' || typeof data.roots !== 'object' || !data.roots) throw new Error('not a metadata store');
    return data;
  }

  async function load() {
    if (store) return store;
    try {
      store = await parse(file());
    } catch (error) {
      if (error.code === 'ENOENT') {
        store = { version: 1, roots: {} };
      } else {
        // Keep the unreadable file for inspection and fall back on the last good copy.
        await fs.rename(file(), `${file()}.unreadable-${now()}`).catch(() => {});
        store = await parse(backup()).catch(() => ({ version: 1, roots: {} }));
      }
    }
    return store;
  }

  function persist() {
    dirty = false;
    const snapshot = JSON.stringify(store);
    const next = writing.then(async () => {
      const target = file();
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(target, backup()).catch(() => {});
      const temp = `${target}.${process.pid}.${now()}.tmp`;
      await fs.writeFile(temp, snapshot, 'utf8');
      await fs.rename(temp, target);
    });
    writing = next.catch(() => {});
    return next;
  }

  async function rootEntries(root) {
    const data = await load();
    const key = root.toLowerCase();
    data.roots[key] ||= { entries: {} };
    return data.roots[key].entries;
  }

  function create(relativePath, fields = {}) {
    return {
      id: crypto.randomUUID(),
      path: relativePath,
      originalName: activeName(path.basename(relativePath)),
      originalKnown: false,
      firstSeen: new Date(now()).toISOString(),
      sha256: '',
      size: 0,
      mtimeMs: 0,
      source: null,
      preview: '',
      tags: null,
      missingSince: 0,
      ...fields
    };
  }

  const byPath = entries => new Map(Object.values(entries).map(entry => [entry.path.toLowerCase(), entry]));

  // Brings the store in line with a scan. Files whose size and date are unchanged keep their known hash, so only the
  // first run reads everything. Returns the path changes found, which the caller applies to the tag catalog.
  async function reconcile(root, files, { token = {}, onProgress = () => {}, installed = [] } = {}) {
    const entries = await rootEntries(root);
    const known = byPath(entries);
    const stamp = now();
    const scanned = new Set(files.map(item => item.relativePath.toLowerCase()));

    const stats = new Map();
    for (let start = 0; start < files.length && !token.cancelled; start += STAT_BATCH) {
      await Promise.all(
        files.slice(start, start + STAT_BATCH).map(async item => {
          const stat = await fs.stat(path.join(root, item.relativePath)).catch(() => null);
          if (stat) stats.set(item.relativePath, stat);
        })
      );
    }

    const queue = files.filter(item => {
      const stat = stats.get(item.relativePath);
      const entry = known.get(item.relativePath.toLowerCase());
      return stat && !(entry?.sha256 && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs);
    });
    const total = queue.length;
    let done = 0;
    let sinceSave = 0;
    const hashes = new Map();
    onProgress({ done, total });
    const worker = async () => {
      while (queue.length && !token.cancelled) {
        const item = queue.shift();
        try {
          hashes.set(item.relativePath, await hashFile(path.join(root, item.relativePath), token));
        } catch {}
        done++;
        if (done % 25 === 0 || done === total) onProgress({ done, total });
      }
    };
    await Promise.all(Array.from({ length: HASH_CONCURRENCY }, worker));

    // Entries whose file disappeared, by content: only these can be claimed by a file with a new path.
    const orphans = new Map();
    for (const entry of Object.values(entries)) {
      if (scanned.has(entry.path.toLowerCase()) || !entry.sha256) continue;
      orphans.set(entry.sha256, [...(orphans.get(entry.sha256) || []), entry]);
    }

    const moved = [];
    for (const item of files) {
      const stat = stats.get(item.relativePath);
      if (!stat) continue;
      const hash = hashes.get(item.relativePath);
      let entry = known.get(item.relativePath.toLowerCase());
      if (!entry && hash && orphans.get(hash)?.length) {
        entry = orphans.get(hash).shift();
        moved.push([entry.path, item.relativePath]);
        known.delete(entry.path.toLowerCase());
        entry.path = item.relativePath;
        known.set(item.relativePath.toLowerCase(), entry);
      }
      if (!entry) {
        entry = create(item.relativePath);
        entries[entry.id] = entry;
        known.set(item.relativePath.toLowerCase(), entry);
      }
      if (hash) entry.sha256 = hash;
      if (hash || !entry.size) {
        entry.size = stat.size;
        entry.mtimeMs = stat.mtimeMs;
      }
      entry.missingSince = 0;
      if (++sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        await persist().catch(() => {});
      }
    }

    // Files SimmerSpace installed before this store existed: the install log recorded the name they arrived with.
    for (const item of installed) {
      for (const relative of Array.isArray(item.files) ? item.files : []) {
        const entry = known.get(String(relative).toLowerCase());
        if (!entry) continue;
        entry.source ||= { modId: item.modId, fileId: item.fileId, name: item.name || '', logo: item.logo || '' };
        if (!entry.originalKnown) {
          entry.originalName = activeName(path.basename(relative));
          entry.originalKnown = true;
        }
      }
    }

    if (!token.cancelled) {
      for (const entry of Object.values(entries)) {
        if (scanned.has(entry.path.toLowerCase())) continue;
        entry.missingSince ||= stamp;
        if (stamp - entry.missingSince > MISSING_KEEP_MS) delete entries[entry.id];
      }
    }
    await persist();
    return { moved, hashed: hashes.size, cancelled: !!token.cancelled };
  }

  // Called when SimmerSpace itself installs a file: the name it arrives with is captured here, for good.
  async function register(root, files, source) {
    const entries = await rootEntries(root);
    const known = byPath(entries);
    for (const item of files) {
      const stat = await fs.stat(path.join(root, item.relativePath)).catch(() => null);
      const entry = known.get(item.relativePath.toLowerCase()) || create(item.relativePath);
      entries[entry.id] = entry;
      Object.assign(entry, { sha256: item.sha256 || entry.sha256, size: stat?.size || 0, mtimeMs: stat?.mtimeMs || 0, originalName: item.originalName, originalKnown: true, source, missingSince: 0 });
    }
    return persist();
  }

  async function movePaths(root, pairs) {
    const entries = await rootEntries(root);
    const known = byPath(entries);
    let changed = false;
    for (const [from, to] of pairs) {
      const entry = known.get(String(from).toLowerCase());
      if (!entry || from === to) continue;
      entry.path = to;
      const stat = await fs.stat(path.join(root, to)).catch(() => null);
      if (stat) entry.mtimeMs = stat.mtimeMs;
      changed = true;
    }
    if (changed) await persist();
  }

  async function forget(root, relativePaths) {
    const entries = await rootEntries(root);
    const known = byPath(entries);
    const removed = [];
    for (const relative of relativePaths) {
      const entry = known.get(String(relative).toLowerCase());
      if (!entry) continue;
      delete entries[entry.id];
      removed.push(entry);
    }
    if (removed.length) await persist();
    return removed;
  }

  // Tags are copied here each time they are saved, so a damaged tag catalog can be rebuilt from this store.
  async function snapshotTags(root, catalogFiles) {
    const entries = await rootEntries(root);
    const known = byPath(entries);
    dirty = false;
    for (const entry of known.values()) {
      const tags = catalogFiles[entry.path] || null;
      if (JSON.stringify(tags) !== JSON.stringify(entry.tags)) {
        entry.tags = tags;
        dirty = true;
      }
    }
    if (dirty) await persist();
  }

  // Tags saved here for files the catalog has lost.
  async function recoverTags(root, catalogFiles) {
    const entries = await rootEntries(root);
    const recovered = {};
    for (const entry of Object.values(entries)) {
      if (!entry.missingSince && entry.tags && !catalogFiles[entry.path]) recovered[entry.path] = entry.tags;
    }
    return recovered;
  }

  // What the page needs per file: { relativePath: { id, preview, originalName, originalKnown, source } }.
  async function summary(root) {
    const entries = await rootEntries(root);
    const result = {};
    for (const entry of Object.values(entries)) {
      if (entry.missingSince) continue;
      result[entry.path] = { id: entry.id, preview: entry.preview, originalName: entry.originalName, originalKnown: entry.originalKnown, source: entry.source, sha256: entry.sha256, size: entry.size };
    }
    return result;
  }

  async function entryById(root, id) {
    return (await rootEntries(root))[id] || null;
  }
  async function entries(root) {
    return Object.values(await rootEntries(root));
  }
  async function setPreview(root, id, preview) {
    const entry = (await rootEntries(root))[id];
    if (!entry) return null;
    entry.preview = preview;
    await persist();
    return entry;
  }

  return { load, reconcile, register, movePaths, forget, snapshotTags, recoverTags, summary, entryById, entries, setPreview, whenIdle: () => writing };
}

module.exports = { createLibraryMetadata, sha256File, activeName, TAG_KEYS };
