const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const APP_VERSION = '0.5.3';
let mainWindow;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); }
  catch { return {}; }
}
async function saveSettings(settings) {
  const file = settingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const current = await loadSettings();
  await fs.writeFile(file, JSON.stringify({ ...current, ...settings }, null, 2), 'utf8');
}
let cancelModsScan = false;
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
async function existingDefault(value) {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    let current = candidate;
    while (current && current !== path.dirname(current)) {
      try { if ((await fs.stat(current)).isDirectory()) return current; } catch {}
      current = path.dirname(current);
    }
  }
  return app.getPath('documents');
}

async function scanModsFolder(folder, report) {
  const stack = [{ absolute: folder, relative: '' }];
  const files = [];
  let visited = 0;
  let unreadableFolders = 0;
  cancelModsScan = false;
  while (stack.length && !cancelModsScan) {
    const current = stack.pop();
    let entries;
    try { entries = await fs.readdir(current.absolute, { withFileTypes: true }); }
    catch { unreadableFolders++; continue; }
    for (const entry of entries) {
      if (cancelModsScan) break;
      visited++;
      const relativePath = current.relative ? path.join(current.relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        stack.push({ absolute: path.join(current.absolute, entry.name), relative: relativePath });
      } else if (entry.isFile() && /\.(package|ts4script)$/i.test(entry.name)) {
        files.push({ name: entry.name, relativePath, extension: path.extname(entry.name).slice(1).toLowerCase() });
      }
      if (visited % 1000 === 0) {
        report({ visited, found: files.length, unreadableFolders });
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }
  return { files, visited, unreadableFolders, cancelled: cancelModsScan };
}

ipcMain.handle('settings:load-routes', async () => (await loadSettings()).routes || {});
ipcMain.handle('settings:save-routes', async (_event, routes) => {
  await saveSettings({ routes });
  return true;
});
ipcMain.handle('folders:choose', async (_event, id) => {
  const suggested = await existingDefault(defaultFolders[id]);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for SimmerSpace',
    properties: ['openDirectory'],
    defaultPath: suggested
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selectedPath = result.filePaths[0];
  return {
    id,
    path: selectedPath,
    name: path.basename(selectedPath) || selectedPath,
    updated: Date.now()
  };
});
ipcMain.handle('folders:scan-mods', async () => {
  const routes = (await loadSettings()).routes || {};
  const folder = routes.mods?.path;
  if (!folder) throw new Error('Choose your Mods folder in Settings first.');
  return scanModsFolder(folder, progress => mainWindow?.webContents.send('folders:scan-progress', progress));
});
ipcMain.on('folders:cancel-scan', () => { cancelModsScan = true; });

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
      sandbox: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
