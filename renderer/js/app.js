/* SimmerSpace interface: state, pages and local interactions. */
let APP_VERSION = '0.11.1';

function savedLanguage() {
  const value = safeGet('language');
  if (value === 'es' || value === 'en') return value;
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

// Collections saved by earlier versions have no color or change time; both get safe defaults here. Earlier
// versions also created three sample collections and could hold sample items: both are removed, so only
// the user's own collections and their CurseForge mods ("cf:<id>") remain.
const OLD_SAMPLE_COLLECTIONS = ['soft-life', 'build-inspo', 'dream-sims'];
function normalizeCollections(list) {
  return (Array.isArray(list) ? list : [])
    .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && !OLD_SAMPLE_COLLECTIONS.includes(c.id))
    .map((c, index) => ({ ...c, items: Array.isArray(c.items) ? c.items.filter(isCurseForgeItem) : [], color: collectionColor(c.color, index), updated: Number(c.updated) || 0 }));
}

const state = {
  page: 'home',
  query: '',
  libraryQuery: '',
  libraryState: 'All',
  followingCreators: normalizeFollowing(safeRead('following-creators', [])),
  groupMode: safeGet('group-mode') === 'creator' ? 'creator' : 'category',
  navCollectionsOpen: safeRead('nav-collections-open', true) !== false,
  tooltips: safeRead('tooltips', true) !== false,
  collections: normalizeCollections(safeRead('collections', [])),
  appearance: loadAppearance(),
  lang: savedLanguage(),
  activeCollection: null,
  collectionQuery: '',
  collectionSort: ['custom', 'az', 'opened'].includes(safeGet('collection-sort')) ? safeGet('collection-sort') : 'custom',
  appInfo: { developer: false },
  integrations: null
};

// Saved data of features that no longer exist (sample favorites and statuses, boards, manual Patreon creators,
// account sync). Removed once so nothing unused stays on this PC.
for (const key of ['favorites', 'statuses', 'boards', 'board-sort', 'boards-show-all', 'suggestions', 'patreon-creators', 'more-filters-open', 'sample-library-open', 'preferences-updated']) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {}
}
persist();

const content = document.getElementById('page-content');
const search = document.getElementById('search-input');
let renderedPage = null;

// Returns false when the browser storage refused the write (for example, a very large cover image).
function persist() {
  return safeWrite('collections', state.collections);
}
function touchCollection(c) {
  c.updated = Date.now();
}

function collectionLabel(c) {
  return c.name;
}

