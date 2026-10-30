/* My CC library extras: where each file came from (a SimmerSpace download or an external file), folder views
   by category or creator with the "No category" / "No creator" fallbacks, and the optional one-by-one
   classification of external files. Origin is read from the CurseForge install log; it is never guessed, so
   external files never show download history or update information. */
const CATEGORY_ICONS = { cas: 'clothing', buildbuy: 'buildbuy', gameplay: 'mods', other: 'cc', custom: 'tag' };
const CATEGORY_ICON_OVERRIDES = { 'cas-hair': 'hair', 'cas-accessories': 'accessories', 'bb-furniture': 'objects', 'bb-decor': 'objects', 'bb-lighting': 'objects', 'script-mods': 'mods' };
const LIBRARY_VIEWS = ['list', 'category', 'creator'];

const library = {
  view: LIBRARY_VIEWS.includes(safeGet('library-view')) ? safeGet('library-view') : 'list',
  listOpen: safeRead('library-list-open', true) !== false,
  origin: 'all',
  creatorFilter: '',
  installs: { source: null, map: new Map(), version: 0 },
  classify: null, // { queue: [relativePath], index, saved, skipped }
  offered: false
};

/* ---------- Origin ---------- */
function installIndex() {
  const list = typeof cf !== 'undefined' && Array.isArray(cf.installs) ? cf.installs : [];
  if (library.installs.source !== list) {
    const map = new Map();
    for (const item of list) for (const file of Array.isArray(item.files) ? item.files : []) map.set(modPathKey(file), item);
    library.installs = { source: list, map, version: library.installs.version + 1 };
  }
  return library.installs;
}
function installFor(file) {
  return installIndex().map.get(modPathKey(file.relativePath)) || null;
}
function modLookup() {
  return {
    tags: tagsForMod,
    categoryName: categoryNameForMod,
    creatorName: id => creatorForMod(id)?.name || '',
    origin: file => (installFor(file) ? 'simmerspace' : 'external'),
    // A creator tag wins; a SimmerSpace download without one is grouped under its CurseForge author.
    creatorKey: file => {
      const id = tagsForMod(file.relativePath).creatorId;
      if (id && creatorForMod(id)) return id;
      const author = installFor(file)?.authors?.[0];
      return author ? `cf:${author.toLocaleLowerCase()}` : '';
    },
    creatorLabel: file => {
      const id = tagsForMod(file.relativePath).creatorId;
      if (id && creatorForMod(id)) return creatorForMod(id).name;
      return installFor(file)?.authors?.[0] || '';
    }
  };
}
async function ensureInstallsLoaded() {
  if (typeof cf === 'undefined' || cf.installs || typeof loadCurseForgeInstalls !== 'function') return;
  await loadCurseForgeInstalls();
  mods.resultVersion++;
  if (state.page === 'mycc') renderModsPanel();
}

