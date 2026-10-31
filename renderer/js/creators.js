/* Creators page: real CurseForge creators, twelve per page, searchable and sorted by the desktop app (from the
   creator index when the backend has it, otherwise from what CurseForge answers directly), plus the creators the
   user follows. Following is stored locally and only changes how SimmerSpace orders
   things (Explore lists followed creators' mods first); nothing is sent to CurseForge. Patreon is not
   connected yet, which a dismissible notice explains. */
const CREATOR_SORTS = ['popular', 'az', 'uploaded', 'updated'];
const CREATORS_PAGE_SIZE = 12;
const creators = {
  tab: 'popular',
  result: null, // { creators, source, pagination: { page, pageSize, total, pages } }
  page: 1,
  query: '',
  sort: CREATOR_SORTS.includes(safeGet('creators-sort')) ? safeGet('creators-sort') : 'popular',
  loading: false,
  error: null,
  request: 0,
  timer: null,
  noticeHidden: safeRead('patreon-notice-dismissed', false) === true,
  style: 'all' // all | maxis | alpha | unknown
};
const CREATOR_STYLES = ['all', 'maxis', 'alpha', 'unknown'];
const CREATOR_STYLES_FILTER = value => (CREATOR_STYLES.includes(value) ? value : 'all');
const STYLE_CATEGORY = /maxis[\s-]*match|\balpha\b/i;

function isFollowing(id) {
  return state.followingCreators.some(f => f.id === Number(id));
}
function setFollowing(entry, follow) {
  const id = Number(entry.id);
  const rest = state.followingCreators.filter(f => f.id !== id);
  state.followingCreators = normalizeFollowing(follow ? [...rest, { id, name: entry.name, url: entry.url }] : rest);
  safeWrite('following-creators', state.followingCreators);
  toast(format(t(follow ? 'creatorFollowSaved' : 'creatorFollowRemoved'), { name: entry.name }));
  render();
}
function creatorFollowButton(entry, { compact = false } = {}) {
  const on = isFollowing(entry.id);
  return `<button class="${compact ? 'small-chip' : 'secondary-btn small-chip'} follow-btn ${on ? 'is-on' : ''}" data-follow-creator="${esc(entry.id)}" data-name="${esc(entry.name)}" data-url="${esc(entry.url || '')}" aria-pressed="${on}">${icon(on ? 'check' : 'plus')}<span>${on ? t('followingCreator') : t('followCreator')}</span></button>`;
}

async function loadCreatorsPage() {
  if (!cfApi) return;
  const request = ++creators.request;
  creators.loading = true;
  creators.error = null;
  if (state.page === 'creators') render();
  try {
    const result = await callDesktop(cfApi.creators, { query: creators.query, sort: creators.sort, style: creators.style, page: creators.page, pageSize: CREATORS_PAGE_SIZE });
    if (request !== creators.request) return;
    creators.result = result;
    creators.page = result.pagination.page;
  } catch (error) {
    if (request === creators.request) creators.error = error;
  } finally {
    if (request === creators.request) {
      creators.loading = false;
      if (state.page === 'creators') render();
    }
  }
}
// Search waits for a pause in typing, so one word does not become one request per letter.
function creatorsQueryChanged(value) {
  clearTimeout(creators.timer);
  creators.timer = setTimeout(() => {
    creators.query = value.trim();
    creators.page = 1;
    if (creators.tab === 'popular') loadCreatorsPage();
    else render();
  }, 450);
}
function creatorsPager() {
  const { page, pages, total } = creators.result.pagination;
  if (pages <= 1) return `<p class="muted-note">${esc(format(t('creatorsCount'), { count: n(total) }))}</p>`;
  return `<nav class="pager" aria-label="${esc(mt('pagination'))}"><button class="secondary-btn small-chip" data-creators-page="-1" ${page <= 1 || creators.loading ? 'disabled' : ''}>← ${t('previous')}</button><span>${esc(format(mt('pageOf'), { page: n(page), pages: n(pages) }))}</span><button class="secondary-btn small-chip" data-creators-page="1" ${page >= pages || creators.loading ? 'disabled' : ''}>${t('next')} →</button></nav>`;
}

