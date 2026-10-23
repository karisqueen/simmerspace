/* SimmerSpace interface: state, pages and local interactions. Demo catalog data lives in demo-data.js. */
let APP_VERSION = '0.8.0';
const HUES = ['rose', 'lavender', 'sage', 'blue'];
const THEMES = HUES.flatMap(hue => [`soft-${hue}`, `dark-${hue}`]);
const DEFAULT_THEME = 'soft-lavender';

function savedTheme() {
  const value = safeGet('theme');
  if (value === 'dark') return 'dark-lavender';
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}
function savedLanguage() {
  const value = safeGet('language');
  if (value === 'es' || value === 'en') return value;
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const state = {
  page: 'discover',
  parent: 'all',
  sub: 'All',
  gender: 'All',
  age: 'All ages',
  style: 'All',
  source: 'All',
  sort: 'curated',
  query: '',
  libraryQuery: '',
  libraryState: 'All',
  creatorPlatform: 'All',
  creatorFollowingOnly: false,
  followingCreators: safeRead('following-creators', []),
  groupMode: safeGet('group-mode') === 'creator' ? 'creator' : 'category',
  filtersOpen: false,
  favorites: safeRead('favorites', []),
  collections: safeRead('collections', SEED_COLLECTIONS),
  statuses: safeRead('statuses', {}),
  theme: savedTheme(),
  primaryHue: HUES.includes(safeGet('primary-hue')) ? safeGet('primary-hue') : savedTheme().split('-')[1],
  secondaryHue: HUES.includes(safeGet('secondary-hue')) ? safeGet('secondary-hue') : '',
  lang: savedLanguage(),
  activeCollection: null,
  activeBoard: null,
  animalType: 'All',
  occultType: 'All',
  casDetail: 'All',
  collectionQuery: '',
  collectionSort: safeGet('collection-sort') || 'custom',
  boardSort: safeGet('board-sort') || 'recent',
  showAllBoards: safeGet('boards-show-all') === 'true'
};
if (!Array.isArray(state.collections)) state.collections = structuredClone(SEED_COLLECTIONS);
if (!Array.isArray(state.favorites)) state.favorites = [];
if (!Array.isArray(state.followingCreators)) state.followingCreators = [];

const content = document.getElementById('page-content');
const search = document.getElementById('search-input');
const ITEM_IDS = new Set(ITEMS.map(item => item.id));
const itemById = id => ITEMS.find(item => item.id === id);
let renderedPage = null;

function persist() {
  safeWrite('favorites', state.favorites);
  safeWrite('collections', state.collections);
  safeWrite('statuses', state.statuses);
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
  return sub === 'All' ? t('all') : t(sub.toLowerCase());
}

function art(item, extra = '') {
  return `<div class="art ${extra}" aria-hidden="true" style="--art-height:${Number(item.height) || 208}px;--art-bg:${item.bg};--shape-a:${item.a};--shape-b:${item.b};--hair:${item.hair || '#594743'};--skin:${item.skin || '#dfb9a2'};--figure:${item.figure || '#c49bab'};--figure-light:${item.light || '#e4ccd7'};--figure-dark:${item.dark || '#977785'}"><span class="art-label">SIMMERSPACE · ${t('demo')}</span><span class="art-deco"></span><span class="art-rug"></span><span class="art-figure"></span><span class="art-object">${item.emoji}</span><span class="art-sparkle">✧</span>${state.page === 'mycc' ? '' : `<span class="art-sticker">${esc(categoryLabel(item.category || 'Pinterest'))}</span>`}</div>`;
}

/* ---------- Shell ---------- */
function navIcon(id) {
  const paths = {
    discover: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4 4"/>',
    mycc: '<path d="M3 6.5h7l2 2h9v9.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M7 13h10M7 16h7"/>',
    inspiration: '<rect x="4" y="4" width="15" height="16" rx="2.5"/><path d="M8 8h7M8 11h7M8 15l2.2-2 2 1.7 2.8-2.7"/>',
    creators: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M15 5.5a3 3 0 0 1 0 5.8M17 14a4 4 0 0 1 3.5 4v1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.3 13.8 1.1 1.8-2 2-1.8-1.1a7 7 0 0 1-1.5.6L14.5 19h-3l-.6-1.9a7 7 0 0 1-1.5-.6l-1.8 1.1-2-2 1.1-1.8a7 7 0 0 1-.6-1.5L4.2 12v-3l1.9-.6a7 7 0 0 1 .6-1.5L5.6 5.1l2-2 1.8 1.1a7 7 0 0 1 1.5-.6L11.5 1.7h3l.6 1.9a7 7 0 0 1 1.5.6l1.8-1.1 2 2-1.1 1.8a7 7 0 0 1 .6 1.5l1.9.6v3l-1.9.6a7 7 0 0 1-.6 1.2Z" transform="translate(-1 2) scale(.95)"/>'
  };
  return `<svg viewBox="0 0 24 24" focusable="false"><g>${paths[id] || paths.discover}</g></svg>`;
}
function nav() {
  const pages = ['discover', 'mycc', 'inspiration', 'creators'];
  const modsCount = typeof scannedModCount === 'function' ? scannedModCount() : null;
  const navButton = id =>
    `<button class="nav-item ${state.page === id ? 'active' : ''}" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${navIcon(id)}</span><span>${t(id)}</span>${id === 'mycc' && modsCount !== null ? `<span class="nav-count" title="${esc(t('navModsCount'))}">${modsCount.toLocaleString(state.lang)}</span>` : ''}</button>`;
  document.getElementById('sidebar').innerHTML = `<a class="brand" href="#" data-page="discover" aria-label="SimmerSpace"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 4 32 20 20 36 8 20Z" fill="currentColor" opacity=".2"/><path d="M20 4 32 20 20 36 8 20Z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m20 9 8 11-8 11-8-11Z" fill="currentColor" opacity=".72"/></svg></span><span class="brand-name"><span class="brand-simmer">simmer</span><span class="brand-space">space</span></span></a><div class="side-label">${t('space')}</div><nav class="main-nav" aria-label="${esc(t('space'))}">${pages.map(navButton).join('')}</nav><div class="side-label side-label-spaced">${t('collections')}<button class="tiny-add" id="new-collection" aria-label="${esc(t('newCollection'))}" title="${esc(t('newCollection'))}">+</button></div><button class="collection-all" id="show-all-collections">${t('viewAllCollections')} →</button><div class="collection-nav">${state.collections.map(c => `<button class="nav-item ${state.page === 'collection' && state.activeCollection === c.id ? 'active' : ''}" data-collection="${esc(c.id)}"><span class="collection-plumbob" aria-hidden="true" style="--plumbob:${esc(c.color || '#b9a4ce')}"><svg viewBox="0 0 20 24"><path d="M10 1 19 11 10 23 1 11Z" fill="currentColor"/><path d="m10 4 6 7-6 9-6-9Z" fill="white" opacity=".26"/></svg></span><span>${esc(collectionLabel(c))}</span></button>`).join('')}</div><div class="sidebar-game"><button class="game-launch-link" id="launch-game" ${desktop && routeRecords.game?.path ? '' : 'disabled'}><span aria-hidden="true">▶</span><span>${t('launchGame')}</span></button></div><div class="sidebar-bottom">${navButton('settings')}<div class="profile-card"><div class="avatar" aria-hidden="true">S</div><div><strong>${t('profile')}</strong><small>${t('local')}</small></div></div></div>`;
}
function setShell() {
  document.body.className = `theme-${state.theme}${overlay.hidden ? '' : ' dialog-open'}`;
  applyPalette();
  // The page scrollbar belongs to <html>, which cannot see the body's theme colors, so it gets the theme too.
  document.documentElement.dataset.appTheme = state.theme;
  document.documentElement.lang = state.lang;
  nav();
  const names = {
    discover: t('discover'),
    mycc: t('mycc'),
    inspiration: t('inspiration'),
    creators: t('creators'),
    settings: t('settings'),
    collections: t('collectionsTitle'),
    favorites: t('favorite'),
    collection: (() => {
      const c = state.collections.find(x => x.id === state.activeCollection);
      return c ? collectionLabel(c) : t('collectionsTitle');
    })()
  };
  document.getElementById('crumb-kicker').textContent = t('kicker');
  document.getElementById('crumb-title').textContent = names[state.page] || t('discover');
  document.getElementById('footer-copy').textContent = t('footer');
  document.getElementById('footer-version').textContent = `SimmerSpace v${APP_VERSION} · ${t('betaLabel')}`;
  document.title = `${names[state.page] || t('discover')} · SimmerSpace`;
  search.placeholder = t('search');
  search.setAttribute('aria-label', t('search'));
  const toggle = document.getElementById('theme-toggle');
  const dark = state.theme.startsWith('dark');
  toggle.innerHTML = `<span class="theme-icon" aria-hidden="true">${dark ? '☀' : '☾'}</span>`;
  toggle.setAttribute('aria-label', t(dark ? 'switchToLight' : 'switchToDark'));
  toggle.title = t(dark ? 'switchToLight' : 'switchToDark');
  const profile = document.getElementById('profile-button');
  profile.title = `${t('signIn')} · ${t('comingSoon')}`;
  profile.setAttribute('aria-label', profile.title);
  document.getElementById('skip-link').textContent = t('skipToContent');
}
function heading(eyebrow, title, subtitle) {
  return `<div class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>`;
}
function empty(title = t('empty'), text = t('emptyText')) {
  return `<div class="empty-state"><span aria-hidden="true">☁</span><b>${title}</b><div>${text}</div></div>`;
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
  return `<article class="cc-card" data-detail="${esc(item.id)}">${art(item)}<div class="card-info"><div class="card-title-row"><div><h3><button class="card-title-button" data-detail="${esc(item.id)}" aria-label="${esc(t('openDetails'))}: ${name}">${name}</button></h3><div class="card-creator">${esc(item.creator)}</div></div><div class="card-actions"><button class="icon-btn ${liked ? 'liked' : ''}" data-favorite="${esc(item.id)}" title="${esc(t('favorite'))}" aria-label="${esc(t('favorite'))}: ${name}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button><button class="icon-btn ${saved ? 'saved' : ''}" data-save="${esc(item.id)}" title="${esc(t('save'))}" aria-label="${esc(t('save'))}: ${name}">▤</button></div></div><div class="card-meta">${state.page === 'mycc' ? (status === 'pending' ? '' : `<span class="status-pill status-${status}">${esc(statusText)}</span>`) : `<span class="meta-pill">${esc(item.type)}</span>`}<span class="meta-source">${esc(item.source)}</span></div></div></article>`;
}
function refCard(ref) {
  const name = esc(labelItem(ref));
  return `<article class="cc-card reference-card">${art(ref)}<div class="card-info"><div class="card-title-row"><div><h3>${name}</h3><div class="card-creator">${t('pinterest')} · ${esc(ref.creator)}</div></div><button class="icon-btn saved" data-pin-ref="${esc(ref.id)}" title="${esc(t('addReference'))}" aria-label="${esc(t('addReference'))}: ${name}">▤</button></div><div class="card-meta"><span class="meta-pill">Pinterest</span><span class="meta-source">${t('demo')}</span></div></div></article>`;
}
function filteredItems() {
  const query = state.query.toLowerCase();
  const items = ITEMS.filter(i => {
    if (query && !`${i.name} ${i.es} ${i.creator} ${i.category} ${i.sub} ${i.source} ${i.tag} ${i.type}`.toLowerCase().includes(query)) return false;
    if (state.parent !== 'all' && i.department !== state.parent) return false;
    if (state.sub === 'Body' && state.parent === 'cas') {
      if (!['Hair', 'Makeup', 'Lashes', 'Eyebrows', 'Eyes'].includes(i.sub)) return false;
    } else if (state.sub !== 'All' && i.sub !== state.sub && i.category !== state.sub) return false;
    if (state.casDetail !== 'All') {
      const type = i.casType || ({'Clothing':'Tops','Accessories':'Jewelry','Hair':'Hair','Makeup':'Makeup'}[i.sub] || i.sub);
      if (type !== state.casDetail) return false;
    }
    if (state.animalType !== 'All' && i.animalType !== state.animalType) return false;
    if (state.occultType !== 'All' && i.occultType !== state.occultType) return false;
    if (state.gender !== 'All' && i.gender !== 'All' && i.gender !== state.gender && i.gender !== 'Unisex') return false;
    if (state.age !== 'All ages' && i.age !== 'All ages') {
      const ageAliases = { Elders: ['Elder','Elders'], Infants: ['Infant','Infants'], Babies: ['Baby','Babies'] };
      if (!(ageAliases[state.age] || [state.age]).includes(i.age)) return false;
    }
    if (state.style !== 'All' && i.type !== state.style && i.type !== 'Both') return false;
    if (state.source !== 'All' && i.source !== state.source) return false;
    return true;
  });
  if (state.sort === 'az') items.sort((a, b) => labelItem(a).localeCompare(labelItem(b), state.lang));
  if (state.sort === 'updated') items.sort((a, b) => b.updated - a.updated);
  if (state.sort === 'popular') items.sort((a, b) => b.popularity - a.popularity);
  return items;
}
// A labelled dropdown; it is marked .is-set when it no longer shows its first ("all") option.
function selectField(id, label, options, value) {
  const isSet = options.length && options[0][0] !== value;
  return `<label class="filter-field"><span>${label}</span><select id="${id}" class="${isSet ? 'is-set' : ''}">${options
    .map(([optionValue, text]) => `<option value="${esc(optionValue)}" ${optionValue === value ? 'selected' : ''}>${esc(text)}</option>`)
    .join('')}</select></label>`;
}

/* ---------- Pages ---------- */
function renderDiscover() {
  state.filtersOpen = document.querySelector('.filter-disclosure')?.open ?? state.filtersOpen;
  const items = filteredItems();
  const parents = [
    ['all', t('all')],
    ['mods', t('mods')],
    ['cas', t('cas')],
    ['buildbuy', t('buildbuy')]
  ];
  const subs = SUBS[state.parent];
  const summary =
    state.parent === 'cas'
      ? `${t('cas')} › ${state.sub === 'All' ? t('all') : subLabel(state.sub)}`
      : state.parent === 'buildbuy'
        ? `${t('buildbuy')} › ${state.sub === 'All' ? t('all') : subLabel(state.sub)}`
        : state.parent === 'mods'
          ? `${t('mods')} › ${state.sub === 'All' ? t('allMods') : subLabel(state.sub)}`
          : t('quickFilters');
  const sources = [...new Set(ITEMS.map(i => i.source))].sort();
  const filters = `<div class="quick-filters">${selectField(
    'gender-filter',
    t('gender'),
    [
      ['All', t('all')],
      ['Female', t('female')],
      ['Male', t('male')]
    ],
    state.gender
  )}${selectField(
    'age-filter',
    t('age'),
    [
      ['All ages', t('allages')],
      ['Teen', t('teen')],
      ['Young Adult', t('youngadult')],
      ['Elders', t('elders')],
      ['Kids', t('kids')],
      ['Toddlers', t('toddlers')],
      ['Infants', t('infants')],
      ['Babies', t('babies')]
    ],
    state.age
  )}${selectField(
    'style-filter',
    t('style'),
    [
      ['All', t('typeAll')],
      ['Maxis Match', 'Maxis Match'],
      ['Alpha', 'Alpha']
    ],
    state.style
  )}${selectField('source-filter', t('source'), [['All', t('anysource')], ...sources.map(s => [s, s])], state.source)}${state.parent === 'cas' && ['Clothing','Accessories'].includes(state.sub) ? `<div class="cas-subfilter-wrap"><span class="filter-caption">${t('casType')}</span><div class="cas-subfilters">${(state.sub==='Clothing'?['Tops','Bottoms','Full body','Shoes','Swimwear','Outerwear']:['Hats','Glasses','Jewelry','Bags','Gloves','Socks']).map(v=>`<button type="button" class="filter-chip ${state.casDetail===v?'selected':''}" data-cas-detail="${esc(v)}" aria-pressed="${state.casDetail===v}">${t(`cas_${v}`)}</button>`).join('')}</div></div>` : ''}${state.parent === 'cas' && state.sub === 'Animals' ? `<div class="cas-subfilter-wrap"><span class="filter-caption">${t('animalType')}</span><div class="cas-subfilters">${['Skins','Clothing','Eyes','Accessories','Objects'].map(v=>`<button type="button" class="filter-chip ${state.animalType===v?'selected':''}" data-animal-detail="${v}" aria-pressed="${state.animalType===v}">${t(`animal_${v}`)}</button>`).join('')}</div></div>` : ''}${selectField(
    'sort-filter',
    t('sort'),
    [
      ['curated', t('curated')],
      ['az', t('az')],
      ['updated', t('updated')],
      ['popular', t('popular')]
    ],
    state.sort
  )}</div><details class="occult-filter"><summary>${t('occultType')} <span>${state.occultType==='All'?t('all'):t(`occult_${state.occultType}`)}⌄</span></summary><div class="occult-options">${['Vampires','Werewolves','Mermaids','Fairies','PlantSims','Genies','Spellcasters','Aliens','Ghosts','Servos'].map(v=>`<button type="button" class="filter-chip ${state.occultType===v?'selected':''}" data-occult-detail="${v}" aria-pressed="${state.occultType===v}">${t(`occult_${v}`)}</button>`).join('')}</div></details>`;
  content.innerHTML = `<section class="hero"><div><div class="eyebrow">${t('heroEyebrow')}</div><h1>${t('heroTitle').replace('\n', '<br>')}</h1><p>${t('heroText')}</p></div><div class="hero-note"><i aria-hidden="true">✳</i><span><b>${t('mycc')}</b> ${t('heroNote')} <small>${t('demo')} · ${items.length} ${t('finds')}</small></span></div></section><div class="demo-banner" role="note"><b>${t('demo')}</b><span>${t('discoverDemoNote')}</span></div><div class="section-toolbar"><h2>${t('filterBy')}</h2></div><div class="category-row parent-filters">${parents
    .map(
      ([id, name]) =>
        `<button class="chip ${state.parent === id ? 'selected' : ''}" data-parent="${id}" aria-pressed="${state.parent === id}">${id === 'all' ? '✦ ' : ''}${name}</button>`
    )
    .join('')}</div><div class="filter-actions-row"><details class="filter-panel filter-disclosure" ${state.filtersOpen ? 'open' : ''}><summary class="filter-title">${esc(summary)}</summary><div class="category-row">${subs
    .map(s => `<button class="chip ${state.sub === s ? 'selected' : ''}" data-sub="${esc(s)}" aria-pressed="${state.sub === s}">${esc(subLabel(s))}</button>`)
    .join('')}</div>${
    state.parent === 'cas' && state.sub === 'Body'
      ? `<div class="category-row nested-filter">${['Hair', 'Makeup', 'Lashes', 'Eyebrows'].map(s => `<button class="chip" data-sub="${s}">${t(s.toLowerCase())}</button>`).join('')}</div>`
      : ''
  }${filters}</details><button class="small-chip filter-clear" id="clear-filters">${t('removeFilter')}</button></div><div class="section-toolbar"><h2>${state.parent === 'all' ? t('all') : t(state.parent)} <span>${items.length} ${t('finds')} · ${t('demo')}</span></h2></div>${items.length ? `<div class="masonry">${items.map(itemCard).join('')}</div>` : empty()}`;
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
  const currentLabel = statuses.find(([id]) => id === state.libraryState)?.[1] || 'all';
  content.innerHTML = `${heading(t('mycc').toUpperCase(), t('libraryTitle'), t('libraryText'))}${folderRoutePanel()}<div id="mods-manager-root">${renderManagedModsPanel()}</div><section class="demo-library" aria-labelledby="demo-library-title"><div class="section-toolbar demo-library-head"><div><div class="eyebrow">${t('demo')}</div><h2 id="demo-library-title">${t('demoLibraryTitle')}</h2><p class="muted-note">${t('demoLibraryNote')}</p></div></div><div class="library-search-bar"><label><span aria-hidden="true">⌕</span><input id="library-search" type="search" value="${esc(state.libraryQuery)}" placeholder="${esc(t('librarySearch'))}" aria-label="${esc(t('librarySearch'))}"></label><small>${t('librarySearchHint')}</small></div><div class="subtabs">${statuses
    .map(([id, key]) => `<button class="small-chip ${state.libraryState === id ? 'active' : ''}" data-library-state="${id}" aria-pressed="${state.libraryState === id}">${t(key)}</button>`)
    .join('')}</div><div class="library-toolbar"><div class="section-toolbar"><h2>${t(currentLabel === 'all' ? 'allCC' : currentLabel)} <span>${items.length} ${t('demo')}</span></h2><label>${t('groupBy')} <select id="group-mode"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></div></div>${
    items.length
      ? grouped
          .map(([name, group]) => `<section class="library-group"><div class="section-toolbar"><h3>${esc(name)} <span>${group.length}</span></h3></div><div class="masonry">${group.map(itemCard).join('')}</div></section>`)
          .join('')
      : empty(t('libraryEmpty'))
  }</section>`;
}

function recentBoards() {
  const boards = getBoards();
  if (state.boardSort === 'az') return boards.sort((a,b) => boardLabel(a).localeCompare(boardLabel(b), state.lang));
  if (state.boardSort === 'custom') return boards;
  return boards.sort((a, b) => (b.used || 0) - (a.used || 0));
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
  return `<span class="board-collage" aria-hidden="true">${[0, 1, 2]
    .map(slot => `<span class="collage-tile">${refs[slot]?.emoji || defaults[slot]}</span>`)
    .join('')}</span>`;
}
function renderInspiration() {
  const allBoards = recentBoards();
  const boards = state.showAllBoards ? allBoards : allBoards.slice(0, 6);
  const recommendations = recommendedItems();
  content.innerHTML = `${heading(t('inspiration').toUpperCase(), t('inspiration'), t('inspirationText'))}<div class="inspo-columns"><section><div class="section-toolbar"><h2>${t('recentBoards')} <span>${boards.length}/${allBoards.length}</span></h2><div class="collection-actions"><label class="sort-control">${t('sort')} <select id="board-sort"><option value="recent" ${state.boardSort==='recent'?'selected':''}>${t('recentlyUsed')}</option><option value="az" ${state.boardSort==='az'?'selected':''}>${t('az')}</option><option value="custom" ${state.boardSort==='custom'?'selected':''}>${t('customOrder')}</option></select></label><button class="small-chip" id="toggle-all-boards">${state.showAllBoards?t('showRecent'):t('showAllBoards')}</button><button class="small-chip" id="new-board">＋ ${t('newBoard')}</button></div></div><div class="board-grid">${boards
    .map(
      (b, i) =>
        `<button class="board-card" data-board="${esc(b.id)}" ${state.boardSort==='custom'?'draggable="true"':''}>${boardPreview(b, i)}<span class="board-label"><strong>${esc(boardLabel(b))}</strong><span>${b.refs.length} ${t('pins')}</span></span></button>`
    )
    .join('')}</div><div class="section-toolbar section-toolbar-spaced"><h2>${t('pinterest')} <span>${t('demo')}</span></h2><button class="small-chip" id="upload-reference" title="${esc(t('planned'))}">＋ ${t('uploadImage')}</button></div><div class="masonry">${REFERENCES.map(refCard).join('')}</div></section><aside class="recommend-panel"><div class="eyebrow">✦ ${t('recommendations')}</div><p>${t('noRecommendations')}</p><div class="recommend-list">${recommendations
    .map(
      i =>
        `<div class="recommend-item">${art(i, 'recommend-art')}<div><strong>${esc(labelItem(i))}</strong><small>${esc(i.creator)} · ${esc(i.type)}</small><button class="text-link" data-detail="${esc(i.id)}">${t('openDetails')} →</button></div></div>`
    )
    .join('')}</div></aside></div>`;
}

function localPatreonCreators() {
  const saved = safeRead('patreon-creators', []);
  if (!Array.isArray(saved)) return [];
  return saved.flatMap(c => {
    if (!c || typeof c.name !== 'string' || typeof c.id !== 'string') return [];
    const profileUrl = normalizePatreonProfile(c.profileUrl);
    return profileUrl
      ? [{ ...c, profileUrl, icon: 'P', platforms: [['Patreon', profileUrl]], tags: [], type: 'Unknown', style: 'Patreon profile', esStyle: 'Perfil de Patreon', manualPatreon: true }]
      : [];
  });
}
function creatorCatalog() {
  return [...CREATORS, ...localPatreonCreators()];
}
function creatorCard(c) {
  const following = state.followingCreators.includes(c.id);
  const platformControl =
    c.platforms.length > 1
      ? `<label class="creator-platform-picker"><span>${t('choosePlatform')}</span><select data-creator-link="${esc(c.id)}"><option value="">${t('visit')}…</option>${c.platforms
          .map((p, i) => `<option value="${i}">${esc(p[0])}</option>`)
          .join('')}</select></label>`
      : `<a class="creator-visit" href="${esc(c.platforms[0][1])}" target="_blank" rel="noopener noreferrer">${t('visit')} ${esc(c.platforms[0][0])} ↗</a>`;
  return `<article class="creator-card creator-card-soft"><header class="creator-soft-head"><div class="creator-avatar" aria-hidden="true">${esc(c.icon)}</div><div class="creator-identity"><h3>${esc(c.name)}</h3><div class="platform">${c.platforms.map(p => esc(p[0])).join(' · ')}</div></div><span class="creator-style-pill">${c.manualPatreon ? t('creatorAddedByYou') : esc(styleLabel(c.type))}</span></header><div class="creator-soft-tags">${c.tags
    .slice(0, 3)
    .map(tag => `<span>${esc(tagLabel(tag))}</span>`)
    .join('')}</div><div class="creator-soft-footer">${platformControl}<button class="small-chip creator-follow ${following ? 'active' : ''}" data-follow-creator="${esc(c.id)}" aria-pressed="${following}">${following ? '♥ ' : ''}${following ? t('followingCreator') : t('followCreator')}</button>${
    c.manualPatreon
      ? `<button class="small-chip creator-remove" data-remove-patreon-creator="${esc(c.id)}">${t('removePatreonCreator')}</button>`
      : `<span class="creator-kinds">${esc(state.lang === 'es' ? c.esStyle : c.style)}</span>`
  }</div>${c.manualPatreon ? `<p class="creator-local-note">${t('patreonProfileLink')}</p>` : ''}</article>`;
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
  content.innerHTML = `${heading(t('creators').toUpperCase(), t('creators'), t('creatorsText'))}<section class="patreon-status" role="note"><div class="patreon-status-mark" aria-hidden="true">P</div><div><strong>${t('patreonPostsTitle')}</strong><p>${t('patreonPostsNote')}</p></div></section><div class="creator-toolbar"><label>${t('creatorFilter')}<select id="creator-platform"><option value="All">${t('allPlatforms')}</option>${platforms
    .map(p => `<option ${p === state.creatorPlatform ? 'selected' : ''}>${esc(p)}</option>`)
    .join('')}</select></label><div class="creator-toolbar-actions"><button class="small-chip ${state.creatorFollowingOnly ? 'active' : ''}" id="creator-following-filter" aria-pressed="${state.creatorFollowingOnly}">${state.creatorFollowingOnly ? '♥ ' : ''}${state.creatorFollowingOnly ? t('followingOnly') : t('allCreators')} · ${state.followingCreators.length}</button><button class="primary-btn" id="add-patreon-creator">＋ ${t('addPatreonCreator')}</button><span>${t('demo')} · ${t('sourceDemo')}</span></div></div><div class="creator-grid">${filtered.map(creatorCard).join('')}</div>${filtered.length ? '' : empty(t('noResult'))}`;
}
function addPatreonCreatorDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">Patreon · ${t('creatorAddedByYou')}</div><h2 id="dialog-title">${t('addPatreonCreator')}</h2><p>${t('patreonManualNote')}</p><label>${t('creatorName')}<input id="patreon-creator-name" type="text" maxlength="70" autocomplete="off" placeholder="${esc(t('creatorName'))}"></label><label>${t('patreonProfileUrl')}<input id="patreon-profile-url" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t('patreonProfilePlaceholder'))}"></label><div class="detail-actions"><button class="primary-btn" id="save-patreon-creator">${t('addPatreonCreator')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
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

function renderCollection() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) {
    state.page = 'discover';
    return renderDiscover();
  }
  const items = ITEMS.filter(i => i.isCC !== false && c.items.includes(i.id));
  content.innerHTML = `${heading(t('collectionsTitle').toUpperCase(), esc(collectionLabel(c)), t('collectionsText'))}<div class="collection-actions"><button class="primary-btn" data-export="${esc(c.id)}">${t('share')}</button><button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button><button class="small-chip" id="rename-collection">${t('rename')}</button><button class="small-chip cover-image-button" id="choose-collection-cover">▧ ${t('coverImage')}</button><label class="collection-palette-label">${t('collectionColor')}<span class="collection-palette">${['#f5c9d3','#f8d9bd','#f4e9ae','#d5e8c3','#c5e6df','#c8e3f2','#cfd8f5','#dfd0f0','#f0d3e8','#d9d9d1'].map(color=>`<button type="button" class="palette-swatch ${c.color===color?'selected':''}" data-collection-color="${color}" style="--swatch:${color}" aria-label="${color}" aria-pressed="${c.color===color}"></button>`).join('')}</span></label></div><p class="muted-note">${t('onlyLinks')}</p><div class="section-toolbar"><h2>${t('downloadable')} <span>${items.length} ${t('demo')}</span></h2></div>${items.length ? `<div class="masonry">${items.map(itemCard).join('')}</div>` : empty(t('noCC'), t('onlyLinks'))}`;
}
function collectionPreview(c) {
  if (c.cover) return `<span class="collection-cover-collage collection-photo-cover" style="--collection-color:${esc(c.color || '#dfd0f0')}"><img src="${esc(c.cover)}" alt=""></span>`;
  const items = ITEMS.filter(i => c.items.includes(i.id)).slice(0, 3);
  const defaults = ['✧', '✿', '☼'];
  return `<span class="collection-cover-collage" aria-hidden="true">${[0, 1, 2]
    .map(slot => {
      const item = items[slot];
      return `<span class="collection-cover-tile ${item ? 'has-art' : ''}" ${item ? `style="--cover-art:${esc(item.bg)}"` : ''}>${item?.emoji || defaults[slot]}</span>`;
    })
    .join('')}</span>`;
}
function renderCollections() {
  let collections = state.collections.filter(c => collectionLabel(c).toLowerCase().includes(state.collectionQuery.toLowerCase()));
  if (state.collectionSort === 'az') collections.sort((a,b)=>collectionLabel(a).localeCompare(collectionLabel(b),state.lang));
  if (state.collectionSort === 'opened') collections.sort((a,b)=>(b.opened||0)-(a.opened||0));
  content.innerHTML = `${heading(t('collectionsTitle').toUpperCase(), t('collectionsTitle'), t('collectionsText'))}<div class="collection-actions"><button class="primary-btn" id="new-collection-page">＋ ${t('newCollection')}</button><button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button><div class="collection-search"><span aria-hidden="true">⌕</span><input id="collection-search" type="search" value="${esc(state.collectionQuery)}" placeholder="${esc(t('searchCollections'))}"></div><label class="sort-control">${t('sort')} <select id="collection-sort"><option value="custom" ${state.collectionSort==='custom'?'selected':''}>${t('customOrder')}</option><option value="az" ${state.collectionSort==='az'?'selected':''}>${t('az')}</option><option value="opened" ${state.collectionSort==='opened'?'selected':''}>${t('recentlyOpened')}</option></select></label></div><div class="collection-grid">${collections
    .map(
      c =>
        `<button class="collection-tile" data-collection="${esc(c.id)}" ${state.collectionSort==='custom'?'draggable="true"':''} style="--collection-color:${esc(c.color||'#dfd0f0')}">${collectionPreview(c)}<span class="collection-tile-info"><strong>${esc(collectionLabel(c))}</strong><span>${c.items.length} · →</span></span></button>`
    )
    .join('')}</div>${collections.length ? '' : empty(t('noResult'))}`;
}

