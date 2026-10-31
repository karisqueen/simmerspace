/* CurseForge page: browse and search Sims 4 content, open details, install, and check installed mods for
   updates. Every request goes through the desktop app (electron/curseforge-service.cjs), which holds the key. */
const cfApi = desktop?.curseforge || null;
const CF_SORTS = [
  [2, 'cfSortPopular'],
  [3, 'cfSortUpdated'],
  [6, 'cfSortDownloads'],
  [4, 'cfSortName'],
  [1, 'cfSortFeatured']
];

// Explore's filters, by the real CurseForge category ids for The Sims 4. The API returns the projects that have all the
// categories asked for, so combinations hold across the whole catalog. Masculine and Feminine are different categories
// under Clothing and under Body, and hair and makeup live under Body. CurseForge has no Unisex category: it means both.
// Maxis Match, Alpha and script are not categories, so they search the projects' own text.
const CF_FILTER_CONTENT = { hair: [5606, 'body'], clothing: [5340, 'clothing'], shoes: [5601, 'clothing'], bodyAccessories: [5603, 'clothing'], headAccessories: [5923, 'clothing'], furniture: [5621, ''], build: [5438, ''], makeup: [5610, 'body'], skinDetails: [5710, 'body'], skintones: [5609, 'body'], poses: [5599, ''], gameplay: [5091, ''] };
const CF_FILTER_AGE = { infant: 6179, toddler: 6144, child: 6140, teen: 6142, youngAdult: 6143, adult: 6139, elder: 6141 };
const CF_FILTER_GENDER = { clothing: { feminine: [5921], masculine: [5920], unisex: [5921, 5920] }, body: { feminine: [5919], masculine: [5918], unisex: [5919, 5918] } };
const CF_FILTER_STYLE = { maxis: 'maxis match', alpha: 'alpha', script: 'script' };

const cf = {
  tab: 'browse',
  classes: null,
  classesError: null,
  classId: 0,
  authorId: 0,
  followedOnly: false,
  filters: { content: '', age: '', gender: '', style: [] },
  filtersOpen: safeRead('cf-filters-open', false) === true,
  sortField: 2,
  query: '',
  index: 0,
  pageSize: 20,
  results: null,
  loading: false,
  error: null,
  request: 0,
  installs: null,
  installsError: null,
  updates: null,
  checking: false,
  installing: new Set(),
  test: null,
  testing: false,
  detailId: 0,
  items: safeRead('cf-items', {}) || {}
};
if (typeof cf.items !== 'object' || Array.isArray(cf.items)) cf.items = {};

function cfConfigured() {
  return !!state.integrations?.curseforge?.configured;
}
const compactNumber = value => new Intl.NumberFormat(state.lang, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(state.lang, { year: 'numeric', month: 'short', day: 'numeric' });
}
function cfError(error) {
  if (error?.code === 'CF_RATE_LIMITED') return format(mt('err_CF_RATE_LIMITED'), { seconds: n(error.details?.retryAfter || 30) });
  return errorMessage(error);
}
// Up to three of the item's own CurseForge categories, without repeats.
function cardTags(mod) {
  const seen = new Set();
  const tags = (mod.categories || []).filter(c => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase())).slice(0, 3);
  return tags.length ? `<div class="card-tags">${tags.map(c => `<span class="meta-pill meta-pill-quiet">${esc(c.name)}</span>`).join('')}</div>` : '';
}
function cfThumb(url, className = 'cf-thumb') {
  return url ? `<img class="${className}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${className} cf-thumb-empty" aria-hidden="true">${icon('curseforge')}</span>`;
}
// Remembers what is needed to show a CurseForge mod inside a collection without asking the API again.
function rememberCurseForgeItem(mod) {
  if (!mod?.id) return;
  cf.items[`cf:${mod.id}`] = { name: mod.name, author: mod.authors?.[0]?.name || '', logo: mod.logo || '', websiteUrl: mod.websiteUrl || '', summary: (mod.summary || '').slice(0, 200) };
  const keys = Object.keys(cf.items);
  if (keys.length > 2000) delete cf.items[keys[0]];
  safeWrite('cf-items', cf.items);
}
function curseForgeItemInfo(id) {
  return cf.items[id] || (isCurseForgeItem(id) ? { name: `CurseForge #${id.slice(3)}`, author: '', logo: '', websiteUrl: '', summary: '' } : null);
}
function curseForgeCollectionCard(id) {
  const info = curseForgeItemInfo(id);
  if (!info) return '';
  const modId = id.slice(3);
  return `<article class="cc-card cf-card">${cfThumb(info.logo)}<div class="card-body"><div class="card-title-row"><h3><button class="card-title-button" data-cf-detail="${esc(modId)}">${esc(info.name)}</button></h3><div class="card-actions"><button class="icon-btn icon-btn-sm is-on" data-save="${esc(id)}" title="${esc(t('save'))}" aria-label="${esc(t('save'))}: ${esc(info.name)}">${icon('folder')}</button></div></div><div class="card-creator">${esc(info.author)}</div><div class="card-meta"><span class="meta-pill meta-pill-cf">CurseForge</span></div></div></article>`;
}

