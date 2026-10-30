/* My CC → Mods folder panel. All file changes go through the desktop app (electron/mods-service.cjs). */
const MOD_CATEGORIES = [
  { id: 'cas-tops', group: 'cas', en: 'Tops', es: 'Parte de arriba' },
  { id: 'cas-bottoms', group: 'cas', en: 'Bottoms', es: 'Parte de abajo' },
  { id: 'cas-full-body', group: 'cas', en: 'Full body', es: 'Cuerpo completo' },
  { id: 'cas-dresses', group: 'cas', en: 'Dresses', es: 'Vestidos' },
  { id: 'cas-outerwear', group: 'cas', en: 'Outerwear', es: 'Abrigos' },
  { id: 'cas-sleepwear', group: 'cas', en: 'Sleepwear & underwear', es: 'Ropa interior y pijamas' },
  { id: 'cas-swimwear', group: 'cas', en: 'Swimwear', es: 'Trajes de baño' },
  { id: 'cas-shoes', group: 'cas', en: 'Shoes', es: 'Zapatos' },
  { id: 'cas-accessories', group: 'cas', en: 'Accessories', es: 'Accesorios' },
  { id: 'cas-hair', group: 'cas', en: 'Hair', es: 'Cabello' },
  { id: 'cas-skin-details', group: 'cas', en: 'Skin details', es: 'Detalles de la piel' },
  { id: 'cas-teeth', group: 'cas', en: 'Teeth', es: 'Dientes' },
  { id: 'cas-makeup', group: 'cas', en: 'Makeup', es: 'Maquillaje' },
  { id: 'cas-eyes', group: 'cas', en: 'Eyes & eyebrows', es: 'Ojos y cejas' },
  { id: 'cas-lashes', group: 'cas', en: 'Lashes', es: 'Pestañas' },
  { id: 'cas-nails', group: 'cas', en: 'Nails', es: 'Uñas' },
  { id: 'cas-tattoos', group: 'cas', en: 'Tattoos', es: 'Tatuajes' },
  { id: 'cas-presets', group: 'cas', en: 'Presets & sliders', es: 'Presets y deslizadores' },
  { id: 'cas-poses', group: 'cas', en: 'Poses & animations', es: 'Poses y animaciones' },
  { id: 'cas-defaults', group: 'cas', en: 'Default replacements', es: 'Reemplazos predeterminados' },
  { id: 'bb-furniture', group: 'buildbuy', en: 'Furniture', es: 'Muebles' },
  { id: 'bb-decor', group: 'buildbuy', en: 'Decor', es: 'Decoración' },
  { id: 'bb-lighting', group: 'buildbuy', en: 'Lighting', es: 'Iluminación' },
  { id: 'bb-plants', group: 'buildbuy', en: 'Plants', es: 'Plantas' },
  { id: 'bb-walls-floors', group: 'buildbuy', en: 'Walls & floors', es: 'Paredes y suelos' },
  { id: 'bb-doors-windows', group: 'buildbuy', en: 'Doors & windows', es: 'Puertas y ventanas' },
  { id: 'bb-appliances', group: 'buildbuy', en: 'Appliances', es: 'Electrodomésticos' },
  { id: 'bb-build', group: 'buildbuy', en: 'Build tools', es: 'Construcción' },
  { id: 'gameplay', group: 'gameplay', en: 'Gameplay', es: 'Jugabilidad' },
  { id: 'script-mods', group: 'gameplay', en: 'Script mods', es: 'Mods de script' },
  { id: 'traits-skills', group: 'gameplay', en: 'Traits, aspirations & skills', es: 'Rasgos, aspiraciones y habilidades' },
  { id: 'careers', group: 'gameplay', en: 'Careers', es: 'Profesiones' },
  { id: 'ui-cheats', group: 'gameplay', en: 'UI & cheats', es: 'Interfaz y trucos' },
  { id: 'fixes-utilities', group: 'gameplay', en: 'Fixes & utilities', es: 'Arreglos y utilidades' },
  { id: 'other', group: 'other', en: 'Other', es: 'Otros' }
];
const MOD_GENDERS = [
  ['Female', 'female'],
  ['Male', 'male'],
  ['Unisex', 'unisex'],
  ['Neutral', 'neutral']
];
const MOD_AGES = [
  ['Infant', 'infant'],
  ['Toddler', 'toddler'],
  ['Child', 'child'],
  ['Teen', 'teen'],
  ['Young Adult', 'youngAdult'],
  ['Adult', 'adult'],
  ['Elder', 'elder']
];
const MODS_PAGE_SIZE = 100;
const modsApi = desktop?.manageMods || null;

const mods = {
  result: null, // last scan: { files, visited, folders, unreadableFolders, cancelled }
  byPath: new Map(), // relativePath -> file object in result.files
  busy: false,
  progress: null,
  error: null,
  query: '',
  stateFilter: 'all',
  categoryFilter: '',
  page: 0,
  selected: new Set(),
  working: false, // a file-changing action is running
  catalog: emptyCatalog(),
  catalogVersion: 0,
  resultVersion: 0,
  cache: { key: '', files: [] },
  lookups: { version: -1, lang: '', categories: new Map(), creators: new Map() }
};
let catalogSaveTimer = null;
let catalogDirty = false;

function emptyCatalog() {
  return { files: {}, categories: [], creators: [], folderCategories: [], folderNames: {} };
}
function mt(key) {
  return MODS_TEXT[state.lang]?.[key] || MODS_TEXT.en[key] || key;
}
// Uses the `<key>_one` text when there is exactly one item and the language has it.
function mtCount(key, count) {
  return (count === 1 && (MODS_TEXT[state.lang]?.[`${key}_one`] || MODS_TEXT.en[`${key}_one`])) || mt(key);
}
function scannedModCount() {
  return mods.result ? mods.result.files.length : null;
}
function errorMessage(error) {
  const key = `err_${error?.code || 'UNKNOWN'}`;
  return MODS_TEXT[state.lang]?.[key] || MODS_TEXT.en[key] || error?.message || mt('err_UNKNOWN');
}

