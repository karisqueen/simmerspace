/* My CC → "Organize into folders": preview every move, choose how subfolders and name clashes are handled,
   then move files with progress, a Stop button and a per-file result. The desktop app re-checks each file. */
const ORGANIZE_PREVIEW_LIMIT = 300;

const organizer = {
  open: false,
  entries: [], // [{ relativePath, folderName }]
  untagged: 0,
  layout: 'keep',
  duplicates: 'skip',
  view: 'all', // all | move | skipped
  plan: null,
  loading: false,
  error: null,
  running: false,
  stopping: false,
  progress: null,
  request: 0
};

function organizeSelected() {
  const entries = [];
  let untagged = 0;
  for (const relativePath of mods.selected) {
    const categoryId = tagsForMod(relativePath).categoryId;
    const folderName = categoryId && mods.catalog.folderCategories.includes(categoryId) ? folderNameFor(categoryId) : '';
    if (folderName) entries.push({ relativePath, folderName });
    else untagged++;
  }
  if (!entries.length) return toast(mt('noFolderForCategory'), 'error');
  const savedLayout = safeGet('organize-layout');
  Object.assign(organizer, {
    open: true,
    entries,
    untagged,
    layout: savedLayout === 'flatten' ? 'flatten' : 'keep',
    duplicates: safeGet('organize-duplicates') === 'rename' ? 'rename' : 'skip',
    view: 'all',
    plan: null,
    error: null,
    running: false,
    stopping: false,
    progress: null
  });
  openDialog(`${closeButton()}<div class="form-dialog organize-dialog" id="organize-dialog"></div>`, {
    wide: true,
    onClose: () => {
      organizer.open = false;
      organizer.plan = null;
    }
  });
  renderOrganizer();
  dialog.querySelector('input[name="organize-layout"]:checked')?.focus();
  return refreshOrganizePlan();
}

// Asks the desktop app for a fresh, read-only plan for the current choices.
async function refreshOrganizePlan() {
  const request = ++organizer.request;
  organizer.loading = true;
  organizer.error = null;
  renderOrganizer();
  try {
    await saveModCatalog();
    const categoryFolders = [...new Set(mods.catalog.folderCategories.map(folderNameFor).filter(Boolean))];
    const plan = await callDesktop(modsApi.planOrganize, organizer.entries, { layout: organizer.layout, duplicates: organizer.duplicates, categoryFolders });
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
  return `<div class="organize-options"><fieldset><legend>${mt('organizeLayoutLabel')}</legend>${radio('organize-layout', 'keep', organizer.layout, mt('layoutKeep'), mt('layoutKeepHelp'))}${radio(
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
  )}</fieldset></div><p class="organize-safety"><i class="safe-dot" aria-hidden="true"></i>${mt('neverOverwrite')}</p>`;
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
  const untagged = organizer.untagged ? `<p class="muted-note">${esc(format(mt('organizeUntagged'), { count: n(organizer.untagged) }))}</p>` : '';
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
  return `${summary}${untagged}<div class="subtabs organize-views" role="group" aria-label="${esc(mt('planFilterLabel'))}">${views}</div><div class="organize-list-wrap ${organizer.loading ? 'is-refreshing' : ''}" aria-busy="${organizer.loading}">${list}</div>`;
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
  const title = format(mtCount('organizePreviewTitle', organizer.entries.length), { count: n(organizer.entries.length) });
  const actions = organizer.running
    ? `<button class="secondary-btn" id="organize-stop" ${organizer.stopping ? 'disabled' : ''}>${mt('organizeStop')}</button>`
    : `<button class="primary-btn" id="organize-apply" ${moves && !organizer.loading ? '' : 'disabled'}>${esc(moves ? format(mtCount('organizeMoveButton', moves), { count: n(moves) }) : mt('organizeNothing'))}</button><button class="secondary-btn" data-close>${t('cancel')}</button>`;
  withFocusPreserved(() => {
    root.innerHTML = `<div class="eyebrow">${mt('changeGroup')}</div><h2 id="dialog-title">${esc(title)}</h2>${organizer.running ? '' : `<p>${mt('organizePreviewIntro')}</p>`}${renderOrganizeChoices()}${
      organizer.running ? renderOrganizeProgress() : renderOrganizePlan()
    }<div class="detail-actions">${actions}</div>`;
  });
}

async function applyOrganizePlan() {
  const plan = organizer.plan;
  if (!plan || organizer.running || !plan.counts.move) return;
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
  if (!organizer.open || organizer.running || !target.matches('input[name="organize-layout"], input[name="organize-duplicates"]')) return;
  if (target.name === 'organize-layout') {
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
