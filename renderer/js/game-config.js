/* The Sims 4's own three settings, read from and written to the game's Options.ini by electron/sims4-config.cjs. The
   same panel appears when SimmerSpace opens, before launching the game, and in Settings. Nothing changes unless the
   player applies it, and continuing without changes is always one click. */
const gameConfigApi = desktop?.gameConfig || null;
const GAME_OPTIONS = ['showModList', 'modsEnabled', 'scriptMods'];
const gc = { data: null, draft: {}, busy: false, error: null, mode: 'settings', shownAtStart: false, loading: false };

function gcChanged() {
  return !!gc.data?.values && GAME_OPTIONS.some(name => gc.draft[name] !== gc.data.values[name]);
}
async function loadGameConfig() {
  if (!gameConfigApi || gc.loading) return;
  gc.loading = true;
  try {
    gc.data = await callDesktop(gameConfigApi.read);
    gc.draft = { ...(gc.data.values || {}) };
    gc.error = null;
  } catch (error) {
    gc.error = error;
  } finally {
    gc.loading = false;
    refreshGamePanel();
  }
}
function refreshGamePanel() {
  // Settings can be open behind the dialog: both show the same data.
  withFocusPreserved(() => document.querySelectorAll('.gc-panel').forEach(panel => (panel.innerHTML = gamePanelBody())));
}
function gameOptionRow(name) {
  return `<label class="switch-row"><span><b>${t(`gameOpt_${name}`)}</b><small>${t(`gameOpt_${name}Help`)}</small></span><input type="checkbox" class="switch" data-gc-option="${name}" ${gc.draft[name] ? 'checked' : ''} ${gc.busy || gc.data?.gameRunning ? 'disabled' : ''}></label>`;
}
function gamePanelActions() {
  const changed = gcChanged();
  const running = !!gc.data?.gameRunning;
  const ready = gc.data?.status === 'ready';
  if (gc.mode === 'launch') {
    const canApply = ready && changed && !running;
    return `<div class="detail-actions">${canApply ? `<button class="primary-btn" id="gc-apply" ${gc.busy ? 'disabled' : ''}>${t('gameConfigApplyLaunch')}</button>` : ''}<button class="${canApply ? 'secondary-btn' : 'primary-btn'}" id="gc-continue" ${canApply ? '' : 'autofocus'}>${t(canApply ? 'gameConfigLaunchNoChange' : 'launchGame')}</button><button class="tertiary-btn" data-close>${t('cancel')}</button></div>`;
  }
  const apply = ready ? `<button class="primary-btn" id="gc-apply" ${changed && !running && !gc.busy ? '' : 'disabled'}>${t('gameConfigApply')}</button>` : '';
  if (gc.mode === 'startup') return `<div class="detail-actions">${apply}<button class="secondary-btn" id="gc-continue" autofocus>${t('gameConfigContinue')}</button></div>`;
  return `<div class="button-row">${apply}</div>`;
}
function gamePanelBody() {
  if (!gameConfigApi) return `<p class="setting-help">${t('desktopOnly')}</p>`;
  if (gc.error) return notice(esc(errorMessage(gc.error)), { tone: 'warning' });
  if (!gc.data) return `<p role="status">${t('loading')}</p>`;
  const data = gc.data;
  const folders = data.folders.length > 1 ? `<div class="setting-row"><label class="setting-label" for="gc-folder">${t('gameConfigFolder')}</label><label class="select-field"><select id="gc-folder">${data.folders.map(item => `<option value="${esc(item.path)}" ${item.path === data.folder ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label></div>` : '';
  const running = data.gameRunning ? notice(esc(t('gameConfigRunning')), { tone: 'warning' }) : '';
  const message = { missing: 'gameConfigMissing', unreadable: 'gameConfigUnreadable', invalid: 'gameConfigInvalid' }[data.status];
  const body = data.status === 'ready' ? GAME_OPTIONS.map(gameOptionRow).join('') : notice(esc(t(message)), { tone: 'warning' });
  return `${folders}${running}${body}${gamePanelActions()}`;
}
function gameConfigSettings() {
  gc.mode = 'settings';
  if (!gc.data && !gc.loading) loadGameConfig();
  return `<div class="gc-panel">${gamePanelBody()}</div>`;
}
// Resolves 'continue' (or 'launch') when the player goes on, and null when they close it.
async function openGameConfigDialog(mode) {
  if (!gameConfigApi) return mode === 'launch' ? 'launch' : 'continue';
  gc.mode = mode;
  gc.data = null;
  const answer = new Promise(resolve => {
    openDialog(`${closeButton()}<div class="form-dialog game-config-dialog"><div class="eyebrow">${t(mode === 'launch' ? 'gameConfigBeforeLaunch' : 'gameConfigEyebrow')}</div><h2 id="dialog-title">${t('gameConfigTitle')}</h2><p>${t('gameConfigLead')}</p><div class="gc-panel">${gamePanelBody()}</div></div>`, {
      onClose: result => {
        gc.mode = 'settings';
        refreshGamePanel();
        resolve(result);
      }
    });
  });
  loadGameConfig();
  return answer;
}
async function applyGameConfig() {
  if (gc.busy || !gcChanged()) return true;
  gc.busy = true;
  refreshGamePanel();
  try {
    gc.data = await callDesktop(gameConfigApi.write, { values: gc.draft, version: gc.data.version });
    gc.draft = { ...gc.data.values };
    toast(t('gameConfigSaved'));
    return true;
  } catch (error) {
    if (error.code === 'CONFIG_CHANGED') {
      await loadGameConfig();
      toast(errorMessage(error), 'error');
      return false;
    }
    toast(errorMessage(error), 'error');
    return false;
  } finally {
    gc.busy = false;
    refreshGamePanel();
  }
}
// Once per session, after sign-in. New players see the tutorial first and meet this panel at the next start.
async function showStartupGameConfig() {
  if (gc.shownAtStart || !gameConfigApi || !accountUser() || !overlay.hidden || document.querySelector('.tour-layer')) return;
  gc.shownAtStart = true;
  await openGameConfigDialog('startup');
}

document.addEventListener('click', async event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.id === 'gc-apply') {
    const ok = await applyGameConfig();
    if (ok && gc.mode !== 'settings') closeDialog(gc.mode === 'launch' ? 'launch' : 'continue');
  }
  if (target.id === 'gc-continue') closeDialog(gc.mode === 'launch' ? 'launch' : 'continue');
});
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.gcOption) {
    gc.draft[target.dataset.gcOption] = target.checked;
    return refreshGamePanel();
  }
  if (target.id === 'gc-folder') {
    try {
      gc.data = await callDesktop(gameConfigApi.selectFolder, target.value);
      gc.draft = { ...(gc.data.values || {}) };
      refreshGamePanel();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }
});