/* ---------- Loading ---------- */
async function loadCurseForgeClasses() {
  if (!cfApi || cf.classes || cf.classesError) return;
  try {
    cf.classes = await callDesktop(cfApi.classes);
  } catch (error) {
    cf.classesError = error;
  }
  if (state.page === 'curseforge') render();
}
function cfFilterRequest() {
  const { content, age, gender, style } = cf.filters;
  const [contentId, branch] = CF_FILTER_CONTENT[content] || [];
  const categoryIds = [contentId, CF_FILTER_AGE[age], ...(CF_FILTER_GENDER[branch === 'body' ? 'body' : 'clothing'][gender] || [])].filter(Boolean);
  return { categoryIds, query: [cf.query, ...style.map(id => CF_FILTER_STYLE[id])].filter(Boolean).join(' ') };
}
const cfFollowedEmpty = () => cf.followedOnly && !state.followingCreators.length;
async function searchCurseForge() {
  if (!cfApi) return;
  const request = ++cf.request;
  cf.loading = true;
  cf.error = null;
  if (state.page === 'curseforge') render();
  try {
    const options = { ...cfFilterRequest(), classId: cf.classId || undefined, sortField: cf.sortField, sortOrder: cf.sortField === 4 ? 'asc' : 'desc', index: cf.index, pageSize: cf.pageSize };
    let result;
    if (cfFollowedEmpty()) result = null;
    else if (cf.followedOnly && !cf.authorId) result = await callDesktop(cfApi.searchFollowed, { ...options, authorIds: state.followingCreators.map(f => f.id) });
    else result = await callDesktop(cfApi.search, { ...options, authorId: cf.authorId || undefined });
    if (request !== cf.request) return;
    cf.results = result;
  } catch (error) {
    if (request !== cf.request) return;
    cf.error = error;
  } finally {
    if (request === cf.request) {
      cf.loading = false;
      if (state.page === 'curseforge') render();
    }
  }
}
async function loadCurseForgeInstalls() {
  if (!cfApi) return;
  try {
    cf.installs = await callDesktop(cfApi.installs);
    cf.installsError = null;
  } catch (error) {
    cf.installs = [];
    cf.installsError = error;
  }
  if (state.page === 'curseforge') render();
}
function curseForgeQueryChanged(query) {
  cf.query = query.trim();
  cf.index = 0;
  cf.tab = 'browse';
  searchCurseForge();
}