/* ---------- Catalog (tags, custom categories, creators) ---------- */
function allModCategories() {
  return [...MOD_CATEGORIES, ...mods.catalog.categories.map(item => ({ ...item, group: 'custom', en: item.name, es: item.name }))];
}
function lookups() {
  const cache = mods.lookups;
  if (cache.version !== mods.catalogVersion || cache.lang !== state.lang) {
    cache.categories = new Map(allModCategories().map(item => [item.id, item]));
    cache.creators = new Map(mods.catalog.creators.map(item => [item.id, item]));
    cache.version = mods.catalogVersion;
    cache.lang = state.lang;
  }
  return cache;
}
function categoryForMod(id) {
  return id ? lookups().categories.get(id) : undefined;
}
function categoryNameForMod(id) {
  const item = categoryForMod(id);
  return item ? item[state.lang === 'es' ? 'es' : 'en'] : '';
}
function creatorForMod(id) {
  return id ? lookups().creators.get(id) : undefined;
}
// Default folder names keep using the Spanish category names, as in 0.6.x, so existing folders still match.
function folderNameFor(categoryId) {
  return mods.catalog.folderNames[categoryId] || categoryForMod(categoryId)?.es || '';
}
function tagsForMod(relativePath) {
  return mods.catalog.files[relativePath] || {};
}
function catalogChanged() {
  mods.catalogVersion++;
}

async function loadModCatalog() {
  if (!modsApi) return;
  try {
    const loaded = await callDesktop(modsApi.loadCatalog);
    mods.catalog = { ...emptyCatalog(), ...loaded };
    catalogChanged();
  } catch (error) {
    if (error.code !== 'MODS_ROOT_NOT_SET') console.warn('Could not load the local Mods catalog:', error.code);
    mods.catalog = emptyCatalog();
    catalogChanged();
  }
}
async function saveModCatalog() {
  clearTimeout(catalogSaveTimer);
  catalogSaveTimer = null;
  if (!catalogDirty) return;
  catalogDirty = false;
  if (!modsApi) return;
  try {
    await callDesktop(modsApi.saveCatalog, mods.catalog);
  } catch (error) {
    catalogDirty = true;
    toast(`${mt('tagSaveFailed')} ${errorMessage(error)}`, 'error');
  }
}
// Tag edits are saved shortly after the last change so typing a folder name does not write on every key.
function scheduleModCatalogSave(delay = 350) {
  catalogChanged();
  catalogDirty = true;
  clearTimeout(catalogSaveTimer);
  catalogSaveTimer = setTimeout(saveModCatalog, delay);
}

// Called when the player picks a different Mods folder: tags belong to the folder they were made in.
async function onModsFolderChanged() {
  await saveModCatalog();
  mods.result = null;
  mods.byPath = new Map();
  mods.selected.clear();
  mods.error = null;
  mods.page = 0;
  mods.resultVersion++;
  await loadModCatalog();
}

/* ---------- Derived lists ---------- */
function filteredModFiles() {
  const files = mods.result?.files || [];
  const key = [mods.resultVersion, mods.catalogVersion, installIndex().version, state.lang, mods.query, mods.stateFilter, mods.categoryFilter, library.creatorFilter, library.origin].join('\u0000');
  if (mods.cache.key !== key) {
    mods.cache = {
      key,
      files: filterModFiles(files, { query: mods.query, state: mods.stateFilter, categoryId: mods.categoryFilter, creatorKey: library.creatorFilter, origin: library.origin }, modLookup())
    };
  }
  return mods.cache.files;
}
function setScanResult(result) {
  mods.result = result;
  mods.scannedAt = Date.now();
  mods.byPath = new Map(result.files.map(file => [file.relativePath, file]));
  mods.resultVersion++;
}
// Keeps the in-memory list, tags and selection in step after a rename, toggle or move.
function updateModPath(oldPath, newPath) {
  if (!oldPath || !newPath || oldPath === newPath) return;
  const tags = mods.catalog.files[oldPath];
  if (tags) {
    mods.catalog.files[newPath] = tags;
    delete mods.catalog.files[oldPath];
    catalogDirty = true;
  }
  if (mods.selected.delete(oldPath)) mods.selected.add(newPath);
  const file = mods.byPath.get(oldPath);
  if (file) {
    mods.byPath.delete(oldPath);
    file.relativePath = newPath;
    file.name = fileNameOf(newPath);
    file.depth = newPath.split(/[\\/]/).length - 1;
    const enabled = modStateFromPath(newPath);
    if (enabled !== null) file.enabled = enabled;
    mods.byPath.set(newPath, file);
  }
  mods.resultVersion++;
}
function removeModPaths(paths) {
  const removed = new Set(paths);
  if (!removed.size) return;
  for (const relativePath of removed) {
    if (mods.catalog.files[relativePath]) {
      delete mods.catalog.files[relativePath];
      catalogDirty = true;
    }
    mods.selected.delete(relativePath);
    mods.byPath.delete(relativePath);
  }
  if (mods.result) mods.result.files = mods.result.files.filter(file => !removed.has(file.relativePath));
  mods.resultVersion++;
}

/* ---------- Rendering ---------- */
function optionList(items, selected) {
  return items.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}
function categoryOptions(selected = '', mode = 'single') {
  const head =
    mode === 'bulk'
      ? [
          ['', mt('unchanged')],
          ['__clear__', mt('clearTag')]
        ]
      : [['', mt('noCategory')]];
  const grouped = ['cas', 'buildbuy', 'gameplay', 'other', 'custom']
    .map(group => {
      const items = allModCategories().filter(item => item.group === group);
      return items.length ? `<optgroup label="${esc(mt(`group_${group}`))}">${optionList(items.map(item => [item.id, item[state.lang === 'es' ? 'es' : 'en']]), selected)}</optgroup>` : '';
    })
    .join('');
  return optionList(head, selected) + grouped;
}
function genderOptions(selected = '', mode = 'single') {
  const head =
    mode === 'bulk'
      ? [
          ['', mt('unchanged')],
          ['__clear__', mt('clearTag')]
        ]
      : [['', mt('neutral')]];
  return optionList([...head, ...MOD_GENDERS.map(([value, key]) => [value, mt(key)])], selected);
}
function ageOptions(selected = '', mode = 'single') {
  const head =
    mode === 'bulk'
      ? [
          ['', mt('unchanged')],
          ['__clear__', mt('clearTag')]
        ]
      : [['', mt('noAge')]];
  return optionList([...head, ...MOD_AGES.map(([value, key]) => [value, mt(key)])], selected);
}
function creatorsDatalist(id) {
  return `<datalist id="${id}">${mods.catalog.creators.map(item => `<option value="${esc(item.name)}"></option>`).join('')}</datalist>`;
}
const n = value => Number(value || 0).toLocaleString(state.lang);

