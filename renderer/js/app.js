/* SimmerSpace interface: state, pages and local interactions. Demo catalog data lives in demo-data.js. */
let APP_VERSION = '0.10.0';

function savedLanguage() {
  const value = safeGet('language');
  if (value === 'es' || value === 'en') return value;
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

// Collections saved by earlier versions have no color or change time; both get safe defaults here.
function normalizeCollections(list) {
  const source = Array.isArray(list) ? list : structuredClone(SEED_COLLECTIONS);
  return source
    .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c, index) => ({ ...c, items: Array.isArray(c.items) ? c.items.filter(id => typeof id === 'string') : [], color: collectionColor(c.color, index), updated: Number(c.updated) || 0 }));
}

const state = {
  page: 'discover',
  parent: 'all',
  sub: 'All',
  parts: [],
  gender: 'All',
  age: 'All ages',
  style: 'All',
  source: 'All',
  occult: [],
  sort: 'curated',
  query: '',
  libraryQuery: '',
  libraryState: 'All',
  creatorPlatform: 'All',
  creatorFollowingOnly: false,
  followingCreators: safeRead('following-creators', []),
  groupMode: safeGet('group-mode') === 'creator' ? 'creator' : 'category',
  moreFilters: safeRead('more-filters-open', false) === true,
  navCollectionsOpen: safeRead('nav-collections-open', true) !== false,
  favorites: safeRead('favorites', []),
  collections: normalizeCollections(safeRead('collections', SEED_COLLECTIONS)),
  statuses: safeRead('statuses', {}),
  appearance: loadAppearance(),
  lang: savedLanguage(),
  activeCollection: null,
  activeBoard: null,
  collectionQuery: '',
  collectionSort: ['custom', 'az', 'opened'].includes(safeGet('collection-sort')) ? safeGet('collection-sort') : 'custom',
  boardSort: ['recent', 'az', 'custom'].includes(safeGet('board-sort')) ? safeGet('board-sort') : 'recent',
  showAllBoards: safeGet('boards-show-all') === 'true',
  appInfo: { developer: false },
  integrations: null
};
if (!Array.isArray(state.favorites)) state.favorites = [];
if (!Array.isArray(state.followingCreators)) state.followingCreators = [];

const content = document.getElementById('page-content');
const search = document.getElementById('search-input');
const ITEM_IDS = new Set(ITEMS.map(item => item.id));
const itemById = id => ITEMS.find(item => item.id === id);
let renderedPage = null;

// Returns false when the browser storage refused the write (for example, a very large cover image).
function persist() {
  const saved = safeWrite('collections', state.collections);
  safeWrite('favorites', state.favorites);
  safeWrite('statuses', state.statuses);
  return saved;
}
function touchCollection(c) {
  c.updated = Date.now();
}

/* ---------- Demo content labels ---------- */
function getBoards() {
  const saved = safeRead('boards', SEED_BOARDS);
  if (!Array.isArray(saved)) return structuredClone(SEED_BOARDS);
  return saved.map((b, i) => ({ ...b, refs: Array.isArray(b.refs) ? b.refs : [], note: b.note || '', used: b.used || saved.length - i }));
}
// Sample boards and collections are translated only while they keep their original sample text.
function boardLabel(b) {
  const translated = DEMO_ES.boards[b.id]?.name;
  return state.lang === 'es' && translated && b.name === seedValue(SEED_BOARDS, b.id, 'name') ? translated : b.name;
}
function boardDescription(b) {
  const translated = DEMO_ES.boards[b.id]?.note;
  if (state.lang === 'es' && translated && b.note === seedValue(SEED_BOARDS, b.id, 'note')) return translated;
  return b.note || '';
}
function collectionLabel(c) {
  const translated = DEMO_ES.collections[c.id];
  return state.lang === 'es' && translated && c.name === seedValue(SEED_COLLECTIONS, c.id, 'name') ? translated : c.name;
}
function seedValue(list, id, field) {
  return list.find(item => item.id === id)?.[field];
}
function audienceLabel(value) {
  return AUDIENCE_KEYS[value] ? t(AUDIENCE_KEYS[value]) : value;
}
function styleLabel(value) {
  return value === 'Both' ? t('both') : value;
}
function categoryLabel(value) {
  return CATEGORY_LABEL_KEYS[value] ? t(CATEGORY_LABEL_KEYS[value]) : value;
}
function tagLabel(tag) {
  return state.lang === 'es' ? DEMO_ES.tags[tag] || tag : tag;
}
function labelItem(item, field = 'name') {
  if (state.lang === 'es') {
    if (field === 'note') return DEMO_ES.notes[item.id] || item.note;
    if (field === 'name' && item.es) return item.es;
  }
  return item[field];
}
function subLabel(sub) {
  return sub === 'All' ? t('all') : t(PART_KEYS[sub] || sub.toLowerCase());
}
const PART_KEYS = {
  'Full body': 'fullBody',
  Tops: 'tops',
  Bottoms: 'bottoms',
  Shoes: 'shoes',
  Swimwear: 'swimwear',
  Outerwear: 'outerwear',
  Jewelry: 'jewelry',
  Hats: 'hats',
  Glasses: 'glasses',
  Bags: 'bags',
  Gloves: 'gloves',
  Socks: 'socks',
  Eyes: 'eyes',
  Animals: 'animals',
  Skins: 'animalSkins',
  Objects: 'animalObjects'
};
const OCCULT_KEYS = {
  Vampire: 'occultVampire',
  Werewolf: 'occultWerewolf',
  Mermaid: 'occultMermaid',
  Fairy: 'occultFairy',
  PlantSim: 'occultPlantSim',
  Genie: 'occultGenie',
  Spellcaster: 'occultSpellcaster',
  Alien: 'occultAlien',
  Ghost: 'occultGhost',
  Servo: 'occultServo'
};

function art(item, extra = '') {
  return `<div class="art ${extra}" aria-hidden="true" style="--art-height:${Number(item.height) || 208}px;--art-bg:${item.bg};--shape-a:${item.a};--shape-b:${item.b};--hair:${item.hair || '#594743'};--skin:${item.skin || '#dfb9a2'};--figure:${item.figure || '#c49bab'};--figure-light:${item.light || '#e4ccd7'};--figure-dark:${item.dark || '#977785'}"><span class="art-deco"></span><span class="art-rug"></span><span class="art-figure"></span><span class="art-object">${item.emoji}</span><span class="art-sparkle">✧</span></div>`;
}

