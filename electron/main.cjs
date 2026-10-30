const { app, BrowserWindow, dialog, ipcMain, nativeImage, safeStorage, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createModsService } = require('./mods-service.cjs');
const { createSettingsStore, ROUTE_IDS } = require('./settings-store.cjs');
const { createIpc, validators } = require('./ipc.cjs');
const { AppError } = require('./errors.cjs');
const { loadAppConfig, describeConfig } = require('./app-config.cjs');
const { createCurseForgeService } = require('./curseforge-service.cjs');
const { createAccountService } = require('./account-service.cjs');
const { createGameLauncher } = require('./game-launcher.cjs');
const { moveNoOverwrite } = require('./mods-service.cjs');

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

// Integration diagnostics are for developers only: start with SIMMERSPACE_DEV=1 or --developer to see them.
const DEV_MODE = process.env.SIMMERSPACE_DEV === '1' || process.argv.includes('--developer');
// A copy run from source may keep its development keys in the git-ignored .env.local; packaged builds never read it.
const getConfig = () => loadAppConfig({ userDataPath: app.getPath('userData'), devEnvFile: app.isPackaged ? '' : path.join(__dirname, '..', '.env.local') });
const account = createAccountService({
  getConfig,
  userDataPath: () => app.getPath('userData'),
  safeStorage,
  onChange: status => sendToPage('account:changed', status)
});
const curseforge = createCurseForgeService({
  getConfig,
  getProxyToken: () => account.proxyToken(),
  userDataPath: () => app.getPath('userData'),
  getModsRoot: () => modsService.selectedRoot(),
  moveNoOverwrite,
  trashItem: file => shell.trashItem(file)
});
const gameLauncher = createGameLauncher({
  getGameFolder: async () => (await settings.loadRoutes()).game?.path,
  openPath: file => shell.openPath(file)
});

async function integrationStatus() {
  const summary = describeConfig(await getConfig());
  const basic = { curseforge: { configured: summary.curseforge.configured }, supabase: { configured: summary.supabase.configured } };
  return DEV_MODE ? { ...basic, developer: { ...summary, curseforgeStats: curseforge.diagnostics() } } : basic;
}

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
ipc.handle('app:info', validators.none, () => ({ version: APP_VERSION, platform: process.platform, developer: DEV_MODE }));
ipc.handle('app:set-window-background', validators.string, async color => {
  if (/^#[0-9a-f]{6}$/i.test(color)) await settings.update({ windowBackground: color });
  return true;
});
ipc.handle('integrations:status', validators.none, integrationStatus);
ipc.handle('integrations:open-config-folder', validators.none, async () => {
  if (!DEV_MODE) throw new AppError('FORBIDDEN', 'Developer tools are turned off.');
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  return !(await shell.openPath(app.getPath('userData')));
});
ipc.handle('game:launch', validators.none, () => gameLauncher.launch());
// Collection cover (added in 0.7.1): the chosen image is shrunk to a JPEG thumbnail before it reaches the page.
const COVER_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
ipc.handle('collections:choose-cover', validators.none, async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose a collection cover', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  if (!COVER_TYPES.has(path.extname(file).toLowerCase())) throw new AppError('COVER_UNSUPPORTED', 'Choose a PNG, JPG or WebP image.');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 15 * 1024 * 1024) throw new AppError('COVER_TOO_LARGE', 'Choose an image smaller than 15 MB.');
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new AppError('COVER_UNREADABLE', 'The selected image could not be read.');
  const size = image.getSize();
  const scale = Math.min(1, 720 / size.width, 480 / size.height);
  const thumbnail = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'good' }).toJPEG(78);
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
});
ipc.handle('cf:test', validators.none, () => curseforge.testConnection());
ipc.handle('cf:classes', validators.none, () => curseforge.classes());
ipc.handle('cf:categories', validators.id, classId => curseforge.categories(classId));
ipc.handle('cf:search', validators.optionalObject, options => curseforge.search(options));
ipc.handle('cf:creators', validators.optionalObject, options => curseforge.popularCreators(options));
ipc.handle('cf:details', validators.id, modId => curseforge.details(modId));
ipc.handle('cf:files', validators.idAndObject, (modId, options) => curseforge.files(modId, options));
ipc.handle('cf:install', validators.twoIdsAndObject, (modId, fileId, options) => curseforge.install(modId, fileId, { replacePrevious: options.replacePrevious === true }));
ipc.handle('cf:installs', validators.none, () => curseforge.installs());
ipc.handle('cf:check-updates', validators.none, () => curseforge.checkUpdates());
ipc.handle('account:status', validators.none, () => account.status());
ipc.handle('account:sign-up', validators.object, input => account.signUp(input));
ipc.handle('account:verify-email', validators.object, input => account.verifyEmail(input));
ipc.handle('account:sign-in', validators.object, input => account.signIn(input));
ipc.handle('account:sign-out', validators.none, () => account.signOut());
ipc.handle('account:request-reset', validators.object, input => account.requestPasswordReset(input));
ipc.handle('account:complete-reset', validators.object, input => account.completePasswordReset(input));
ipc.handle('account:update-profile', validators.object, input => account.updateProfile(input));
ipc.handle('account:pull', validators.none, () => account.pullData());
ipc.handle('account:push', validators.object, input => account.pushData(input));
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

async function createWindow() {
  const saved = await settings.load();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 760,
    minHeight: 620,
    title: `SimmerSpace ${APP_VERSION}`,
    icon: path.join(__dirname, '..', 'renderer', 'brand', 'app-icon.png'),
    // The last theme's background, so dark themes do not flash light while the page loads.
    backgroundColor: /^#[0-9a-f]{6}$/i.test(saved.windowBackground || '') ? saved.windowBackground : '#f6f5fa',
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