// The page heading is "My CC"; the folder facts sit under it and the library section is titled "Library".
function renderModsIntro() {
  return `${libraryFolderStrip()}<div class="library-head"><h2 class="library-title" id="mods-title">${t('libraryTitle')}</h2>${mods.result ? libraryViewSwitch() : ''}</div>`;
}
function renderModsToolbar() {
  const pendingCount = mods.busy ? 0 : pendingClassification().length;
  const scanButton = mods.busy
    ? `<button class="secondary-btn" id="cancel-managed-scan">${mt('cancelScan')}</button>`
    : `<button class="primary-btn" id="managed-scan-mods" data-tip="${esc(t('tipScan'))}" ${mods.working ? 'disabled' : ''}>${mods.result ? mt('rescan') : mt('scan')}</button>`;
  return `<div class="mods-toolbar"><div class="mods-toolbar-group" role="group" aria-labelledby="mods-safe-label"><span class="mods-group-label" id="mods-safe-label"><i class="safe-dot" aria-hidden="true"></i>${mt('safeGroup')}</span><div class="mods-group-buttons">${scanButton}<button class="secondary-btn" id="manage-mod-categories" data-tip="${esc(t('tipCategoriesFolders'))}">${mt('addCategory')}</button><button class="secondary-btn" id="manage-mod-creators" data-tip="${esc(t('tipCreatorsManage'))}">${mt('addCreator')}</button>${pendingCount ? `<button class="secondary-btn classify-open" id="classify-open" data-tip="${esc(t('tipClassify'))}">${icon('tag')}<span>${esc(format(t('classifyOpen'), { count: n(pendingCount) }))}</span></button>` : ''}</div></div><div class="mods-toolbar-group" role="group" aria-labelledby="mods-add-label"><span class="mods-group-label" id="mods-add-label"><i class="copy-dot" aria-hidden="true"></i>${mt('addGroup')}</span><div class="mods-group-buttons"><button class="secondary-btn" id="import-mod-files" data-tip="${esc(t('tipImportFiles'))}" ${mods.busy || mods.working ? 'disabled' : ''}>${mt('importFiles')}</button><button class="secondary-btn" id="import-mod-folder" data-tip="${esc(t('tipImportFolder'))}" ${mods.busy || mods.working ? 'disabled' : ''}>${mt('importFolder')}</button></div></div></div>`;
}
function renderModsProgress() {
  if (!mods.busy) return '';
  const p = mods.progress || {};
  return `<div class="scan-progress" role="status" aria-live="polite"><div class="scan-progress-copy" id="managed-scan-progress">${progressText(p)}</div><div class="scan-progress-track" aria-hidden="true"><i></i></div></div>`;
}
function progressText(p) {
  return `<span>${mt('scanning')} ${esc(format(mt('progressCounts'), { checked: n(p.visited), found: n(p.found) }))}</span>`;
}
function renderModsSummary(summary) {
  const result = mods.result;
  if (!result) return '';
  const chips = [
    `<b>${esc(format(mtCount('summaryFiles', summary.total), { count: n(summary.total) }))}</b>`,
    `<span>${esc(format(mt('summaryEnabled'), { count: n(summary.enabled) }))}</span>`,
    `<span>${esc(format(mt('summaryDisabled'), { count: n(summary.disabled) }))}</span>`,
    summary.tooDeep ? `<button class="scan-warning summary-link" data-mod-filter="tooDeep">⚠ ${esc(format(mt('summaryTooDeep'), { count: n(summary.tooDeep) }))}</button>` : '',
    result.unreadableFolders ? `<span class="scan-warning">⚠ ${esc(format(mt('summaryUnreadable'), { count: n(result.unreadableFolders) }))}</span>` : '',
    result.cancelled ? `<span class="scan-warning">${mt('scanCancelledPartial')}</span>` : ''
  ];
  return `<div class="scan-summary" aria-label="${esc(mt('summaryLabel'))}">${chips.join('')}</div>`;
}
function renderModsEmptyState() {
  if (!modsApi) return `<div class="mods-empty"><b>${mt('desktopOnlyTitle')}</b><p>${t('desktopOnly')}</p></div>`;
  if (!routeRecords.mods?.path) {
    return `<div class="mods-empty"><b>${mt('noFolderTitle')}</b><p>${mt('noFolderText')}</p><button class="primary-btn" data-pick-folder="mods">${t('chooseFolder')}</button></div>`;
  }
  if (mods.busy) return '';
  return `<div class="mods-empty"><b>${mt('noScanTitle')}</b><p>${esc(format(mt('noScanText'), { folder: routeRecords.mods.name || routeRecords.mods.path }))}</p></div>`;
}
function renderFolderSettings() {
  const rows = allModCategories()
    .map(item => {
      const checked = mods.catalog.folderCategories.includes(item.id);
      const label = item[state.lang === 'es' ? 'es' : 'en'];
      return `<label class="folder-choice"><input type="checkbox" data-folder-category="${esc(item.id)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span><input type="text" data-folder-name="${esc(item.id)}" value="${esc(folderNameFor(item.id))}" aria-label="${esc(format(mt('folderNameFor'), { category: label }))}" ${checked ? '' : 'disabled'}></label>`;
    })
    .join('');
  return `<details class="mods-folder-settings" ${mods.folderSettingsOpen ? 'open' : ''}><summary>${mt('configureFolders')} <span class="summary-count">${esc(format(mt('folderReady'), { count: n(mods.catalog.folderCategories.length) }))}</span></summary><p>${mt('noFolders')}</p><div class="mods-folder-choice-list">${rows}</div><div class="detail-actions"><button class="secondary-btn" id="create-mod-category-folders" ${mods.working ? 'disabled' : ''}>${mt('createFolders')}</button><span class="changes-files-note">${mt('createFoldersNote')}</span></div></details>`;
}
function renderModsFilters(filtered) {
  const tabs = [
    ['all', 'allFiles'],
    ['enabled', 'enabled'],
    ['disabled', 'disabled'],
    ['tooDeep', 'tooDeepFilter']
  ]
    .map(([id, key]) => `<button class="small-chip ${mods.stateFilter === id ? 'active' : ''}" data-mod-filter="${id}" aria-pressed="${mods.stateFilter === id}">${mt(key)}</button>`)
    .join('');
  const categories = `<label class="mods-category-filter"><span>${mt('category')}</span><select id="mod-category-filter"><option value="">${mt('allCategories')}</option><option value="__none__" ${mods.categoryFilter === '__none__' ? 'selected' : ''}>${mt('noCategory')}</option>${categoryOptions(mods.categoryFilter).replace(/^<option value="" [^>]*>[^<]*<\/option>/, '')}</select></label>`;
  return `<div class="mods-search-row"><div class="library-search-bar scan-search"><label><span aria-hidden="true">⌕</span><input id="scan-search" type="search" value="${esc(mods.query)}" placeholder="${esc(mt('search'))}" aria-label="${esc(mt('search'))}"></label></div></div><div class="mods-filter-row"><div class="subtabs mods-filter-tabs" role="group" aria-label="${esc(mt('stateFilterLabel'))}">${tabs}</div>${originFilter()}${categories}</div><div class="mods-select-row"><span class="mods-result-count" role="status">${esc(format(mt('resultCount'), { count: n(filtered.length) }))}</span><button class="text-link" id="select-mod-page">${mt('selectPage')}</button><button class="text-link" id="select-mod-results">${esc(format(mt('selectResults'), { count: n(filtered.length) }))}</button>${mods.selected.size ? `<button class="text-link" id="clear-mod-selection">${mt('clearSelection')}</button>` : ''}</div>`;
}
function renderBulkTools() {
  if (!mods.selected.size) return '';
  const canOrganize = mods.catalog.folderCategories.length > 0;
  return `<section class="mods-bulk-tools" aria-labelledby="mods-bulk-title"><div class="mods-bulk-head"><b id="mods-bulk-title">${esc(format(mt('selectedCount'), { count: n(mods.selected.size) }))}</b></div><div class="mods-bulk-section"><span class="mods-group-label"><i class="safe-dot" aria-hidden="true"></i>${mt('tagGroup')}</span><div class="mods-bulk-fields"><label><span>${mt('category')}</span><select id="bulk-mod-category">${categoryOptions('', 'bulk')}</select></label><label><span>${mt('creator')}</span><input id="bulk-mod-creator" list="bulk-mod-creators" placeholder="${esc(mt('unchanged'))}">${creatorsDatalist('bulk-mod-creators')}</label><label><span>${mt('gender')}</span><select id="bulk-mod-gender">${genderOptions('', 'bulk')}</select></label><label><span>${mt('age')}</span><select id="bulk-mod-age">${ageOptions('', 'bulk')}</select></label><label class="mods-clear-creator"><input id="clear-bulk-mod-creator" type="checkbox"><span>${mt('clearCreator')}</span></label><button class="primary-btn" id="apply-mod-tags">${mt('applyTags')}</button></div></div><div class="mods-bulk-section changes-files"><span class="mods-group-label"><i class="change-dot" aria-hidden="true"></i>${mt('changeGroup')}</span><div class="mods-bulk-actions"><button class="secondary-btn" data-bulk-mod-toggle="true" ${mods.working ? 'disabled' : ''}>${mt('enable')}</button><button class="secondary-btn" data-bulk-mod-toggle="false" ${mods.working ? 'disabled' : ''}>${mt('disable')}</button><button class="secondary-btn" id="organize-selected-mods" ${canOrganize && !mods.working ? '' : 'disabled'} title="${esc(canOrganize ? mt('organizeHint') : mt('organizeNeedsFolders'))}">${mt('organize')}</button><button class="danger-btn" id="trash-selected-mods" ${mods.working ? 'disabled' : ''}>${mt('remove')}</button></div><p class="changes-files-note">${canOrganize ? mt('changeGroupNote') : mt('organizeNeedsFolders')}</p></div></section>`;
}
function renderModRow(file) {
  const tags = tagsForMod(file.relativePath);
  const category = categoryNameForMod(tags.categoryId);
  const creator = modLookup().creatorLabel(file);
  const dims = [tags.gender && mt(MOD_GENDERS.find(([value]) => value === tags.gender)?.[1] || 'neutral'), tags.age && mt(MOD_AGES.find(([value]) => value === tags.age)?.[1] || 'unknownAge')]
    .filter(Boolean)
    .join(' · ');
  const warning = modDepthWarning(file);
  const path = esc(file.relativePath);
  const name = esc(file.name);
  return `<li class="managed-mod-row ${mods.selected.has(file.relativePath) ? 'is-selected' : ''} ${file.enabled ? '' : 'is-off'}"><input type="checkbox" data-mod-select="${path}" ${mods.selected.has(file.relativePath) ? 'checked' : ''} aria-label="${esc(format(mt('selectFile'), { name: file.name }))}"><span class="scan-file-icon" aria-hidden="true" title="${file.extension === 'ts4script' ? mt('scriptFile') : mt('packageFile')}">${file.extension === 'ts4script' ? '⚙' : '✧'}</span><span class="managed-mod-copy"><b title="${name}">${name}</b><small title="${path}">${path}</small><span class="managed-mod-tags">${originBadge(file)}<i class="${file.enabled ? 'is-enabled' : 'is-disabled'}">${file.enabled ? mt('enabledState') : mt('disabledState')}</i>${category ? `<i>${esc(category)}</i>` : `<i class="is-empty">${mt('noCategory')}</i>`}${creator ? `<i>${esc(creator)}</i>` : ''}${dims ? `<i>${esc(dims)}</i>` : ''}${warning ? `<i class="script-depth-warning" title="${esc(mt(`${warning}Help`))}">⚠ ${esc(mt(warning))}</i>` : ''}</span></span><span class="managed-mod-actions"><button class="small-chip" data-edit-mod-tags="${path}" aria-label="${esc(format(mt('editTagsFor'), { name: file.name }))}">${mt('editTags')}</button><button class="small-chip" data-toggle-mod="${path}" aria-label="${esc(format(mt(file.enabled ? 'disableFile' : 'enableFile'), { name: file.name }))}" ${mods.working ? 'disabled' : ''}>${file.enabled ? mt('disable') : mt('enable')}</button><button class="small-chip" data-rename-mod="${path}" aria-label="${esc(format(mt('renameFile'), { name: file.name }))}" ${mods.working ? 'disabled' : ''}>${mt('rename')}</button><button class="small-chip danger-quiet icon-only" data-trash-mod="${path}" aria-label="${esc(format(mt('removeFile'), { name: file.name }))}" title="${esc(mt('remove'))}" ${mods.working ? 'disabled' : ''}>🗑</button></span></li>`;
}
function renderModsList(filtered) {
  const pages = Math.max(1, Math.ceil(filtered.length / MODS_PAGE_SIZE));
  mods.page = Math.min(mods.page, pages - 1);
  const pageFiles = filtered.slice(mods.page * MODS_PAGE_SIZE, (mods.page + 1) * MODS_PAGE_SIZE);
  if (!pageFiles.length) {
    const noFiles = !mods.result.files.length;
    return `<div class="mods-empty"><b>${noFiles ? mt('noMods') : mt('noMatches')}</b>${noFiles ? '' : `<button class="text-link" id="reset-mod-filters">${mt('resetFilters')}</button>`}</div>`;
  }
  const pager =
    pages > 1
      ? `<nav class="scan-pagination" aria-label="${esc(mt('pagination'))}"><button class="small-chip" data-scan-page="first" ${mods.page === 0 ? 'disabled' : ''} aria-label="${esc(mt('firstPage'))}">«</button><button class="small-chip" data-scan-page="-1" ${mods.page === 0 ? 'disabled' : ''} aria-label="${esc(mt('previousPage'))}">←</button><span>${esc(format(mt('pageOf'), { page: n(mods.page + 1), pages: n(pages) }))}</span><button class="small-chip" data-scan-page="1" ${mods.page >= pages - 1 ? 'disabled' : ''} aria-label="${esc(mt('nextPage'))}">→</button><button class="small-chip" data-scan-page="last" ${mods.page >= pages - 1 ? 'disabled' : ''} aria-label="${esc(mt('lastPage'))}">»</button></nav>`
      : '';
  return `<ul class="scan-file-list managed-mod-list" aria-label="${esc(mt('fileListLabel'))}">${pageFiles.map(renderModRow).join('')}</ul>${pager}`;
}
function renderManagedModsPanel() {
  const files = mods.result?.files || [];
  const filtered = mods.result ? filteredModFiles() : [];
  const body = mods.result
    ? `${renderModsSummary(summarizeModFiles(files))}${libraryFolders()}<section class="library-list ${library.listOpen ? 'is-open' : ''}"><button class="library-list-toggle" id="toggle-library-list" aria-expanded="${library.listOpen}" aria-controls="library-list-body">${icon('chevron', 'disclosure-icon')}<b>${t('libFileList')}</b><span class="badge">${n(filtered.length)}</span>${filtered.length !== files.length ? `<small>${esc(format(t('libOfTotal'), { total: n(files.length) }))}</small>` : ''}</button><div class="library-list-body" id="library-list-body" ${library.listOpen ? '' : 'hidden'}>${renderFolderSettings()}${renderModsFilters(filtered)}${renderBulkTools()}${renderModsList(filtered)}</div></section>`
    : renderModsEmptyState();
  const errorBox = mods.error
    ? `<div class="scan-error" role="alert"><b>${mt('scanError')}</b> <span>${esc(errorMessage(mods.error))}</span>${
        mods.error.code === 'MODS_ROOT_UNAVAILABLE' || mods.error.code === 'MODS_ROOT_NOT_SET'
          ? `<button class="text-link" data-pick-folder="mods">${t('changeFolder')}</button>`
          : `<button class="text-link" id="retry-managed-scan">${mt('tryAgain')}</button>`
      }</div>`
    : '';
  return `<section class="mods-scan-panel mods-manager" aria-labelledby="mods-title" aria-busy="${mods.busy}">${renderModsIntro()}${modsApi ? renderModsToolbar() : ''}${renderModsProgress()}${errorBox}${body}</section>`;
}
// Re-renders only the Mods panel (not the whole page) and keeps keyboard focus where it was.
function renderModsPanel() {
  const root = document.getElementById('mods-manager-root');
  if (!root) return;
  withFocusPreserved(() => {
    root.innerHTML = renderManagedModsPanel();
  });
  nav();
}

