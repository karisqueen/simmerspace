const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simmerSpace', Object.freeze({
  loadRoutes: () => ipcRenderer.invoke('settings:load-routes'),
  saveRoutes: routes => ipcRenderer.invoke('settings:save-routes', routes),
  chooseFolder: id => ipcRenderer.invoke('folders:choose', id),
  scanMods: () => ipcRenderer.invoke('folders:scan-mods'),
  cancelModsScan: () => ipcRenderer.send('folders:cancel-scan'),
  onScanProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('folders:scan-progress', listener);
    return () => ipcRenderer.removeListener('folders:scan-progress', listener);
  }
}));
