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
    isGameRunning: invoke('game:is-running'),
    chooseCoverImage: invoke('collections:choose-cover'),
    updates: Object.freeze({
      state: invoke('update:state'),
      check: invoke('update:check'),
      download: invoke('update:download'),
      install: invoke('update:install'),
      onChange: callback => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('update:changed', listener);
        return () => ipcRenderer.removeListener('update:changed', listener);
      }
    }),
    curseforge: Object.freeze({
      test: invoke('cf:test'),
      classes: invoke('cf:classes'),
      categories: invoke('cf:categories'),
      search: invoke('cf:search'),
      creators: invoke('cf:creators'),
      details: invoke('cf:details'),
      files: invoke('cf:files'),
      install: invoke('cf:install'),
      installs: invoke('cf:installs'),
      checkUpdates: invoke('cf:check-updates')
    }),
    account: Object.freeze({
      status: invoke('account:status'),
      signUp: invoke('account:sign-up'),
      signIn: invoke('account:sign-in'),
      signOut: invoke('account:sign-out'),
      requestReset: invoke('account:request-reset'),
      completeReset: invoke('account:complete-reset'),
      checkUsername: invoke('account:check-username'),
      checkConfirmation: invoke('account:check-confirmation'),
      updateProfile: invoke('account:update-profile'),
      uploadAvatar: invoke('account:upload-avatar'),
      removeAvatar: invoke('account:remove-avatar'),
      sendFeedback: invoke('account:send-feedback'),
      onChange: callback => {
        const listener = (_event, status) => callback(status);
        ipcRenderer.on('account:changed', listener);
        return () => ipcRenderer.removeListener('account:changed', listener);
      }
    }),
    inspiration: Object.freeze({
      list: invoke('inspiration:list'),
      profile: invoke('inspiration:profile'),
      create: invoke('inspiration:create'),
      remove: invoke('inspiration:delete'),
      get: invoke('inspiration:get'),
      update: invoke('inspiration:update'),
      suggestTags: invoke('inspiration:suggest-tags'),
      follow: invoke('community:follow'),
      unfollow: invoke('community:unfollow'),
      follows: invoke('community:follows'),
      boards: invoke('boards:list'),
      createBoard: invoke('boards:create'),
      updateBoard: invoke('boards:update'),
      deleteBoard: invoke('boards:delete'),
      boardPosts: invoke('boards:posts'),
      savePost: invoke('boards:save'),
      unsavePost: invoke('boards:unsave'),
      comments: invoke('comments:list'),
      addComment: invoke('comments:add'),
      editComment: invoke('comments:edit'),
      deleteComment: invoke('comments:delete')
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