/* ---------- Actions ---------- */
async function scanManagedMods() {
  if (!modsApi || mods.busy) return;
  mods.busy = true;
  mods.error = null;
  mods.progress = { visited: 0, found: 0 };
  renderModsPanel();
  document.getElementById('cancel-managed-scan')?.focus();
  try {
    await saveModCatalog();
    await loadModCatalog();
    const result = await callDesktop(modsApi.scan);
    setScanResult(result);
    mods.page = 0;
    mods.selected.clear();
    toast(result.cancelled ? mt('scanCancelledPartial') : format(mt('scanDone'), { count: n(result.files.length) }));
    setTimeout(offerClassification, 400);
  } catch (error) {
    mods.error = error;
  } finally {
    mods.busy = false;
    renderModsPanel();
    document.getElementById('managed-scan-mods')?.focus({ preventScroll: true });
  }
}

// Runs a file-changing action with the panel locked so two changes cannot overlap.
async function runFileAction(action) {
  if (mods.working) return;
  mods.working = true;
  renderModsPanel();
  try {
    await action();
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    mods.working = false;
    if (catalogDirty) scheduleModCatalogSave(0);
    else catalogChanged();
    renderModsPanel();
  }
}

function describeFailure(item) {
  return errorMessage(item);
}

async function importManagedMods(kind) {
  await runFileAction(async () => {
    const result = await callDesktop(kind === 'folder' ? modsApi.importFolder : modsApi.importFiles);
    if (result.canceled) return;
    const failures = (result.failures || []).map(item => ({ ...item, label: item.name }));
    const summary = format(mt('importResult'), { count: n(result.imported), skipped: n(result.skipped) });
    if (failures.length || result.unsupported) {
      showResultDialog({ title: mt('importTitle'), summary: `${summary}${result.unsupported ? ` ${format(mt('importUnsupported'), { count: n(result.unsupported) })}` : ''}`, failures, describe: describeFailure });
    } else {
      toast(summary);
    }
    if (result.imported) setTimeout(scanManagedMods, 0);
  });
}