function creatorInitial(name) {
  return esc((String(name).trim()[0] || '?').toUpperCase());
}
// The creator's CurseForge avatar when the API sends one, else their most downloaded project's image, else
// their initial. Nothing is invented: a broken image falls back to the initial too.
function creatorAvatar(c) {
  const picture = c.avatarUrl || c.projects?.find(p => p.logo)?.logo || '';
  const initial = `<span class="creator-avatar-initial">${creatorInitial(c.name)}</span>`;
  return `<div class="creator-avatar ${picture ? 'has-image' : ''}" aria-hidden="true">${picture ? `<img src="${esc(picture)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-avatar-fallback>` : ''}${initial}</div>`;
}
function creatorStyleLabel(style) {
  return t({ maxis: 'styleMaxis', alpha: 'styleAlpha', both: 'styleBoth' }[style] || 'styleUnknown');
}
function creatorTypes(c) {
  return (c.categories || []).filter(name => !STYLE_CATEGORY.test(name)).slice(0, 3);
}
function popularCreatorCard(c, rank) {
  const projects = (c.projects || [])
    .map(p => `<li>${cfThumb(p.logo, 'cf-thumb cf-thumb-sm')}<button class="text-link" data-cf-detail="${p.id}">${esc(p.name)}</button></li>`)
    .join('');
  const types = creatorTypes(c);
  const labels = `<div class="creator-labels"><span class="style-pill style-${esc(c.style || 'unknown')}" data-tip="${esc(t('tipCreatorStyle'))}">${esc(creatorStyleLabel(c.style))}</span>${types.map(name => `<span class="meta-pill meta-pill-quiet">${esc(name)}</span>`).join('')}</div>`;
  return `<article class="creator-card"><header class="creator-head">${creatorAvatar(c)}<div class="creator-identity"><h3>${esc(c.name)}</h3><div class="creator-platforms">${esc(format(t('creatorStats'), { projects: n(c.projectCount), downloads: compactNumber(c.downloads) }))}</div></div><span class="meta-pill meta-pill-quiet" title="${esc(t('creatorRankTip'))}">#${rank + 1}</span></header>${labels}<ul class="creator-projects">${projects}</ul><div class="creator-footer">${creatorFollowButton(c)}${c.id ? `<button class="tertiary-btn small-chip" data-creator-mods="${esc(c.id)}">${t('creatorSeeMods')}</button>` : ''}${c.url ? `<a class="icon-btn icon-btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(format(t('creatorOpenProfile'), { name: c.name }))}" data-tip="${esc(t('creatorOpenProfileTip'))}">${icon('external')}</a>` : ''}</div></article>`;
}
function followedCreatorCard(c) {
  return `<article class="creator-card"><header class="creator-head">${creatorAvatar(creators.result?.creators.find(p => p.id === c.id) || c)}<div class="creator-identity"><h3>${esc(c.name)}</h3><div class="creator-platforms">CurseForge</div></div></header><div class="creator-footer">${creatorFollowButton(c)}<button class="tertiary-btn small-chip" data-creator-mods="${esc(c.id)}">${t('creatorSeeMods')}</button>${c.url ? `<a class="icon-btn icon-btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(format(t('creatorOpenProfile'), { name: c.name }))}" data-tip="${esc(t('creatorOpenProfileTip'))}">${icon('external')}</a>` : ''}</div></article>`;
}

function patreonNotice() {
  if (creators.noticeHidden) return '';
  return notice(esc(t('patreonInDevelopment')), { action: `<button class="icon-btn icon-btn-sm" id="dismiss-patreon-notice" aria-label="${esc(t('dismiss'))}" data-tip="${esc(t('dismiss'))}">${icon('close')}</button>` });
}