const HUE_COLORS = {
  rose: { light: ['#a3657c','#f7e7eb','#fae4e7'], dark: ['#e0b2c5','#493340','#49313d'] },
  lavender: { light: ['#715d7f','#eee7f4','#f7e6e9'], dark: ['#d0bce0','#41354a','#49353f'] },
  sage: { light: ['#586c53','#e8efe3','#eff0e4'], dark: ['#bdd2b9','#354639','#3d463b'] },
  blue: { light: ['#2869a8','#e3effb','#dceafb'], dark: ['#91c7ff','#24394f','#263d57'] }
};
function applyPalette() {
  const dark = state.theme.startsWith('dark');
  const [strong, wash, pink] = HUE_COLORS[state.primaryHue]?.[dark ? 'dark' : 'light'] || HUE_COLORS.lavender[dark ? 'dark' : 'light'];
  const secondary = state.secondaryHue && state.secondaryHue !== state.primaryHue ? HUE_COLORS[state.secondaryHue][dark ? 'dark' : 'light'] : null;
  const root = document.body.style;
  root.setProperty('--accent', strong);
  root.setProperty('--lav-strong', strong);
  root.setProperty('--lav', wash);
  root.setProperty('--pink', secondary?.[2] || pink);
  root.setProperty('--accent-secondary', secondary?.[0] || strong);
  root.setProperty('--secondary-wash', secondary?.[1] || wash);
  root.setProperty('--secondary-hue', secondary?.[0] || strong);
  root.setProperty('--focus-ring', `color-mix(in srgb, ${strong} 82%, transparent)`);
  document.documentElement.style.setProperty('--page-thumb', strong);
  document.documentElement.style.setProperty('--page-track', dark ? '#1b2531' : '#e8eff7');
}
function hueButton(hue, slot) {
  const selected = slot === 'primary' ? state.primaryHue === hue : state.secondaryHue === hue;
  return `<button type="button" class="palette-choice ${selected ? 'selected' : ''}" data-${slot}-hue="${hue}" aria-pressed="${selected}" style="--choice:${HUE_COLORS[hue].light[0]}"><span aria-hidden="true"></span>${t(hue)}</button>`;
}
function renderSettings() {
  const dark = state.theme.startsWith('dark');
  content.innerHTML = `${heading(t('settingsTitle').toUpperCase(), t('settingsTitle'), t('settingsText'))}<div class="settings-groups"><details class="setting-card setting-group theme-disclosure" open><summary><span><b>${t('personalization')}</b><small>${t('personalizationHelp')}</small></span><i aria-hidden="true">⌄</i></summary><div class="setting-group-body"><div class="personalization-row"><span>${t('appearance')}</span><div class="segmented-control"><button type="button" data-appearance="light" class="${!dark?'active':''}" aria-pressed="${!dark}">${t('light')}</button><button type="button" data-appearance="dark" class="${dark?'active':''}" aria-pressed="${dark}">${t('dark')}</button></div></div><div class="personalization-row"><span>${t('mainColor')}</span><div class="palette-choices">${HUES.map(h=>hueButton(h,'primary')).join('')}</div></div><div class="personalization-row"><span>${t('secondColor')}</span><div class="palette-choices">${`<button type="button" class="palette-choice ${!state.secondaryHue?'selected':''}" data-secondary-hue="none" aria-pressed="${!state.secondaryHue}"><span aria-hidden="true">＋</span>${t('oneColor')}</button>`}${HUES.map(h=>hueButton(h,'secondary')).join('')}</div></div></div></details><details class="setting-card setting-group"><summary><span><b>${t('gameSettings')}</b><small>${t('folderRoutes')}</small></span><i aria-hidden="true">⌄</i></summary><div class="setting-group-body"><section class="setting-card nested-setting"><h3>${t('organization')}</h3><p>${t('organizationNote')}</p><label>${t('groupBy')} <select id="group-mode-settings"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></section><div class="nested-setting">${folderSettingsSection()}</div></div></details><details class="setting-card setting-group"><summary><span><b>${t('connections')}</b><small>${t('connectionSettingsHelp')}</small></span><i aria-hidden="true">⌄</i></summary><div class="setting-group-body"><section class="connection-card"><div><h3>CurseForge</h3><p>${t('curseforgeStatus')}</p></div><span class="status-pill status-pending">${t('notConnected')}</span></section><p class="connection-footnote">${t('curseforgeLoginClarification')}</p></div></details><details class="setting-card setting-group"><summary><span><b>${t('language')}</b><small>${t('languageNote')}</small></span><i aria-hidden="true">⌄</i></summary><div class="setting-group-body"><div class="theme-options"><button class="theme-option ${state.lang === 'es' ? 'active' : ''}" data-language="es" aria-pressed="${state.lang === 'es'}" lang="es">Español</button><button class="theme-option ${state.lang === 'en' ? 'active' : ''}" data-language="en" aria-pressed="${state.lang === 'en'}" lang="en">English</button></div></div></details><details class="setting-card setting-group"><summary><span><b>${t('about')}</b><small>${t('version')} ${APP_VERSION} · ${t('betaLabel')}</small></span><i aria-hidden="true">⌄</i></summary><div class="setting-group-body"><p>${t('compatibility')}: <b>${t('windows')}</b><br>${t('sourceDemo')}<br>${t('privacyNote')}</p><div class="setting-actions"><button class="secondary-btn" id="send-feedback">${t('feedback')}</button><button class="small-chip" id="donate-button">${t('donate')} · ${t('comingSoon')}</button></div></div></details></div>`;
}
function renderFavorites() {
  const items = ITEMS.filter(i => state.favorites.includes(i.id));
  content.innerHTML = `${heading(t('favorite').toUpperCase(), t('favorite'), t('favoritesText'))}${items.length ? `<div class="masonry">${items.map(itemCard).join('')}</div>` : empty()}`;
}

