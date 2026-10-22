/* Local settings (folder locations) stored in the app's userData folder. */
const fs = require('node:fs/promises');
const path = require('node:path');

const ROUTE_IDS = Object.freeze(['mods', 'documents', 'game', 's4s']);

function isRouteId(value) {
  return typeof value === 'string' && ROUTE_IDS.includes(value);
}

// Keep only well-formed route records; anything else in an older or hand-edited file is ignored.
function normalizeRoutes(input) {
  const routes = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return routes;
  for (const id of ROUTE_IDS) {
    const record = input[id];
    if (!record || typeof record !== 'object') continue;
    const folder = record.path;
    if (typeof folder !== 'string' || !folder.trim() || folder.length > 1024 || folder.includes('\0') || !path.isAbsolute(folder)) {
      continue;
    }
    routes[id] = {
      id,
      path: folder,
      name: typeof record.name === 'string' && record.name ? record.name.slice(0, 260) : path.basename(folder) || folder,
      updated: Number.isFinite(record.updated) ? record.updated : 0
    };
  }
  return routes;
}

function createSettingsStore({ getUserDataPath }) {
  let writeQueue = Promise.resolve();
  const file = () => path.join(getUserDataPath(), 'settings.json');

  async function load() {
    try {
      const data = JSON.parse(await fs.readFile(file(), 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  // Writes are serialized and atomic (temp file + rename) so a crash cannot leave half a file.
  function update(changes) {
    const next = writeQueue.then(async () => {
      const target = file();
      await fs.mkdir(path.dirname(target), { recursive: true });
      const merged = { ...(await load()), ...changes };
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temp, JSON.stringify(merged, null, 2), 'utf8');
      await fs.rename(temp, target);
      return merged;
    });
    writeQueue = next.catch(() => {});
    return next;
  }

  async function loadRoutes() {
    return normalizeRoutes((await load()).routes);
  }

  async function saveRoute(id, folderPath) {
    if (!isRouteId(id)) throw new Error('Unknown folder setting.');
    const routes = await loadRoutes();
    routes[id] = { id, path: folderPath, name: path.basename(folderPath) || folderPath, updated: Date.now() };
    await update({ routes: normalizeRoutes(routes) });
    return routes[id];
  }

  return { load, update, loadRoutes, saveRoute, whenIdle: () => writeQueue };
}

module.exports = { createSettingsStore, normalizeRoutes, isRouteId, ROUTE_IDS };
