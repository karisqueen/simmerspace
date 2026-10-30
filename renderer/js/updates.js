/* App updates (installed Windows build only; see electron/updater.cjs). SimmerSpace looks for a new version when
   it opens (unless turned off in Settings), asks before downloading it, and asks again before restarting to
   install it. Portable copies show where to download new versions instead. */
const updatesApi = desktop?.updates || null;
const SITE_URL = 'https://karisqueen.github.io/simmerspace/';
const updates = {
  state: null, // { status, currentVersion, version, percent, error }
  manual: false, // the last check came from the Settings button, so its result is shown
  asked: '' // the version the player was already asked about in this session
};

function updatesAutoCheck() {
  return safeRead('update-auto-check', true) !== false;
}

function updateStatusText() {
  const s = updates.state;
  if (!s || s.status === 'unsupported') return t('updateUnsupported');
  const values = { version: s.version || s.currentVersion, percent: s.percent };
  switch (s.status) {
    case 'checking':
      return t('updateChecking');
    case 'current':
      return format(t('updateCurrent'), { version: s.currentVersion });
    case 'available':
      return format(t('updateAvailableText'), values);
    case 'downloading':
      return format(t('updateDownloading'), values);
    case 'ready':
      return format(t('updateReadyText'), values);
    case 'error':
      return t('updateFailed');
    default:
      return format(t('updateIdle'), { version: s.currentVersion });
  }
}

function updateButtons() {
  const s = updates.state;
  if (!s || s.status === 'unsupported') return `<a class="secondary-btn" href="${SITE_URL}" target="_blank" rel="noopener noreferrer">${t('updateOpenPage')} ${icon('external')}</a>`;
  if (s.status === 'ready') return `<button class="primary-btn" id="update-install">${icon('refresh')}<span>${t('updateInstall')}</span></button>`;
  if (s.status === 'available' || (s.status === 'error' && s.version)) return `<button class="primary-btn" id="update-download">${icon('download')}<span>${t('updateDownload')}</span></button>`;
  const busy = s.status === 'checking' || s.status === 'downloading';
  return `<button class="secondary-btn" id="update-check" ${busy ? 'disabled' : ''}>${icon('updates')}<span>${t('updateCheck')}</span></button>`;
}

function updatesPanelBody() {
  const s = updates.state;
  const progress = s?.status === 'downloading' ? `<progress class="update-progress" max="100" value="${Number(s.percent) || 0}"></progress>` : '';
  const auto = s && s.status !== 'unsupported' ? `<label class="switch-row"><span><b>${t('updateAutoCheck')}</b><small>${t('updateAutoCheckNote')}</small></span><input type="checkbox" class="switch" id="pref-update-check" ${updatesAutoCheck() ? 'checked' : ''}></label>` : '';
  return `<p class="setting-help" role="status">${esc(updateStatusText())}</p>${progress}<div class="button-row">${updateButtons()}</div>${auto}`;
}

function updatesSettingsSection() {
  return `<div id="update-panel">${updatesPanelBody()}</div>`;
}

// Only the Settings panel is redrawn on progress, so the rest of the page keeps its focus and scroll.
function refreshUpdatesPanel() {
  const panel = document.getElementById('update-panel');
  if (panel && !panel.contains(document.activeElement)) panel.innerHTML = updatesPanelBody();
  else if (panel) {
    const status = panel.querySelector('[role="status"]');
    if (status) status.textContent = updateStatusText();
    const bar = panel.querySelector('.update-progress');
    if (bar) bar.value = Number(updates.state?.percent) || 0;
  }
}

function askToDownload() {
  const s = updates.state;
  updates.asked = s.version;
  openDialog(
    `${closeButton()}<div class="form-dialog confirm-dialog"><div class="eyebrow">${t('updateEyebrow')}</div><h2 id="dialog-title">${t('updateAvailableTitle')}</h2><p>${esc(format(t('updateAvailableBody'), { version: s.version, current: s.currentVersion }))}</p><div class="detail-actions"><button class="primary-btn" data-dialog-result="download">${icon('download')}<span>${t('updateDownload')}</span></button><button class="secondary-btn" data-close autofocus>${t('updateNotNow')}</button></div></div>`,
    { onClose: result => result === 'download' && downloadUpdate() }
  );
}

function askToInstall() {
  const s = updates.state;
  openDialog(
    `${closeButton()}<div class="form-dialog confirm-dialog"><div class="eyebrow">${t('updateEyebrow')}</div><h2 id="dialog-title">${t('updateReadyTitle')}</h2><p>${esc(format(t('updateReadyBody'), { version: s.version }))}</p><div class="detail-actions"><button class="primary-btn" data-dialog-result="install">${icon('refresh')}<span>${t('updateInstall')}</span></button><button class="secondary-btn" data-close autofocus>${t('updateLater')}</button></div></div>`,
    { onClose: result => result === 'install' && installUpdate() }
  );
}

async function checkForUpdates({ manual = false } = {}) {
  if (!updatesApi || updates.state?.status === 'unsupported') return;
  updates.manual = manual;
  try {
    updates.state = await callDesktop(updatesApi.check);
  } catch (error) {
    if (manual) toast(errorMessage(error), 'error');
  }
  refreshUpdatesPanel();
}

async function downloadUpdate() {
  try {
    toast(t('updateDownloadStarted'));
    updates.state = await callDesktop(updatesApi.download);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
  refreshUpdatesPanel();
}

async function installUpdate() {
  try {
    await callDesktop(updatesApi.install);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function onUpdateState(next) {
  const before = updates.state?.status;
  updates.state = next;
  refreshUpdatesPanel();
  if (next.status === before) return;
  // Ask only when no other dialog is open; otherwise the Settings panel still offers the next step.
  const free = overlay.hidden && accountUser();
  if (next.status === 'available' && next.version !== updates.asked && free) askToDownload();
  else if (next.status === 'ready' && free) askToInstall();
  else if (next.status === 'current' && updates.manual) toast(format(t('updateCurrent'), { version: next.currentVersion }));
  else if (next.status === 'error' && updates.manual) toast(t('updateFailed'), 'error');
}

async function startUpdates() {
  if (!updatesApi) return;
  updatesApi.onChange(onUpdateState);
  try {
    updates.state = await callDesktop(updatesApi.state);
  } catch {
    return;
  }
  refreshUpdatesPanel();
  if (updates.state.status !== 'unsupported' && updatesAutoCheck()) setTimeout(() => checkForUpdates(), 5000);
}

document.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.id === 'update-check') return checkForUpdates({ manual: true });
  if (target.id === 'update-download') return downloadUpdate();
  if (target.id === 'update-install') return askToInstall();
});
document.addEventListener('change', event => {
  if (event.target.id === 'pref-update-check') safeWrite('update-auto-check', event.target.checked);
});