/* ---------- Page ---------- */
function cfCard(mod) {
  const authors = mod.authors.map(a => a.name).filter(Boolean).join(', ');
  const followed = mod.authors.some(a => isFollowing(a.id));
  return `<article class="cc-card cf-card ${followed ? 'is-followed' : ''}">${followed ? `<span class="followed-badge" data-tip="${esc(t('cfFollowedBadge'))}">${icon('heart')}<span class="visually-hidden">${esc(t('cfFollowedBadge'))}</span></span>` : ''}${cfThumb(mod.logo)}<div class="card-body"><h3><button class="card-title-button" data-cf-detail="${mod.id}">${esc(mod.name)}</button></h3><div class="card-creator">${authors ? esc(format(t('cfBy'), { name: authors })) : ''}</div><p class="cf-summary">${esc(mod.summary)}</p>${cardTags(mod)}<div class="card-meta"><span class="meta-stat" title="${esc(t('cfDownloads'))}">${icon('download')}${compactNumber(mod.downloadCount)}</span>${mod.dateModified ? `<span class="meta-stat">${esc(shortDate(mod.dateModified))}</span>` : ''}</div></div></article>`;
}
function cfSkeleton(count = 8) {
  return `<div class="card-grid" aria-hidden="true">${Array.from({ length: count }, () => '<div class="cc-card skeleton-card"><span class="skeleton skeleton-thumb"></span><div class="card-body"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line short"></span></div></div>').join('')}</div>`;
}
// Every selected filter, as [group, value, label].
function cfActiveFilters() {
  const { content, age, gender, style } = cf.filters;
  return [content && ['content', content, t(`cfType_${content}`)], age && ['age', age, t(`cfAge_${age}`)], gender && ['gender', gender, t(`cfGender_${gender}`)], ...style.map(id => ['style', id, t(`cfStyle_${id}`)])].filter(Boolean);
}
function cfFilterPanel() {
  const active = cfActiveFilters();
  const group = (name, label, ids, prefix, selected, multi = false) => chipGroup({ name: `cf-f-${name}`, label, options: ids.map(id => [id, t(`${prefix}${id}`)]), selected, multi, size: 'sm' });
  const chips = active.length
    ? `<div class="cf-active-filters">${active.map(([name, value, label]) => `<span class="cf-active-chip"><span>${esc(label)}</span><button data-cf-remove="${name}" data-value="${esc(value)}" aria-label="${esc(format(t('cfRemoveFilter'), { name: label }))}">${icon('close')}</button></span>`).join('')}<button class="text-link" id="cf-clear-filters">${t('clearFilters')}</button></div>`
    : '';
  return `<details class="cf-filters" id="cf-filter-panel" ${cf.filtersOpen ? 'open' : ''}><summary>${icon('sliders')}<span>${t('cfAdvancedFilters')}</span>${active.length ? `<span class="badge">${n(active.length)}</span>` : ''}</summary><div class="cf-filters-body">${group('content', t('cfFilterContent'), Object.keys(CF_FILTER_CONTENT), 'cfType_', cf.filters.content)}${group('age', t('cfFilterAge'), Object.keys(CF_FILTER_AGE), 'cfAge_', cf.filters.age)}${group('gender', t('cfFilterGender'), ['feminine', 'masculine', 'unisex'], 'cfGender_', cf.filters.gender)}${group('style', t('cfFilterStyle'), Object.keys(CF_FILTER_STYLE), 'cfStyle_', cf.filters.style, true)}<p class="muted-note">${t('cfFilterNote')}</p></div></details>${chips}`;
}
function cfBrowse() {
  const classes = cf.classes
    ? `<div class="filter-bar"><div class="filter-row">${chipGroup({ name: 'cf-class', label: t('category'), options: [['0', t('all')], ...cf.classes.map(c => [String(c.id), c.name])], selected: String(cf.classId), hideLabel: true })}<div class="filter-tools"><label class="select-field select-inline"><span>${t('sort')}</span><select id="cf-sort">${CF_SORTS.map(([value, key]) => `<option value="${value}" ${cf.sortField === value ? 'selected' : ''}>${t(key)}</option>`).join('')}</select></label></div></div></div>`
    : cf.classesError
      ? ''
      : '<div class="filter-bar"><span class="skeleton skeleton-line"></span></div>';
  const followedToggle = `<div class="toolbar-row followed-row"><button class="chip chip-sm ${cf.followedOnly ? 'is-selected' : ''}" id="cf-followed-only" aria-pressed="${cf.followedOnly}">${icon('heart', 'chip-check')}<span>${t('cfFollowedCreators')}</span></button>${
    cf.followedOnly && state.followingCreators.length ? chipGroup({ name: 'cf-author', label: t('cfFollowedFilter'), options: [['0', t('cfAllCreators')], ...state.followingCreators.map(f => [String(f.id), f.name])], selected: String(cf.authorId), size: 'sm', hideLabel: true }) : ''
  }</div>`;
  const followedChips = `${cfFilterPanel()}${followedToggle}`;
  let body = '';
  if (cfFollowedEmpty()) body = empty(t('cfFollowedEmpty'), t('cfFollowedEmptyText'), `<button class="secondary-btn" data-page="creators">${t('creators')}</button>`);
  else if (cf.loading && !cf.results) body = `<p class="visually-hidden" role="status">${t('loading')}</p>${cfSkeleton()}`;
  else if (cf.error) body = cfErrorState(cf.error, 'cf-retry-search');
  else if (cf.results && !cf.results.mods.length) body = empty(t('cfNoResults'), cf.query ? format(t('cfNoResultsFor'), { query: esc(cf.query) }) : '', cf.query || cf.classId || cf.authorId || cfActiveFilters().length || cf.followedOnly ? `<button class="secondary-btn" id="cf-clear-search">${t('resetFilters')}</button>` : '');
  else if (cf.results) {
    const { index, pageSize, reachable, totalCount } = cf.results.pagination;
    const pages = Math.max(1, Math.ceil(reachable / pageSize));
    const page = Math.floor(index / pageSize) + 1;
    body = `${cf.results.truncated ? notice(esc(t('cfFollowedTruncated'))) : ''}<p class="result-count" role="status">${esc(format(t('cfResultCount'), { count: compactNumber(totalCount) }))}${cf.loading ? ` · ${t('loading')}` : ''}</p><div class="card-grid ${cf.loading ? 'is-refreshing' : ''}">${rankByFollowing(cf.results.mods, state.followingCreators).map(cfCard).join('')}</div>${
      pages > 1
        ? `<nav class="pager" aria-label="${esc(mt('pagination'))}"><button class="secondary-btn small-chip" data-cf-page="-1" ${page <= 1 || cf.loading ? 'disabled' : ''}>← ${t('previous')}</button><span>${esc(format(mt('pageOf'), { page: n(page), pages: n(pages) }))}</span><button class="secondary-btn small-chip" data-cf-page="1" ${page >= pages || cf.loading ? 'disabled' : ''}>${t('next')} →</button></nav>`
        : ''
    }`;
  }
  return `${classes}${followedChips}${body}`;
}
function cfErrorState(error, retryId) {
  const rate = error?.code === 'CF_RATE_LIMITED';
  const offline = error?.code === 'CF_OFFLINE' || error?.code === 'CF_TIMEOUT';
  return `<div class="empty-state is-error" role="alert">${icon(offline ? 'cloud' : 'warning', 'empty-icon')}<b>${t(rate ? 'cfRateLimitedTitle' : offline ? 'cfOfflineTitle' : 'cfErrorTitle')}</b><p>${esc(cfError(error))}</p><button class="secondary-btn" id="${retryId}">${icon('refresh')}<span>${mt('tryAgain')}</span></button></div>`;
}
function cfInstalled() {
  if (!routeRecords.mods?.path) return empty(mt('noFolderTitle'), mt('noFolderText'), `<button class="primary-btn" data-pick-folder="mods">${t('chooseFolder')}</button>`);
  if (!cf.installs) return `<p role="status">${t('loading')}</p>`;
  if (cf.installsError) return cfErrorState(cf.installsError, 'cf-reload-installs');
  if (!cf.installs.length) return empty(t('cfNothingInstalled'), t('cfNothingInstalledText'));
  const updates = new Map((cf.updates?.updates || []).map(u => [u.modId, u]));
  const rows = cf.installs
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), state.lang))
    .map(item => {
      const update = updates.get(item.modId);
      const busy = cf.installing.has(`${item.modId}:${update?.latest.id}`);
      return `<li class="list-row">${cfThumb(item.logo, 'cf-thumb cf-thumb-sm')}<div class="list-row-copy"><b><button class="text-link" data-cf-detail="${item.modId}">${esc(item.name)}</button></b><small>${esc(item.displayName)} · ${esc(format(t('cfInstalledOn'), { date: shortDate(item.installedAt) }))} · ${esc(format(t('cfFilesCount'), { count: n(item.files?.length || 0) }))}</small></div>${
        update
          ? `<span class="status-pill status-update">${t('needsUpdate')}</span><button class="primary-btn small-chip" data-cf-update="${item.modId}" data-file="${update.latest.id}" ${busy || !update.latest.downloadAllowed ? 'disabled' : ''}>${busy ? t('cfInstalling') : t('cfUpdate')}</button>`
          : cf.updates
            ? `<span class="status-pill status-installed">${t('cfUpToDate')}</span>`
            : ''
      }</li>`;
    })
    .join('');
  return `<div class="toolbar-row"><button class="secondary-btn" id="cf-check-updates" ${cf.checking ? 'disabled' : ''}>${icon('refresh')}<span>${cf.checking ? t('cfChecking') : t('cfCheckUpdates')}</span></button>${cf.updates ? `<span class="muted-note">${esc(format(t('cfUpdatesFound'), { count: n(cf.updates.updates.length) }))}</span>` : ''}</div><ul class="list-panel">${rows}</ul>`;
}
function renderCurseForge() {
  const header = pageHeader(t('explore'), { meta: `<span class="attribution">${t('cfAttribution')}</span>`, actions: `<a class="tertiary-btn" href="https://www.curseforge.com/sims4" target="_blank" rel="noopener noreferrer">${t('cfOpenSite')} ${icon('external')}</a>` });
  if (!cfApi) {
    content.innerHTML = `${header}${empty(mt('desktopOnlyTitle'), t('desktopOnly'))}`;
    return;
  }
  if (!state.integrations) {
    content.innerHTML = `${header}${cfSkeleton(4)}`;
    return;
  }
  if (!cfConfigured()) {
    content.innerHTML = `${header}<div class="empty-state setup-state">${icon('curseforge', 'empty-icon')}<b>${t('cfNotSetUpTitle')}</b><p>${t('cfNotSetUpText')}</p><button class="secondary-btn" id="cf-open-settings">${t('cfSeeSettings')}</button></div>`;
    return;
  }
  const tabs = `<div class="tabs" role="tablist" aria-label="${esc(t('curseforge'))}"><button class="tab ${cf.tab === 'browse' ? 'is-selected' : ''}" role="tab" aria-selected="${cf.tab === 'browse'}" data-cf-tab="browse">${t('cfBrowse')}</button><button class="tab ${cf.tab === 'installed' ? 'is-selected' : ''}" role="tab" aria-selected="${cf.tab === 'installed'}" data-cf-tab="installed">${t('cfInstalledTab')}${cf.installs?.length ? ` <span class="badge">${cf.installs.length}</span>` : ''}</button></div>`;
  content.innerHTML = `${header}${tabs}<div class="tab-panel" role="tabpanel">${cf.tab === 'browse' ? cfBrowse() : cfInstalled()}</div>`;
  if (cf.tab === 'browse') {
    loadCurseForgeClasses();
    if (!cf.results && !cf.loading && !cf.error && !cfFollowedEmpty()) searchCurseForge();
  } else if (!cf.installs && routeRecords.mods?.path) loadCurseForgeInstalls();
}