function createCreatorIfMissing(name) {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) return null;
  let creator = mods.catalog.creators.find(item => item.name.trim().toLocaleLowerCase() === normalized);
  if (!creator) {
    creator = { id: `creator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 120) };
    mods.catalog.creators.push(creator);
  }
  return creator;
}
function storeModTags(relativePath, tags) {
  const compact = Object.fromEntries(Object.entries(tags).filter(([, value]) => typeof value === 'string' && value));
  if (Object.keys(compact).length) mods.catalog.files[relativePath] = compact;
  else delete mods.catalog.files[relativePath];
}

function applyBulkTags() {
  const category = document.getElementById('bulk-mod-category')?.value || '';
  const creatorText = document.getElementById('bulk-mod-creator')?.value.trim() || '';
  const clearCreator = !!document.getElementById('clear-bulk-mod-creator')?.checked;
  const gender = document.getElementById('bulk-mod-gender')?.value || '';
  const age = document.getElementById('bulk-mod-age')?.value || '';
  if (!category && !creatorText && !clearCreator && !gender && !age) return toast(mt('nothingToApply'));
  const creator = creatorText ? createCreatorIfMissing(creatorText) : null;
  const apply = (tags, key, value) => {
    if (value === '__clear__') delete tags[key];
    else if (value) tags[key] = value;
  };
  for (const relativePath of mods.selected) {
    const tags = { ...tagsForMod(relativePath) };
    apply(tags, 'categoryId', category);
    apply(tags, 'gender', gender);
    apply(tags, 'age', age);
    if (creator) tags.creatorId = creator.id;
    else if (clearCreator) delete tags.creatorId;
    storeModTags(relativePath, tags);
  }
  scheduleModCatalogSave();
  renderModsPanel();
  toast(format(mt('tagsApplied'), { count: n(mods.selected.size) }));
}

async function toggleSelected(enabled) {
  const paths = [...mods.selected];
  const ok =
    paths.length < 2 ||
    (await confirmAction({
      eyebrow: mt('changeGroup'),
      title: format(mt(enabled ? 'confirmEnableTitle' : 'confirmDisableTitle'), { count: n(paths.length) }),
      body: mt(enabled ? 'confirmEnable' : 'confirmDisable'),
      confirmLabel: mt(enabled ? 'enable' : 'disable')
    }));
  if (!ok) return;
  await runFileAction(async () => {
    const result = await callDesktop(modsApi.toggleMany, paths, enabled);
    for (const item of result.results) if (item.ok && item.newPath) updateModPath(item.oldPath, item.newPath);
    reportBatch(mt(enabled ? 'enable' : 'disable'), format(mt('toggleResult'), { changed: n(result.changed), skipped: n(result.skipped) }), result.results, 'oldPath');
  });
}

async function trashSelected() {
  const paths = [...mods.selected];
  const ok = await confirmAction({
    eyebrow: mt('changeGroup'),
    title: format(mtCount('confirmBulkDeleteTitle', paths.length), { count: n(paths.length) }),
    body: mtCount('confirmDelete', paths.length),
    details: paths.slice(0, 6).map(fileNameOf).concat(paths.length > 6 ? [format(mt('andMore'), { count: n(paths.length - 6) })] : []),
    confirmLabel: mt('remove'),
    danger: true
  });
  if (!ok) return;
  await runFileAction(async () => {
    const result = await callDesktop(modsApi.trashMany, paths);
    removeModPaths(result.results.filter(item => item.ok).map(item => item.relativePath));
    reportBatch(mt('remove'), format(mt('trashResult'), { count: n(result.deleted), skipped: n(result.skipped) }), result.results, 'relativePath');
  });
}

function reportBatch(title, summary, results, pathKey) {
  const failures = results.filter(item => !item.ok).map(item => ({ ...item, label: item[pathKey] || '—' }));
  if (failures.length) showResultDialog({ title, summary, failures, describe: describeFailure });
  else toast(summary);
}

function openModTagsDialog(relativePath) {
  const tags = tagsForMod(relativePath);
  const currentCreator = creatorForMod(tags.creatorId)?.name || '';
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form"><div class="eyebrow">${mt('editTags')} · ${mt('tagsOnlyNote')}</div><h2 id="dialog-title">${mt('editTagsTitle')}</h2><p class="path-text">${esc(relativePath)}</p><label>${mt('category')}<select id="mod-tag-category">${categoryOptions(tags.categoryId)}</select></label><label>${mt('creator')}<input id="mod-tag-creator" list="mod-tag-creators" value="${esc(currentCreator)}" placeholder="${esc(mt('noCreator'))}">${creatorsDatalist('mod-tag-creators')}</label><label>${mt('gender')}<select id="mod-tag-gender">${genderOptions(tags.gender)}</select></label><label>${mt('age')}<select id="mod-tag-age">${ageOptions(tags.age)}</select></label><div class="detail-actions"><button class="primary-btn" id="save-mod-tags" data-mod-path="${esc(relativePath)}">${mt('saveTags')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function openRenameModDialog(relativePath) {
  const name = fileNameOf(relativePath);
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form"><div class="eyebrow">${mt('changeGroup')}</div><h2 id="dialog-title">${mt('rename')}</h2><p class="path-text">${esc(relativePath)}</p><label>${mt('fileName')}<span class="input-with-suffix"><input id="rename-mod-name" value="${esc(base)}" maxlength="180" spellcheck="false"><span aria-hidden="true">${esc(extension)}</span></span></label><p class="muted-note">${mt('renameNote')}</p><div class="detail-actions"><button class="primary-btn" id="save-mod-name" data-mod-path="${esc(relativePath)}">${mt('saveName')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
  document.getElementById('rename-mod-name')?.select();
}
function openAddCategoryDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form"><div class="eyebrow">${mt('custom')}</div><h2 id="dialog-title">${mt('newCategory')}</h2><label>${mt('categoryName')}<input id="new-mod-category" maxlength="120"></label><div class="detail-actions"><button class="primary-btn" id="save-new-mod-category">${mt('createCategory')}</button><button class="secondary-btn" id="manage-mod-categories">${t('cancel')}</button></div></div>`
  );
}
function openCategoriesDialog() {
  const rows = allModCategories()
    .map(item => {
      const checked = mods.catalog.folderCategories.includes(item.id);
      const label = item[state.lang === 'es' ? 'es' : 'en'];
      return `<div class="mods-category-setting"><label><input type="checkbox" data-folder-category="${esc(item.id)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label><input type="text" data-folder-name="${esc(item.id)}" value="${esc(folderNameFor(item.id))}" aria-label="${esc(format(mt('folderNameFor'), { category: label }))}" ${checked ? '' : 'disabled'}>${item.group === 'custom' ? `<button class="small-chip danger-quiet icon-only" data-remove-category="${esc(item.id)}" aria-label="${esc(`${mt('deleteCategory')}: ${label}`)}" title="${esc(mt('deleteCategory'))}">×</button>` : ''}</div>`;
    })
    .join('');
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form mods-category-dialog"><div class="eyebrow">${mt('safeGroup')}</div><h2 id="dialog-title">${mt('addCategory')}</h2><p>${mt('noFolders')}</p><div class="mods-category-settings-list">${rows}</div><div class="detail-actions"><button class="secondary-btn" id="new-mod-category-button">＋ ${mt('newCategory')}</button><button class="primary-btn" id="save-mod-category-settings">${mt('done')}</button></div></div>`,
    { wide: true }
  );
}
function openCreatorsDialog() {
  const rows = mods.catalog.creators
    .map(
      item =>
        `<li class="mods-creator-setting"><span>${esc(item.name)}</span><button class="small-chip" data-edit-creator="${esc(item.id)}">${mt('rename')}</button><button class="small-chip danger-quiet icon-only" data-remove-creator="${esc(item.id)}" aria-label="${esc(`${mt('deleteCreator')}: ${item.name}`)}" title="${esc(mt('deleteCreator'))}">×</button></li>`
    )
    .join('');
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form"><div class="eyebrow">${mt('safeGroup')}</div><h2 id="dialog-title">${mt('creatorTitle')}</h2><p>${mt('creatorsNote')}</p><ul class="mods-creator-list">${rows || `<li class="muted-note">${mt('noCreatorsYet')}</li>`}</ul><div class="detail-actions"><button class="secondary-btn" id="new-mod-creator-button">＋ ${mt('newCreator')}</button><button class="primary-btn" data-close>${mt('done')}</button></div></div>`
  );
}
function openCreatorEditor(creatorId = '') {
  const creator = mods.catalog.creators.find(item => item.id === creatorId);
  openDialog(
    `${closeButton()}<div class="form-dialog mods-form"><div class="eyebrow">${mt('creatorTitle')}</div><h2 id="dialog-title">${creator ? mt('rename') : mt('newCreator')}</h2><label>${mt('creatorName')}<input id="edit-mod-creator-name" maxlength="120" value="${esc(creator?.name || '')}"></label><div class="detail-actions"><button class="primary-btn" id="save-mod-creator" data-creator-id="${esc(creatorId)}">${mt('saveCreator')}</button><button class="secondary-btn" id="manage-mod-creators" data-tip="${esc(t('tipCreatorsManage'))}">${t('cancel')}</button></div></div>`
  );
}