const PAGES = {
  discover: renderDiscover,
  mycc: renderLibrary,
  inspiration: renderInspiration,
  creators: renderCreators,
  settings: renderSettings,
  collection: renderCollection,
  collections: renderCollections,
  favorites: renderFavorites
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
  state.page = page;
  state.query = '';
  search.value = '';
  render();
  content.focus({ preventScroll: true });
}

/* ---------- Dialogs ---------- */
function newCollectionDialog() {
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('collectionsTitle')}</div><h2 id="dialog-title">${t('newCollection')}</h2><p>${t('downloadable')} · ${t('demo')}</p><label>${t('collectionName')}<input id="collection-name" maxlength="40" placeholder="${esc(t('collectionName'))}"></label><div class="detail-actions"><button class="primary-btn" id="create-collection">${t('create')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function saveDialog(id) {
  const item = itemById(id);
  if (!item) return;
  if (item.isCC === false) return toast(t('noCC'));
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('downloadable')}</div><h2 id="dialog-title">${t('save')}</h2><p>${esc(labelItem(item))} · ${t('demo')}</p><fieldset class="check-list"><legend class="visually-hidden">${t('collectionsTitle')}</legend>${state.collections
      .map(
        c =>
          `<label class="check-collection"><input type="checkbox" value="${esc(c.id)}" ${c.items.includes(id) ? 'checked' : ''}> ${esc(collectionLabel(c))}</label>`
      )
      .join('')}</fieldset><button class="small-chip" id="new-collection-from-save">＋ ${t('newCollection')}</button><div class="detail-actions"><button class="primary-btn" id="confirm-save" data-item="${esc(id)}">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function detailDialog(item) {
  const installed = installState(item).installed;
  openDialog(
    `${closeButton()}${art(item, 'detail-art')}<div class="detail-body"><div class="eyebrow">${esc(categoryLabel(item.category))} · ${esc(item.source)} · ${t('demo')}</div><h2 id="dialog-title">${esc(labelItem(item))}</h2><div class="card-creator">${esc(item.creator)} · ${esc(styleLabel(item.type))}</div><p>${esc(labelItem(item, 'note'))}</p><div class="tag-row"><span class="meta-pill">${esc(audienceLabel(item.gender))}</span><span class="meta-pill">${esc(audienceLabel(item.age))}</span><span class="meta-pill">${esc(item.source)}</span></div><div class="detail-actions"><button class="primary-btn" data-toggle-install="${esc(item.id)}">${installed ? t('uninstall') : t('install')}</button><button class="secondary-btn" data-save="${esc(item.id)}">${t('save')}</button><button class="secondary-btn download-demo" disabled title="${esc(t('downloadLinks'))}">↓ ${t('downloadItem')}</button><button class="secondary-btn" data-favorite="${esc(item.id)}" aria-pressed="${state.favorites.includes(item.id)}">${state.favorites.includes(item.id) ? '♥' : '♡'} ${t('favorite')}</button></div><p class="demo-disclaimer">${t('downloadLinks')} ${t('markInstalledNote')}</p></div>`
  );
}
function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
  persist();
  const inDetail = !overlay.hidden && dialog.querySelector(`[data-toggle-install="${CSS.escape(id)}"]`);
  render();
  if (inDetail) detailDialog(itemById(id));
  toast(state.favorites.includes(id) ? t('favoriteAdded') : t('favoriteRemoved'));
}
function saveSelection(id) {
  const selected = [...dialog.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
  state.collections.forEach(c => {
    c.items = c.items.filter(i => i !== id);
    if (selected.includes(c.id)) c.items.push(id);
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
  state.collections.push({ id: `collection-${Date.now().toString(36)}`, name, items: [] });
  persist();
  closeDialog();
  render();
  toast(t('collectionSaved'));
}
function shareCollection(id) {
  const c = state.collections.find(x => x.id === id);
  if (!c) return;
  const link = collectionLink(collectionLabel(c), c.items.filter(itemId => ITEM_IDS.has(itemId)));
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('collectionsTitle')}</div><h2 id="dialog-title">${t('share')}</h2><p>${t('linkShareHint')}</p><label>${t('share')}<input id="collection-share-link" readonly value="${esc(link)}"></label><div class="detail-actions"><button class="primary-btn" id="copy-collection-link">${t('copyLink')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function importCollectionFromLink(value) {
  const data = readCollectionLink(value, ITEM_IDS);
  if (!data) return toast(t('invalidCollectionLink'), 'error');
  state.collections.push({ id: `import-${Date.now().toString(36)}`, name: data.name || t('importedCollectionName'), items: data.items });
  persist();
  closeDialog();
  render();
  toast(t('imported'));
}
function importCollectionDialog(value = '') {
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('collectionsTitle')}</div><h2 id="dialog-title">${t('importCollection')}</h2><p>${t('pasteCollectionLink')}</p><label>${t('importCollection')}<input id="collection-link-input" placeholder="simmerspace://collection#…" value="${esc(value)}"></label><div class="detail-actions"><button class="primary-btn" id="import-collection-link">${t('importLink')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
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
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('inspiration')}</div><h2 id="dialog-title">${t('newBoard')}</h2><label>${t('boardName')}<input id="board-name" maxlength="42" placeholder="${esc(t('boardName'))}"></label><label>${t('note')}<textarea id="board-note" placeholder="${esc(t('boardNote'))}"></textarea></label><div class="detail-actions"><button class="primary-btn" id="create-board">${t('create')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
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
    `${closeButton()}<div class="board-detail-layout"><div class="form-dialog"><div class="eyebrow">${t('pinterest')} · ${t('demo')}</div><h2 id="dialog-title">${esc(boardLabel(board))}</h2><label>${t('boardNote')}<textarea id="board-note-edit">${esc(boardDescription(board))}</textarea></label><div class="board-reference-list">${refs.map(refCard).join('') || `<p class="muted-note">${t('pinterest')} · ${t('demo')}</p>`}</div><div class="detail-actions"><button class="primary-btn" id="save-board-note" data-save-board-note="${esc(id)}">${t('saveNote')}</button><button class="secondary-btn" id="add-reference">＋ ${t('addReference')}</button><button class="secondary-btn danger-quiet" data-delete-board="${esc(id)}">${t('deleteBoard')}</button></div></div><aside class="related-panel"><div class="eyebrow">✦ ${t('relatedCC')}</div>${rec
      .map(
        i =>
          `<div class="recommend-item">${art(i, 'recommend-art')}<div><strong>${esc(labelItem(i))}</strong><small>${esc(i.creator)} · ${esc(i.type)}</small><button class="text-link" data-save="${esc(i.id)}">${t('save')}</button></div></div>`
      )
      .join('')}</aside></div>`,
    { wide: true }
  );
}
function pinReference(id) {
  const boards = getBoards();
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('pinterest')}</div><h2 id="dialog-title">${t('addReference')}</h2><fieldset class="check-list"><legend class="visually-hidden">${t('recentBoards')}</legend>${boards
      .map((b, i) => `<label class="check-collection"><input type="radio" name="pin-board" value="${esc(b.id)}" ${i === 0 ? 'checked' : ''}> ${esc(boardLabel(b))}</label>`)
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
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('feedback')}</div><h2 id="dialog-title">${t('feedback')}</h2><p>${t('feedbackLocalNote')}</p><label>${t('feedback')}<textarea id="feedback-note" maxlength="4000" placeholder="${esc(t('feedbackPlaceholder'))}"></textarea></label><div class="detail-actions"><button class="primary-btn" id="save-feedback">${t('saveSuggestion')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function renameCollectionDialog() {
  const c = state.collections.find(x => x.id === state.activeCollection);
  if (!c) return;
  openDialog(
    `${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('collectionsTitle')}</div><h2 id="dialog-title">${t('rename')}</h2><label>${t('collectionName')}<input id="collection-name" maxlength="40" value="${esc(collectionLabel(c))}"></label><div class="detail-actions"><button class="primary-btn" id="save-rename">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`
  );
}
function resetDiscoverFilters() {
  Object.assign(state, { parent: 'all', sub: 'All', gender: 'All', age: 'All ages', style: 'All', source: 'All', sort: 'curated', query: '', casDetail:'All', animalType:'All', occultType:'All' });
  search.value = '';
  render();
}

/* ---------- Events ---------- */
// Simple id-based buttons. Each handler receives the clicked button.
const CLICK_ACTIONS = {
  'new-collection': newCollectionDialog,
  'launch-game': async () => { try { await callDesktop(desktop?.launchGame); toast(t('gameLaunched')); } catch(e) { toast(errorMessage(e),'error'); } },
  'new-collection-page': newCollectionDialog,
  'new-collection-from-save': newCollectionDialog,
  'create-collection': createCollection,
  'confirm-save': el => saveSelection(el.dataset.item),
  'theme-toggle': () => {
    setTheme(`${state.theme.startsWith('dark') ? 'soft' : 'dark'}-${state.primaryHue}`);
  },
  'new-board': newBoardDialog,
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
  'rename-collection': renameCollectionDialog,
  'choose-collection-cover': async () => {
    const c=state.collections.find(x=>x.id===state.activeCollection); if(!c) return;
    try { const result=await callDesktop(desktop?.chooseCoverImage); if(result){ c.cover=result; persist(); render(); } } catch(error){ toast(errorMessage(error),'error'); }
  },
  'toggle-all-boards': () => { state.showAllBoards=!state.showAllBoards; safeSet('boards-show-all',String(state.showAllBoards)); render(); },
  'save-rename': () => {
    const c = state.collections.find(x => x.id === state.activeCollection);
    const name = document.getElementById('collection-name').value.trim();
    if (!c || !name) return;
    if (name !== collectionLabel(c)) c.name = name;
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
  'profile-button': () => toast(t('loginDemo')),
  'upload-reference': () => toast(t('planned')),
  'clear-filters': resetDiscoverFilters,
  'show-all-collections': () => goTo('collections'),
  'creator-following-filter': () => {
    state.creatorFollowingOnly = !state.creatorFollowingOnly;
    render();
  }
};
function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  state.theme = theme;
  state.primaryHue = theme.split('-')[1];
  safeSet('theme', theme);
  safeSet('primary-hue', state.primaryHue);
  render();
}

document.addEventListener('click', async event => {
  const target = event.target;
  const colorChoice=target.closest('[data-collection-color]');
  if(colorChoice){ const c=state.collections.find(x=>x.id===state.activeCollection); if(c){c.color=colorChoice.dataset.collectionColor;persist();render();} return; }
  const casDetail = target.closest('[data-cas-detail]');
  if(casDetail){ state.casDetail=state.casDetail===casDetail.dataset.casDetail?'All':casDetail.dataset.casDetail; return render(); }
  const animalDetail = target.closest('[data-animal-detail]');
  if(animalDetail){ state.animalType=state.animalType===animalDetail.dataset.animalDetail?'All':animalDetail.dataset.animalDetail; return render(); }
  const occultDetail = target.closest('[data-occult-detail]');
  if(occultDetail){ state.occultType=state.occultType===occultDetail.dataset.occultDetail?'All':occultDetail.dataset.occultDetail; return render(); }
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
    if (opened) { opened.opened = Date.now(); persist(); }
    return goTo('collection');
  }
  const parent = target.closest('[data-parent]');
  if (parent) {
    state.parent = parent.dataset.parent;
    state.sub = 'All';
    state.casDetail = 'All'; state.animalType = 'All';
    return render();
  }
  const sub = target.closest('[data-sub]');
  if (sub) {
    state.sub = sub.dataset.sub;
    if (!['Clothing','Accessories'].includes(state.sub)) state.casDetail='All';
    if (state.sub !== 'Animals') state.animalType='All';
    return render();
  }
  const library = target.closest('[data-library-state]');
  if (library) {
    state.libraryState = library.dataset.libraryState;
    return render();
  }
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
  const theme = target.closest('[data-theme]');
  if (theme) return setTheme(theme.dataset.theme);
  const primary = target.closest('[data-primary-hue]');
  if (primary) { state.primaryHue = primary.dataset.primaryHue; setTheme(`${state.theme.startsWith('dark')?'dark':'soft'}-${state.primaryHue}`); return; }
  const secondary = target.closest('[data-secondary-hue]');
  if (secondary) { state.secondaryHue = secondary.dataset.secondaryHue === 'none' || secondary.dataset.secondaryHue === state.primaryHue ? '' : secondary.dataset.secondaryHue; safeSet('secondary-hue', state.secondaryHue); return render(); }
  const appearance = target.closest('[data-appearance]');
  if (appearance) { setTheme(`${appearance.dataset.appearance === 'dark'?'dark':'soft'}-${state.primaryHue}`); return; }
  const lang = target.closest('[data-language]');
  if (lang) {
    state.lang = lang.dataset.language === 'es' ? 'es' : 'en';
    safeSet('language', state.lang);
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

const CHANGE_FIELDS = { 'gender-filter': 'gender', 'age-filter': 'age', 'style-filter': 'style', 'source-filter': 'source', 'sort-filter': 'sort', 'creator-platform': 'creatorPlatform', 'animal-filter':'animalType', 'occult-filter':'occultType', 'cas-detail-filter':'casDetail' };
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'group-mode' || target.id === 'group-mode-settings') {
    state.groupMode = target.value === 'creator' ? 'creator' : 'category';
    safeSet('group-mode', state.groupMode);
    return render();
  }
  if (target.id === 'collection-sort') { state.collectionSort=target.value; safeSet('collection-sort',target.value); return render(); }
  if (target.id === 'board-sort') { state.boardSort=target.value; safeSet('board-sort',target.value); return render(); }
  if (CHANGE_FIELDS[target.id]) {
    state[CHANGE_FIELDS[target.id]] = target.value;
    return render();
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
  if (event.target.id === 'collection-search') { state.collectionQuery=event.target.value; const at=event.target.selectionStart; render(); const input=document.getElementById('collection-search'); input?.focus(); input?.setSelectionRange(at,at); return; }
  if (event.target.id === 'library-search') {
    state.libraryQuery = event.target.value;
    render();
  }
});
let searchTimer = null;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = search.value;
    if (state.page === 'mycc') state.libraryQuery = '';
    if (!['discover', 'mycc', 'creators'].includes(state.page)) state.page = 'discover';
    render();
  }, 120);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
    search.select();
  }
});