/* ---------- Details and installs ---------- */
function cfDetailBody(mod) {
  const authors = mod.authors.map(a => (a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>` : esc(a.name))).join(', ');
  const latest = mod.latestFiles.find(file => file.id === mod.mainFileId) || mod.latestFiles[0];
  const noMods = !routeRecords.mods?.path;
  const installButton = file => {
    const busy = cf.installing.has(`${mod.id}:${file.id}`);
    if (busy) return `<span class="cf-progress" data-cf-progress="${mod.id}:${file.id}" role="status">${esc(cfProgressText(`${mod.id}:${file.id}`))}</span><button class="tertiary-btn small-chip" data-cf-cancel="${mod.id}" data-file="${file.id}">${t('cfCancelDownload')}</button>`;
    if (!file.downloadAllowed) return file.available === false ? `<span class="muted-note">${mt('err_CF_FILE_UNAVAILABLE')}</span>` : `<button class="${file === latest ? 'primary-btn' : 'secondary-btn small-chip'}" data-cf-assisted="${mod.id}" data-file="${file.id}" data-tip="${esc(t('cfSiteOnly'))}">${icon('external')}<span>${t('cfAssistedButton')}</span></button>`;
    return `<button class="${file === latest ? 'primary-btn' : 'secondary-btn small-chip'}" data-cf-install="${mod.id}" data-file="${file.id}">${icon('download')}<span>${t('cfInstall')}</span></button>`;
  };
  const files = mod.latestFiles
    .map(file => `<li class="list-row"><div class="list-row-copy"><b>${esc(file.displayName)}</b><small>${esc(shortDate(file.fileDate))}${file.fileLength ? ` · ${esc(formatBytes(file.fileLength))}` : ''}${file.releaseType === 2 ? ` · ${t('cfBeta')}` : file.releaseType === 3 ? ` · ${t('cfAlpha')}` : ''}</small></div>${installButton(file)}</li>`)
    .join('');
  const inCollection = state.collections.some(c => c.items.includes(`cf:${mod.id}`));
  return `${closeButton()}<div class="cf-detail"><header class="cf-detail-head">${cfThumb(mod.logo, 'cf-thumb cf-thumb-lg')}<div><div class="eyebrow">CurseForge</div><h2 id="dialog-title">${esc(mod.name)}</h2><div class="card-creator">${authors ? `${t('cfByLabel')} ${authors}` : ''}</div><div class="tag-row">${mod.categories.map(c => `<span class="meta-pill meta-pill-quiet">${esc(c.name)}</span>`).join('')}${mod.gameVersions.slice(0, 3).map(v => `<span class="meta-pill">${esc(v)}</span>`).join('')}</div></div></header><div class="detail-actions">${
    latest && !noMods ? installButton(latest) : ''
  }${mod.websiteUrl ? `<a class="secondary-btn" href="${esc(mod.websiteUrl)}" target="_blank" rel="noopener noreferrer">${t('cfViewOnSite')} ${icon('external')}</a>` : ''}<button class="secondary-btn" data-save="cf:${mod.id}">${icon('folder')}<span>${inCollection ? t('savedToCollection') : t('save')}</span></button></div>${
    noMods ? notice(mt('noFolderText'), { tone: 'warning', action: `<button class="text-link" data-pick-folder="mods">${t('chooseFolder')}</button>` }) : ''
  }${!mod.allowModDistribution ? notice(t('cfDistributionOff')) : ''}<dl class="facts"><div><dt>${t('cfDownloads')}</dt><dd>${compactNumber(mod.downloadCount)}</dd></div><div><dt>${t('updated')}</dt><dd>${esc(shortDate(mod.dateModified))}</dd></div></dl>${
    mod.screenshots.length ? `<div class="cf-shots">${mod.screenshots.map(shot => `<img src="${esc(shot.thumbnailUrl)}" alt="${esc(shot.title)}" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>` : ''
  }${mod.description ? `<h3 class="section-title">${t('cfDescription')}</h3><div class="cf-description">${esc(mod.description)}</div>` : ''}${files ? `<h3 class="section-title">${t('cfFiles')}</h3><ul class="list-panel">${files}</ul>` : ''}<p class="muted-note">${t('cfInstallNote')}</p></div>`;
}
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(state.lang, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}
const cfDetails = new Map();
async function openCurseForgeDetails(modId, { refresh = false } = {}) {
  cf.detailId = modId;
  const cached = cfDetails.get(modId);
  if (cached && !refresh) {
    openDialog(cfDetailBody(cached), { wide: true, onClose: () => (cf.detailId = 0) });
    cf.detailId = modId;
    return;
  }
  openDialog(`${closeButton()}<div class="cf-detail" aria-busy="true"><h2 id="dialog-title">${t('loading')}</h2>${cfSkeleton(1)}</div>`, { wide: true, onClose: () => (cf.detailId = 0) });
  try {
    const mod = await callDesktop(cfApi.details, modId);
    cfDetails.set(modId, mod);
    rememberCurseForgeItem(mod);
    if (cf.detailId === modId && !overlay.hidden) {
      // Replacing a dialog runs the previous one's onClose, which clears detailId; this dialog still shows this mod.
      openDialog(cfDetailBody(mod), { wide: true, onClose: () => (cf.detailId = 0) });
      cf.detailId = modId;
    }
  } catch (error) {
    if (cf.detailId === modId && !overlay.hidden) openDialog(`${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('cfErrorTitle')}</h2>${cfErrorState(error, 'cf-retry-details')}</div>`, { onClose: () => (cf.detailId = 0) });
  }
}
function refreshOpenDetails() {
  const mod = cfDetails.get(cf.detailId);
  if (mod && !overlay.hidden && dialog.querySelector('.cf-detail')) withFocusPreserved(() => (dialog.innerHTML = cfDetailBody(mod)));
}

// Download progress, shown on the file's own row.
const cfProgress = new Map();
function cfProgressText(key) {
  const p = cfProgress.get(key);
  if (!p) return t('cfInstalling');
  if (p.retry) return t('cfRetrying');
  if (p.done || !p.total) return t('cfInstalling');
  return format(t('cfDownloadingPercent'), { percent: n(Math.min(100, Math.floor((p.received / p.total) * 100))) });
}
cfApi?.onDownloadProgress(progress => {
  const key = `${progress.modId}:${progress.fileId}`;
  cfProgress.set(key, progress);
  const slot = document.querySelector(`[data-cf-progress="${key}"]`);
  if (slot) slot.textContent = cfProgressText(key);
});

/* The author allows this file on the website only. The player downloads it there; simmerspace finds it in Downloads,
   checks it against CurseForge's checksum and installs it the same way as any other file. */
const assisted = { info: null, timer: null, found: '', busy: false };
function stopAssistedWatch() {
  clearTimeout(assisted.timer);
  assisted.timer = null;
  assisted.info = null;
  assisted.found = '';
}
function assistedBody() {
  const { info, found, busy } = assisted;
  const status = found ? `${icon('check')}<span>${esc(format(t('cfAssistedFound'), { file: found }))}</span>` : `<span>${esc(format(t('cfAssistedWaiting'), { file: info.fileName }))}</span>`;
  return `${closeButton()}<div class="form-dialog"><div class="eyebrow">CurseForge</div><h2 id="dialog-title">${esc(format(t('cfAssistedTitle'), { name: info.name }))}</h2><p>${esc(t('cfAssistedWhy'))}</p><ol class="assisted-steps"><li>${esc(t('cfAssistedStep1'))}</li><li>${esc(t('cfAssistedStep2'))}</li></ol><p class="assisted-status" role="status" id="assisted-status">${status}</p><div class="detail-actions">${found ? `<button class="primary-btn" id="cf-assisted-install" ${busy ? 'disabled' : ''}>${icon('download')}<span>${busy ? t('cfInstalling') : t('cfAssistedInstall')}</span></button>` : `<button class="primary-btn" id="cf-assisted-open">${t('cfAssistedOpen')} ${icon('external')}</button>`}<button class="secondary-btn" id="cf-assisted-pick">${t('cfAssistedPick')}</button><button class="tertiary-btn" data-close>${t('cancel')}</button></div></div>`;
}
async function watchAssistedDownload() {
  const info = assisted.info;
  if (!info || assisted.found) return;
  try {
    const result = await callDesktop(cfApi.assistedFind, info.modId, info.fileId);
    if (assisted.info !== info) return;
    if (result.found) {
      assisted.found = result.name;
      return withFocusPreserved(() => (dialog.innerHTML = assistedBody()));
    }
  } catch {}
  if (assisted.info === info) assisted.timer = setTimeout(watchAssistedDownload, 2000);
}
async function openAssistedInstall(modId, fileId) {
  if (!routeRecords.mods?.path) return toast(mt('noFolderText'), 'error');
  try {
    stopAssistedWatch();
    const info = await callDesktop(cfApi.assistedInfo, modId, fileId);
    assisted.info = info;
    openDialog(assistedBody(), { onClose: stopAssistedWatch });
    assisted.info = info; // replacing a dialog runs the previous onClose
    watchAssistedDownload();
  } catch (error) {
    toast(cfError(error), 'error');
  }
}
async function runAssistedInstall({ reinstall = false } = {}) {
  const info = assisted.info;
  if (!info || assisted.busy) return;
  assisted.busy = true;
  dialog.innerHTML = assistedBody();
  try {
    const result = await callDesktop(cfApi.assistedInstall, info.modId, info.fileId, { reinstall });
    assisted.busy = false;
    closeDialog();
    finishInstall(result, info.modId);
  } catch (error) {
    assisted.busy = false;
    if (error.code === 'CF_LOCAL_FILE_MISMATCH' || error.code === 'CF_LOCAL_FILE_MISSING') assisted.found = '';
    if (assisted.info) dialog.innerHTML = assistedBody();
    toast(cfError(error), 'error');
    if (assisted.info && !assisted.found) watchAssistedDownload();
  }
}

// What every successful install does, however the file arrived.
function finishInstall(result, modId) {
  if (result.authors[0] && typeof createCreatorIfMissing === 'function') {
    const creator = createCreatorIfMissing(result.authors[0]);
    for (const file of result.files) storeModTags(file, { ...tagsForMod(file), creatorId: creator.id });
    scheduleModCatalogSave(0);
  }
  cf.installs = null;
  cf.updates = cf.updates ? { ...cf.updates, updates: cf.updates.updates.filter(u => u.modId !== modId) } : null;
  const summary = format(t('cfInstalledResult'), { name: result.name, count: n(result.files.length) });
  if (result.skippedCount || !result.verified || result.replaced) {
    showResultDialog({
      title: t('cfInstallDone'),
      summary,
      note: [result.verified ? '' : t('cfNotVerified'), result.replaced ? format(t('cfReplaced'), { count: n(result.replaced) }) : ''].filter(Boolean).join(' '),
      failures: result.skipped.map(name => ({ label: name, code: 'CF_SKIPPED' })),
      describe: () => t('cfSkippedFile'),
      successes: result.files.map(file => ({ label: fileNameOf(file), detail: file })),
      successTitle: t('cfInstalledFiles')
    });
  } else toast(summary);
  if (mods.result) setTimeout(scanManagedMods, 0);
}

async function installCurseForgeFile(modId, fileId, { replacePrevious = false, reinstall = false } = {}) {
  if (!routeRecords.mods?.path) return toast(mt('noFolderText'), 'error');
  const key = `${modId}:${fileId}`;
  if (cf.installing.has(key)) return;
  cf.installing.add(key);
  refreshOpenDetails();
  if (state.page === 'curseforge') render();
  try {
    finishInstall(await callDesktop(cfApi.install, modId, fileId, { replacePrevious, reinstall }), modId);
  } catch (error) {
    if (error.code === 'CF_DOWNLOAD_NOT_ALLOWED') {
      cf.installing.delete(key);
      await openAssistedInstall(modId, fileId);
    } else if (error.code === 'CF_ALREADY_INSTALLED') {
      const again = await confirmAction({ title: t('cfAlreadyInstalledTitle'), body: errorMessage(error), details: error.details?.files || [], confirmLabel: t('cfReinstall') });
      if (again) {
        cf.installing.delete(key);
        return installCurseForgeFile(modId, fileId, { reinstall: true });
      }
    } else if (error.code === 'CF_UNSUPPORTED_FILE' || error.code === 'CF_TRAY_CONTENT') {
      const site = error.details?.websiteUrl;
      openDialog(
        `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('cfManualTitle')}</h2><p>${esc(errorMessage(error))}</p><div class="detail-actions">${site ? `<a class="primary-btn" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${t('cfViewOnSite')} ${icon('external')}</a>` : ''}<button class="secondary-btn" data-close>${t('close')}</button></div></div>`
      );
    } else toast(cfError(error), 'error');
  } finally {
    cf.installing.delete(key);
    cfProgress.delete(key);
    refreshOpenDetails();
    if (state.page === 'curseforge') render();
  }
}

async function checkCurseForgeUpdates() {
  if (cf.checking) return;
  cf.checking = true;
  render();
  try {
    cf.updates = await callDesktop(cfApi.checkUpdates);
    toast(format(t('cfUpdatesFound'), { count: n(cf.updates.updates.length) }));
  } catch (error) {
    toast(cfError(error), 'error');
  } finally {
    cf.checking = false;
    render();
  }
}

/* ---------- Settings ---------- */
function curseForgeSettingsSection() {
  if (!desktop) return `<p class="setting-help">${t('desktopOnly')}</p>`;
  const configured = cfConfigured();
  const tested = cf.test;
  const status = !configured
    ? `<span class="status-pill status-pending">${t('cfStatusNotSetUp')}</span>`
    : tested?.ok
      ? `<span class="status-pill status-installed">${t('cfStatusConnected')}</span>`
      : tested?.error
        ? `<span class="status-pill status-update">${t('cfStatusProblem')}</span>`
        : `<span class="status-pill status-saved">${t('cfStatusReady')}</span>`;
  return `<div class="setting-row"><span class="setting-label">${t('status')}</span><div class="inline-row">${status}${configured ? `<button class="secondary-btn small-chip" id="cf-test" ${cf.testing ? 'disabled' : ''}>${cf.testing ? t('cfTesting') : t('cfTest')}</button>` : ''}</div></div>${
    tested?.error ? `<p class="field-error" role="alert">${esc(cfError(tested.error))}</p>` : ''
  }<p class="setting-help">${configured ? t('cfSettingsConfigured') : t('cfSettingsNotConfigured')}</p><div class="account-split"><div><b>${t('cfAccountTitle')}</b><p class="setting-help">${t('cfAccountText')}</p></div><div><b>${t('simmerAccountTitle')}</b><p class="setting-help">${t('simmerAccountText')}</p></div></div><div class="button-row">${configured ? `<button class="secondary-btn" data-page="curseforge">${t('cfBrowseNow')}</button>` : ''}<a class="tertiary-btn" href="https://www.curseforge.com/sims4" target="_blank" rel="noopener noreferrer">${t('cfOpenSite')} ${icon('external')}</a></div>`;
}

// Developer-only diagnostics (start SimmerSpace with SIMMERSPACE_DEV=1 or --developer).
function developerSection() {
  const dev = state.integrations?.developer;
  if (!dev) return `<p class="setting-help">${t('loading')}</p>`;
  const stats = dev.curseforgeStats || {};
  const row = (label, value) => `<div><dt>${esc(label)}</dt><dd><code>${esc(value === undefined || value === null || value === '' ? '—' : String(value))}</code></dd></div>`;
  return `<p class="setting-help">${t('developerNote')}</p><dl class="facts facts-code">${row('Config file', dev.localFile)}${row('CurseForge mode', dev.curseforge.mode)}${row('Key source', dev.curseforge.keySource)}${row('Key length', dev.curseforge.keyLength)}${row('Base URL', dev.curseforge.baseUrl)}${row('Game id', stats.gameId || dev.curseforge.gameId)}${row('Requests / failures', `${stats.requests} / ${stats.failures}`)}${row('Rate limited (times / seconds left)', `${stats.rateLimited} / ${stats.rateLimitedFor}`)}${row('Last status / error', `${stats.lastStatus ?? '—'} / ${stats.lastError || '—'}`)}${row('Cache entries', stats.cacheEntries)}${row('Bundled key ignored', dev.curseforge.ignoredBundledKey)}${row('Supabase', dev.supabase.configured ? dev.supabase.host : 'not configured')}</dl><div class="button-row"><button class="secondary-btn" id="dev-refresh">${icon('refresh')}<span>${t('refresh')}</span></button><button class="secondary-btn" id="dev-open-config">${icon('folder')}<span>${t('openConfigFolder')}</span></button></div>`;
}

async function loadIntegrationStatus() {
  if (!desktop?.integrationStatus) return;
  try {
    state.integrations = await callDesktop(desktop.integrationStatus);
  } catch {
    state.integrations = { curseforge: { configured: false }, supabase: { configured: false } };
  }
}

/* ---------- Events ---------- */
const CF_CLICK_ACTIONS = {
  'cf-retry-search': searchCurseForge,
  'cf-clear-search': () => {
    cf.query = '';
    cf.classId = 0;
    cf.authorId = 0;
    cf.followedOnly = false;
    cf.filters = { content: '', age: '', gender: '', style: [] };
    cf.index = 0;
    state.query = '';
    search.value = '';
    searchCurseForge();
  },
  'cf-clear-filters': () => {
    cf.filters = { content: '', age: '', gender: '', style: [] };
    cf.index = 0;
    searchCurseForge();
  },
  'cf-followed-only': () => {
    cf.followedOnly = !cf.followedOnly;
    cf.authorId = 0;
    cf.index = 0;
    cf.results = null;
    searchCurseForge();
  },
  'cf-reload-installs': loadCurseForgeInstalls,
  'cf-assisted-open': () => assisted.info?.pageUrl && callDesktop(cfApi.openSite, assisted.info.pageUrl),
  'cf-assisted-install': () => runAssistedInstall(),
  'cf-assisted-pick': async () => {
    const info = assisted.info;
    if (!info) return;
    try {
      const result = await callDesktop(cfApi.assistedPick, info.modId, info.fileId);
      if (result.found && assisted.info === info) {
        assisted.found = result.name;
        dialog.innerHTML = assistedBody();
      }
    } catch (error) {
      toast(cfError(error), 'error');
    }
  },
  'cf-check-updates': checkCurseForgeUpdates,
  'cf-retry-details': () => cf.detailId && openCurseForgeDetails(cf.detailId, { refresh: true }),
  'cf-open-settings': () => openSettings('curseforge-settings'),
  'cf-test': async () => {
    cf.testing = true;
    render();
    try {
      await callDesktop(cfApi.test);
      cf.test = { ok: true };
      toast(t('cfTestOk'));
    } catch (error) {
      cf.test = { error };
    } finally {
      cf.testing = false;
      await loadIntegrationStatus();
      render();
    }
  },
  'dev-refresh': async () => {
    await loadIntegrationStatus();
    render();
  },
  'dev-open-config': () => callDesktop(desktop.openConfigFolder).catch(error => toast(errorMessage(error), 'error'))
};

document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.id && CF_CLICK_ACTIONS[target.id]) return CF_CLICK_ACTIONS[target.id](target);
  if (target.dataset.cfDetail) return openCurseForgeDetails(Number(target.dataset.cfDetail));
  if (target.dataset.cfInstall) return installCurseForgeFile(Number(target.dataset.cfInstall), Number(target.dataset.file));
  if (target.dataset.cfAssisted) return openAssistedInstall(Number(target.dataset.cfAssisted), Number(target.dataset.file));
  if (target.dataset.cfCancel) return callDesktop(cfApi.cancelInstall, Number(target.dataset.cfCancel), Number(target.dataset.file)).catch(() => {});
  if (target.dataset.cfUpdate) return installCurseForgeFile(Number(target.dataset.cfUpdate), Number(target.dataset.file), { replacePrevious: true });
  if (target.dataset.cfTab) {
    cf.tab = target.dataset.cfTab === 'installed' ? 'installed' : 'browse';
    return render();
  }
  if (target.dataset.cfPage) {
    const step = Number(target.dataset.cfPage) * cf.pageSize;
    cf.index = Math.max(0, cf.index + step);
    searchCurseForge();
    document.querySelector('.main-area')?.scrollTo?.(0, 0);
    return;
  }
  if (target.dataset.filter === 'cf-author') {
    cf.authorId = Number(target.dataset.value) || 0;
    cf.index = 0;
    return searchCurseForge();
  }
  if (target.dataset.filter?.startsWith('cf-f-')) {
    const name = target.dataset.filter.slice(5);
    const value = target.dataset.value;
    if (name === 'style') cf.filters.style = cf.filters.style.includes(value) ? cf.filters.style.filter(id => id !== value) : [...cf.filters.style, value];
    else cf.filters[name] = cf.filters[name] === value ? '' : value;
    // Clothing, hair and the rest belong to one class; a class chosen earlier could only empty the results.
    if (name === 'content' && cf.filters.content) cf.classId = 0;
    cf.index = 0;
    return searchCurseForge();
  }
  if (target.dataset.cfRemove) {
    const name = target.dataset.cfRemove;
    if (name === 'style') cf.filters.style = cf.filters.style.filter(id => id !== target.dataset.value);
    else cf.filters[name] = '';
    cf.index = 0;
    return searchCurseForge();
  }
  if (target.dataset.filter === 'cf-class') {
    cf.classId = Number(target.dataset.value) || 0;
    cf.index = 0;
    return searchCurseForge();
  }
});
document.addEventListener('toggle', event => {
  if (event.target.id !== 'cf-filter-panel') return;
  cf.filtersOpen = event.target.open;
  safeWrite('cf-filters-open', cf.filtersOpen);
}, true);
document.addEventListener('change', event => {
  if (event.target.id !== 'cf-sort') return;
  cf.sortField = Number(event.target.value) || 2;
  cf.index = 0;
  searchCurseForge();
});
// Keyboard users can move between tabs with the arrow keys.
document.addEventListener('keydown', event => {
  const tab = event.target.closest?.('[data-cf-tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  cf.tab = cf.tab === 'browse' ? 'installed' : 'browse';
  render();
  document.querySelector(`[data-cf-tab="${cf.tab}"]`)?.focus();
});