/* ---------- Events ---------- */
const MOD_CLICK_ACTIONS = {
  'managed-scan-mods': scanManagedMods,
  'retry-managed-scan': scanManagedMods,
  'cancel-managed-scan': () => {
    modsApi?.cancelScan();
    document.getElementById('cancel-managed-scan')?.setAttribute('disabled', '');
  },
  'import-mod-files': () => importManagedMods('files'),
  'import-mod-folder': () => importManagedMods('folder'),
  'manage-mod-categories': openCategoriesDialog,
  'manage-mod-creators': openCreatorsDialog,
  'new-mod-category-button': openAddCategoryDialog,
  'new-mod-creator-button': () => openCreatorEditor(),
  'save-new-mod-category': () => {
    const field = document.getElementById('new-mod-category');
    const name = field?.value.trim();
    if (!name) return field?.focus();
    const lower = name.toLocaleLowerCase();
    if (allModCategories().some(item => item.en.toLocaleLowerCase() === lower || item.es.toLocaleLowerCase() === lower)) return toast(mt('categoryExists'), 'error');
    mods.catalog.categories.push({ id: `custom-${Date.now().toString(36)}`, name: name.slice(0, 120) });
    scheduleModCatalogSave();
    openCategoriesDialog();
  },
  'save-mod-category-settings': () => {
    saveModCatalog();
    closeDialog();
    renderModsPanel();
  },
  'create-mod-category-folders': async () => {
    const names = [...new Set(mods.catalog.folderCategories.map(folderNameFor).filter(Boolean))];
    if (!names.length) return toast(mt('noFolders'));
    const ok = await confirmAction({
      eyebrow: mt('changeGroup'),
      title: format(mtCount('confirmCreateFoldersTitle', names.length), { count: n(names.length) }),
      body: mt('confirmCreateFolders'),
      details: names.slice(0, 10).map(name => `Mods\\${name}`),
      confirmLabel: mt('createFolders')
    });
    if (!ok) return;
    await runFileAction(async () => {
      const result = await callDesktop(modsApi.createFolders, names);
      toast(format(mt('foldersCreated'), { count: n(result.created) }));
    });
  },
  'select-mod-page': () => {
    for (const file of filteredModFiles().slice(mods.page * MODS_PAGE_SIZE, (mods.page + 1) * MODS_PAGE_SIZE)) mods.selected.add(file.relativePath);
    renderModsPanel();
  },
  'select-mod-results': () => {
    for (const file of filteredModFiles()) mods.selected.add(file.relativePath);
    renderModsPanel();
  },
  'clear-mod-selection': () => {
    mods.selected.clear();
    renderModsPanel();
  },
  'reset-mod-filters': () => {
    Object.assign(mods, { query: '', stateFilter: 'all', categoryFilter: '', page: 0 });
    Object.assign(library, { origin: 'all', creatorFilter: '' });
    renderModsPanel();
  },
  'apply-mod-tags': applyBulkTags,
  'organize-selected-mods': () => organizeSelected(),
  'trash-selected-mods': trashSelected,
  'save-mod-tags': button => {
    const relativePath = button.dataset.modPath;
    const creatorName = document.getElementById('mod-tag-creator')?.value.trim() || '';
    const creator = creatorName ? createCreatorIfMissing(creatorName) : null;
    storeModTags(relativePath, {
      categoryId: document.getElementById('mod-tag-category')?.value || '',
      creatorId: creator?.id || '',
      gender: document.getElementById('mod-tag-gender')?.value || '',
      age: document.getElementById('mod-tag-age')?.value || ''
    });
    scheduleModCatalogSave();
    closeDialog();
    renderModsPanel();
    toast(mt('tagSaved'));
  },
  'save-mod-name': async button => {
    const value = document.getElementById('rename-mod-name')?.value || '';
    if (!value.trim()) return document.getElementById('rename-mod-name')?.focus();
    try {
      const result = await callDesktop(modsApi.rename, button.dataset.modPath, value);
      updateModPath(result.oldPath, result.newPath);
      if (catalogDirty) scheduleModCatalogSave(0);
      closeDialog();
      renderModsPanel();
      toast(format(mt('renamed'), { name: fileNameOf(result.newPath) }));
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  },
  'save-mod-creator': button => {
    const field = document.getElementById('edit-mod-creator-name');
    const name = field?.value.trim();
    if (!name) return field?.focus();
    const creator = button.dataset.creatorId ? creatorForMod(button.dataset.creatorId) : null;
    if (creator) creator.name = name.slice(0, 120);
    else createCreatorIfMissing(name);
    scheduleModCatalogSave();
    openCreatorsDialog();
    renderModsPanel();
  }
};

document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  try {
    if (target.id && MOD_CLICK_ACTIONS[target.id]) return await MOD_CLICK_ACTIONS[target.id](target);
    const page = target.dataset.scanPage;
    if (page) {
      const pages = Math.max(1, Math.ceil(filteredModFiles().length / MODS_PAGE_SIZE));
      mods.page = page === 'first' ? 0 : page === 'last' ? pages - 1 : Math.min(pages - 1, Math.max(0, mods.page + Number(page)));
      renderModsPanel();
      document.querySelector('.managed-mod-list')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (target.dataset.bulkModToggle) return await toggleSelected(target.dataset.bulkModToggle === 'true');
    if (target.dataset.editModTags) return openModTagsDialog(target.dataset.editModTags);
    if (target.dataset.renameMod) return openRenameModDialog(target.dataset.renameMod);
    if (target.dataset.toggleMod) {
      const relativePath = target.dataset.toggleMod;
      return await runFileAction(async () => {
        const result = await callDesktop(modsApi.toggle, relativePath);
        updateModPath(result.oldPath, result.newPath);
        toast(format(mt(result.enabled ? 'fileEnabled' : 'fileDisabled'), { name: fileNameOf(result.newPath) }));
      });
    }
    if (target.dataset.trashMod) {
      const relativePath = target.dataset.trashMod;
      const ok = await confirmAction({ eyebrow: mt('changeGroup'), title: mt('confirmDeleteTitle'), body: mtCount('confirmDelete', 1), details: [relativePath], confirmLabel: mt('remove'), danger: true });
      if (!ok) return;
      return await runFileAction(async () => {
        const result = await callDesktop(modsApi.trash, relativePath);
        removeModPaths([result.relativePath]);
        toast(format(mt('fileTrashed'), { name: fileNameOf(result.relativePath) }));
      });
    }
    if (target.dataset.editCreator) return openCreatorEditor(target.dataset.editCreator);
    if (target.dataset.removeCreator) {
      const id = target.dataset.removeCreator;
      const creator = creatorForMod(id);
      const ok = await confirmAction({ title: mt('deleteCreator'), body: mt('confirmRemoveCreator'), details: creator ? [creator.name] : [], confirmLabel: mt('deleteCreator') });
      if (ok) {
        mods.catalog.creators = mods.catalog.creators.filter(item => item.id !== id);
        for (const tags of Object.values(mods.catalog.files)) if (tags.creatorId === id) delete tags.creatorId;
        scheduleModCatalogSave();
        renderModsPanel();
      }
      return openCreatorsDialog();
    }
    if (target.dataset.removeCategory) {
      const id = target.dataset.removeCategory;
      const category = categoryForMod(id);
      const ok = await confirmAction({ title: mt('deleteCategory'), body: mt('confirmRemoveCategory'), details: category ? [category.en] : [], confirmLabel: mt('deleteCategory') });
      if (ok) {
        mods.catalog.categories = mods.catalog.categories.filter(item => item.id !== id);
        mods.catalog.folderCategories = mods.catalog.folderCategories.filter(value => value !== id);
        delete mods.catalog.folderNames[id];
        for (const tags of Object.values(mods.catalog.files)) if (tags.categoryId === id) delete tags.categoryId;
        if (mods.categoryFilter === id) mods.categoryFilter = '';
        scheduleModCatalogSave();
        renderModsPanel();
      }
      return openCategoriesDialog();
    }
    const filter = target.dataset.modFilter;
    if (filter) {
      mods.stateFilter = filter;
      mods.page = 0;
      renderModsPanel();
    }
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-mod-select]')) {
    if (target.checked) mods.selected.add(target.dataset.modSelect);
    else mods.selected.delete(target.dataset.modSelect);
    renderModsPanel();
    return;
  }
  if (target.id === 'mod-category-filter') {
    mods.categoryFilter = target.value;
    mods.page = 0;
    mods.selected.clear();
    renderModsPanel();
    return;
  }
  if (target.matches('[data-folder-category]')) {
    const id = target.dataset.folderCategory;
    mods.catalog.folderCategories = target.checked ? [...new Set([...mods.catalog.folderCategories, id])] : mods.catalog.folderCategories.filter(value => value !== id);
    const nameInput = target.closest('.folder-choice, .mods-category-setting')?.querySelector('[data-folder-name]');
    if (nameInput) nameInput.disabled = !target.checked;
    scheduleModCatalogSave();
    if (!dialog.contains(target)) renderModsPanel();
    return;
  }
  if (target.matches('[data-folder-name]')) {
    const id = target.dataset.folderName;
    const value = target.value.trim();
    if (value && value !== categoryForMod(id)?.es) mods.catalog.folderNames[id] = value;
    else delete mods.catalog.folderNames[id];
    scheduleModCatalogSave();
  }
});

document.addEventListener('toggle', event => {
  if (event.target.matches?.('.mods-folder-settings')) mods.folderSettingsOpen = event.target.open;
}, true);

let modSearchTimer = null;
document.addEventListener('input', event => {
  if (event.target.id !== 'scan-search') return;
  const value = event.target.value;
  clearTimeout(modSearchTimer);
  modSearchTimer = setTimeout(() => {
    mods.query = value;
    mods.page = 0;
    mods.selected.clear();
    renderModsPanel();
  }, 150);
});

modsApi?.onProgress(progress => {
  mods.progress = progress;
  const field = document.getElementById('managed-scan-progress');
  if (field) field.innerHTML = progressText(progress);
});
window.addEventListener('beforeunload', () => {
  if (catalogDirty) saveModCatalog();
});