/* ---------- Shell ---------- */
function wordmark() {
  return `<span class="wordmark"><span class="wm-simmer">Simmer</span><span class="wm-space">Space</span></span>`;
}
function navButton(id, iconName, extra = '') {
  const active = state.page === id;
  return `<button class="nav-item ${active ? 'is-active' : ''}" data-page="${id}" ${active ? 'aria-current="page"' : ''} title="${esc(t(id))}">${icon(iconName, 'nav-icon')}<span class="nav-label">${t(id)}</span>${extra}</button>`;
}
function nav() {
  const modsCount = typeof scannedModCount === 'function' ? scannedModCount() : null;
  const count = modsCount === null ? '' : `<span class="nav-count" title="${esc(t('navModsCount'))}">${modsCount.toLocaleString(state.lang)}</span>`;
  const open = state.navCollectionsOpen;
  const collections = state.collections
    .map(c => {
      const active = state.page === 'collection' && state.activeCollection === c.id;
      return `<button class="nav-item nav-collection ${active ? 'is-active' : ''}" data-collection="${esc(c.id)}" ${active ? 'aria-current="page"' : ''} title="${esc(collectionLabel(c))}">${plumbob(c.color, { className: 'nav-icon' })}<span class="nav-label">${esc(collectionLabel(c))}</span><span class="nav-count">${c.items.length}</span></button>`;
    })
    .join('');
  const user = typeof accountUser === 'function' ? accountUser() : null;
  document.getElementById('sidebar').innerHTML = `<a class="brand" href="#" data-page="discover" aria-label="SimmerSpace">${brandMark()}${wordmark()}</a>
    <nav class="side-nav" aria-label="${esc(t('mainNavigation'))}">
      <div class="nav-group"><div class="nav-heading">${t('navBrowse')}</div>${navButton('discover', 'discover')}${navButton('curseforge', 'curseforge')}</div>
      <div class="nav-group"><div class="nav-heading">${t('navLibrary')}</div>${navButton('mycc', 'library', count)}${navButton('favorites', 'heart')}${navButton('creators', 'creators')}${navButton('inspiration', 'inspiration')}</div>
      <div class="nav-group nav-collections ${open ? '' : 'is-collapsed'}">
        <div class="nav-heading-row"><button class="nav-heading nav-disclosure" id="toggle-nav-collections" aria-expanded="${open}" aria-controls="nav-collection-list">${icon('chevron', 'disclosure-icon')}<span>${t('collectionsNav')}</span></button><button class="icon-btn icon-btn-sm" id="new-collection" aria-label="${esc(t('newCollection'))}" title="${esc(t('newCollection'))}">${icon('plus')}</button></div>
        <div class="nav-collection-list" id="nav-collection-list" ${open ? '' : 'hidden'}>${collections}<button class="nav-item nav-subtle" id="show-all-collections" title="${esc(t('viewAllCollections'))}">${icon('folder', 'nav-icon')}<span class="nav-label">${t('viewAllCollections')}</span></button></div>
      </div>
    </nav>
    <div class="sidebar-footer">
      <button class="launch-button" id="launch-game" title="${esc(t('launchGame'))}">${icon('play', 'nav-icon')}<span class="nav-label">${t('launchGame')}</span></button>
      ${navButton('settings', 'settings')}
      <button class="account-chip ${state.page === 'account' ? 'is-active' : ''}" data-page="account" ${state.page === 'account' ? 'aria-current="page"' : ''} title="${esc(t('accountTitle'))}"><span class="avatar" aria-hidden="true">${esc((user?.displayName || 'S').slice(0, 1).toUpperCase())}</span><span class="nav-label account-copy"><strong>${esc(user?.displayName || t('guest'))}</strong><small>${user ? t('accountSignedInShort') : t('guestLocal')}</small></span></button>
    </div>`;
}
const PAGE_TITLES = { discover: 'discover', mycc: 'mycc', inspiration: 'inspiration', creators: 'creators', settings: 'settings', collections: 'collectionsTitle', favorites: 'favorites', curseforge: 'curseforge', account: 'accountTitle' };
function pageName() {
  if (state.page === 'collection') {
    const c = state.collections.find(x => x.id === state.activeCollection);
    return c ? collectionLabel(c) : t('collectionsTitle');
  }
  return t(PAGE_TITLES[state.page] || 'discover');
}
function setShell() {
  applyAppearance(state.appearance);
  document.body.classList.toggle('dialog-open', !overlay.hidden);
  document.documentElement.lang = state.lang;
  nav();
  document.getElementById('topbar-title').textContent = pageName();
  document.getElementById('footer-copy').textContent = t('footer');
  document.getElementById('footer-version').textContent = `SimmerSpace ${APP_VERSION} · ${t('preBeta')}`;
  document.title = `${pageName()} · SimmerSpace`;
  search.placeholder = state.page === 'curseforge' ? t('cfSearchPlaceholder') : t('search');
  search.setAttribute('aria-label', search.placeholder);
  const toggle = document.getElementById('theme-toggle');
  const dark = document.documentElement.dataset.mode === 'dark';
  toggle.innerHTML = icon(dark ? 'sun' : 'moon');
  toggle.setAttribute('aria-label', t(dark ? 'switchToLight' : 'switchToDark'));
  toggle.title = t(dark ? 'switchToLight' : 'switchToDark');
  const profile = document.getElementById('profile-button');
  const user = typeof accountUser === 'function' ? accountUser() : null;
  profile.innerHTML = user ? `<span class="avatar" aria-hidden="true">${esc(user.displayName.slice(0, 1).toUpperCase())}</span>` : icon('user');
  profile.title = user ? `${t('accountTitle')} · ${user.displayName}` : `${t('accountTitle')} · ${t('guest')}`;
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
const FILTER_DEFAULTS = { parent: 'all', sub: 'All', gender: 'All', age: 'All ages', style: 'All', source: 'All' };
const MULTI_FILTERS = ['parts', 'occult'];
function setFilter(name, value, multi) {
  if (multi && MULTI_FILTERS.includes(name)) {
    state[name] = state[name].includes(value) ? state[name].filter(v => v !== value) : [...state[name], value];
  } else if (name in FILTER_DEFAULTS) {
    state[name] = value;
    if (name === 'parent') state.sub = 'All';
    if (name === 'parent' || name === 'sub') state.parts = [];
  }
  render();
}
// Filters other than the category tabs, shown as removable tokens so it is clear what is narrowing results.
function activeFilterTokens() {
  const tokens = [];
  for (const part of state.parts) tokens.push(['parts', part, subLabel(part)]);
  if (state.gender !== 'All') tokens.push(['gender', state.gender, `${t('gender')}: ${t(state.gender.toLowerCase())}`]);
  if (state.age !== 'All ages') tokens.push(['age', state.age, `${t('age')}: ${audienceLabel(state.age)}`]);
  if (state.style !== 'All') tokens.push(['style', state.style, state.style]);
  if (state.source !== 'All') tokens.push(['source', state.source, state.source]);
  for (const value of state.occult) tokens.push(['occult', value, t(OCCULT_KEYS[value])]);
  return tokens;
}

/* ---------- Demo items ---------- */
function isInCollection(item) {
  return state.collections.some(c => c.items.includes(item.id));
}
function installState(item) {
  const stored = state.statuses[item.id];
  if (stored && typeof stored === 'object') return { installed: !!stored.installed, needsUpdate: !!stored.needsUpdate };
  const value = typeof stored === 'string' ? stored : item.status;
  return { installed: value === 'installed' || value === 'update', needsUpdate: value === 'update' };
}
function itemStatus(item) {
  const s = installState(item);
  return s.needsUpdate ? 'update' : s.installed ? 'installed' : isInCollection(item) ? 'saved' : 'pending';
}
function itemCard(item) {
  const liked = state.favorites.includes(item.id);
  const saved = isInCollection(item);
  const status = itemStatus(item);
  const statusText = { installed: t('installed'), saved: t('saved'), update: t('needsUpdate'), pending: t('pending') }[status];
  const name = esc(labelItem(item));
  return `<article class="cc-card" data-detail="${esc(item.id)}">${art(item)}<div class="card-body"><div class="card-title-row"><h3><button class="card-title-button" data-detail="${esc(item.id)}" aria-label="${esc(t('openDetails'))}: ${name}">${name}</button></h3><div class="card-actions"><button class="icon-btn icon-btn-sm ${liked ? 'is-on' : ''}" data-favorite="${esc(item.id)}" title="${esc(t('favorite'))}" aria-label="${esc(t('favorite'))}: ${name}" aria-pressed="${liked}">${icon('heart')}</button><button class="icon-btn icon-btn-sm ${saved ? 'is-on' : ''}" data-save="${esc(item.id)}" title="${esc(t('save'))}" aria-label="${esc(t('save'))}: ${name}">${icon('folder')}</button></div></div><div class="card-creator">${esc(item.creator)}</div><div class="card-meta">${state.page === 'mycc' ? (status === 'pending' ? '' : `<span class="status-pill status-${status}">${esc(statusText)}</span>`) : `<span class="meta-pill">${esc(categoryLabel(item.category))}</span><span class="meta-pill">${esc(item.type)}</span>`}<span class="meta-source">${esc(item.source)}</span></div></div></article>`;
}
function refCard(ref) {
  const name = esc(labelItem(ref));
  return `<article class="cc-card reference-card">${art(ref)}<div class="card-body"><div class="card-title-row"><h3>${name}</h3><button class="icon-btn icon-btn-sm" data-pin-ref="${esc(ref.id)}" title="${esc(t('addReference'))}" aria-label="${esc(t('addReference'))}: ${name}">${icon('plus')}</button></div><div class="card-creator">${esc(ref.creator)}</div><div class="card-meta"><span class="meta-pill">Pinterest</span><span class="meta-source">${t('sampleData')}</span></div></div></article>`;
}
function filteredItems() {
  return filterDemoItems(ITEMS, { ...state, lang: state.lang }, item => labelItem(item));
}

/* ---------- Pages ---------- */
function renderDiscover() {
  const items = filteredItems();
  const parents = [
    ['all', t('all')],
    ['mods', t('mods')],
    ['cas', t('cas')],
    ['buildbuy', t('buildbuy')]
  ];
  const subs = SUBS[state.parent];
  const partsDef = state.parent === 'cas' ? CAS_PARTS[state.sub] : null;
  const sources = [...new Set(ITEMS.map(i => i.source))].sort();
  const tokens = activeFilterTokens();
  const moreCount = tokens.filter(([name]) => name !== 'parts').length;
  const sort = `<label class="select-field select-inline"><span>${t('sort')}</span><select id="sort-filter">${[
    ['curated', t('curated')],
    ['az', t('az')],
    ['updated', t('updated')],
    ['popular', t('popular')]
  ]
    .map(([value, text]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${esc(text)}</option>`)
    .join('')}</select></label>`;
  const more = state.moreFilters
    ? `<div class="filter-more" id="more-filters">${chipGroup({ name: 'gender', label: t('gender'), options: [['All', t('all')], ['Female', t('female')], ['Male', t('male')]], selected: state.gender, size: 'sm' })}${chipGroup({
        name: 'age',
        label: t('age'),
        options: [['All ages', t('allages')], ['Babies', t('babies')], ['Infants', t('infants')], ['Toddlers', t('toddlers')], ['Kids', t('kids')], ['Teen', t('teen')], ['Young Adult', t('youngadult')], ['Elders', t('elders')]],
        selected: state.age,
        size: 'sm'
      })}${chipGroup({ name: 'style', label: t('style'), options: [['All', t('typeAll')], ['Maxis Match', 'Maxis Match'], ['Alpha', 'Alpha']], selected: state.style, size: 'sm' })}${chipGroup({
        name: 'source',
        label: t('source'),
        options: [['All', t('anysource')], ...sources.map(s => [s, s])],
        selected: state.source,
        size: 'sm'
      })}${chipGroup({ name: 'occult', label: t('occultFilter'), options: OCCULTS.map(o => [o, t(OCCULT_KEYS[o])]), selected: state.occult, multi: true, size: 'xs', quiet: true })}</div>`
    : '';
  const filterBar = `<section class="filter-bar" aria-label="${esc(t('filters'))}">
    <div class="filter-row">${chipGroup({ name: 'parent', label: t('category'), options: parents, selected: state.parent, hideLabel: true })}<div class="filter-tools"><button class="tertiary-btn" id="toggle-more-filters" aria-expanded="${state.moreFilters}" aria-controls="more-filters">${icon('sliders')}<span>${t('moreFilters')}</span>${moreCount ? `<span class="badge">${moreCount}</span>` : ''}</button>${sort}</div></div>
    ${subs.length > 1 ? `<div class="filter-row filter-row-sub">${chipGroup({ name: 'sub', label: t('subcategory'), options: subs.map(s => [s, subLabel(s)]), selected: state.sub, size: 'sm', hideLabel: true })}</div>` : ''}
    ${partsDef ? `<div class="filter-row filter-row-parts">${chipGroup({ name: 'parts', label: subLabel(state.sub), options: partsDef.values.map(v => [v, subLabel(v)]), selected: state.parts, multi: true, size: 'sm' })}</div>` : ''}
    ${more}
    ${tokens.length ? `<div class="active-filters" aria-label="${esc(t('activeFilters'))}"><span class="active-filters-label">${t('activeFilters')}</span>${tokens.map(([name, value, text]) => `<button class="filter-token" data-remove-filter="${esc(name)}" data-value="${esc(value)}" aria-label="${esc(format(t('removeFilterNamed'), { name: text }))}"><span>${esc(text)}</span>${icon('close')}</button>`).join('')}<button class="text-link" id="clear-filters">${t('resetFilters')}</button></div>` : ''}
  </section>`;
  content.innerHTML = `${pageHeader(t('discover'), { meta: `${items.length} ${t('finds')}`, actions: `<span class="sample-badge">${t('sampleData')}</span>` })}${notice(t('discoverDemoNote'), { action: `<button class="text-link" data-page="curseforge">${t('browseCurseForge')} →</button>` })}${filterBar}${items.length ? `<div class="card-grid">${items.map(itemCard).join('')}</div>` : empty(t('empty'), t('emptyText'), `<button class="secondary-btn" id="clear-filters-empty">${t('resetFilters')}</button>`)}`;
}

function renderLibrary() {
  const statuses = [
    ['All', 'all'],
    ['Installed', 'installed'],
    ['Saved', 'saved'],
    ['Needs update', 'needsUpdate']
  ];
  const q = (state.libraryQuery || state.query).trim().toLowerCase();
  const all = ITEMS.filter(i => (installState(i).installed || isInCollection(i)) && (!q || `${i.name} ${i.es} ${i.creator} ${i.category} ${i.sub}`.toLowerCase().includes(q)));
  const items = all.filter(i => {
    const s = installState(i);
    if (state.libraryState === 'Installed' && !s.installed) return false;
    if (state.libraryState === 'Saved' && (!isInCollection(i) || s.installed)) return false;
    if (state.libraryState === 'Needs update' && !s.needsUpdate) return false;
    return true;
  });
  const groupLabel = i => (state.groupMode === 'creator' ? i.creator : categoryLabel(i.category));
  const grouped =
    state.groupMode === 'creator'
      ? CREATORS.map(c => [c.name, items.filter(i => i.creator === c.name)]).filter(x => x[1].length)
      : [...new Set(items.map(groupLabel))].sort((a, b) => a.localeCompare(b, state.lang)).map(k => [k, items.filter(i => groupLabel(i) === k)]);
  const sampleOpen = safeRead('sample-library-open', false) === true;
  const count = typeof scannedModCount === 'function' ? scannedModCount() : null;
  content.innerHTML = `${pageHeader(t('mycc'), { meta: count === null ? '' : format(t('filesFound'), { count: count.toLocaleString(state.lang) }) })}${folderRoutePanel()}<div id="mods-manager-root">${renderManagedModsPanel()}</div><details class="panel sample-library" id="sample-library" ${sampleOpen ? 'open' : ''}><summary class="panel-summary"><span><b>${t('demoLibraryTitle')}</b><small>${t('demoLibraryShort')}</small></span>${icon('chevron', 'disclosure-icon')}</summary><div class="panel-body"><p class="muted-note">${t('demoLibraryNote')}</p><div class="toolbar-row"><label class="search-field search-field-inline">${icon('search')}<input id="library-search" type="search" value="${esc(state.libraryQuery)}" placeholder="${esc(t('librarySearch'))}" aria-label="${esc(t('librarySearch'))}"></label>${chipGroup({ name: 'library-state', label: t('status'), options: statuses.map(([id, key]) => [id, t(key)]), selected: state.libraryState, size: 'sm', hideLabel: true })}<label class="select-field select-inline"><span>${t('groupBy')}</span><select id="group-mode"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></div>${
    items.length
      ? grouped.map(([name, group]) => `<section class="library-group"><h3 class="group-title">${esc(name)} <span>${group.length}</span></h3><div class="card-grid">${group.map(itemCard).join('')}</div></section>`).join('')
      : empty(t('libraryEmpty'), '')
  }</div></details>`;
}

// Boards in the chosen order. "Custom" is the saved order, which can be changed by dragging.
function sortedBoards() {
  const boards = getBoards();
  if (state.boardSort === 'az') return boards.sort((a, b) => boardLabel(a).localeCompare(boardLabel(b), state.lang));
  if (state.boardSort === 'custom') return boards;
  return boards.sort((a, b) => (b.used || 0) - (a.used || 0));
}
function sortSelect(id, options, value) {
  return `<label class="select-field select-inline"><span>${t('sort')}</span><select id="${id}">${options.map(([optionValue, key]) => `<option value="${optionValue}" ${value === optionValue ? 'selected' : ''}>${t(key)}</option>`).join('')}</select></label>`;
}
function recommendedItems() {
  const saved = ITEMS.filter(i => state.favorites.includes(i.id) || isInCollection(i));
  const want = saved.length ? saved[0].type : null;
  return ITEMS.filter(i => !state.favorites.includes(i.id))
    .sort((a, b) => (want && b.type === want ? 1 : 0) - (want && a.type === want ? 1 : 0))
    .slice(0, 3);
}
const BOARD_DEFAULT_ICONS = [
  ['🛋️', '💐', '🪞'],
  ['🏡', '🌿', '🕯️'],
  ['👗', '👜', '🌷'],
  ['💄', '🪻', '✧'],
  ['🪑', '🪴', '🧸'],
  ['🎨', '🌼', '☼']
];
function boardPreview(b, index) {
  const refs = b.refs
    .map(id => REFERENCES.find(r => r.id === id))
    .filter(Boolean)
    .slice(0, 3);
  const defaults = BOARD_DEFAULT_ICONS[index % BOARD_DEFAULT_ICONS.length];
  return `<span class="board-collage" aria-hidden="true">${[0, 1, 2].map(slot => `<span class="collage-tile">${refs[slot]?.emoji || defaults[slot]}</span>`).join('')}</span>`;
}
function renderInspiration() {
  const allBoards = sortedBoards();
  const boards = state.showAllBoards ? allBoards : allBoards.slice(0, 6);
  const custom = state.boardSort === 'custom';
  const recommendations = recommendedItems();
  const tools = `<div class="section-tools">${sortSelect('board-sort', [['recent', 'recentlyUsed'], ['az', 'az'], ['custom', 'customOrder']], state.boardSort)}${allBoards.length > 6 ? `<button class="tertiary-btn" id="toggle-all-boards" aria-pressed="${state.showAllBoards}">${state.showAllBoards ? t('showRecent') : t('showAllBoards')}</button>` : ''}</div>`;
  content.innerHTML = `${pageHeader(t('inspiration'), { actions: `<button class="secondary-btn" id="new-board">${icon('plus')}<span>${t('newBoard')}</span></button>`, meta: `<span class="sample-badge">${t('sampleData')}</span>` })}<div class="inspo-layout"><div><section class="section"><div class="section-head"><h2 class="section-title">${state.showAllBoards ? t('allBoards') : t('recentBoards')} <span>${boards.length} / ${allBoards.length}</span></h2>${tools}</div>${custom ? `<p class="muted-note drag-hint">${t('dragHint')}</p>` : ''}<div class="board-grid">${boards
    .map((b, i) => `<button class="board-card" data-board="${esc(b.id)}" ${custom ? 'draggable="true"' : ''}>${boardPreview(b, i)}<span class="board-label"><strong>${esc(boardLabel(b))}</strong><span>${b.refs.length} ${t('pins')}</span></span></button>`)
    .join('')}</div></section><section class="section"><div class="section-head"><h2 class="section-title">${t('pinterest')}</h2><button class="tertiary-btn" id="upload-reference" title="${esc(t('planned'))}">${icon('plus')}<span>${t('uploadImage')}</span></button></div><div class="card-grid">${REFERENCES.map(refCard).join('')}</div></section></div><aside class="panel recommend-panel"><h2 class="section-title">${icon('star')} ${t('recommendations')}</h2><p class="muted-note">${t('noRecommendations')}</p><div class="recommend-list">${recommendations
    .map(i => `<div class="recommend-item">${art(i, 'recommend-art')}<div><strong>${esc(labelItem(i))}</strong><small>${esc(i.creator)} · ${esc(i.type)}</small><button class="text-link" data-detail="${esc(i.id)}">${t('openDetails')} →</button></div></div>`)
    .join('')}</div></aside></div>`;
}

function localPatreonCreators() {
  const saved = safeRead('patreon-creators', []);
  if (!Array.isArray(saved)) return [];
  return saved.flatMap(c => {
    if (!c || typeof c.name !== 'string' || typeof c.id !== 'string') return [];
    const profileUrl = normalizePatreonProfile(c.profileUrl);
    return profileUrl ? [{ ...c, profileUrl, icon: 'P', platforms: [['Patreon', profileUrl]], tags: [], type: 'Unknown', style: 'Patreon profile', esStyle: 'Perfil de Patreon', manualPatreon: true }] : [];
  });
}
function creatorCatalog() {
  return [...CREATORS, ...localPatreonCreators()];
}
function creatorCard(c) {
  const following = state.followingCreators.includes(c.id);
  const platformControl =
    c.platforms.length > 1
      ? `<label class="select-field select-compact"><span class="visually-hidden">${t('choosePlatform')}</span><select data-creator-link="${esc(c.id)}"><option value="">${t('visit')}…</option>${c.platforms.map((p, i) => `<option value="${i}">${esc(p[0])}</option>`).join('')}</select></label>`
      : `<a class="secondary-btn small-chip" href="${esc(c.platforms[0][1])}" target="_blank" rel="noopener noreferrer">${t('visit')} ${esc(c.platforms[0][0])} ${icon('external')}</a>`;
  return `<article class="creator-card"><header class="creator-head"><div class="creator-avatar" aria-hidden="true">${esc(c.icon)}</div><div class="creator-identity"><h3>${esc(c.name)}</h3><div class="creator-platforms">${c.platforms.map(p => esc(p[0])).join(' · ')}</div></div><span class="meta-pill">${c.manualPatreon ? t('creatorAddedByYou') : esc(styleLabel(c.type))}</span></header>${c.tags.length ? `<div class="tag-row">${c.tags.slice(0, 3).map(tag => `<span class="meta-pill meta-pill-quiet">${esc(tagLabel(tag))}</span>`).join('')}</div>` : ''}<div class="creator-footer">${platformControl}<button class="small-chip ${following ? 'is-on' : ''}" data-follow-creator="${esc(c.id)}" aria-pressed="${following}">${following ? icon('check') : ''}<span>${following ? t('followingCreator') : t('followCreator')}</span></button>${
    c.manualPatreon ? `<button class="small-chip danger-quiet" data-remove-patreon-creator="${esc(c.id)}">${t('removePatreonCreator')}</button>` : ''
  }</div>${c.manualPatreon ? `<p class="muted-note">${t('patreonProfileLink')}</p>` : ''}</article>`;
}
function renderCreators() {
  const creators = creatorCatalog();
  const query = state.query.toLowerCase();
  const filtered = creators.filter(
    c =>
      (state.creatorPlatform === 'All' || c.platforms.some(p => p[0] === state.creatorPlatform)) &&
      (!state.creatorFollowingOnly || state.followingCreators.includes(c.id)) &&
      (!query || `${c.name} ${c.tags.join(' ')} ${c.style}`.toLowerCase().includes(query))
  );
  const platforms = [...new Set(creators.flatMap(c => c.platforms.map(p => p[0])))];
  content.innerHTML = `${pageHeader(t('creators'), { meta: `<span class="sample-badge">${t('sampleData')}</span>`, actions: `<button class="primary-btn" id="add-patreon-creator">${icon('plus')}<span>${t('addPatreonCreator')}</span></button>` })}${notice(`<b>${t('patreonPostsTitle')}.</b> ${t('patreonPostsNote')}`)}<div class="toolbar-row">${chipGroup({
    name: 'creator-platform',
    label: t('creatorFilter'),
    options: [['All', t('allPlatforms')], ...platforms.map(p => [p, p])],
    selected: state.creatorPlatform,
    size: 'sm'
  })}<button class="chip chip-sm ${state.creatorFollowingOnly ? 'is-selected' : ''}" id="creator-following-filter" aria-pressed="${state.creatorFollowingOnly}">${icon('heart', 'chip-check')}<span>${t('followingOnly')} · ${state.followingCreators.length}</span></button></div><div class="creator-grid">${filtered.map(creatorCard).join('')}</div>${filtered.length ? '' : empty(t('noResult'), '')}`;
}
function addPatreonCreatorDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">Patreon · ${t('creatorAddedByYou')}</div><h2 id="dialog-title">${t('addPatreonCreator')}</h2><p>${t('patreonManualNote')}</p><label class="field">${t('creatorName')}<input id="patreon-creator-name" type="text" maxlength="70" autocomplete="off"></label><label class="field">${t('patreonProfileUrl')}<input id="patreon-profile-url" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t('patreonProfilePlaceholder'))}"></label><div class="detail-actions"><button class="primary-btn" id="save-patreon-creator">${t('addPatreonCreator')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function savePatreonCreator() {
  const name = document.getElementById('patreon-creator-name')?.value.trim();
  const input = document.getElementById('patreon-profile-url')?.value.trim();
  const profileUrl = normalizePatreonProfile(input);
  if (!name || !input) return toast(t('patreonNameRequired'), 'error');
  if (!profileUrl) return toast(t('patreonUrlInvalid'), 'error');
  const saved = localPatreonCreators();
  if (saved.some(c => c.profileUrl === profileUrl)) return toast(t('patreonDuplicate'), 'error');
  const id = `patreon-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  saved.push({ id, name, profileUrl });
  if (!safeWrite('patreon-creators', saved.map(({ id, name, profileUrl }) => ({ id, name, profileUrl })))) return toast(t('patreonSaveFailed'), 'error');
  closeDialog();
  state.creatorPlatform = 'All';
  state.creatorFollowingOnly = false;
  state.query = '';
  search.value = '';
  render();
  toast(t('patreonCreatorAdded'));
}

