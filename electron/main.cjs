const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createModsService } = require('./mods-service.cjs');
const { createSettingsStore, ROUTE_IDS } = require('./settings-store.cjs');
const { createIpc, validators } = require('./ipc.cjs');

const APP_VERSION = app.getVersion();
const INDEX_FILE = path.join(__dirname, '..', 'renderer', 'index.html');

// True only for the bundled index.html (any #hash allowed).
function isAppPage(url) {
  try {
    const target = new URL(url);
    return target.protocol === 'file:' && path.resolve(fileURLToPath(target)).toLowerCase() === path.resolve(INDEX_FILE).toLowerCase();
  } catch {
    return false;
  }
}

// Optional isolated profile for testing (e.g. SIMMERSPACE_PROFILE_DIR=C:\Temp\ss-test) so a test run
// never reads or writes the player's normal settings.
if (process.env.SIMMERSPACE_PROFILE_DIR) app.setPath('userData', path.resolve(process.env.SIMMERSPACE_PROFILE_DIR));

let mainWindow;
const settings = createSettingsStore({ getUserDataPath: () => app.getPath('userData') });
const modsService = createModsService({
  app,
  dialog,
  shell,
  getWindow: () => mainWindow,
  getModsRoot: async () => (await settings.loadRoutes()).mods?.path,
  report: progress => sendToPage('mods:scan-progress', progress),
  reportOrganize: progress => sendToPage('mods:organize-progress', progress)
});

function sendToPage(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

const defaultFolders = {
  mods: path.join(app.getPath('documents'), 'Electronic Arts', 'The Sims 4', 'Mods'),
  documents: path.join(app.getPath('documents'), 'Electronic Arts', 'The Sims 4'),
  game: [
    'C:\\Program Files\\EA Games\\The Sims 4',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\The Sims 4',
    'C:\\Program Files (x86)\\Origin Games\\The Sims 4'
  ],
  s4s: 'C:\\Program Files (x86)\\Sims 4 Studio'
};

// Closest existing folder to the usual location, used only as the dialog's starting point.
async function existingDefault(value) {
  for (const candidate of Array.isArray(value) ? value : [value]) {
    let current = candidate;
    while (current && current !== path.dirname(current)) {
      try {
        if ((await fs.stat(current)).isDirectory()) return current;
      } catch {}
      current = path.dirname(current);
    }
  }
  return app.getPath('documents');
}

// Folder locations are only ever saved from a folder the player picked in the system dialog.
async function chooseFolder(id) {
  const routes = await settings.loadRoutes();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for SimmerSpace',
    properties: ['openDirectory'],
    defaultPath: routes[id]?.path || (await existingDefault(defaultFolders[id]))
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return settings.saveRoute(id, result.filePaths[0]);
}

const ipc = createIpc({ ipcMain, isTrustedSender: isAppPage });
ipc.handle('app:info', validators.none, () => ({ version: APP_VERSION, platform: process.platform }));
ipc.handle('settings:load-routes', validators.none, () => settings.loadRoutes());
ipc.handle('folders:choose', validators.oneOf(ROUTE_IDS), chooseFolder);
ipc.handle('mods:scan', validators.none, () => modsService.scan());
ipc.on('mods:cancel-scan', () => modsService.cancel());
ipc.handle('mods:load-catalog', validators.none, () => modsService.loadCatalog());
ipc.handle('mods:save-catalog', validators.object, catalog => modsService.saveCatalog(catalog));
ipc.handle('mods:import', validators.oneOf(['files', 'folder']), kind => modsService.importMods(kind));
ipc.handle('mods:toggle', validators.string, relativePath => modsService.toggleMod(relativePath));
ipc.handle('mods:toggle-many', validators.listAndBoolean, (paths, enabled) => modsService.toggleMods(paths, enabled));
ipc.handle('mods:rename', validators.twoStrings, (relativePath, name) => modsService.renameMod(relativePath, name));
ipc.handle('mods:plan-organize', validators.listAndObject, (entries, options) => modsService.planOrganize(entries, options));
ipc.handle('mods:apply-organize', validators.string, planId => modsService.applyOrganize(planId));
ipc.on('mods:cancel-organize', () => modsService.cancelOrganize());
ipc.handle('mods:trash', validators.string, relativePath => modsService.trashMod(relativePath));
ipc.handle('mods:trash-many', validators.list, paths => modsService.trashMods(paths));
ipc.handle('mods:create-folders', validators.list, names => modsService.createCategoryFolders(names));

function openExternalSafely(url) {
  try {
    const target = new URL(url);
    if (target.protocol === 'https:') shell.openExternal(target.href);
  } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 760,
    minHeight: 620,
    title: `SimmerSpace ${APP_VERSION}`,
    backgroundColor: '#f7f3fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  // The window only ever shows the bundled page; links leave through the system browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppPage(url)) return;
    event.preventDefault();
    openExternalSafely(url);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadFile(INDEX_FILE);
}

if (!app.requestSingleInstanceLock()) {
  // A second copy would race the first one on the same settings and tag files.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Let pending tag/settings writes finish before the process exits.
let quitting = false;
app.on('before-quit', event => {
  if (quitting || (!modsService.hasPendingWrites() && !modsService.isOrganizing())) return;
  event.preventDefault();
  quitting = true;
  // Quitting mid-organize stops after the file being moved, then waits for the tag update.
  modsService.cancelOrganize();
  waitForOrganize()
    .then(() => Promise.all([modsService.whenIdle(), settings.whenIdle()]))
    .finally(() => app.quit());
});
async function waitForOrganize() {
  while (modsService.isOrganizing()) await new Promise(resolve => setTimeout(resolve, 50));
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
