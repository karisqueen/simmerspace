/* My CC → "Organize into folders": preview every move, choose how subfolders and name clashes are handled,
   then move files with progress, a Stop button and a per-file result. The desktop app re-checks each file. */
const ORGANIZE_PREVIEW_LIMIT = 300;

const organizer = {
  open: false,
  mode: 'category', // category | creator
  scope: 'all', // all | selected
  includeUnsorted: true,
  entries: [], // [{ relativePath, folderName }]
  folders: [], // [{ name, count, fallback }]
  left: 0, // files without a category / creator that stay where they are
  layout: 'keep',
  duplicates: 'skip',
  view: 'all', // all | move | skipped
  plan: null,
  loading: false,
  error: null,
  running: false,
  stopping: false,
  progress: null,
  game: null, // { running, checked } from the desktop app
  request: 0
};

// The folder names an earlier "Organize" may have created. With "keep subfolders", a file already inside one
// of them keeps only the path below it, so organizing again by the other mode does not nest folders.
function organizerFolderNames() {
  const names = new Set();
  for (const id of mods.catalog.folderCategories) names.add(folderNameFor(id));
  for (const item of allModCategories()) names.add(folderNameFor(item.id)).add(item.en).add(item.es);
  for (const creator of mods.catalog.creators) names.add(safeFolderName(creator.name));
  for (const key of ['libNoCategory', 'libNoCreator']) for (const lang of ['en', 'es']) names.add(DICT[lang][key]);
  return [...names].map(safeFolderName).filter(Boolean);
}
function organizeFiles() {
  const files = mods.result?.files || [];
  return organizer.scope === 'selected' ? files.filter(file => mods.selected.has(file.relativePath)) : files;
}
function buildOrganizeEntries() {
  const fallbackName = organizer.mode === 'creator' ? t('libNoCreator') : t('libNoCategory');
  const built = organizeFolderEntries(organizeFiles(), organizer.mode, modLookup(), { fallbackName, includeUnsorted: organizer.includeUnsorted, folderFor: folderNameFor });
  Object.assign(organizer, built);
}

function openOrganizer({ scope = mods.selected.size ? 'selected' : 'all' } = {}) {
  if (!mods.result) return toast(mt('scanFirst'), 'error');
  const saved = key => safeGet(`organize-${key}`);
  Object.assign(organizer, {
    open: true,
    scope: scope === 'selected' && mods.selected.size ? 'selected' : 'all',
    mode: saved('mode') === 'creator' ? 'creator' : 'category',
    includeUnsorted: saved('unsorted') !== 'leave',
    layout: saved('layout') === 'flatten' ? 'flatten' : 'keep',
    duplicates: saved('duplicates') === 'rename' ? 'rename' : 'skip',
    view: 'all',
    plan: null,
    error: null,
    running: false,
    stopping: false,
    progress: null,
    game: null
  });
  buildOrganizeEntries();
  openDialog(`${closeButton()}<div class="form-dialog organize-dialog" id="organize-dialog"></div>`, {
    wide: true,
    onClose: () => {
      organizer.open = false;
      organizer.plan = null;
    }
  });
  renderOrganizer();
  dialog.querySelector('input[name="organize-mode"]:checked')?.focus();
  checkGameRunning();
  return refreshOrganizePlan();
}
// Kept for the selection toolbar.
function organizeSelected() {
  return openOrganizer({ scope: 'selected' });
}
async function checkGameRunning() {
  if (typeof desktop?.isGameRunning !== 'function') return null;
  try {
    organizer.game = await callDesktop(desktop.isGameRunning);
  } catch {
    organizer.game = { running: false, checked: false };
  }
  if (organizer.open) renderOrganizer();
  return organizer.game;
}

// Asks the desktop app for a fresh, read-only plan for the current choices.
async function refreshOrganizePlan() {
  const request = ++organizer.request;
  organizer.loading = true;
  organizer.error = null;
  renderOrganizer();
  try {
    await saveModCatalog();
    if (!organizer.entries.length) {
      organizer.plan = { planId: '', items: [], counts: { move: 0, unchanged: 0, duplicate: 0, error: 0, renamed: 0 } };
      return;
    }
    const plan = await callDesktop(modsApi.planOrganize, organizer.entries, { layout: organizer.layout, duplicates: organizer.duplicates, categoryFolders: organizerFolderNames() });
    if (request !== organizer.request || !organizer.open) return;
    organizer.plan = plan;
  } catch (error) {
    if (request !== organizer.request) return;
    organizer.plan = null;
    organizer.error = error;
  } finally {
    if (request === organizer.request) {
      organizer.loading = false;
      renderOrganizer();
    }
  }
}