/* ---------- Header strip ---------- */
function libraryFolderStrip() {
  const folder = routeRecords.mods?.path || '';
  const files = mods.result?.files || [];
  const lookup = modLookup();
  let fromApp = 0;
  for (const file of files) if (lookup.origin(file) === 'simmerspace') fromApp++;
  const scanned = mods.result && mods.scannedAt ? new Date(mods.scannedAt).toLocaleString(state.lang, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const status = mods.busy ? t('libStatusScanning') : mods.error ? t('libStatusError') : mods.result ? t('libStatusReady') : folder ? t('libStatusNotScanned') : t('libStatusNoFolder');
  const fact = (label, value, tone = '') => `<div class="strip-fact ${tone}"><span>${esc(label)}</span><b>${value}</b></div>`;
  return `<section class="library-strip" aria-label="${esc(t('libFolderInfo'))}"><div class="strip-path">${icon('folder', 'strip-icon')}<div><span>${t('libModsFolder')}</span><b title="${esc(folder)}">${esc(folder || t('libNoFolderYet'))}</b></div></div><div class="strip-facts">${fact(t('libFilesDetected'), mods.result ? n(files.length) : '—')}${fact(t('libFromApp'), mods.result ? n(fromApp) : '—', 'is-accent')}${fact(t('libExternal'), mods.result ? n(files.length - fromApp) : '—', 'is-pop')}${fact(t('libLastScan'), esc(scanned || '—'))}${fact(t('libStatus'), esc(status), mods.error ? 'is-danger' : '')}</div><div class="strip-actions"><button class="secondary-btn" data-pick-folder="mods" data-tip="${esc(t('tipChangeFolder'))}">${icon('folderCog')}<span>${folder ? t('changeFolder') : t('chooseFolder')}</span></button></div></section>`;
}

/* ---------- Organization views ---------- */
function libraryViewSwitch() {
  const labels = { list: t('libViewList'), category: t('libViewCategory'), creator: t('libViewCreator') };
  return `<div class="segmented library-view" role="radiogroup" aria-label="${esc(t('libOrganizeBy'))}"><span class="segmented-label">${t('libOrganizeBy')}</span>${LIBRARY_VIEWS.map(view => `<button class="segment ${library.view === view ? 'is-selected' : ''}" role="radio" aria-checked="${library.view === view}" data-library-view="${view}">${esc(labels[view])}</button>`).join('')}</div>`;
}
function categoryIcon(categoryId) {
  const category = categoryForMod(categoryId);
  return CATEGORY_ICON_OVERRIDES[categoryId] || CATEGORY_ICONS[category?.group] || 'tag';
}
function libraryFolders() {
  if (library.view === 'list' || !mods.result) return '';
  const lookup = modLookup();
  const groups = groupModFiles(mods.result.files, library.view, lookup);
  const active = library.view === 'creator' ? library.creatorFilter : mods.categoryFilter;
  const fallbackName = library.view === 'creator' ? t('libNoCreator') : t('libNoCategory');
  const tiles = groups
    .map(group => {
      const name = group.fallback ? fallbackName : group.name;
      const iconName = group.fallback ? 'folder' : library.view === 'creator' ? 'creators' : categoryIcon(group.key);
      const selected = active === group.key;
      return `<button class="folder-tile ${group.fallback ? 'is-fallback' : ''} ${selected ? 'is-selected' : ''}" data-library-folder="${esc(group.key)}" aria-pressed="${selected}">${icon(iconName, 'folder-tile-icon')}<span class="folder-tile-copy"><b>${esc(name)}</b><small>${esc(format(t('libFolderCount'), { count: n(group.count) }))}${group.external ? ` · ${esc(format(t('libFolderExternal'), { count: n(group.external) }))}` : ''}</small></span></button>`;
    })
    .join('');
  return `<div class="folder-grid" role="group" aria-label="${esc(library.view === 'creator' ? t('libViewCreator') : t('libViewCategory'))}">${tiles}</div>`;
}
function originFilter() {
  const options = [
    ['all', t('libOriginAll')],
    ['simmerspace', t('libFromApp')],
    ['external', t('libExternal')]
  ];
  return `<div class="subtabs" role="group" aria-label="${esc(t('libOrigin'))}">${options.map(([id, label]) => `<button class="small-chip ${library.origin === id ? 'active' : ''}" data-library-origin="${id}" aria-pressed="${library.origin === id}">${esc(label)}</button>`).join('')}</div>`;
}
function originBadge(file) {
  const install = installFor(file);
  if (install) return `<i class="origin-badge is-app" title="${esc(format(t('libDownloadedAs'), { name: install.name || install.displayName || '' }))}">${icon('download')}${t('libFromAppShort')}</i>`;
  return `<i class="origin-badge is-external" data-tip="${esc(t('tipExternal'))}">${icon('import')}${t('libExternalShort')}</i>`;
}

/* ---------- Classification of external files ---------- */
function skippedStoreKey() {
  return `classify-skipped:${modPathKey(routeRecords.mods?.path || '')}`;
}
function skippedSet() {
  const saved = safeRead(skippedStoreKey(), []);
  return new Set(Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : []);
}
function saveSkipped(set) {
  safeWrite(skippedStoreKey(), [...set].slice(-20000));
}
function pendingClassification() {
  return mods.result ? unclassifiedExternal(mods.result.files, modLookup(), skippedSet()) : [];
}
// After a scan or import, offer (once per session) to classify external files. Never forced.
function offerClassification() {
  if (library.offered || library.classify || typeof cf === 'undefined') return;
  const pending = pendingClassification();
  if (!pending.length || !overlay.hidden) return;
  library.offered = true;
  openDialog(
    `${closeButton()}<div class="form-dialog classify-offer">${icon('tag', 'classify-hero')}<h2 id="dialog-title">${t('classifyOfferTitle')}</h2><p>${esc(format(t('classifyOfferText'), { count: n(pending.length) }))}</p><div class="detail-actions"><button class="primary-btn" id="classify-start">${t('classifyStart')}</button><button class="secondary-btn" data-close>${t('classifyLater')}</button><button class="tertiary-btn" id="classify-skip-all">${t('classifySkipAll')}</button></div></div>`
  );
}
function startClassification() {
  const queue = pendingClassification().map(file => file.relativePath);
  if (!queue.length) return toast(t('classifyNothing'));
  library.classify = { queue, index: 0, saved: 0, skipped: 0 };
  renderClassifyStep();
}
function renderClassifyStep() {
  const job = library.classify;
  if (!job) return;
  if (job.index >= job.queue.length) return finishClassification();
  const relativePath = job.queue[job.index];
  const file = mods.byPath.get(relativePath);
  if (!file) {
    job.index++;
    return renderClassifyStep();
  }
  const tags = tagsForMod(relativePath);
  const quick = ['cas-hair', 'cas-tops', 'cas-full-body', 'cas-shoes', 'cas-accessories', 'cas-makeup', 'bb-furniture', 'bb-decor', 'gameplay', 'script-mods']
    .filter(id => categoryForMod(id))
    .map(id => `<button class="chip chip-sm" data-classify-category="${esc(id)}">${icon(categoryIcon(id))}<span>${esc(categoryNameForMod(id))}</span></button>`)
    .join('');
  openDialog(
    `${closeButton()}<div class="form-dialog classify-dialog"><div class="classify-progress"><span>${esc(format(t('classifyProgress'), { step: n(job.index + 1), total: n(job.queue.length) }))}</span><i style="--progress:${((job.index / job.queue.length) * 100).toFixed(1)}%" aria-hidden="true"></i></div><div class="classify-file"><span class="classify-thumb" aria-hidden="true">${icon(file.extension === 'ts4script' ? 'mods' : 'cc')}</span><div><h2 id="dialog-title">${esc(file.name)}</h2><p class="path-text">${esc(relativePath)}</p><span class="origin-badge is-external">${icon('import')}${t('libExternalShort')}</span></div></div><label>${mt('category')}<select id="classify-category">${categoryOptions(tags.categoryId)}</select></label><div class="chip-row classify-quick" role="group" aria-label="${esc(t('classifyQuick'))}">${quick}</div><label>${mt('creator')}<input id="classify-creator" list="classify-creators" value="${esc(creatorForMod(tags.creatorId)?.name || '')}" placeholder="${esc(t('classifyCreatorPlaceholder'))}" autocomplete="off">${creatorsDatalist('classify-creators')}</label><details class="classify-more"><summary>${t('classifyMoreTags')}</summary><div class="classify-more-grid"><label>${mt('gender')}<select id="classify-gender">${genderOptions(tags.gender)}</select></label><label>${mt('age')}<select id="classify-age">${ageOptions(tags.age)}</select></label></div></details><div class="detail-actions"><button class="primary-btn" id="classify-save">${t('classifySaveNext')}</button><button class="secondary-btn" id="classify-skip">${t('classifySkip')}</button><button class="tertiary-btn" id="classify-skip-rest">${t('classifySkipAll')}</button></div></div>`
  );
  document.getElementById('classify-category')?.focus();
}
function classifySave() {
  const job = library.classify;
  if (!job) return;
  const relativePath = job.queue[job.index];
  const categoryId = document.getElementById('classify-category')?.value || '';
  const creatorName = document.getElementById('classify-creator')?.value.trim() || '';
  const gender = document.getElementById('classify-gender')?.value || '';
  const age = document.getElementById('classify-age')?.value || '';
  if (!categoryId && !creatorName && !gender && !age) return classifySkip();
  const creator = creatorName ? createCreatorIfMissing(creatorName) : null;
  storeModTags(relativePath, { ...tagsForMod(relativePath), categoryId, creatorId: creator?.id || '', gender, age });
  scheduleModCatalogSave();
  job.saved++;
  job.index++;
  renderClassifyStep();
}
function classifySkip() {
  const job = library.classify;
  if (!job) return;
  const skipped = skippedSet();
  skipped.add(modPathKey(job.queue[job.index]));
  saveSkipped(skipped);
  job.skipped++;
  job.index++;
  renderClassifyStep();
}
function classifySkipRemaining(paths) {
  const skipped = skippedSet();
  for (const relativePath of paths) skipped.add(modPathKey(relativePath));
  saveSkipped(skipped);
  return paths.length;
}
function finishClassification() {
  const job = library.classify;
  library.classify = null;
  closeDialog();
  renderModsPanel();
  if (job) toast(format(t('classifyDone'), { saved: n(job.saved), skipped: n(job.skipped) }));
}

/* ---------- Events ---------- */
const LIBRARY_ACTIONS = {
  'classify-start': () => startClassification(),
  'classify-open': () => startClassification(),
  'classify-save': () => classifySave(),
  'classify-skip': () => classifySkip(),
  'classify-skip-all': () => {
    const count = classifySkipRemaining(pendingClassification().map(file => file.relativePath));
    closeDialog();
    renderModsPanel();
    toast(format(t('classifySkippedAll'), { count: n(count) }));
  },
  'classify-skip-rest': () => {
    const job = library.classify;
    if (!job) return;
    job.skipped += classifySkipRemaining(job.queue.slice(job.index));
    job.index = job.queue.length;
    finishClassification();
  },
  'toggle-library-list': () => {
    library.listOpen = !library.listOpen;
    safeWrite('library-list-open', library.listOpen);
    renderModsPanel();
  }
};
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.id && LIBRARY_ACTIONS[target.id]) return LIBRARY_ACTIONS[target.id](target);
  if (target.dataset.libraryView) {
    library.view = target.dataset.libraryView;
    safeSet('library-view', library.view);
    library.creatorFilter = '';
    mods.categoryFilter = '';
    mods.page = 0;
    return renderModsPanel();
  }
  if (target.dataset.libraryFolder !== undefined) {
    const key = target.dataset.libraryFolder;
    if (library.view === 'creator') library.creatorFilter = library.creatorFilter === key ? '' : key;
    else mods.categoryFilter = mods.categoryFilter === key ? '' : key;
    mods.page = 0;
    library.listOpen = true;
    return renderModsPanel();
  }
  if (target.dataset.libraryOrigin) {
    library.origin = target.dataset.libraryOrigin;
    mods.page = 0;
    return renderModsPanel();
  }
  if (target.dataset.classifyCategory) {
    const select = document.getElementById('classify-category');
    if (select) select.value = target.dataset.classifyCategory;
    document.querySelectorAll('[data-classify-category]').forEach(chip => chip.classList.toggle('is-selected', chip === target));
  }
});
// Closing the classifier keeps everything saved so far; it can be resumed from the library toolbar.
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && library.classify && event.target.id === 'classify-creator') {
    event.preventDefault();
    classifySave();
  }
});
