/* App updates for the installed Windows build, from the project's GitHub releases (electron-updater).
   Nothing happens without the player's say: the page asks before downloading and again before restarting to
   install. Portable copies and copies run from source cannot replace themselves, so they report 'unsupported'. */
const { AppError } = require('./errors.cjs');

function createUpdater({ supported, currentVersion, send = () => {}, loadUpdater = () => require('electron-updater').autoUpdater }) {
  let state = { status: supported ? 'idle' : 'unsupported', currentVersion, version: '', percent: 0, error: '' };
  let updater = null;

  function set(next) {
    state = { ...state, ...next };
    send({ ...state });
  }

  function instance() {
    if (!supported) throw new AppError('UPDATE_UNSUPPORTED', 'This copy of SimmerSpace cannot update itself.');
    if (updater) return updater;
    updater = loadUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
    updater.on('update-available', info => set({ status: 'available', version: String(info?.version || ''), percent: 0 }));
    updater.on('update-not-available', () => set({ status: 'current', version: '' }));
    updater.on('download-progress', progress => set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))) }));
    updater.on('update-downloaded', info => set({ status: 'ready', version: String(info?.version || state.version), percent: 100 }));
    // The updater's own messages can include URLs and paths; the page only needs to know it failed.
    updater.on('error', () => set({ status: 'error', error: 'UPDATE_FAILED' }));
    return updater;
  }

  async function run(task) {
    try {
      await task();
    } catch {
      set({ status: 'error', error: 'UPDATE_FAILED' });
    }
    return { ...state };
  }

  return {
    state: () => ({ ...state }),
    async check() {
      const u = instance();
      if (['checking', 'downloading', 'ready'].includes(state.status)) return { ...state };
      return run(() => u.checkForUpdates());
    },
    async download() {
      const u = instance();
      if (!['available', 'error'].includes(state.status) || !state.version) throw new AppError('UPDATE_NOT_AVAILABLE', 'There is no update to download.');
      set({ status: 'downloading', percent: 0, error: '' });
      return run(() => u.downloadUpdate());
    },
    install() {
      const u = instance();
      if (state.status !== 'ready') throw new AppError('UPDATE_NOT_READY', 'The update has not finished downloading.');
      // Silent install, then SimmerSpace opens again on the new version.
      setImmediate(() => u.quitAndInstall(true, true));
      return { ...state };
    }
  };
}

module.exports = { createUpdater };
