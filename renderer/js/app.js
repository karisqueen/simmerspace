/* SimmerSpace interface: state, pages and local interactions. Demo catalog data lives in demo-data.js. */
let APP_VERSION = '0.7.0';
const THEMES = ['soft-rose', 'soft-lavender', 'soft-sage', 'dark-rose', 'dark-lavender', 'dark-sage'];
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
  lang: savedLanguage(),
  activeCollection: null,
  activeBoard: null
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
function nav() {
  const pages = [
    ['discover', '✳'],
    ['mycc', '▦'],
    ['inspiration', '♡'],
    ['creators', '✧']
  ];
  const modsCount = typeof scannedModCount === 'function' ? scannedModCount() : null;
  const navButton = (id, icon) =>
    `<button class="nav-item ${state.page === id ? 'active' : ''}" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${t(id)}</span>${id === 'mycc' && modsCount !== null ? `<span class="nav-count" title="${esc(t('navModsCount'))}">${modsCount.toLocaleString(state.lang)}</span>` : ''}</button>`;
  document.getElementById('sidebar').innerHTML = `<a class="brand" href="#" data-page="discover" aria-label="SimmerSpace"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span class="brand-name"><span class="brand-simmer">simmer</span><span class="brand-space">space</span></span></a><div class="side-label">${t('space')}</div><nav class="main-nav" aria-label="${esc(t('space'))}">${pages
    .map(([id, icon]) => navButton(id, icon))
    .join('')}</nav><div class="side-label side-label-spaced">${t('collections')}<button class="tiny-add" id="new-collection" aria-label="${esc(t('newCollection'))}" title="${esc(t('newCollection'))}">+</button></div><button class="collection-all" id="show-all-collections">${t('viewAllCollections')} →</button><div class="collection-nav">${state.collections
    .map(
      c =>
        `<button class="nav-item ${state.page === 'collection' && state.activeCollection === c.id ? 'active' : ''}" data-collection="${esc(c.id)}"><span class="collection-dot" aria-hidden="true"></span><span>${esc(collectionLabel(c))}</span></button>`
    )
    .join('')}</div><div class="sidebar-bottom">${navButton('settings', '⚙')}<div class="profile-card"><div class="avatar" aria-hidden="true">S</div><div><strong>${t('profile')}</strong><small>${t('local')}</small></div></div></div>`;
}
function setShell() {
  document.body.className = `theme-${state.theme}${overlay.hidden ? '' : ' dialog-open'}`;
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
  document.getElementById('footer-version').textContent = `SimmerSpace v${APP_VERSION} · ${t('preBeta')}`;
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
  return `<div class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>`;
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
    if (state.gender !== 'All' && i.gender !== 'All' && i.gender !== state.gender && i.gender !== 'Unisex') return false;
    if (state.age !== 'All ages' && i.age !== 'All ages' && i.age !== state.age) return false;
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
      ['Kids', t('kids')],
      ['Toddlers', t('toddlers')]
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
  )}${selectField('source-filter', t('source'), [['All', t('anysource')], ...sources.map(s => [s, s])], state.source)}${selectField(
    'sort-filter',
    t('sort'),
    [
      ['curated', t('curated')],
      ['az', t('az')],
      ['updated', t('updated')],
      ['popular', t('popular')]
    ],
    state.sort
  )}</div>`;
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
  return getBoards()
    .sort((a, b) => (b.used || 0) - (a.used || 0))
    .slice(0, 6);
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
  const boards = recentBoards();
  const recommendations = recommendedItems();
  content.innerHTML = `${heading(t('inspiration').toUpperCase(), t('inspiration'), t('inspirationText'))}<div class="inspo-columns"><section><div class="section-toolbar"><h2>${t('recentBoards')} <span>${boards.length}</span></h2><button class="small-chip" id="new-board">＋ ${t('newBoard')}</button></div><div class="board-grid">${boards
    .map(
      (b, i) =>
        `<button class="board-card" data-board="${esc(b.id)}">${boardPreview(b, i)}<span class="board-label"><strong>${esc(boardLabel(b))}</strong><span>${b.refs.length} ${t('pins')}</span></span></button>`
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
  content.innerHTML = `${heading(t('collectionsTitle').toUpperCase(), esc(collectionLabel(c)), t('collectionsText'))}<div class="collection-actions"><button class="primary-btn" data-export="${esc(c.id)}">${t('share')}</button><button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button><button class="small-chip" id="rename-collection">${t('rename')}</button><button class="small-chip cover-image-button" disabled title="${esc(t('coverSoon'))}">▧ ${t('coverImage')} · ${t('coverSoon')}</button></div><p class="muted-note">${t('onlyLinks')}</p><div class="section-toolbar"><h2>${t('downloadable')} <span>${items.length} ${t('demo')}</span></h2></div>${items.length ? `<div class="masonry">${items.map(itemCard).join('')}</div>` : empty(t('noCC'), t('onlyLinks'))}`;
}
function collectionPreview(c) {
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
  content.innerHTML = `${heading(t('collectionsTitle').toUpperCase(), t('collectionsTitle'), t('collectionsText'))}<div class="collection-actions"><button class="primary-btn" id="new-collection-page">＋ ${t('newCollection')}</button><button class="secondary-btn" id="import-collection-button">${t('importCollection')}</button></div><div class="collection-grid">${state.collections
    .map(
      c =>
        `<button class="collection-tile" data-collection="${esc(c.id)}">${collectionPreview(c)}<span class="collection-tile-info"><strong>${esc(collectionLabel(c))}</strong><span>${c.items.length} · →</span></span></button>`
    )
    .join('')}</div>`;
}

function themeOption(mode, title, key) {
  const active = state.theme === mode;
  return `<button class="theme-option theme-swatch ${active ? 'active' : ''}" data-theme="${mode}" aria-pressed="${active}"><i class="swatch-dot" aria-hidden="true"></i><span>${title}</span><small>${t(key)}</small></button>`;
}
function renderSettings() {
  content.innerHTML = `${heading(t('settingsTitle').toUpperCase(), t('settingsTitle'), t('settingsText'))}<div class="settings-grid"><details class="setting-card theme-card theme-disclosure" ${state.theme.startsWith('soft') ? 'open' : ''}><summary><span><b>${t('softLight')}</b><small>${t('softLightNote')}</small></span><i aria-hidden="true">⌄</i></summary><div class="theme-options">${themeOption('soft-rose', t('rose'), 'softLight')}${themeOption('soft-lavender', t('lavender'), 'softLight')}${themeOption('soft-sage', t('sage'), 'softLight')}</div></details><details class="setting-card theme-card theme-disclosure" ${state.theme.startsWith('dark') ? 'open' : ''}><summary><span><b>${t('afterHours')}</b><small>${t('afterHoursNote')}</small></span><i aria-hidden="true">⌄</i></summary><div class="theme-options">${themeOption('dark-rose', t('rose'), 'afterHours')}${themeOption('dark-lavender', t('lavender'), 'afterHours')}${themeOption('dark-sage', t('sage'), 'afterHours')}</div></details><section class="setting-card"><h3>${t('organization')}</h3><p>${t('organizationNote')}</p><label>${t('groupBy')} <select id="group-mode-settings"><option value="category" ${state.groupMode === 'category' ? 'selected' : ''}>${t('category')}</option><option value="creator" ${state.groupMode === 'creator' ? 'selected' : ''}>${t('creator')}</option></select></label></section><section class="setting-card"><h3>${t('language')}</h3><p>${t('languageNote')}</p><div class="theme-options"><button class="theme-option ${state.lang === 'es' ? 'active' : ''}" data-language="es" aria-pressed="${state.lang === 'es'}" lang="es">Español</button><button class="theme-option ${state.lang === 'en' ? 'active' : ''}" data-language="en" aria-pressed="${state.lang === 'en'}" lang="en">English</button></div></section><section class="setting-card"><h3>${t('about')}</h3><p>${t('version')}: <b>${APP_VERSION} ${t('preBeta')}</b><br>${t('compatibility')}: <b>${t('windows')}</b><br>${t('sourceDemo')}<br>${t('privacyNote')}</p></section><section class="setting-card"><h3>${t('signIn')}</h3><p>${t('accountText')}</p><button class="secondary-btn" disabled>${t('signIn')} · ${t('comingSoon')}</button></section><section class="setting-card"><h3>${t('feedback')} / ${t('donate')}</h3><p>${t('feedbackNote')}</p><div class="setting-actions"><button class="secondary-btn" id="send-feedback">${t('feedback')}</button><button class="small-chip" id="donate-button">${t('donate')} · ${t('comingSoon')}</button></div></section></div>${folderSettingsSection()}`;
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
  Object.assign(state, { parent: 'all', sub: 'All', gender: 'All', age: 'All ages', style: 'All', source: 'All', sort: 'curated', query: '' });
  search.value = '';
  render();
}

/* ---------- Events ---------- */
// Simple id-based buttons. Each handler receives the clicked button.
const CLICK_ACTIONS = {
  'new-collection': newCollectionDialog,
  'new-collection-page': newCollectionDialog,
  'new-collection-from-save': newCollectionDialog,
  'create-collection': createCollection,
  'confirm-save': el => saveSelection(el.dataset.item),
  'theme-toggle': () => {
    const hue = state.theme.split('-')[1] || 'lavender';
    setTheme(state.theme.startsWith('dark') ? `soft-${hue}` : `dark-${hue}`);
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
  safeSet('theme', theme);
  render();
}

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
    return goTo('collection');
  }
  const parent = target.closest('[data-parent]');
  if (parent) {
    state.parent = parent.dataset.parent;
    state.sub = 'All';
    return render();
  }
  const sub = target.closest('[data-sub]');
  if (sub) {
    state.sub = sub.dataset.sub;
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

const CHANGE_FIELDS = { 'gender-filter': 'gender', 'age-filter': 'age', 'style-filter': 'style', 'source-filter': 'source', 'sort-filter': 'sort', 'creator-platform': 'creatorPlatform' };
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'group-mode' || target.id === 'group-mode-settings') {
    state.groupMode = target.value === 'creator' ? 'creator' : 'category';
    safeSet('group-mode', state.groupMode);
    return render();
  }
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
