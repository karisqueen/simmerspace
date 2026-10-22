const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simmerSpace', Object.freeze({
  loadRoutes: () => ipcRenderer.invoke('settings:load-routes'),
  saveRoutes: routes => ipcRenderer.invoke('settings:save-routes', routes),
  chooseFolder: id => ipcRenderer.invoke('folders:choose', id),
  scanMods: () => ipcRenderer.invoke('folders:scan-mods'),
  cancelModsScan: () => ipcRenderer.send('folders:cancel-scan'),
  manageMods: Object.freeze({
    scan: () => ipcRenderer.invoke('mods:scan'),
    cancelScan: () => ipcRenderer.send('mods:cancel-scan'),
    loadCatalog: () => ipcRenderer.invoke('mods:load-catalog'),
    saveCatalog: catalog => ipcRenderer.invoke('mods:save-catalog', catalog),
    importFiles: () => ipcRenderer.invoke('mods:import', 'files'),
    importFolder: () => ipcRenderer.invoke('mods:import', 'folder'),
    toggle: relativePath => ipcRenderer.invoke('mods:toggle', relativePath),
    toggleMany: (relativePaths, enabled) => ipcRenderer.invoke('mods:toggle-many', relativePaths, enabled),
    rename: (relativePath, newBaseName) => ipcRenderer.invoke('mods:rename', relativePath, newBaseName),
    organize: entries => ipcRenderer.invoke('mods:organize', entries),
    trash: relativePath => ipcRenderer.invoke('mods:trash', relativePath),
    trashMany: relativePaths => ipcRenderer.invoke('mods:trash-many', relativePaths),
    createFolders: folderNames => ipcRenderer.invoke('mods:create-folders', folderNames),
    onProgress: callback => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('mods:scan-progress', listener);
      return () => ipcRenderer.removeListener('mods:scan-progress', listener);
    }
  }),
  onScanProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('folders:scan-progress', listener);
    return () => ipcRenderer.removeListener('folders:scan-progress', listener);
  }
}));