function organizeStatusLabel(item) {
  if (item.status === 'move') return item.renamed ? mt('statusRenamed') : mt('statusMove');
  return mt({ unchanged: 'statusUnchanged', duplicate: 'statusDuplicate' }[item.status] || 'statusError');
}
function organizeStatusClass(item) {
  if (item.status === 'move') return item.renamed ? 'is-renamed' : 'is-move';
  return item.status === 'unchanged' ? 'is-unchanged' : 'is-skipped';
}
function withModsPrefix(relativePath) {
  return relativePath ? `Mods\\${relativePath.replace(/\//g, '\\')}` : '—';
}

function renderOrganizePreviewRow(item) {
  const note = item.flattenedForGame ? mt(/\.ts4script(off)?$/i.test(item.source) ? 'statusFlattened' : 'statusFlattenedPackage') : '';
  const reason = item.status === 'error' || item.status === 'duplicate' ? errorMessage(item) : '';
  return `<li class="organize-row ${organizeStatusClass(item)}"><span class="organize-status">${esc(organizeStatusLabel(item))}</span><span class="organize-paths"><span><small>${mt('planFrom')}</small><code>${esc(withModsPrefix(item.source))}</code></span>${
    item.status === 'move' || item.status === 'duplicate'
      ? `<span><small>${mt('planTo')}</small><code>${esc(withModsPrefix(item.destination))}</code></span>`
      : ''
  }${note ? `<em>${esc(note)}</em>` : ''}${reason ? `<em class="organize-reason">${esc(reason)}</em>` : ''}</span></li>`;
}

function renderOrganizeChoices() {
  const disabled = organizer.running ? 'disabled' : '';
  const radio = (name, value, current, label, help) =>
    `<label class="organize-choice"><input type="radio" id="${name}-${value}" name="${name}" value="${value}" ${value === current ? 'checked' : ''} ${disabled}><span><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span></label>`;
  const fallback = organizer.mode === 'creator' ? t('libNoCreator') : t('libNoCategory');
  const selected = mods.selected.size;
  return `<div class="organize-options organize-options-main"><fieldset><legend>${mt('organizeModeLabel')}</legend>${radio('organize-mode', 'category', organizer.mode, mt('organizeByCategory'), mt('organizeByCategoryHelp'))}${radio(
    'organize-mode',
    'creator',
    organizer.mode,
    mt('organizeByCreator'),
    mt('organizeByCreatorHelp')
  )}</fieldset><fieldset><legend>${mt('organizeScopeLabel')}</legend>${radio('organize-scope', 'all', organizer.scope, format(mt('organizeScopeAll'), { count: n(mods.result?.files.length || 0) }), '')}${
    selected ? radio('organize-scope', 'selected', organizer.scope, format(mt('organizeScopeSelected'), { count: n(selected) }), '') : ''
  }<label class="check-row organize-unsorted"><input type="checkbox" id="organize-unsorted" ${organizer.includeUnsorted ? 'checked' : ''} ${disabled}><span>${esc(format(mt('organizeUnsorted'), { folder: fallback }))}</span></label></fieldset></div><details class="organize-more"><summary>${mt('organizeMoreOptions')}</summary><div class="organize-options"><fieldset><legend>${mt('organizeLayoutLabel')}</legend>${radio('organize-layout', 'keep', organizer.layout, mt('layoutKeep'), mt('layoutKeepHelp'))}${radio(
    'organize-layout',
    'flatten',
    organizer.layout,
    mt('layoutFlatten'),
    mt('layoutFlattenHelp')
  )}</fieldset><fieldset><legend>${mt('duplicatesLabel')}</legend>${radio('organize-duplicates', 'skip', organizer.duplicates, mt('dupSkip'), '')}${radio(
    'organize-duplicates',
    'rename',
    organizer.duplicates,
    mt('dupRename'),
    ''
  )}</fieldset></div></details><p class="organize-safety"><i class="safe-dot" aria-hidden="true"></i>${mt('neverOverwrite')}</p>`;
}
function renderGameWarning() {
  if (!organizer.game?.running) return '';
  return notice(`<b>${mt('organizeGameRunningTitle')}</b> ${mt('organizeGameRunningText')}`, { tone: 'warning', action: `<button class="secondary-btn small-chip" id="organize-game-check">${mt('organizeGameCheck')}</button>` }).replace('role="note"', 'role="alert"');
}
function renderOrganizeFolders() {
  const plan = organizer.plan;
  if (!plan || !organizer.folders.length) return '';
  const moving = new Map();
  for (const item of plan.items) if (item.status === 'move') {
    const top = item.destination.split(/[\\/]/)[0].toLowerCase();
    moving.set(top, (moving.get(top) || 0) + 1);
  }
  const tiles = organizer.folders
    .map(folder => {
      const moves = moving.get(folder.name.toLowerCase()) || 0;
      return `<li class="${folder.fallback ? 'is-fallback' : ''}">${icon('folder')}<span><b>${esc(folder.name)}</b><small>${esc(format(mtCount('organizeFolderFiles', folder.count), { count: n(folder.count) }))}${moves ? ` · ${esc(format(mtCount('organizeFolderMoves', moves), { count: n(moves) }))}` : ''}</small></span></li>`;
    })
    .join('');
  return `<div class="organize-folders"><b>${esc(format(mt('organizeFoldersTitle'), { count: n(organizer.folders.length) }))}</b><ul>${tiles}</ul></div>`;
}