/* ---------- Shell ---------- */
// The wordmark is always one lowercase word.
function wordmark() {
  return `<span class="wordmark">simmerspace</span>`;
}
// `tip` is the short explanation shown by the delayed tooltip (see ui.js); the label is the accessible name.
function navButton(id, iconName, { extra = '', label = t(id), tip = '' } = {}) {
  const active = state.page === id || (id === 'collections' && state.page === 'collection');
  return `<button class="nav-item ${active ? 'is-active' : ''}" data-page="${id}" ${active ? 'aria-current="page"' : ''} aria-label="${esc(label)}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${icon(iconName, 'nav-icon')}<span class="nav-label">${esc(label)}</span>${extra}</button>`;
}
// The sidebar is a narrow icon rail. It expands over the page (never pushing it) while the pointer or keyboard
// focus is inside it; on touch screens the menu button opens and closes it.
function nav() {
  const sidebar = document.getElementById('sidebar');
  const modsCount = typeof scannedModCount === 'function' ? scannedModCount() : null;
  const count = modsCount === null ? '' : `<span class="nav-count" title="${esc(t('navModsCount'))}">${modsCount.toLocaleString(state.lang)}</span>`;
  const collections = state.collections
    .map(c => {
      const active = state.page === 'collection' && state.activeCollection === c.id;
      return `<button class="nav-item nav-collection ${active ? 'is-active' : ''}" data-collection="${esc(c.id)}" ${active ? 'aria-current="page"' : ''} aria-label="${esc(collectionLabel(c))}">${plumbob(c.color, { className: 'nav-icon' })}<span class="nav-label">${esc(collectionLabel(c))}</span><span class="nav-count">${c.items.length}</span></button>`;
    })
    .join('');
  const user = typeof accountUser === 'function' ? accountUser() : null;
  const name = user?.username || '';
  const avatar = avatarMarkup(user);
  sidebar.innerHTML = `<div class="sidebar-top"><button class="icon-btn sidebar-toggle" id="sidebar-toggle" aria-expanded="${sidebar.classList.contains('is-open')}" aria-controls="sidebar" aria-label="${esc(t('navToggle'))}">${icon('menu')}</button><a class="brand" href="#" data-page="home" aria-label="simmerspace · ${esc(t('home'))}">${brandMark()}<span class="nav-label">${wordmark()}</span></a></div>
    <nav class="side-nav" aria-label="${esc(t('mainNavigation'))}">
      <div class="nav-group">
        ${navButton('home', 'home', { tip: t('tipHome') })}
        ${navButton('curseforge', 'explore', { label: t('explore'), tip: t('tipExplore') })}
        ${navButton('mycc', 'library', { extra: count, tip: t('tipLibrary') })}
        ${navButton('creators', 'creators', { tip: t('tipCreators') })}
        ${navButton('collections', 'collections', { label: t('collectionsTitle'), tip: t('tipCollections') })}
        <div class="nav-collections" id="nav-collection-list">${collections}<button class="nav-item nav-collection nav-subtle" id="new-collection" aria-label="${esc(t('newCollection'))}" data-tip="${esc(t('tipNewCollection'))}">${icon('plus', 'nav-icon')}<span class="nav-label">${t('newCollection')}</span></button></div>
        ${navButton('inspiration', 'inspiration', { tip: t('tipInspiration') })}
      </div>
    </nav>
    <div class="sidebar-footer">
      <button class="launch-button" id="launch-game" aria-label="${esc(t('launchGame'))}" data-tip="${esc(t('tipLaunchGame'))}">${icon('play', 'nav-icon')}<span class="nav-label">${t('launchGame')}</span></button>
      ${navButton('settings', 'settings', { tip: t('tipSettings') })}
      <button class="account-chip ${state.page === 'account' ? 'is-active' : ''}" data-page="account" ${state.page === 'account' ? 'aria-current="page"' : ''} aria-label="${esc(t('accountTitle'))}" data-tip="${esc(t('tipAccount'))}">${avatar}<span class="nav-label account-copy"><strong>${esc(name || t('accountTitle'))}</strong><small>${esc(user?.email || t('accountSignedOutShort'))}</small></span></button>
    </div>`;
}
const PAGE_TITLES = { home: 'home', mycc: 'mycc', inspiration: 'inspiration', creators: 'creators', settings: 'settings', collections: 'collectionsTitle', curseforge: 'explore', account: 'accountTitle' };
function pageName() {
  if (state.page === 'collection') {
    const c = state.collections.find(x => x.id === state.activeCollection);
    return c ? collectionLabel(c) : t('collectionsTitle');
  }
  return t(PAGE_TITLES[state.page] || 'home');
}
function setShell() {
  applyAppearance(state.appearance);
  document.body.classList.toggle('dialog-open', !overlay.hidden);
  document.documentElement.lang = state.lang;
  nav();
  // The page's own heading names the page, so the top bar does not repeat it.
  document.getElementById('topbar-title').textContent = '';
  document.getElementById('footer-copy').textContent = t('footer');
  document.getElementById('footer-version').textContent = `SimmerSpace ${APP_VERSION} · ${t('preBeta')}`;
  document.title = `${pageName()} · SimmerSpace`;
  search.placeholder = state.page === 'curseforge' ? t('cfSearchPlaceholder') : t('search');
  search.setAttribute('aria-label', search.placeholder);
  search.closest('.search-field').dataset.tip = t('tipSearch');
  const toggle = document.getElementById('theme-toggle');
  const dark = document.documentElement.dataset.mode === 'dark';
  toggle.innerHTML = icon(dark ? 'sun' : 'moon');
  toggle.setAttribute('aria-label', t(dark ? 'switchToLight' : 'switchToDark'));
  toggle.dataset.tip = t('tipThemeToggle');
  const profile = document.getElementById('profile-button');
  const user = typeof accountUser === 'function' ? accountUser() : null;
  profile.innerHTML = user ? avatarMarkup(user) : icon('user');
  profile.title = user ? `${t('accountTitle')} · ${user.username}` : t('accountTitle');
  profile.setAttribute('aria-label', profile.title);
  document.getElementById('skip-link').textContent = t('skipToContent');
}
// Page title row. No oversized subtitles: `meta` is a short count or status, `actions` are buttons.
function pageHeader(title, { meta = '', actions = '', lead = '' } = {}) {
  return `<header class="page-header"><div class="page-title">${lead}<h1>${title}</h1>${meta ? `<span class="page-meta">${meta}</span>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
}
function empty(title = t('empty'), text = t('emptyText'), action = '') {
  return `<div class="empty-state">${icon('cloud', 'empty-icon')}<b>${title}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}
function notice(text, { tone = 'info', action = '' } = {}) {
  return `<div class="notice notice-${tone}" role="note">${icon(tone === 'warning' ? 'warning' : 'info', 'notice-icon')}<span>${text}</span>${action}</div>`;
}

/* ---------- Shared filter chips ---------- */
// One chip control for every filter group. `selected` is a value (single choice) or an array (multi-select).
function chipGroup({ name, label, options, selected, multi = false, size = '', quiet = false, hideLabel = false }) {
  const isOn = value => (multi ? selected.includes(value) : selected === value);
  return `<div class="chip-group ${quiet ? 'chip-group-quiet' : ''}" role="group" aria-label="${esc(label)}">${hideLabel ? '' : `<span class="chip-group-label">${esc(label)}</span>`}<div class="chip-row">${options
    .map(([value, text]) => `<button class="chip ${size ? `chip-${size}` : ''} ${isOn(value) ? 'is-selected' : ''}" data-filter="${esc(name)}" data-value="${esc(value)}" ${multi ? 'data-multi="true"' : ''} aria-pressed="${isOn(value)}">${multi && isOn(value) ? icon('check', 'chip-check') : ''}<span>${esc(text)}</span></button>`)
    .join('')}</div></div>`;
}

/* ---------- Pages ---------- */
// Home: a summary built only from real data on this PC (scan results, collections, followed creators).
function renderHome() {
  const user = typeof accountUser === 'function' ? accountUser() : null;
  const name = user?.username || '';
  const modsCount = typeof scannedModCount === 'function' ? scannedModCount() : null;
  const stat = (iconName, tone, value, label, page) =>
    `<button class="stat-card stat-${tone}" data-page="${page}">${icon(iconName, 'stat-icon')}<span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></button>`;
  const stats = `<section class="stat-row" aria-label="${esc(t('homeSummary'))}">${stat('library', 'accent', modsCount === null ? '—' : modsCount.toLocaleString(state.lang), modsCount === null ? t('homeNotScanned') : t('homeModsFound'), 'mycc')}${stat('collections', 'pop', state.collections.length.toLocaleString(state.lang), t('collectionsTitle'), 'collections')}${stat('creators', 'sun', state.followingCreators.length.toLocaleString(state.lang), t('homeFollowing'), 'creators')}</section>`;
  const action = (id, iconName, title, text) => `<button class="action-tile" id="${id}" data-tip="${esc(text)}">${icon(iconName, 'action-icon')}<span><b>${esc(title)}</b><small>${esc(text)}</small></span></button>`;
  const actions = `<section class="section"><div class="section-head"><h2 class="section-title">${t('homeQuickActions')}</h2></div><div class="action-grid">${action('home-scan', 'search', mt('scan'), t('tipScan'))}${action('home-import-files', 'import', mt('importFiles'), t('tipImportFiles'))}${action('home-import-folder', 'folder', mt('importFolder'), t('tipImportFolder'))}${action('home-explore', 'explore', t('explore'), t('tipExplore'))}</div></section>`;
  const recent = [...state.collections].sort((a, b) => (Number(b.opened) || Number(b.updated) || 0) - (Number(a.opened) || Number(a.updated) || 0)).slice(0, 4);
  const collections = recent.length
    ? `<section class="section"><div class="section-head"><h2 class="section-title">${t('homeRecentCollections')}</h2><button class="text-link" data-page="collections">${t('viewAllCollections')} →</button></div><div class="collection-grid">${recent.map(c => `<button class="collection-tile" data-collection="${esc(c.id)}">${collectionPreview(c)}<span class="collection-tile-info">${plumbob(c.color)}<strong>${esc(collectionLabel(c))}</strong><span>${c.items.length}</span></span></button>`).join('')}</div></section>`
    : '';
  content.innerHTML = `${pageHeader(name ? esc(format(t('homeGreeting'), { name })) : t('home'))}${stats}${actions}${collections}`;
}
// My CC: the real Mods folder library (mods-manager.js and library.js). The sample cards of earlier
// versions are no longer shown here.
function renderLibrary() {
  content.innerHTML = `${pageHeader(t('mycc'))}${folderRoutePanel()}<div id="mods-manager-root">${renderManagedModsPanel()}</div>`;
  ensureInstallsLoaded();
}

function sortSelect(id, options, value) {
  return `<label class="select-field select-inline"><span>${t('sort')}</span><select id="${id}">${options.map(([optionValue, key]) => `<option value="${optionValue}" ${value === optionValue ? 'selected' : ''}>${t(key)}</option>`).join('')}</select></label>`;
}
function renderInspiration() {
  renderInspirationFeed();
}

function renderCreators() {
  renderCreatorsPage();
}

// Cards for a collection: the CurseForge mods saved with "cf:<id>".
function collectionCards(c) {
  return c.items.filter(isCurseForgeItem).map(id => (typeof curseForgeCollectionCard === 'function' ? curseForgeCollectionCard(id) : '')).filter(Boolean);
}
function renderCollection() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) {
    state.page = 'collections';
    return renderCollections();
  }
  const cards = collectionCards(c);
  content.innerHTML = `${pageHeader(esc(collectionLabel(c)), {
    lead: plumbob(c.color, { className: 'page-plumbob' }),
    meta: format(t('itemsCount'), { count: cards.length }),
    actions: `<button class="secondary-btn" id="edit-collection">${t('editCollection')}</button><button class="secondary-btn" id="choose-collection-cover" ${desktop?.chooseCoverImage ? '' : 'disabled'}>${icon('inspiration')}<span>${c.cover ? t('changeCover') : t('coverImage')}</span></button>${c.cover ? `<button class="tertiary-btn" id="remove-collection-cover">${t('removeCover')}</button>` : ''}<button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button><button class="primary-btn" data-export="${esc(c.id)}">${t('share')}</button>`
  })}${cards.length ? `<div class="card-grid">${cards.join('')}</div>` : empty(t('noCC'), t('collectionEmptyText'), `<button class="secondary-btn" data-page="curseforge">${t('browseCurseForge')}</button>`)}`;
}
function collectionPreview(c) {
  if (c.cover) return `<span class="collection-cover collection-photo" aria-hidden="true"><img src="${esc(c.cover)}" alt=""></span>`;
  const defaults = ['✧', '✿', '☼'];
  return `<span class="collection-cover" aria-hidden="true">${defaults.map(mark => `<span class="collection-cover-tile">${mark}</span>`).join('')}</span>`;
}
// Collections matching the search box, in the chosen order. "Custom" is the saved order, changed by dragging.
function visibleCollections() {
  const query = state.collectionQuery.trim().toLowerCase();
  const list = state.collections.filter(c => !query || collectionLabel(c).toLowerCase().includes(query));
  if (state.collectionSort === 'az') list.sort((a, b) => collectionLabel(a).localeCompare(collectionLabel(b), state.lang));
  if (state.collectionSort === 'opened') list.sort((a, b) => (b.opened || 0) - (a.opened || 0));
  return list;
}
function renderCollections() {
  const list = visibleCollections();
  const draggable = state.collectionSort === 'custom' && !state.collectionQuery.trim();
  content.innerHTML = `${pageHeader(t('collectionsTitle'), {
    meta: format(t('itemsCount'), { count: state.collections.length }),
    actions: `<button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button><button class="primary-btn" id="new-collection-page">${icon('plus')}<span>${t('newCollection')}</span></button>`
  })}<div class="toolbar-row"><label class="search-field search-field-inline">${icon('search')}<input id="collection-search" type="search" value="${esc(state.collectionQuery)}" placeholder="${esc(t('searchCollections'))}" aria-label="${esc(t('searchCollections'))}"></label>${sortSelect('collection-sort', [['custom', 'customOrder'], ['az', 'az'], ['opened', 'recentlyOpened']], state.collectionSort)}${draggable ? `<span class="muted-note">${t('dragHint')}</span>` : ''}</div>${
    list.length
      ? `<div class="collection-grid">${list.map(c => `<button class="collection-tile" data-collection="${esc(c.id)}" ${draggable ? 'draggable="true"' : ''}>${collectionPreview(c)}<span class="collection-tile-info">${plumbob(c.color)}<strong>${esc(collectionLabel(c))}</strong><span>${c.items.length}</span></span></button>`).join('')}</div>`
      : empty(t('noResult'), '')
  }`;
}

/* ---------- Settings ---------- */
function segmented(name, label, options, value) {
  return `<div class="setting-row"><span class="setting-label" id="${name}-label">${label}</span><div class="segmented" role="radiogroup" aria-labelledby="${name}-label">${options
    .map(([optionValue, text]) => `<button class="segment ${value === optionValue ? 'is-selected' : ''}" role="radio" aria-checked="${value === optionValue}" data-appearance="${name}" data-value="${optionValue}">${esc(text)}</button>`)
    .join('')}</div></div>`;
}
const THEME_LABEL_KEYS = { pink: 'themePink', purple: 'themePurple', green: 'themeGreen', blue: 'themeBlue' };
// Each preview is painted by the real theme tokens: the data attributes on the preview select them.
function themeCard(family) {
  const selected = state.appearance.family === family;
  const mode = document.documentElement.dataset.mode || 'light';
  return `<button class="theme-card ${selected ? 'is-selected' : ''}" role="radio" aria-checked="${selected}" data-appearance="family" data-value="${family}"><span class="theme-preview" data-family="${family}" data-mode="${mode}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="theme-card-copy"><b>${esc(t(THEME_LABEL_KEYS[family]))}</b></span></button>`;
}
function settingsPanel(id, title, body, { open = true, summary = '' } = {}) {
  return `<details class="panel settings-panel" id="${id}" ${open ? 'open' : ''}><summary class="panel-summary"><span><b>${title}</b>${summary ? `<small>${summary}</small>` : ''}</span>${icon('chevron', 'disclosure-icon')}</summary><div class="panel-body">${body}</div></details>`;
}
function renderSettings() {
  const a = state.appearance;
  const openPanels = safeRead('settings-open', { personalization: true });
  const isOpen = id => (openPanels && typeof openPanels === 'object' ? openPanels[id] !== false && (id in openPanels || id === 'personalization') : id === 'personalization');
  const personalization = `<div class="setting-row"><span class="setting-label" id="family-label">${t('theme')}</span><div class="theme-cards" role="radiogroup" aria-labelledby="family-label">${THEME_FAMILIES.map(themeCard).join('')}</div></div>${segmented('mode', t('mode'), [['light', t('modeLight')], ['dark', t('modeDark')], ['system', t('modeSystem')]], a.mode)}<p class="setting-help">${t('themeFamilyNote')}</p>${segmented('density', t('density'), [['comfortable', t('densityComfortable')], ['compact', t('densityCompact')]], a.density)}${segmented('motion', t('motion'), [['system', t('motionSystem')], ['reduced', t('motionReduced')], ['full', t('motionFull')]], a.motion)}<div class="setting-row"><span class="setting-label">${t('preview')}</span><div class="preview-row"><button class="primary-btn" tabindex="-1">${t('previewPrimary')}</button><button class="secondary-btn" tabindex="-1">${t('previewSecondary')}</button><span class="chip is-selected">${t('previewChip')}</span><span class="badge">3</span></div></div>`;
  const general = `<div class="setting-row"><span class="setting-label" id="language-label">${t('language')}</span><div class="segmented" role="radiogroup" aria-labelledby="language-label"><button class="segment ${state.lang === 'es' ? 'is-selected' : ''}" role="radio" aria-checked="${state.lang === 'es'}" data-language="es" lang="es">Español</button><button class="segment ${state.lang === 'en' ? 'is-selected' : ''}" role="radio" aria-checked="${state.lang === 'en'}" data-language="en" lang="en">English</button></div></div><div class="setting-row"><label class="setting-label" for="group-mode-settings">${t('groupBy')}</label><label class="select-field"><select id="group-mode-settings"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></div>`;
  const help = `<label class="switch-row"><span><b>${t('prefTooltips')}</b><small>${t('prefTooltipsNote')}</small></span><input type="checkbox" class="switch" id="pref-tooltips" ${state.tooltips ? 'checked' : ''}></label><div class="setting-row"><span class="setting-label">${t('tutorialTitle')}</span><div class="button-row"><button class="secondary-btn" id="replay-tour" data-tip="${esc(t('tipReplayTour'))}">${icon('help')}<span>${t('tutorialReplay')}</span></button></div></div>`;
  const about = `<dl class="facts"><div><dt>${t('version')}</dt><dd>${APP_VERSION} ${t('preBeta')}</dd></div><div><dt>${t('compatibility')}</dt><dd>${t('windows')}</dd></div></dl><p class="setting-help">${t('privacyNote')}</p><div class="button-row"><button class="secondary-btn" id="send-feedback">${t('feedback')}</button><button class="tertiary-btn" id="donate-button" data-tip="${esc(t('donateFeedbackTip'))}">${t('donate')} · ${t('comingSoon')}</button></div>`;
  content.innerHTML = `${pageHeader(t('settingsTitle'))}<div class="settings-stack">${settingsPanel('personalization', t('personalization'), personalization, { open: isOpen('personalization'), summary: t('personalizationSummary') })}${settingsPanel('help-settings', t('helpSettings'), help, { open: isOpen('help-settings'), summary: t('helpSettingsSummary') })}${settingsPanel('general', t('general'), general, { open: isOpen('general'), summary: t('generalSummary') })}${settingsPanel('folders', t('folderRoutes'), folderSettingsSection(), { open: isOpen('folders'), summary: t('foldersSummary') })}${settingsPanel('account-settings', t('accountTitle'), typeof accountSettingsSection === 'function' ? accountSettingsSection() : '', { open: isOpen('account-settings'), summary: t('accountSummary') })}${settingsPanel('curseforge-settings', t('curseforgeConnection'), typeof curseForgeSettingsSection === 'function' ? curseForgeSettingsSection() : '', { open: isOpen('curseforge-settings'), summary: t('curseforgeSummary') })}${settingsPanel('about', t('about'), about, { open: isOpen('about') })}${state.appInfo.developer && typeof developerSection === 'function' ? settingsPanel('developer', t('developerTools'), developerSection(), { open: isOpen('developer'), summary: t('developerSummary') }) : ''}</div>`;
}
const PAGES = {
  home: renderHome,
  mycc: renderLibrary,
  inspiration: renderInspiration,
  creators: renderCreators,
  settings: renderSettings,
  collection: renderCollection,
  collections: renderCollections,
  curseforge: () => renderCurseForge(),
  account: () => renderAccount()
};
function render() {
  if (renderAuthGate()) return;
  withFocusPreserved(() => {
    setShell();
    (PAGES[state.page] || renderHome)();
  });
  const pageKey = `${state.page}:${state.activeCollection || ''}`;
  if (pageKey !== renderedPage) {
    renderedPage = pageKey;
    document.querySelector('.main-area')?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }
}
// Touch screens have no hover, so the rail opens with its menu button and closes after choosing a page.
function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('is-open', open);
  document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', String(open));
}
function goTo(page) {
  setSidebarOpen(false);
  if (!PAGES[page]) page = 'home';
  state.page = page;
  state.query = '';
  search.value = '';
  render();
  content.focus({ preventScroll: true });
}