function renderCreatorsPage() {
  const query = creators.query.toLowerCase();
  const matches = c => !query || c.name.toLowerCase().includes(query);
  const tabs = `<div class="tabs" role="tablist" aria-label="${esc(t('creators'))}">${[
    ['popular', t('creatorsPopular')],
    ['following', `${t('creatorsFollowing')}${state.followingCreators.length ? ` <span class="badge">${state.followingCreators.length}</span>` : ''}`]
  ]
    .map(([id, label]) => `<button class="tab ${creators.tab === id ? 'is-selected' : ''}" role="tab" aria-selected="${creators.tab === id}" data-creators-tab="${id}">${label}</button>`)
    .join('')}</div>`;
  let body;
  if (creators.tab === 'following') {
    const list = state.followingCreators.filter(matches);
    body = list.length
      ? `<p class="muted-note">${t('creatorsFollowingNote')}</p><div class="creator-grid">${list.map(followedCreatorCard).join('')}</div>`
      : empty(t('creatorsNoFollowing'), t('creatorsNoFollowingText'), state.followingCreators.length ? '' : `<button class="secondary-btn" data-creators-tab="popular">${t('creatorsPopular')}</button>`);
  } else if (!cfApi) body = empty(mt('desktopOnlyTitle'), t('desktopOnly'));
  else if (!state.integrations) body = cfSkeleton(4);
  else if (!cfConfigured()) body = `<div class="empty-state setup-state">${icon('curseforge', 'empty-icon')}<b>${t('cfNotSetUpTitle')}</b><p>${t('cfNotSetUpText')}</p><button class="secondary-btn" id="cf-open-settings">${t('cfSeeSettings')}</button></div>`;
  else if (creators.error) body = cfErrorState(creators.error, 'creators-retry');
  else if (!creators.result) body = `<p class="visually-hidden" role="status">${t('loading')}</p>${cfSkeleton(6)}`;
  else {
    const list = creators.result.creators;
    const first = (creators.result.pagination.page - 1) * creators.result.pagination.pageSize;
    const styleChips = chipGroup({ name: 'creator-style', label: t('creatorStyleFilter'), options: CREATOR_STYLES.map(id => [id, id === 'all' ? t('all') : creatorStyleLabel(id)]), selected: creators.style, size: 'sm' });
    const sorter = `<label class="select-field select-inline"><span>${t('sort')}</span><select id="creators-sort">${CREATOR_SORTS.map(id => `<option value="${id}" ${creators.sort === id ? 'selected' : ''}>${t(`creatorSort_${id}`)}</option>`).join('')}</select></label>`;
    const note = creators.result.source === 'index' ? t('creatorsIndexNote') : t('creatorsLiveNote');
    body = `<p class="muted-note">${esc(note)}</p><div class="toolbar-row creator-filters">${styleChips}${sorter}</div>${list.length ? `<div class="creator-grid ${creators.loading ? 'is-refreshing' : ''}">${list.map((c, i) => popularCreatorCard(c, first + i)).join('')}</div>${creatorsPager()}` : empty(t('noResult'), creators.query ? esc(format(t('cfNoResultsFor'), { query: creators.query })) : '')}`;
  }
  content.innerHTML = `${pageHeader(t('creators'), { meta: `<span class="attribution">${t('cfAttribution')}</span>` })}${patreonNotice()}${tabs}<div class="tab-panel" role="tabpanel">${body}</div>`;
  if (creators.tab === 'popular' && cfApi && state.integrations && cfConfigured() && !creators.result && !creators.error && !creators.loading) loadCreatorsPage();
}

// Opens Explore filtered to one creator's projects.
function showCreatorMods(id) {
  cf.authorId = Number(id) || 0;
  cf.followedOnly = false;
  cf.index = 0;
  cf.tab = 'browse';
  cf.results = null;
  goTo('curseforge');
  searchCurseForge();
}

document.addEventListener('change', event => {
  if (event.target.id !== 'creators-sort') return;
  creators.sort = CREATOR_SORTS.includes(event.target.value) ? event.target.value : 'popular';
  safeSet('creators-sort', creators.sort);
  creators.page = 1;
  loadCreatorsPage();
});

// A creator picture that fails to load leaves the initial underneath visible.
document.addEventListener('error', event => {
  if (event.target.matches?.('img[data-avatar-fallback]')) event.target.closest('.creator-avatar')?.classList.remove('has-image');
}, true);

document.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.id === 'dismiss-patreon-notice') {
    creators.noticeHidden = true;
    safeWrite('patreon-notice-dismissed', true);
    return render();
  }
  if (target.id === 'creators-retry') return loadCreatorsPage();
  if (target.dataset.filter === 'creator-style') {
    creators.style = CREATOR_STYLES_FILTER(target.dataset.value);
    creators.page = 1;
    return loadCreatorsPage();
  }
  if (target.dataset.creatorsPage) {
    creators.page = Math.max(1, creators.page + Number(target.dataset.creatorsPage));
    loadCreatorsPage();
    document.querySelector('.main-area')?.scrollTo?.(0, 0);
    return;
  }
  if (target.dataset.creatorsTab) {
    creators.tab = target.dataset.creatorsTab === 'following' ? 'following' : 'popular';
    return render();
  }
  if (target.dataset.followCreator) {
    event.stopPropagation();
    const entry = { id: target.dataset.followCreator, name: target.dataset.name, url: target.dataset.url };
    return setFollowing(entry, !isFollowing(entry.id));
  }
  if (target.dataset.creatorMods) return showCreatorMods(target.dataset.creatorMods);
});