// Drag ordering is saved locally and used only when the corresponding custom sort is selected.
let draggedSortCard = null;
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-collection], [data-board]');
  if (!card || !card.draggable) return;
  draggedSortCard = card;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.collection || card.dataset.board);
});
document.addEventListener('dragover', event => {
  if (draggedSortCard && event.target.closest('[data-collection], [data-board]')) event.preventDefault();
});
document.addEventListener('drop', event => {
  const target = event.target.closest('[data-collection], [data-board]');
  if (!draggedSortCard || !target || draggedSortCard === target) return;
  event.preventDefault();
  if (draggedSortCard.hasAttribute('data-collection')) {
    const from=state.collections.findIndex(x=>x.id===draggedSortCard.dataset.collection), to=state.collections.findIndex(x=>x.id===target.dataset.collection);
    if(from>=0 && to>=0){ const [item]=state.collections.splice(from,1); state.collections.splice(to,0,item); persist(); }
  } else {
    const boards=getBoards(), from=boards.findIndex(x=>x.id===draggedSortCard.dataset.board), to=boards.findIndex(x=>x.id===target.dataset.board);
    if(from>=0 && to>=0){ const [item]=boards.splice(from,1); boards.splice(to,0,item); safeWrite('boards',boards); }
  }
  draggedSortCard=null; render();
});
document.addEventListener('dragend', () => { draggedSortCard=null; });