/* ---------- Dialogs ---------- */
function colorPicker(selected) {
  const value = collectionColor(selected);
  return `<fieldset class="color-picker"><legend>${t('collectionColor')}</legend><div class="color-options">${[...COLLECTION_COLORS, ...COLLECTION_PASTELS].map(
    color => `<label class="color-option"><input type="radio" name="collection-color" value="${color}" ${color === value ? 'checked' : ''}><span class="color-option-face">${plumbob(color)}<span class="visually-hidden">${color}</span></span></label>`
  ).join('')}<label class="color-custom"><span>${t('customColor')}</span><input type="color" id="collection-color-custom" value="${value}"></label></div></fieldset>`;
}
function chosenColor() {
  const custom = document.getElementById('collection-color-custom');
  const radio = dialog.querySelector('input[name="collection-color"]:checked');
  if (custom?.dataset.changed === 'true') return collectionColor(custom.value);
  return collectionColor(radio?.value);
}
function newCollectionDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('newCollection')}</h2><label class="field">${t('collectionName')}<input id="collection-name" maxlength="40" autocomplete="off"></label>${colorPicker(COLLECTION_COLORS[state.collections.length % COLLECTION_COLORS.length])}<div class="detail-actions"><button class="primary-btn" id="create-collection">${t('create')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function editCollectionDialog() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) return;
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('editCollection')}</h2><label class="field">${t('collectionName')}<input id="collection-name" maxlength="40" value="${esc(collectionLabel(c))}"></label>${colorPicker(c.color)}<div class="detail-actions"><button class="primary-btn" id="save-rename">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function saveDialog(id) {
  const cfItem = isCurseForgeItem(id) && typeof curseForgeItemInfo === 'function' ? curseForgeItemInfo(id) : null;
  if (!cfItem) return;
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('save')}</h2><p>${esc(cfItem.name)}</p><fieldset class="check-list"><legend class="visually-hidden">${t('collectionsTitle')}</legend>${state.collections
      .map(c => `<label class="check-row"><input type="checkbox" value="${esc(c.id)}" ${c.items.includes(id) ? 'checked' : ''}>${plumbob(c.color)}<span>${esc(collectionLabel(c))}</span></label>`)
      .join('')}</fieldset><button class="tertiary-btn" id="new-collection-from-save">${icon('plus')}<span>${t('newCollection')}</span></button><div class="detail-actions"><button class="primary-btn" id="confirm-save" data-item="${esc(id)}">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function saveSelection(id) {
  const selected = [...dialog.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
  state.collections.forEach(c => {
    const had = c.items.includes(id);
    const wants = selected.includes(c.id);
    if (had === wants) return;
    c.items = wants ? [...c.items, id] : c.items.filter(i => i !== id);
    touchCollection(c);
  });
  persist();
  closeDialog();
  render();
  toast(t('collectionSaved'));
}
function createCollection() {
  const input = document.getElementById('collection-name');
  const name = input?.value.trim();
  if (!name) return input?.focus();
  state.collections.push({ id: `collection-${Date.now().toString(36)}`, name, color: chosenColor(), items: [], updated: Date.now() });
  persist();
  closeDialog();
  render();
  toast(t('collectionSaved'));
}
function shareCollection(id) {
  const c = state.collections.find(x => x.id === id);
  if (!c) return;
  const link = collectionLink(collectionLabel(c), c.items.filter(isCurseForgeItem));
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('share')}</h2><p>${t('linkShareHint')}</p><label class="field">${t('share')}<input id="collection-share-link" readonly value="${esc(link)}"></label><div class="detail-actions"><button class="primary-btn" id="copy-collection-link">${t('copyLink')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function importCollectionFromLink(value) {
  const data = readCollectionLink(value);
  if (!data) return toast(t('invalidCollectionLink'), 'error');
  state.collections.push({ id: `import-${Date.now().toString(36)}`, name: data.name || t('importedCollectionName'), color: collectionColor('', state.collections.length), items: data.items, updated: Date.now() });
  persist();
  closeDialog();
  render();
  toast(t('imported'));
}
function importCollectionDialog(value = '') {
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('importCollection')}</h2><p>${t('pasteCollectionLink')}</p><label class="field">${t('importCollection')}<input id="collection-link-input" placeholder="simmerspace://collection#…" value="${esc(value)}"></label><div class="detail-actions"><button class="primary-btn" id="import-collection-link">${t('importLink')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function offerSharedCollection() {
  if (!location.hash.startsWith('#collection=')) return;
  const raw = location.href;
  history.replaceState(null, '', location.pathname + location.search);
  if (readCollectionLink(raw)) importCollectionDialog(raw);
}
// Cover images are picked in the system file dialog; the desktop app returns a small JPEG thumbnail.
async function chooseCollectionCover() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) return;
  try {
    const cover = await callDesktop(desktop?.chooseCoverImage);
    if (!cover) return;
    c.cover = cover;
    touchCollection(c);
    if (!persist()) return toast(t('coverTooLarge'), 'error');
    render();
    toast(t('coverSaved'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Launch Game ---------- */
let launching = false;
async function launchGame() {
  if (launching) return;
  if (!desktop?.launchGame) return toast(t('desktopOnly'), 'error');
  launching = true;
  try {
    const result = await callDesktop(desktop.launchGame);
    toast(result.repeated ? t('gameAlreadyStarting') : t('gameStarting'));
  } catch (error) {
    if (error.code === 'GAME_FOLDER_NOT_SET' || error.code === 'GAME_NOT_FOUND') {
      const ok = await confirmAction({
        title: t(error.code === 'GAME_FOLDER_NOT_SET' ? 'gameFolderNeeded' : 'gameNotFoundTitle'),
        body: t(error.code === 'GAME_FOLDER_NOT_SET' ? 'gameFolderNeededText' : 'gameNotFoundText'),
        confirmLabel: t('chooseFolder')
      });
      if (ok) await chooseDirectory('game');
    } else {
      toast(errorMessage(error), 'error');
    }
  } finally {
    launching = false;
  }
}

/* ---------- Events ---------- */
// Simple id-based buttons. Each handler receives the clicked button.
const CLICK_ACTIONS = {
  'new-collection': newCollectionDialog,
  'new-collection-page': newCollectionDialog,
  'new-collection-from-save': newCollectionDialog,
  'create-collection': createCollection,
  'confirm-save': el => saveSelection(el.dataset.item),
  'theme-toggle': () => setAppearance({ mode: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' }),
  'launch-game': launchGame,
  'replay-tour': () => startTour({ replay: true }),
  'sidebar-toggle': () => setSidebarOpen(!document.getElementById('sidebar').classList.contains('is-open')),
  'home-scan': async () => {
    goTo('mycc');
    if (typeof scanManagedMods === 'function') await scanManagedMods();
  },
  'home-import-files': async () => {
    goTo('mycc');
    if (typeof importManagedMods === 'function') await importManagedMods('files');
  },
  'home-import-folder': async () => {
    goTo('mycc');
    if (typeof importManagedMods === 'function') await importManagedMods('folder');
  },
  'home-explore': () => goTo('curseforge'),
  'toggle-nav-collections': () => {
    state.navCollectionsOpen = !state.navCollectionsOpen;
    safeWrite('nav-collections-open', state.navCollectionsOpen);
    nav();
    document.getElementById('toggle-nav-collections')?.focus();
  },
  'choose-collection-cover': chooseCollectionCover,
  'remove-collection-cover': () => {
    const c = state.collections.find(x => x.id === state.activeCollection);
    if (!c) return;
    delete c.cover;
    touchCollection(c);
    persist();
    render();
    toast(t('coverRemoved'));
  },
  'import-collection-button': () => importCollectionDialog(),
  'import-collection-link': () => importCollectionFromLink(document.getElementById('collection-link-input')?.value || ''),
  'copy-collection-link': async () => {
    const field = document.getElementById('collection-share-link');
    field?.select();
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      document.execCommand('copy');
    }
    toast(t('shareFile'));
  },
  'edit-collection': editCollectionDialog,
  'save-rename': () => {
    const c = state.collections.find(x => x.id === state.activeCollection);
    const name = document.getElementById('collection-name').value.trim();
    if (!c || !name) return;
    if (name !== collectionLabel(c)) c.name = name;
    c.color = chosenColor();
    touchCollection(c);
    persist();
    closeDialog();
    render();
  },
  'send-feedback': () => openFeedbackDialog(),
  'donate-button': () => openFeedbackDialog('donation_feedback'),
  'profile-button': () => goTo('account'),
  'show-all-collections': () => goTo('collections')
};

document.addEventListener('click', async event => {
  const target = event.target;
  const button = target.closest('button[id]');
  if (button && CLICK_ACTIONS[button.id]) {
    await CLICK_ACTIONS[button.id](button);
    return;
  }
  const page = target.closest('[data-page]');
  if (page) {
    event.preventDefault();
    return goTo(page.dataset.page);
  }
  const collection = target.closest('[data-collection]');
  if (collection) {
    state.activeCollection = collection.dataset.collection;
    const opened = state.collections.find(c => c.id === state.activeCollection);
    if (opened) {
      opened.opened = Date.now();
      persist();
    }
    return goTo('collection');
  }
  const filter = target.closest('[data-filter]');
  if (filter) {
    const name = filter.dataset.filter;
    if (name.startsWith('cf-')) return; // handled in curseforge.js
    if (name === 'library-state') {
      state.libraryState = filter.dataset.value;
      return render();
    }
    return;
  }
  const appearance = target.closest('[data-appearance]');
  if (appearance) return setAppearance({ [appearance.dataset.appearance]: appearance.dataset.value });
  const lang = target.closest('[data-language]');
  if (lang) {
    state.lang = lang.dataset.language === 'es' ? 'es' : 'en';
    safeSet('language', state.lang);
    return render();
  }
  const save = target.closest('[data-save]');
  if (save) {
    event.stopPropagation();
    return saveDialog(save.dataset.save);
  }
  const exp = target.closest('[data-export]');
  if (exp) return shareCollection(exp.dataset.export);
});

// Remembers which settings sections are open.
document.addEventListener(
  'toggle',
  event => {
    const panel = event.target;
    if (panel.matches?.('.settings-panel')) {
      const open = safeRead('settings-open', {});
      safeWrite('settings-open', { ...(open && typeof open === 'object' ? open : {}), [panel.id]: panel.open });
    }
  },
  true
);

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'pref-tooltips') {
    state.tooltips = target.checked;
    safeWrite('tooltips', state.tooltips);
    if (!state.tooltips) hideTooltip();
    return toast(t(state.tooltips ? 'tooltipsOn' : 'tooltipsOff'));
  }
  if (target.id === 'group-mode' || target.id === 'group-mode-settings') {
    state.groupMode = target.value === 'creator' ? 'creator' : 'category';
    safeSet('group-mode', state.groupMode);
    return render();
  }
  if (target.id === 'collection-sort') {
    state.collectionSort = target.value;
    safeSet(target.id, target.value);
    return render();
  }
  if (target.id === 'collection-color-custom') {
    target.dataset.changed = 'true';
    for (const radio of dialog.querySelectorAll('input[name="collection-color"]')) radio.checked = false;
    return;
  }
  if (target.name === 'collection-color') {
    const custom = document.getElementById('collection-color-custom');
    if (custom) {
      custom.dataset.changed = 'false';
      custom.value = target.value;
    }
    return;
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'library-search') {
    state.libraryQuery = event.target.value;
    render();
  }
  if (event.target.id === 'collection-search') {
    state.collectionQuery = event.target.value;
    render();
  }
});

// Drag to reorder collections. Only offered while the "Custom order" sort is chosen; the new
// order is saved locally. Keyboard users can still use the A–Z and recent orders.
let draggedCard = null;
document.addEventListener('dragstart', event => {
  const card = event.target.closest?.('.collection-tile[draggable="true"]');
  if (!card) return;
  draggedCard = card;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.collection);
});
document.addEventListener('dragover', event => {
  const over = event.target.closest?.('.collection-tile');
  if (draggedCard && over && over.className.split(' ')[0] === draggedCard.className.split(' ')[0]) event.preventDefault();
});
document.addEventListener('drop', event => {
  const over = event.target.closest?.('.collection-tile');
  if (!draggedCard || !over || over === draggedCard) return;
  event.preventDefault();
  const move = (list, key) => {
    const from = list.findIndex(x => x.id === draggedCard.dataset[key]);
    const to = list.findIndex(x => x.id === over.dataset[key]);
    if (from < 0 || to < 0) return false;
    list.splice(to, 0, list.splice(from, 1)[0]);
    return true;
  };
  if (draggedCard.dataset.collection && over.dataset.collection) {
    if (move(state.collections, 'collection')) persist();
  }
  draggedCard = null;
  render();
});
document.addEventListener('dragend', () => {
  draggedCard?.classList.remove('is-dragging');
  draggedCard = null;
});
let searchTimer = null;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => {
      state.query = search.value;
      if (state.page === 'curseforge') return curseForgeQueryChanged(state.query);
      if (state.page === 'mycc') {
        // The top search filters the real library list.
        mods.query = state.query;
        mods.page = 0;
        return renderModsPanel();
      }
      // Pages without their own search send the query to Explore, which searches the real CurseForge catalog.
      if (!['mycc', 'creators'].includes(state.page)) {
        state.page = 'curseforge';
        render();
        return curseForgeQueryChanged(state.query);
      }
      render();
    },
    state.page === 'curseforge' ? 450 : 120
  );
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
    search.select();
  }
});
