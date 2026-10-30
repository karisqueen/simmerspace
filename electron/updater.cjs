/* App updates for the installed Windows build, from the project's GitHub releases (electron-updater).
   Nothing happens without the player's say: the page asks before downloading and again before restarting to
   install. Portable copies and copies run from source cannot replace themselves, so they report 'unsupported'. */
const { AppError } = require('./errors.cjs');

// Sorts an updater failure into what the player can act on. Only this kind leaves the main process: the raw
// message can contain URLs and file paths.
//   offline     no connection to GitHub
//   no-release  GitHub answered but has no normal release with latest.yml (for example only a pre-release)
//   verify      the download did not match its checksum or signature
//   download    the file could not be downloaded or saved
//   unknown     anything else
function classifyUpdateError(error, phase = 'check') {
  const text = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  if (/enotfound|eai_again|econnrefused|econnreset|etimedout|err_internet_disconnected|err_name_not_resolved|err_network|err_connection|err_proxy|socket hang up|net::err_timed_out/.test(text)) return 'offline';
  if (/sha512|checksum|signature|not signed|publisher/.test(text)) return 'verify';
  if (/\b404\b|latest\.yml|cannot find channel|unable to find latest version|no published versions|httperror: 406|cannot parse releases feed/.test(text)) return 'no-release';
  return phase === 'download' ? 'download' : 'unknown';
}

function createUpdater({ supported, currentVersion, send = () => {}, loadUpdater = () => require('electron-updater').autoUpdater }) {
  let state = { status: supported ? 'idle' : 'unsupported', currentVersion, version: '', percent: 0, error: '', errorKind: '', checkedAt: '' };
  let phase = 'check';
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
    updater.on('checking-for-update', () => set({ status: 'checking', error: '', errorKind: '' }));
    updater.on('update-available', info => set({ status: 'available', version: String(info?.version || ''), percent: 0, checkedAt: new Date().toISOString() }));
    updater.on('update-not-available', () => set({ status: 'current', version: '', checkedAt: new Date().toISOString() }));
    updater.on('download-progress', progress => set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))) }));
    updater.on('update-downloaded', info => set({ status: 'ready', version: String(info?.version || state.version), percent: 100 }));
    // The updater's own messages can include URLs and paths; the page only needs to know it failed.
    updater.on('error', error => set({ status: 'error', error: 'UPDATE_FAILED', errorKind: classifyUpdateError(error, phase) }));
    return updater;
  }

  async function run(task) {
    try {
      await task();
    } catch (error) {
      set({ status: 'error', error: 'UPDATE_FAILED', errorKind: classifyUpdateError(error, phase) });
    }
    return { ...state };
  }

  return {
    state: () => ({ ...state }),
    async check() {
      const u = instance();
      if (['checking', 'downloading', 'ready'].includes(state.status)) return { ...state };
      phase = 'check';
      return run(async () => {
        const result = await u.checkForUpdates();
        // electron-updater can resolve without an event when it skips the check (for example in development).
        if (state.status === 'checking' && !result) set({ status: 'error', error: 'UPDATE_FAILED', errorKind: 'unknown' });
      });
    },
    async download() {
      const u = instance();
      if (!['available', 'error'].includes(state.status) || !state.version) throw new AppError('UPDATE_NOT_AVAILABLE', 'There is no update to download.');
      phase = 'download';
      set({ status: 'downloading', percent: 0, error: '', errorKind: '' });
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

module.exports = { createUpdater, classifyUpdateError };
