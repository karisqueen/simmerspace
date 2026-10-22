/* The renderer's only bridge to the desktop. Every call returns { ok, value } or { ok: false, error: { code, message } }. */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld(
  'simmerSpace',
  Object.freeze({
    appInfo: invoke('app:info'),
    loadRoutes: invoke('settings:load-routes'),
    chooseFolder: invoke('folders:choose'),
    chooseCoverImage: invoke('collections:choose-cover'),
    launchGame: invoke('game:launch'),
    manageMods: Object.freeze({
      scan: invoke('mods:scan'),
      cancelScan: () => ipcRenderer.send('mods:cancel-scan'),
      loadCatalog: invoke('mods:load-catalog'),
      saveCatalog: invoke('mods:save-catalog'),
      importFiles: () => ipcRenderer.invoke('mods:import', 'files'),
      importFolder: () => ipcRenderer.invoke('mods:import', 'folder'),
      toggle: invoke('mods:toggle'),
      toggleMany: invoke('mods:toggle-many'),
      rename: invoke('mods:rename'),
      planOrganize: invoke('mods:plan-organize'),
      applyOrganize: invoke('mods:apply-organize'),
      cancelOrganize: () => ipcRenderer.send('mods:cancel-organize'),
      trash: invoke('mods:trash'),
      trashMany: invoke('mods:trash-many'),
      createFolders: invoke('mods:create-folders'),
      onOrganizeProgress: callback => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('mods:organize-progress', listener);
        return () => ipcRenderer.removeListener('mods:organize-progress', listener);
      },
      onProgress: callback => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('mods:scan-progress', listener);
        return () => ipcRenderer.removeListener('mods:scan-progress', listener);
      }
    })
  })
);
