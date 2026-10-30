/* The renderer's only bridge to the desktop. Every call returns { ok, value } or { ok: false, error: { code, message } }. */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld(
  'simmerSpace',
  Object.freeze({
    appInfo: invoke('app:info'),
    loadRoutes: invoke('settings:load-routes'),
    chooseFolder: invoke('folders:choose'),
    setWindowBackground: invoke('app:set-window-background'),
    integrationStatus: invoke('integrations:status'),
    openConfigFolder: invoke('integrations:open-config-folder'),
    launchGame: invoke('game:launch'),
    chooseCoverImage: invoke('collections:choose-cover'),
    curseforge: Object.freeze({
      test: invoke('cf:test'),
      classes: invoke('cf:classes'),
      categories: invoke('cf:categories'),
      search: invoke('cf:search'),
      details: invoke('cf:details'),
      files: invoke('cf:files'),
      install: invoke('cf:install'),
      installs: invoke('cf:installs'),
      checkUpdates: invoke('cf:check-updates')
    }),
    account: Object.freeze({
      status: invoke('account:status'),
      signUp: invoke('account:sign-up'),
      verifyEmail: invoke('account:verify-email'),
      signIn: invoke('account:sign-in'),
      signOut: invoke('account:sign-out'),
      requestReset: invoke('account:request-reset'),
      completeReset: invoke('account:complete-reset'),
      updateProfile: invoke('account:update-profile'),
      pull: invoke('account:pull'),
      push: invoke('account:push'),
      onChange: callback => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on('account:changed', listener);
        return () => ipcRenderer.removeListener('account:changed', listener);
      }
    }),
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