function renderOrganizePlan() {
  if (organizer.loading && !organizer.plan) return `<div class="organize-state" role="status"><span class="spinner" aria-hidden="true"></span>${mt('planLoading')}</div>`;
  if (organizer.error) {
    return `<div class="scan-error organize-state" role="alert"><b>${mt('planFailed')}</b> ${esc(errorMessage(organizer.error))} <button class="text-link" id="organize-retry">${mt('planTryAgain')}</button></div>`;
  }
  const plan = organizer.plan;
  if (!plan) return '';
  const c = plan.counts;
  const chip = (key, count, tone = '') => (count ? `<span class="${tone}">${esc(format(mt(key), { count: n(count) }))}</span>` : '');
  const summary = `<div class="scan-summary organize-summary" aria-label="${esc(mt('planSummaryLabel'))}">${chip('planCount_move', c.move, 'is-move')}${chip('planCount_renamed', c.renamed)}${chip(
    'planCount_unchanged',
    c.unchanged
  )}${chip('planCount_duplicate', c.duplicate, 'scan-warning')}${chip('planCount_error', c.error, 'scan-warning')}</div>`;
  const untagged = organizer.left ? `<p class="muted-note">${esc(format(mt('organizeLeft'), { count: n(organizer.left), folder: organizer.mode === 'creator' ? t('libNoCreator') : t('libNoCategory') }))}</p>` : '';
  const views = [
    ['all', 'planShowAll'],
    ['move', 'planShowMove'],
    ['skipped', 'planShowSkipped']
  ]
    .map(([id, key]) => `<button class="small-chip ${organizer.view === id ? 'active' : ''}" data-organize-view="${id}" aria-pressed="${organizer.view === id}">${mt(key)}</button>`)
    .join('');
  const items = plan.items.filter(item => organizer.view === 'all' || (organizer.view === 'move' ? item.status === 'move' : item.status !== 'move'));
  const shown = items.slice(0, ORGANIZE_PREVIEW_LIMIT);
  const list = shown.length
    ? `<ul class="organize-list" aria-label="${esc(mt('planSummaryLabel'))}">${shown.map(renderOrganizePreviewRow).join('')}</ul>${
        items.length > shown.length ? `<p class="muted-note">${esc(format(mt('planShowing'), { shown: n(shown.length), count: n(items.length) }))}</p>` : ''
      }`
    : `<p class="mods-empty organize-empty">${mt('planEmpty')}</p>`;
  return `${summary}${untagged}${renderOrganizeFolders()}<div class="subtabs organize-views" role="group" aria-label="${esc(mt('planFilterLabel'))}">${views}</div><div class="organize-list-wrap ${organizer.loading ? 'is-refreshing' : ''}" aria-busy="${organizer.loading}">${list}</div>`;
}

function renderOrganizeProgress() {
  const p = organizer.progress || { done: 0, total: organizer.plan?.counts.move || 0 };
  const percent = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return `<div class="organize-progress" role="status" aria-live="polite"><b>${mt('organizeRunning')}</b><span id="organize-progress-text">${esc(format(mt('organizeProgress'), { done: n(p.done), total: n(p.total) }))}</span><div class="organize-track" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="${esc(mt('organizeRunning'))}"><i style="width:${percent}%"></i></div><p class="muted-note">${organizer.stopping ? mt('organizeStopping') : mt('organizeKeepOpen')}</p></div>`;
}

function renderOrganizer() {
  const root = document.getElementById('organize-dialog');
  if (!root || !organizer.open) return;
  const moves = organizer.plan?.counts.move || 0;
  const title = organizer.mode === 'creator' ? mt('organizeTitleCreator') : mt('organizeTitleCategory');
  const actions = organizer.running
    ? `<button class="secondary-btn" id="organize-stop" ${organizer.stopping ? 'disabled' : ''}>${mt('organizeStop')}</button>`
    : `<button class="primary-btn" id="organize-apply" ${moves && !organizer.loading ? '' : 'disabled'}>${esc(moves ? (organizer.game?.running ? mt('organizeMoveAnyway') : format(mtCount('organizeMoveButton', moves), { count: n(moves) })) : mt('organizeNothing'))}</button><button class="secondary-btn" data-close>${t('cancel')}</button>`;
  withFocusPreserved(() => {
    root.innerHTML = `<div class="eyebrow">${mt('organizeEyebrow')}</div><h2 id="dialog-title">${esc(title)}</h2>${organizer.running ? '' : `<p>${mt('organizePreviewIntro')}</p>`}${renderGameWarning()}${renderOrganizeChoices()}${
      organizer.running ? renderOrganizeProgress() : renderOrganizePlan()
    }<div class="detail-actions">${actions}</div>`;
  });
}