// Cards for a collection: sample items plus CurseForge mods saved with "cf:<id>".
function collectionCards(c) {
  const sample = ITEMS.filter(i => i.isCC !== false && c.items.includes(i.id)).map(itemCard);
  const fromCurseForge = c.items.filter(isCurseForgeItem).map(id => (typeof curseForgeCollectionCard === 'function' ? curseForgeCollectionCard(id) : ''));
  return [...sample, ...fromCurseForge].filter(Boolean);
}
function renderCollection() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) {
    state.page = 'discover';
    return renderDiscover();
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
  const items = ITEMS.filter(i => c.items.includes(i.id)).slice(0, 3);
  const defaults = ['✧', '✿', '☼'];
  return `<span class="collection-cover" aria-hidden="true">${[0, 1, 2]
    .map(slot => {
      const item = items[slot];
      return `<span class="collection-cover-tile ${item ? 'has-art' : ''}" ${item ? `style="--cover-art:${esc(item.bg)}"` : ''}>${item?.emoji || defaults[slot]}</span>`;
    })
    .join('')}</span>`;
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
const ACCENT_LABEL_KEYS = { rose: 'rose', lavender: 'lavender', sage: 'sage', blue: 'simsBlue' };
function segmented(name, label, options, value) {
  return `<div class="setting-row"><span class="setting-label" id="${name}-label">${label}</span><div class="segmented" role="radiogroup" aria-labelledby="${name}-label">${options
    .map(([optionValue, text]) => `<button class="segment ${value === optionValue ? 'is-selected' : ''}" role="radio" aria-checked="${value === optionValue}" data-appearance="${name}" data-value="${optionValue}">${esc(text)}</button>`)
    .join('')}</div></div>`;
}
function accentPicker(name, label, value, { allowNone = false, exclude = '' } = {}) {
  const options = [...(allowNone ? [['', t('accentNone')]] : []), ...ACCENTS.map(a => [a, t(ACCENT_LABEL_KEYS[a])])];
  return `<div class="setting-row"><span class="setting-label" id="${name}-label">${label}</span><div class="swatch-row" role="radiogroup" aria-labelledby="${name}-label">${options
    .map(([accent, text]) => {
      const selected = value === accent;
      const disabled = accent && accent === exclude;
      return `<button class="swatch ${selected ? 'is-selected' : ''}" role="radio" aria-checked="${selected}" data-appearance="${name}" data-value="${accent}" ${disabled ? `disabled title="${esc(t('accentSameAsPrimary'))}"` : ''}><i class="swatch-dot" data-swatch="${accent || 'none'}" aria-hidden="true"></i><span>${esc(text)}</span></button>`;
    })
    .join('')}</div></div>`;
}
function themeCard(family, title, description) {
  const selected = state.appearance.family === family;
  return `<button class="theme-card ${selected ? 'is-selected' : ''}" role="radio" aria-checked="${selected}" data-appearance="family" data-value="${family}"><span class="theme-preview theme-preview-${family}" aria-hidden="true"><i></i><i></i><i></i></span><span class="theme-card-copy"><b>${esc(title)}</b><small>${esc(description)}</small></span></button>`;
}
function settingsPanel(id, title, body, { open = true, summary = '' } = {}) {
  return `<details class="panel settings-panel" id="${id}" ${open ? 'open' : ''}><summary class="panel-summary"><span><b>${title}</b>${summary ? `<small>${summary}</small>` : ''}</span>${icon('chevron', 'disclosure-icon')}</summary><div class="panel-body">${body}</div></details>`;
}
function renderSettings() {
  const a = state.appearance;
  const openPanels = safeRead('settings-open', { personalization: true });
  const isOpen = id => (openPanels && typeof openPanels === 'object' ? openPanels[id] !== false && (id in openPanels || id === 'personalization') : id === 'personalization');
  const personalization = `<div class="setting-row"><span class="setting-label" id="family-label">${t('theme')}</span><div class="theme-cards" role="radiogroup" aria-labelledby="family-label">${themeCard('soft', t('themeSoft'), t('themeSoftNote'))}${themeCard('sims-blue', t('themeSimsBlue'), t('themeSimsBlueNote'))}</div></div>${segmented('mode', t('mode'), [['light', t('modeLight')], ['dark', t('modeDark')], ['system', t('modeSystem')]], a.mode)}${accentPicker('primary', t('primaryAccent'), a.primary)}${accentPicker('secondary', t('secondaryAccent'), a.secondary, { allowNone: true, exclude: a.primary })}<p class="setting-help">${t('accentRules')}</p>${segmented('density', t('density'), [['comfortable', t('densityComfortable')], ['compact', t('densityCompact')]], a.density)}${segmented('motion', t('motion'), [['system', t('motionSystem')], ['reduced', t('motionReduced')], ['full', t('motionFull')]], a.motion)}<div class="setting-row"><span class="setting-label">${t('preview')}</span><div class="preview-row"><button class="primary-btn" tabindex="-1">${t('previewPrimary')}</button><button class="secondary-btn" tabindex="-1">${t('previewSecondary')}</button><span class="chip is-selected">${t('previewChip')}</span><span class="badge">3</span></div></div>`;
  const general = `<div class="setting-row"><span class="setting-label" id="language-label">${t('language')}</span><div class="segmented" role="radiogroup" aria-labelledby="language-label"><button class="segment ${state.lang === 'es' ? 'is-selected' : ''}" role="radio" aria-checked="${state.lang === 'es'}" data-language="es" lang="es">Español</button><button class="segment ${state.lang === 'en' ? 'is-selected' : ''}" role="radio" aria-checked="${state.lang === 'en'}" data-language="en" lang="en">English</button></div></div><div class="setting-row"><label class="setting-label" for="group-mode-settings">${t('groupBy')}</label><label class="select-field"><select id="group-mode-settings"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></div>`;
  const about = `<dl class="facts"><div><dt>${t('version')}</dt><dd>${APP_VERSION} ${t('preBeta')}</dd></div><div><dt>${t('compatibility')}</dt><dd>${t('windows')}</dd></div></dl><p class="setting-help">${t('privacyNote')}</p><div class="button-row"><button class="secondary-btn" id="send-feedback">${t('feedback')}</button><button class="tertiary-btn" id="donate-button">${t('donate')} · ${t('comingSoon')}</button></div>`;
  content.innerHTML = `${pageHeader(t('settingsTitle'))}<div class="settings-stack">${settingsPanel('personalization', t('personalization'), personalization, { open: isOpen('personalization'), summary: t('personalizationSummary') })}${settingsPanel('general', t('general'), general, { open: isOpen('general'), summary: t('generalSummary') })}${settingsPanel('folders', t('folderRoutes'), folderSettingsSection(), { open: isOpen('folders'), summary: t('foldersSummary') })}${settingsPanel('account-settings', t('accountTitle'), typeof accountSettingsSection === 'function' ? accountSettingsSection() : '', { open: isOpen('account-settings'), summary: t('accountSummary') })}${settingsPanel('curseforge-settings', t('curseforgeConnection'), typeof curseForgeSettingsSection === 'function' ? curseForgeSettingsSection() : '', { open: isOpen('curseforge-settings'), summary: t('curseforgeSummary') })}${settingsPanel('about', t('about'), about, { open: isOpen('about') })}${state.appInfo.developer && typeof developerSection === 'function' ? settingsPanel('developer', t('developerTools'), developerSection(), { open: isOpen('developer'), summary: t('developerSummary') }) : ''}</div>`;
}
function renderFavorites() {
  const items = ITEMS.filter(i => state.favorites.includes(i.id));
  content.innerHTML = `${pageHeader(t('favorites'), { meta: format(t('itemsCount'), { count: items.length }) })}${items.length ? `<div class="card-grid">${items.map(itemCard).join('')}</div>` : empty(t('favoritesEmpty'), t('favoritesEmptyText'), `<button class="secondary-btn" data-page="discover">${t('discover')}</button>`)}`;
}

const PAGES = {
  discover: renderDiscover,
  mycc: renderLibrary,
  inspiration: renderInspiration,
  creators: renderCreators,
  settings: renderSettings,
  collection: renderCollection,
  collections: renderCollections,
  favorites: renderFavorites,
  curseforge: () => renderCurseForge(),
  account: () => renderAccount()
};
function render() {
  withFocusPreserved(() => {
    setShell();
    (PAGES[state.page] || renderDiscover)();
  });
  const pageKey = `${state.page}:${state.activeCollection || ''}`;
  if (pageKey !== renderedPage) {
    renderedPage = pageKey;
    document.querySelector('.main-area')?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }
}
function goTo(page) {
  if (!PAGES[page]) page = 'discover';
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
  const item = itemById(id);
  const cfItem = isCurseForgeItem(id) && typeof curseForgeItemInfo === 'function' ? curseForgeItemInfo(id) : null;
  if (!item && !cfItem) return;
  if (item?.isCC === false) return toast(t('noCC'));
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('save')}</h2><p>${esc(item ? labelItem(item) : cfItem.name)}</p><fieldset class="check-list"><legend class="visually-hidden">${t('collectionsTitle')}</legend>${state.collections
      .map(c => `<label class="check-row"><input type="checkbox" value="${esc(c.id)}" ${c.items.includes(id) ? 'checked' : ''}>${plumbob(c.color)}<span>${esc(collectionLabel(c))}</span></label>`)
      .join('')}</fieldset><button class="tertiary-btn" id="new-collection-from-save">${icon('plus')}<span>${t('newCollection')}</span></button><div class="detail-actions"><button class="primary-btn" id="confirm-save" data-item="${esc(id)}">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function detailDialog(item) {
  const installed = installState(item).installed;
  const liked = state.favorites.includes(item.id);
  openDialog(
    `${closeButton()}${art(item, 'detail-art')}<div class="detail-body"><div class="eyebrow">${esc(categoryLabel(item.category))} · ${esc(item.source)} · ${t('sampleData')}</div><h2 id="dialog-title">${esc(labelItem(item))}</h2><div class="card-creator">${esc(item.creator)} · ${esc(styleLabel(item.type))}</div><p>${esc(labelItem(item, 'note'))}</p><div class="tag-row"><span class="meta-pill">${esc(audienceLabel(item.gender))}</span><span class="meta-pill">${esc(audienceLabel(item.age))}</span><span class="meta-pill">${esc(item.source)}</span></div><div class="detail-actions"><button class="primary-btn" data-toggle-install="${esc(item.id)}">${installed ? t('uninstall') : t('install')}</button><button class="secondary-btn" data-save="${esc(item.id)}">${t('save')}</button><button class="secondary-btn" data-favorite="${esc(item.id)}" aria-pressed="${liked}">${icon('heart')}<span>${t('favorite')}</span></button></div><p class="muted-note">${t('downloadLinks')} ${t('markInstalledNote')}</p></div>`
  );
}
function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
  safeWrite('preferences-updated', Date.now());
  persist();
  const inDetail = !overlay.hidden && dialog.querySelector(`[data-toggle-install="${CSS.escape(id)}"]`);
  render();
  if (inDetail) detailDialog(itemById(id));
  toast(state.favorites.includes(id) ? t('favoriteAdded') : t('favoriteRemoved'));
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
  const link = collectionLink(collectionLabel(c), c.items.filter(itemId => ITEM_IDS.has(itemId) || isCurseForgeItem(itemId)));
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('share')}</h2><p>${t('linkShareHint')}</p><label class="field">${t('share')}<input id="collection-share-link" readonly value="${esc(link)}"></label><div class="detail-actions"><button class="primary-btn" id="copy-collection-link">${t('copyLink')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function importCollectionFromLink(value) {
  const data = readCollectionLink(value, ITEM_IDS);
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
  if (readCollectionLink(raw, ITEM_IDS)) importCollectionDialog(raw);
}
function newBoardDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('newBoard')}</h2><label class="field">${t('boardName')}<input id="board-name" maxlength="42"></label><label class="field">${t('note')}<textarea id="board-note" placeholder="${esc(t('boardNote'))}"></textarea></label><div class="detail-actions"><button class="primary-btn" id="create-board">${t('create')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function openBoard(id) {
  const boards = getBoards();
  const board = boards.find(b => b.id === id);
  if (!board) return;
  board.used = Date.now();
  safeWrite('boards', boards);
  state.activeBoard = id;
  const rec = ITEMS.filter(i => i.category === 'Furniture' || i.department === 'buildbuy').slice(0, 2);
  const refs = REFERENCES.filter(r => board.refs.includes(r.id));
  openDialog(
    `${closeButton()}<div class="board-detail-layout"><div class="form-dialog"><div class="eyebrow">${t('pinterest')} · ${t('sampleData')}</div><h2 id="dialog-title">${esc(boardLabel(board))}</h2><label class="field">${t('boardNote')}<textarea id="board-note-edit">${esc(boardDescription(board))}</textarea></label><div class="board-reference-list">${refs.map(refCard).join('') || `<p class="muted-note">${t('noReferencesYet')}</p>`}</div><div class="detail-actions"><button class="primary-btn" id="save-board-note" data-save-board-note="${esc(id)}">${t('saveNote')}</button><button class="secondary-btn" id="add-reference">${icon('plus')}<span>${t('addReference')}</span></button><button class="danger-btn danger-quiet" data-delete-board="${esc(id)}">${t('deleteBoard')}</button></div></div><aside class="related-panel"><div class="eyebrow">${t('relatedCC')}</div>${rec
      .map(i => `<div class="recommend-item">${art(i, 'recommend-art')}<div><strong>${esc(labelItem(i))}</strong><small>${esc(i.creator)} · ${esc(i.type)}</small><button class="text-link" data-save="${esc(i.id)}">${t('save')}</button></div></div>`)
      .join('')}</aside></div>`,
    { wide: true }
  );
}
function pinReference(id) {
  const boards = getBoards();
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('addReference')}</h2><fieldset class="check-list"><legend class="visually-hidden">${t('recentBoards')}</legend>${boards
      .map((b, i) => `<label class="check-row"><input type="radio" name="pin-board" value="${esc(b.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(boardLabel(b))}</span></label>`)
      .join('')}</fieldset><div class="detail-actions"><button class="primary-btn" id="confirm-pin" data-ref="${esc(id)}">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function createBoard() {
  const input = document.getElementById('board-name');
  const name = input.value.trim();
  if (!name) return input.focus();
  const boards = getBoards();
  boards.unshift({ id: `board-${Date.now().toString(36)}`, name, emoji: '✧', refs: [], note: document.getElementById('board-note').value.trim(), used: Date.now() });
  safeWrite('boards', boards);
  closeDialog();
  render();
  toast(t('boardSaved'));
}
function saveBoardNote(id) {
  const boards = getBoards();
  const board = boards.find(x => x.id === id);
  if (!board) return;
  const text = document.getElementById('board-note-edit').value.trim();
  // Saving the displayed translation unchanged keeps the original sample note.
  if (text !== boardDescription(board)) board.note = text;
  board.used = Date.now();
  safeWrite('boards', boards);
  closeDialog();
  render();
  toast(t('noteSaved'));
}
function openFeedback() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><h2 id="dialog-title">${t('feedback')}</h2><p>${t('feedbackLocalNote')}</p><label class="field">${t('feedback')}<textarea id="feedback-note" maxlength="4000" placeholder="${esc(t('feedbackPlaceholder'))}"></textarea></label><div class="detail-actions"><button class="primary-btn" id="save-feedback">${t('saveSuggestion')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function resetDiscoverFilters() {
  Object.assign(state, { ...FILTER_DEFAULTS, parts: [], occult: [], sort: 'curated', query: '' });
  search.value = '';
  render();
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
  'toggle-nav-collections': () => {
    state.navCollectionsOpen = !state.navCollectionsOpen;
    safeWrite('nav-collections-open', state.navCollectionsOpen);
    nav();
    document.getElementById('toggle-nav-collections')?.focus();
  },
  'toggle-more-filters': () => {
    state.moreFilters = !state.moreFilters;
    safeWrite('more-filters-open', state.moreFilters);
    render();
  },
  'new-board': newBoardDialog,
  'toggle-all-boards': () => {
    state.showAllBoards = !state.showAllBoards;
    safeSet('boards-show-all', String(state.showAllBoards));
    render();
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
  'add-patreon-creator': addPatreonCreatorDialog,
  'save-patreon-creator': savePatreonCreator,
  'create-board': createBoard,
  'save-board-note': el => saveBoardNote(el.dataset.saveBoardNote),
  'add-reference': () => pinReference(REFERENCES[0].id),
  'confirm-pin': el => {
    const selected = dialog.querySelector('input[name="pin-board"]:checked');
    if (!selected) return toast(t('chooseBoard'), 'error');
    const boards = getBoards();
    const b = boards.find(x => x.id === selected.value);
    if (b && !b.refs.includes(el.dataset.ref)) {
      b.refs.push(el.dataset.ref);
      b.used = Date.now();
      safeWrite('boards', boards);
    }
    closeDialog();
    render();
    toast(t('pinAdded'));
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
  'send-feedback': openFeedback,
  'save-feedback': () => {
    const field = document.getElementById('feedback-note');
    const text = field.value.trim();
    if (!text) return field.focus();
    const notes = safeRead('suggestions', []);
    safeWrite('suggestions', [...(Array.isArray(notes) ? notes : []), { text, date: new Date().toISOString() }]);
    closeDialog();
    toast(t('suggestionSaved'));
  },
  'donate-button': () => toast(t('donationDemo')),
  'profile-button': () => goTo('account'),
  'upload-reference': () => toast(t('planned')),
  'clear-filters': resetDiscoverFilters,
  'clear-filters-empty': resetDiscoverFilters,
  'show-all-collections': () => goTo('collections'),
  'creator-following-filter': () => {
    state.creatorFollowingOnly = !state.creatorFollowingOnly;
    render();
  }
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
    if (name === 'creator-platform') {
      state.creatorPlatform = filter.dataset.value;
      return render();
    }
    return setFilter(name, filter.dataset.value, filter.dataset.multi === 'true');
  }
  const removeFilter = target.closest('[data-remove-filter]');
  if (removeFilter) {
    const name = removeFilter.dataset.removeFilter;
    if (MULTI_FILTERS.includes(name)) state[name] = state[name].filter(v => v !== removeFilter.dataset.value);
    else state[name] = FILTER_DEFAULTS[name];
    render();
    return document.getElementById('clear-filters')?.focus() || document.getElementById('toggle-more-filters')?.focus();
  }
  const appearance = target.closest('[data-appearance]');
  if (appearance) return setAppearance({ [appearance.dataset.appearance]: appearance.dataset.value });
  const install = target.closest('[data-toggle-install]');
  if (install) {
    const id = install.dataset.toggleInstall;
    const currently = installState(itemById(id)).installed;
    state.statuses[id] = { installed: !currently, needsUpdate: false };
    persist();
    closeDialog();
    render();
    return toast(t(!currently ? 'markedInstalled' : 'markedUninstalled'));
  }
  const lang = target.closest('[data-language]');
  if (lang) {
    state.lang = lang.dataset.language === 'es' ? 'es' : 'en';
    safeSet('language', state.lang);
    safeWrite('preferences-updated', Date.now());
    return render();
  }
  const favorite = target.closest('[data-favorite]');
  if (favorite) {
    event.stopPropagation();
    return toggleFavorite(favorite.dataset.favorite);
  }
  const followCreator = target.closest('[data-follow-creator]');
  if (followCreator) {
    const id = followCreator.dataset.followCreator;
    state.followingCreators = state.followingCreators.includes(id) ? state.followingCreators.filter(value => value !== id) : [...state.followingCreators, id];
    safeWrite('following-creators', state.followingCreators);
    render();
    return toast(state.followingCreators.includes(id) ? t('creatorFollowSaved') : t('creatorFollowRemoved'));
  }
  const removePatreon = target.closest('[data-remove-patreon-creator]');
  if (removePatreon) {
    const id = removePatreon.dataset.removePatreonCreator;
    const creator = localPatreonCreators().find(c => c.id === id);
    const ok = await confirmAction({ title: t('removePatreonCreator'), body: t('confirmRemovePatreon'), details: creator ? [creator.name] : [], confirmLabel: t('removePatreonCreator'), danger: true });
    if (!ok) return;
    safeWrite('patreon-creators', localPatreonCreators().filter(c => c.id !== id).map(({ id, name, profileUrl }) => ({ id, name, profileUrl })));
    state.followingCreators = state.followingCreators.filter(value => value !== id);
    safeWrite('following-creators', state.followingCreators);
    render();
    return toast(t('patreonCreatorRemoved'));
  }
  const save = target.closest('[data-save]');
  if (save) {
    event.stopPropagation();
    return saveDialog(save.dataset.save);
  }
  const pin = target.closest('[data-pin-ref]');
  if (pin) {
    event.stopPropagation();
    return pinReference(pin.dataset.pinRef);
  }
  const detail = target.closest('[data-detail]');
  if (detail && !target.closest('#dialog')) {
    const item = itemById(detail.dataset.detail);
    if (item) detailDialog(item);
    return;
  }
  const board = target.closest('[data-board]');
  if (board) return openBoard(board.dataset.board);
  const deleteBoard = target.closest('[data-delete-board]');
  if (deleteBoard) {
    const id = deleteBoard.dataset.deleteBoard;
    const boardName = getBoards().find(b => b.id === id);
    const ok = await confirmAction({ title: t('deleteBoard'), body: t('confirmDeleteBoard'), details: boardName ? [boardLabel(boardName)] : [], confirmLabel: t('deleteBoard'), danger: true });
    if (!ok) return;
    safeWrite('boards', getBoards().filter(b => b.id !== id));
    render();
    return toast(t('boardDeleted'));
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
    if (panel.id === 'sample-library') safeWrite('sample-library-open', panel.open);
  },
  true
);

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'group-mode' || target.id === 'group-mode-settings') {
    state.groupMode = target.value === 'creator' ? 'creator' : 'category';
    safeSet('group-mode', state.groupMode);
    return render();
  }
  if (target.id === 'sort-filter') {
    state.sort = target.value;
    return render();
  }
  if (target.id === 'collection-sort' || target.id === 'board-sort') {
    const key = target.id === 'collection-sort' ? 'collectionSort' : 'boardSort';
    state[key] = target.value;
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
  const link = target.closest('[data-creator-link]');
  if (link && link.value !== '') {
    const creator = creatorCatalog().find(c => c.id === link.dataset.creatorLink);
    const platform = creator?.platforms[Number(link.value)];
    if (platform) {
      try {
        const url = new URL(platform[1]);
        if (url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch {}
    }
    link.value = '';
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

// Drag to reorder collections and boards. Only offered while the "Custom order" sort is chosen; the new
// order is saved locally. Keyboard users can still use the A–Z and recent orders.
let draggedCard = null;
document.addEventListener('dragstart', event => {
  const card = event.target.closest?.('.collection-tile[draggable="true"], .board-card[draggable="true"]');
  if (!card) return;
  draggedCard = card;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.collection || card.dataset.board);
});
document.addEventListener('dragover', event => {
  const over = event.target.closest?.('.collection-tile, .board-card');
  if (draggedCard && over && over.className.split(' ')[0] === draggedCard.className.split(' ')[0]) event.preventDefault();
});
document.addEventListener('drop', event => {
  const over = event.target.closest?.('.collection-tile, .board-card');
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
  } else if (draggedCard.dataset.board && over.dataset.board) {
    const boards = getBoards();
    if (move(boards, 'board')) safeWrite('boards', boards);
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
      if (state.page === 'mycc') state.libraryQuery = '';
      if (!['discover', 'mycc', 'creators'].includes(state.page)) state.page = 'discover';
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