async function applyOrganizePlan() {
  const plan = organizer.plan;
  if (!plan || organizer.running || !plan.counts.move) return;
  // Check the game again right before moving: files it has open cannot be moved. A first warning only shows
  // the notice; pressing the button again (now "Move anyway") goes ahead.
  const warned = !!organizer.game?.running;
  const game = await checkGameRunning();
  if (game?.running && !warned) return;
  organizer.running = true;
  organizer.stopping = false;
  organizer.progress = { done: 0, total: plan.counts.move };
  setDialogLocked(true);
  renderOrganizer();
  document.getElementById('organize-stop')?.focus();
  let result = null;
  await runFileAction(async () => {
    try {
      result = await callDesktop(modsApi.applyOrganize, plan.planId);
      for (const item of result.results) if (item.ok && item.newPath) updateModPath(item.oldPath, item.newPath);
    } finally {
      organizer.running = false;
      setDialogLocked(false);
    }
  });
  if (!result) {
    // The whole request failed (for example the preview expired); show the preview again with the reason.
    organizer.plan = null;
    renderOrganizer();
    return refreshOrganizePlan();
  }
  closeDialog();
  showOrganizeResult(result);
  // Read the folder again so the library shows the new places (the moved paths are already updated).
  if (result.moved && typeof scanManagedMods === 'function') scanManagedMods();
}

function showOrganizeResult(result) {
  const failures = result.results.filter(item => !item.ok).map(item => ({ ...item, label: withModsPrefix(item.oldPath) }));
  const successes = result.results
    .filter(item => item.ok && item.moved)
    .map(item => ({ label: withModsPrefix(item.newPath), detail: `${mt('resultWas')}: ${withModsPrefix(item.oldPath)}` }));
  const notes = [result.cancelled ? mt('organizeStoppedNote') : '', result.moved ? mt('organizeAfterNote') : ''].filter(Boolean).join(' ');
  showResultDialog({
    title: mt('organizeDoneTitle'),
    summary: format(mt('organizeDoneSummary'), { moved: n(result.moved), unchanged: n(result.unchanged), skipped: n(result.skipped) }),
    note: notes,
    failures,
    describe: describeFailure,
    successes,
    successTitle: mt('resultsMoved'),
    successMore: format(mt('resultsMovedShowing'), { shown: n(Math.min(200, successes.length)), count: n(successes.length) })
  });
}

/* ---------- Events ---------- */
document.addEventListener('change', event => {
  const target = event.target;
  if (!organizer.open || organizer.running || !target.matches('input[name="organize-layout"], input[name="organize-duplicates"], input[name="organize-mode"], input[name="organize-scope"], #organize-unsorted')) return;
  if (target.name === 'organize-mode' || target.name === 'organize-scope' || target.id === 'organize-unsorted') {
    if (target.name === 'organize-mode') {
      organizer.mode = target.value;
      safeSet('organize-mode', target.value);
    } else if (target.name === 'organize-scope') organizer.scope = target.value;
    else {
      organizer.includeUnsorted = target.checked;
      safeSet('organize-unsorted', target.checked ? 'move' : 'leave');
    }
    buildOrganizeEntries();
  } else if (target.name === 'organize-layout') {
    organizer.layout = target.value;
    safeSet('organize-layout', target.value);
  } else {
    organizer.duplicates = target.value;
    safeSet('organize-duplicates', target.value);
  }
  refreshOrganizePlan();
});

document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || !organizer.open || !dialog.contains(target)) return;
  if (target.id === 'organize-apply') return applyOrganizePlan();
  if (target.id === 'organize-retry') return refreshOrganizePlan();
  if (target.id === 'organize-game-check') return checkGameRunning();
  if (target.id === 'organize-stop') {
    organizer.stopping = true;
    modsApi?.cancelOrganize();
    return renderOrganizer();
  }
  if (target.dataset.organizeView) {
    organizer.view = target.dataset.organizeView;
    renderOrganizer();
  }
});

modsApi?.onOrganizeProgress?.(progress => {
  if (!organizer.running) return;
  organizer.progress = progress;
  const text = document.getElementById('organize-progress-text');
  const track = dialog.querySelector('.organize-track');
  if (!text || !track) return;
  text.textContent = format(mt('organizeProgress'), { done: n(progress.done), total: n(progress.total) });
  track.setAttribute('aria-valuenow', String(progress.done));
  track.firstElementChild.style.width = `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`;
});
