/* Inspiration: the simlings community. Players share images with a caption, a category and their own tags; anyone
   signed in can search by tag, follow other simlings, comment and reply, and save posts to private boards. Posts
   load a page at a time, newest first. Everything is stored in Supabase (electron/community-service.cjs); until
   the 0.12.1 database update is applied the social parts explain that they are not available yet. */
const inspirationApi = desktop?.inspiration || null;
const INSPIRATION_CATEGORIES = ['cas', 'build', 'gameplay', 'story', 'other'];
const INSPIRATION_UPLOAD_MAX = 10 * 1024 * 1024;
const TAG_LIMIT = 8;
const TAG_MAX_LENGTH = 32;
const COMMENT_LIMIT = 1000;
const insp = {
  view: 'discover', // discover | following | boards
  category: 'all',
  userId: '',
  tags: [], // [{ slug, name }] the feed must have all of them
  profile: null,
  posts: [],
  nextBefore: null,
  loaded: false,
  loading: false,
  error: null,
  request: 0,
  social: null, // false until the 0.12.1 database update is applied
  upload: null, // { file, previewUrl, busy }
  boards: null, // the player's boards, loaded when needed
  boardsError: null,
  board: null // { board, posts, nextBefore, loading, error } while a board is open
};
// Posts seen anywhere (feed, profile, boards) so the viewer can open any of them.
const postCache = new Map();
const rememberPosts = posts => posts.forEach(post => postCache.set(String(post.id), post));

function resetCommunityCache() {
  Object.assign(insp, { posts: [], nextBefore: null, loaded: false, profile: null, userId: '', tags: [], boards: null, board: null, social: null, view: 'discover' });
  postCache.clear();
}

// Same search form as the server (community-service.cjs tagSlug), used to compare and deduplicate tags.
function tagSlugOf(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function loadInspiration({ more = false } = {}) {
  if (!inspirationApi || !accountUser()) return;
  if (insp.view === 'boards') return loadBoards();
  const request = ++insp.request;
  insp.loading = true;
  insp.error = null;
  if (!more) {
    insp.posts = [];
    insp.nextBefore = null;
  }
  if (state.page === 'inspiration') render();
  try {
    const filters = {
      category: insp.category === 'all' ? undefined : insp.category,
      userId: insp.userId || undefined,
      tags: insp.tags.length ? insp.tags.map(tag => tag.slug) : undefined,
      following: insp.view === 'following' && !insp.userId ? true : undefined,
      before: more ? insp.nextBefore : undefined
    };
    const [page, profile] = await Promise.all([callDesktop(inspirationApi.list, filters), insp.userId && !more ? callDesktop(inspirationApi.profile, { userId: insp.userId }) : Promise.resolve(insp.profile)]);
    if (request !== insp.request) return;
    rememberPosts(page.posts);
    insp.posts = more ? [...insp.posts, ...page.posts] : page.posts;
    insp.nextBefore = page.nextBefore;
    insp.social = page.social !== false;
    insp.profile = insp.userId ? profile : null;
    insp.loaded = true;
  } catch (error) {
    if (request === insp.request) insp.error = error;
  } finally {
    if (request === insp.request) {
      insp.loading = false;
      if (state.page === 'inspiration') render();
    }
  }
}

function relativeDate(value) {
  const date = new Date(value);
  const seconds = (date.getTime() - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return '';
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  const formatter = new Intl.RelativeTimeFormat(state.lang, { numeric: 'auto' });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  return formatter.format(0, 'second');
}

/* ---------- Pieces ---------- */
function tagChip(tag, { removable = false } = {}) {
  return removable
    ? `<span class="tag-chip is-active"><span>#${esc(tag.name)}</span><button class="tag-chip-x" data-insp-untag="${esc(tag.slug)}" aria-label="${esc(format(t('tagRemoveFilter'), { tag: tag.name }))}">${icon('close')}</button></span>`
    : `<button class="tag-chip" data-insp-tag="${esc(tag.slug)}" data-tag-name="${esc(tag.name)}" data-tip="${esc(format(t('tagSeePosts'), { tag: tag.name }))}">#${esc(tag.name)}</button>`;
}
function authorButton(post) {
  const author = post.author.username ? `@${post.author.username}` : t('unknownUser');
  return `<button class="post-author" data-inspiration-user="${esc(post.userId)}">${avatarMarkup({ username: post.author.username, avatarUrl: post.author.avatarUrl }, 'avatar-sm')}<span>${esc(author)}</span></button>`;
}
function postCard(post, { board = null } = {}) {
  const author = post.author.username ? `@${post.author.username}` : t('unknownUser');
  const tags = post.tags || [];
  const shown = tags.slice(0, 3);
  const tagRow = tags.length ? `<div class="post-tags">${shown.map(tag => tagChip(tag)).join('')}${tags.length > shown.length ? `<span class="tag-more">+${tags.length - shown.length}</span>` : ''}</div>` : '';
  const comments = post.commentCount ? `<span class="meta-stat" title="${esc(t('commentsTitle'))}">${icon('comment')}${n(post.commentCount)}</span>` : '';
  const actions = [
    insp.social !== false ? `<button class="icon-btn icon-btn-sm" data-post-save="${esc(post.id)}" aria-label="${esc(t('boardSave'))}" data-tip="${esc(t('tipBoardSave'))}">${icon('bookmark')}</button>` : '',
    board?.own ? `<button class="icon-btn icon-btn-sm" data-board-remove="${esc(post.id)}" aria-label="${esc(t('boardRemovePost'))}" data-tip="${esc(t('boardRemovePost'))}">${icon('close')}</button>` : '',
    post.own ? `<button class="icon-btn icon-btn-sm" data-post-edit="${esc(post.id)}" aria-label="${esc(t('postEdit'))}" data-tip="${esc(t('postEdit'))}">${icon('edit')}</button>` : '',
    post.own && !board ? `<button class="icon-btn icon-btn-sm" data-post-delete="${esc(post.id)}" aria-label="${esc(t('postDelete'))}" data-tip="${esc(t('postDelete'))}">${icon('trash')}</button>` : ''
  ].join('');
  return `<article class="post-card"><button class="post-image" data-post-view="${esc(post.id)}" aria-label="${esc(format(t('postOpen'), { name: author }))}">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="${esc(post.caption || t('postNoCaption'))}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="post-missing">${icon('inspiration')}</span>`}</button><div class="post-body">${post.caption ? `<p class="post-caption">${esc(post.caption)}</p>` : ''}${tagRow}<div class="post-meta">${authorButton(post)}<span class="meta-pill meta-pill-quiet">${t(`inspCat_${post.category}`)}</span>${comments}</div><div class="post-foot"><time datetime="${esc(post.createdAt)}" title="${esc(longDate(post.createdAt))}">${esc(relativeDate(post.createdAt))}</time><span class="post-actions">${actions}</span></div></div></article>`;
}
function socialPendingNote() {
  return insp.social === false ? notice(esc(t('communityNotReady'))) : '';
}

/* ---------- Feed ---------- */
function inspirationTabs() {
  const tabs = [
    ['discover', t('inspDiscover'), 'discover'],
    ['following', t('inspFollowing'), 'heart'],
    ['boards', t('boardsTitle'), 'bookmark']
  ];
  return `<div class="tabs insp-tabs" role="tablist" aria-label="${esc(t('inspiration'))}">${tabs
    .map(([id, label, iconName]) => `<button class="tab ${insp.view === id ? 'is-selected' : ''}" role="tab" aria-selected="${insp.view === id}" data-insp-view="${id}">${icon(iconName)}<span>${esc(label)}</span></button>`)
    .join('')}</div>`;
}
function tagSearchField() {
  return `<div class="tag-search" id="tag-search"><label class="search-field search-field-inline">${icon('search')}<input id="insp-tag-search" type="search" autocomplete="off" placeholder="${esc(t('tagSearchPlaceholder'))}" aria-label="${esc(t('tagSearchPlaceholder'))}" aria-controls="tag-search-suggestions" ${insp.social === false ? 'disabled' : ''}></label><div class="tag-suggestions" id="tag-search-suggestions" role="listbox" hidden></div></div>`;
}
function inspirationFilters() {
  const me = accountUser();
  const chips = [['all', t('all')], ...INSPIRATION_CATEGORIES.map(value => [value, t(`inspCat_${value}`)])];
  const active = insp.tags.length ? `<div class="tag-filter-row"><span class="muted-note">${t('tagFilterActive')}</span>${insp.tags.map(tag => tagChip(tag, { removable: true })).join('')}<button class="text-link" id="insp-clear-tags">${t('clearFilters')}</button></div>` : '';
  return `<div class="toolbar-row inspiration-filters">${tagSearchField()}${chipGroup({ name: 'insp-category', label: t('category'), options: chips, selected: insp.category, hideLabel: true, size: 'sm' })}${
    me && insp.view === 'discover' ? `<button class="chip chip-sm ${insp.userId === me.id ? 'is-selected' : ''}" data-inspiration-user="${esc(insp.userId === me.id ? '' : me.id)}" aria-pressed="${insp.userId === me.id}">${icon('user', 'chip-check')}<span>${t('myPosts')}</span></button>` : ''
  }</div>${active}`;
}

function followButton(profile) {
  if (!profile || profile.own || profile.social === false) return '';
  return profile.iFollow
    ? `<button class="secondary-btn small-chip is-following" data-unfollow="${esc(profile.id)}" data-tip="${esc(t('tipUnfollow'))}">${icon('check')}<span>${t('followingSimling')}</span></button>`
    : `<button class="primary-btn small-chip" data-follow="${esc(profile.id)}">${icon('plus')}<span>${t('followSimling')}</span></button>`;
}
function followStats(profile) {
  if (!profile || profile.followers === null || profile.followers === undefined) return '';
  return `<span class="follow-stats"><button class="text-link" data-follow-list="followers" data-follow-user="${esc(profile.id)}"><b>${n(profile.followers)}</b> ${t('followersLabel')}</button><button class="text-link" data-follow-list="following" data-follow-user="${esc(profile.id)}"><b>${n(profile.following)}</b> ${t('followingLabel')}</button></span>`;
}
function profileBanner() {
  const p = insp.profile;
  if (!insp.userId) return '';
  if (!p) return `<div class="profile-banner"><span class="skeleton skeleton-line"></span></div>`;
  return `<section class="profile-banner">${avatarMarkup({ username: p.username, avatarUrl: p.avatarUrl }, 'avatar-lg')}<div><h2>@${esc(p.username)}</h2><p class="muted-note">${esc(format(t('profilePostCount'), { count: n(p.postCount) }))} · ${esc(format(t('profileMemberSince'), { date: longDate(p.createdAt) }))}</p>${followStats(p)}</div><div class="profile-banner-actions">${followButton(p)}<button class="secondary-btn small-chip" data-inspiration-user="">${t('backToFeed')}</button></div></section>`;
}

function feedBody() {
  if (insp.error && !insp.posts.length) return `<div class="empty-state is-error" role="alert">${icon('cloud', 'empty-icon')}<b>${t('inspLoadFailed')}</b><p>${esc(errorMessage(insp.error))}</p><button class="secondary-btn" id="insp-retry">${icon('refresh')}<span>${mt('tryAgain')}</span></button></div>`;
  if (!insp.loaded || (insp.loading && !insp.posts.length)) return `<p class="visually-hidden" role="status">${t('loading')}</p><div class="masonry" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<div class="post-card skeleton-card"><span class="skeleton" style="height:${[220, 300, 180, 260, 340, 200][i]}px"></span></div>`).join('')}</div>`;
  if (!insp.posts.length) {
    if (insp.tags.length) return empty(t('tagNoPosts'), t('tagNoPostsText'), `<button class="secondary-btn" id="insp-clear-tags">${t('clearFilters')}</button>`);
    if (insp.view === 'following' && !insp.userId) return empty(t('followingEmpty'), t('followingEmptyText'), `<button class="secondary-btn" data-insp-view="discover">${t('inspDiscover')}</button>`);
    return empty(insp.userId ? t('inspNoPostsUser') : t('inspNoPosts'), insp.userId ? '' : t('inspNoPostsText'), insp.userId && insp.userId !== accountUser().id ? '' : `<button class="primary-btn" id="post-new-empty">${icon('upload')}<span>${t('postNew')}</span></button>`);
  }
  return `<div class="masonry">${insp.posts.map(post => postCard(post)).join('')}</div>${
    insp.nextBefore ? `<div class="load-more"><button class="secondary-btn" id="insp-more" ${insp.loading ? 'disabled' : ''}>${insp.loading ? t('loading') : t('loadMore')}</button></div>` : `<p class="muted-note feed-end">${t('feedEnd')}</p>`
  }${insp.error ? `<p class="field-error" role="alert">${esc(errorMessage(insp.error))}</p>` : ''}`;
}

function renderInspirationFeed() {
  const header = pageHeader(t('inspiration'), { meta: t('inspTagline'), actions: inspirationApi ? `<button class="primary-btn" id="post-new">${icon('upload')}<span>${t('postNew')}</span></button>` : '' });
  if (!inspirationApi || !accountUser()) {
    content.innerHTML = `${header}${empty(mt('desktopOnlyTitle'), t('desktopOnly'))}`;
    return;
  }
  if (insp.view === 'boards') {
    content.innerHTML = `${header}${inspirationTabs()}${socialPendingNote()}${insp.board ? boardDetailBody() : boardsBody()}`;
    if (insp.boards === null && !insp.boardsError && !insp.boardsLoading) loadBoards();
    return;
  }
  content.innerHTML = `${header}${insp.userId ? '' : inspirationTabs()}${profileBanner()}${socialPendingNote()}${inspirationFilters()}${feedBody()}`;
  if (!insp.loaded && !insp.loading && !insp.error) loadInspiration();
}

function setInspirationView(view) {
  insp.view = ['discover', 'following', 'boards'].includes(view) ? view : 'discover';
  insp.userId = '';
  insp.profile = null;
  insp.board = null;
  insp.loaded = false;
  insp.error = null;
  if (state.page !== 'inspiration') goTo('inspiration');
  else if (insp.view === 'boards') {
    insp.boards = null;
    render();
  } else loadInspiration();
}
function filterByTag(slug, name) {
  if (!slug) return;
  if (!overlay.hidden) closeDialog();
  if (!insp.tags.some(tag => tag.slug === slug)) insp.tags = [...insp.tags, { slug, name: name || slug }].slice(0, TAG_LIMIT);
  if (insp.view === 'boards') insp.view = 'discover';
  insp.board = null;
  insp.loaded = false;
  if (state.page !== 'inspiration') goTo('inspiration');
  else loadInspiration();
}

/* ---------- Tag search (feed) ---------- */
let tagSearchTimer = 0;
let tagSearchRequest = 0;
function hideTagSuggestions(listId = 'tag-search-suggestions') {
  const list = document.getElementById(listId);
  if (list) list.hidden = true;
}
function showTagSuggestions(listId, tags, typed, { allowNew = false } = {}) {
  const list = document.getElementById(listId);
  if (!list) return;
  const typedSlug = tagSlugOf(typed);
  const items = tags.map(tag => `<button class="tag-suggestion" role="option" data-suggest-slug="${esc(tag.slug)}" data-suggest-name="${esc(tag.name)}"><span>#${esc(tag.name)}</span>${tag.uses ? `<small>${esc(format(t('tagUses'), { count: n(tag.uses) }))}</small>` : ''}</button>`);
  if (allowNew && typedSlug.length >= 2 && !tags.some(tag => tag.slug === typedSlug)) items.push(`<button class="tag-suggestion is-new" role="option" data-suggest-slug="${esc(typedSlug)}" data-suggest-name="${esc(typed.trim().replace(/^#+/, ''))}"><span>${esc(format(t('tagCreate'), { tag: typed.trim().replace(/^#+/, '') }))}</span></button>`);
  if (!allowNew && !items.length && typedSlug.length >= 2) items.push(`<button class="tag-suggestion" role="option" data-suggest-slug="${esc(typedSlug)}" data-suggest-name="${esc(typed.trim().replace(/^#+/, ''))}"><span>${esc(format(t('tagSearchFor'), { tag: typed.trim().replace(/^#+/, '') }))}</span></button>`);
  list.innerHTML = items.join('');
  list.hidden = !items.length;
}
function suggestTagsSoon(listId, typed, options) {
  clearTimeout(tagSearchTimer);
  const request = ++tagSearchRequest;
  tagSearchTimer = setTimeout(async () => {
    try {
      const result = await callDesktop(inspirationApi.suggestTags, { prefix: typed, limit: 8 });
      if (request === tagSearchRequest) showTagSuggestions(listId, result.tags, typed, options);
    } catch {
      if (request === tagSearchRequest) showTagSuggestions(listId, [], typed, options);
    }
  }, 220);
}

/* ---------- Tag input (publish and edit) ---------- */
// The tags being written in the open post form. Enter or a comma adds a tag; Backspace in an empty field removes
// the last one; suggestions come from tags other simlings already use.
let editingTags = [];
function tagInputChips() {
  return editingTags.map((name, i) => `<span class="tag-chip is-active"><span>#${esc(name)}</span><button type="button" class="tag-chip-x" data-tag-remove="${i}" aria-label="${esc(format(t('tagRemove'), { tag: name }))}">${icon('close')}</button></span>`).join('');
}
function tagInputMarkup() {
  return `<div class="field tag-field"><span id="post-tags-label">${t('tagsLabel')}</span><div class="tag-input" id="post-tag-box"><span id="post-tag-chips">${tagInputChips()}</span><input id="post-tag-input" autocomplete="off" maxlength="${TAG_MAX_LENGTH + 1}" placeholder="${esc(editingTags.length >= TAG_LIMIT ? t('tagLimitReached') : t('tagInputPlaceholder'))}" aria-labelledby="post-tags-label" aria-controls="post-tag-suggestions" ${editingTags.length >= TAG_LIMIT ? 'disabled' : ''}></div><div class="tag-suggestions" id="post-tag-suggestions" role="listbox" hidden></div><small class="field-hint" id="post-tag-hint">${esc(format(t('tagInputHint'), { count: editingTags.length, max: TAG_LIMIT }))}</small></div>`;
}
function refreshTagInput({ focus = true } = {}) {
  const chips = document.getElementById('post-tag-chips');
  const input = document.getElementById('post-tag-input');
  const hint = document.getElementById('post-tag-hint');
  if (!chips || !input) return;
  chips.innerHTML = tagInputChips();
  input.disabled = editingTags.length >= TAG_LIMIT;
  input.placeholder = input.disabled ? t('tagLimitReached') : t('tagInputPlaceholder');
  hint.textContent = format(t('tagInputHint'), { count: editingTags.length, max: TAG_LIMIT });
  hint.classList.remove('is-error');
  if (focus && !input.disabled) input.focus();
}
function addEditingTag(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^#+/, '').trim();
  const slug = tagSlugOf(name);
  const hint = document.getElementById('post-tag-hint');
  const fail = key => {
    if (hint) {
      hint.textContent = t(key);
      hint.classList.add('is-error');
    }
    return false;
  };
  if (slug.length < 2) return fail('tagTooShort');
  if (name.length > TAG_MAX_LENGTH) return fail('tagTooLong');
  if (editingTags.some(tag => tagSlugOf(tag) === slug)) return fail('tagDuplicate');
  if (editingTags.length >= TAG_LIMIT) return fail('tagLimitReached');
  editingTags = [...editingTags, name];
  const input = document.getElementById('post-tag-input');
  if (input) input.value = '';
  hideTagSuggestions('post-tag-suggestions');
  refreshTagInput();
  return true;
}

/* ---------- Viewing a post ---------- */
const viewer = { postId: '', comments: [], loading: false, error: null, social: true, replyTo: '', editing: '', confirmDelete: '', busy: false, savePanel: false };

function postDates(post) {
  const created = `<time datetime="${esc(post.createdAt)}" title="${esc(longDate(post.createdAt))}">${esc(format(t('postPublishedOn'), { date: longDate(post.createdAt) }))}</time>`;
  return post.updatedAt ? `${created} · <span title="${esc(longDate(post.updatedAt))}">${t('postEdited')}</span>` : created;
}
function viewPost(id) {
  const post = postCache.get(String(id));
  if (!post) return;
  Object.assign(viewer, { postId: String(post.id), comments: [], loading: true, error: null, replyTo: '', editing: '', confirmDelete: '', busy: false, savePanel: false });
  const tags = post.tags?.length ? `<div class="post-tags">${post.tags.map(tag => tagChip(tag)).join('')}</div>` : '';
  const actions = `<div class="button-row viewer-actions">${insp.social !== false ? `<button class="secondary-btn small-chip" id="viewer-save">${icon('bookmark')}<span>${t('boardSave')}</span></button>` : ''}${post.own ? `<button class="secondary-btn small-chip" data-post-edit="${esc(post.id)}">${icon('edit')}<span>${t('postEdit')}</span></button><button class="tertiary-btn small-chip" data-post-delete="${esc(post.id)}">${icon('trash')}<span>${t('postDelete')}</span></button>` : ''}</div>`;
  openDialog(
    `${closeButton()}<div class="post-viewer"><div class="post-viewer-image"><img src="${esc(post.imageUrl)}" alt="${esc(post.caption || t('postNoCaption'))}" referrerpolicy="no-referrer"></div><aside class="post-viewer-side"><div class="viewer-author">${authorButton(post)}<span id="viewer-follow"></span></div>${post.caption ? `<p class="viewer-caption" id="dialog-title">${esc(post.caption)}</p>` : `<p id="dialog-title" class="visually-hidden">${t('inspiration')}</p>`}${tags}<small class="viewer-dates">${t(`inspCat_${post.category}`)} · ${postDates(post)}</small>${actions}<div id="viewer-save-panel"></div><section class="viewer-comments" aria-labelledby="viewer-comments-title"><h3 id="viewer-comments-title">${icon('comment')} ${t('commentsTitle')}</h3><div id="viewer-comment-list"></div></section></aside></div>`,
    { wide: true, onClose: () => (viewer.postId = '') }
  );
  renderComments();
  loadComments(post.id);
  if (!post.own && insp.social !== false) loadViewerFollow(post.userId);
}
async function loadViewerFollow(userId) {
  try {
    const profile = await callDesktop(inspirationApi.profile, { userId });
    const slot = document.getElementById('viewer-follow');
    if (slot && viewer.postId) slot.innerHTML = followButton(profile);
  } catch {}
}
async function loadComments(postId) {
  viewer.loading = true;
  try {
    const result = await callDesktop(inspirationApi.comments, { postId });
    if (viewer.postId !== String(postId)) return;
    viewer.comments = result.comments;
    viewer.social = result.social !== false;
    viewer.error = null;
  } catch (error) {
    viewer.error = error;
  } finally {
    viewer.loading = false;
    if (viewer.postId === String(postId)) renderComments();
  }
}
function commentForm({ parentId = '', id = 'comment-form', value = '', submit = t('commentSend'), cancel = false } = {}) {
  return `<form class="comment-form" data-comment-form="${esc(id)}" data-parent="${esc(parentId)}" novalidate><textarea name="body" rows="${parentId || cancel ? 2 : 3}" maxlength="${COMMENT_LIMIT}" placeholder="${esc(parentId ? t('replyPlaceholder') : t('commentPlaceholder'))}" aria-label="${esc(parentId ? t('replyPlaceholder') : t('commentPlaceholder'))}">${esc(value)}</textarea><div class="comment-form-actions"><small class="field-hint" data-comment-count>${value.length} / ${COMMENT_LIMIT}</small>${cancel ? `<button class="tertiary-btn small-chip" type="button" data-comment-cancel>${t('cancel')}</button>` : ''}<button class="primary-btn small-chip" type="submit" ${viewer.busy ? 'disabled' : ''}>${esc(submit)}</button></div></form>`;
}
function commentItem(comment, replies = []) {
  const author = comment.author.username ? `@${comment.author.username}` : t('unknownUser');
  let body;
  if (comment.deleted) body = `<p class="comment-body is-deleted">${t('commentDeleted')}</p>`;
  else if (viewer.editing === comment.id) body = commentForm({ id: `edit:${comment.id}`, value: comment.body, submit: t('save'), cancel: true });
  else body = `<p class="comment-body">${esc(comment.body)}</p>`;
  let actions = '';
  if (!comment.deleted && viewer.editing !== comment.id) {
    if (viewer.confirmDelete === comment.id) actions = `<span class="comment-confirm" role="group" aria-label="${esc(t('commentDeleteConfirm'))}">${t('commentDeleteConfirm')} <button class="text-link is-danger" data-comment-delete-yes="${esc(comment.id)}">${t('commentDeleteYes')}</button><button class="text-link" data-comment-delete-no>${t('cancel')}</button></span>`;
    else
      actions = [
        !comment.parentId ? `<button class="text-link" data-comment-reply="${esc(comment.id)}">${icon('reply')}<span>${t('commentReply')}</span></button>` : '',
        comment.own ? `<button class="text-link" data-comment-edit="${esc(comment.id)}">${t('commentEdit')}</button><button class="text-link" data-comment-delete="${esc(comment.id)}">${t('commentDelete')}</button>` : ''
      ].join('');
  }
  const edited = comment.editedAt && !comment.deleted ? ` · <span title="${esc(longDate(comment.editedAt))}">${t('commentEdited')}</span>` : '';
  const replyForm = viewer.replyTo === comment.id ? commentForm({ parentId: comment.id, id: `reply:${comment.id}`, submit: t('commentReply'), cancel: true }) : '';
  const replyList = replies.length || replyForm ? `<ol class="comment-replies" aria-label="${esc(format(t('repliesTo'), { name: author }))}">${replies.map(reply => commentItem(reply)).join('')}</ol>${replyForm}` : '';
  return `<li class="comment ${comment.parentId ? 'is-reply' : ''}" id="comment-${esc(comment.id)}"><div class="comment-head">${comment.deleted ? `<span class="avatar avatar-sm" aria-hidden="true">·</span>` : `<button class="post-author" data-inspiration-user="${esc(comment.userId)}">${avatarMarkup({ username: comment.author.username, avatarUrl: comment.author.avatarUrl }, 'avatar-sm')}<span>${esc(author)}</span></button>`}<small><time datetime="${esc(comment.createdAt)}" title="${esc(longDate(comment.createdAt))}">${esc(relativeDate(comment.createdAt))}</time>${edited}</small></div>${body}${actions ? `<div class="comment-actions">${actions}</div>` : ''}${replyList}</li>`;
}
function renderComments() {
  const list = document.getElementById('viewer-comment-list');
  if (!list) return;
  if (!viewer.social) {
    list.innerHTML = `<p class="muted-note">${t('communityNotReady')}</p>`;
    return;
  }
  if (viewer.loading && !viewer.comments.length) {
    list.innerHTML = `<span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span>`;
    return;
  }
  if (viewer.error) {
    list.innerHTML = `<p class="field-error" role="alert">${esc(errorMessage(viewer.error))}</p>`;
    return;
  }
  const top = viewer.comments.filter(c => !c.parentId);
  const replies = id => viewer.comments.filter(c => c.parentId === id);
  // Deleted comments without replies have nothing left to show.
  const visible = top.filter(c => !c.deleted || replies(c.id).length);
  const focusedKey = document.activeElement?.closest?.('[data-comment-form]')?.dataset.commentForm;
  list.innerHTML = `${visible.length ? `<ol class="comment-list">${visible.map(c => commentItem(c, replies(c.id))).join('')}</ol>` : `<p class="muted-note">${t('commentsEmpty')}</p>`}${commentForm()}`;
  if (focusedKey) list.querySelector(`[data-comment-form="${CSS.escape(focusedKey)}"] textarea`)?.focus();
}
async function submitComment(form) {
  if (viewer.busy) return;
  const key = form.dataset.commentForm;
  const body = form.querySelector('textarea').value.trim();
  if (!body) {
    form.querySelector('textarea').focus();
    return toast(mt('err_COMMENT_EMPTY'), 'error');
  }
  viewer.busy = true;
  form.querySelector('[type="submit"]').disabled = true;
  try {
    if (key.startsWith('edit:')) {
      await callDesktop(inspirationApi.editComment, { id: key.slice(5), body });
      viewer.editing = '';
    } else {
      await callDesktop(inspirationApi.addComment, { postId: viewer.postId, parentId: form.dataset.parent || undefined, body });
      viewer.replyTo = '';
      const post = postCache.get(viewer.postId);
      if (post) post.commentCount = (post.commentCount || 0) + 1;
      if (key === 'comment-form') form.reset();
    }
    viewer.busy = false;
    await loadComments(viewer.postId);
  } catch (error) {
    viewer.busy = false;
    form.querySelector('[type="submit"]').disabled = false;
    toast(errorMessage(error), 'error');
  }
}
async function removeComment(id) {
  viewer.confirmDelete = '';
  try {
    await callDesktop(inspirationApi.deleteComment, { id });
    const post = postCache.get(viewer.postId);
    if (post) post.commentCount = Math.max(0, (post.commentCount || 0) - 1);
    await loadComments(viewer.postId);
    toast(t('commentDeletedToast'));
  } catch (error) {
    renderComments();
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Boards ---------- */
async function loadBoards({ postId } = {}) {
  insp.boardsLoading = true;
  try {
    const result = await callDesktop(inspirationApi.boards, postId ? { postId } : {});
    insp.boards = result.boards;
    if (result.social === false) insp.social = false;
    insp.boardsError = null;
    return result.boards;
  } catch (error) {
    insp.boardsError = error;
    return [];
  } finally {
    insp.boardsLoading = false;
    if (state.page === 'inspiration' && insp.view === 'boards' && !postId) render();
  }
}
function boardTile(board) {
  const covers = board.covers.length ? board.covers.map(url => `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('') : `<span class="board-empty-cover">${icon('bookmark')}</span>`;
  return `<button class="board-tile" data-board-open="${esc(board.id)}"><span class="board-cover" data-count="${Math.min(board.covers.length, 3)}">${covers}</span><span class="board-info"><b>${esc(board.name)}</b><small>${esc(board.count === 1 ? t('boardCountOne') : format(t('boardCount'), { count: n(board.count) }))} · <span class="board-privacy">${icon('lock')}${board.isPublic ? t('boardPublic') : t('boardPrivate')}</span></small></span></button>`;
}
function boardsBody() {
  if (insp.social === false) return '';
  if (insp.boardsError) return `<div class="empty-state is-error" role="alert"><b>${t('boardsLoadFailed')}</b><p>${esc(errorMessage(insp.boardsError))}</p><button class="secondary-btn" id="boards-retry">${mt('tryAgain')}</button></div>`;
  if (insp.boards === null) return `<div class="board-grid" aria-hidden="true">${'<span class="board-tile skeleton-card"><span class="skeleton" style="height:180px"></span></span>'.repeat(4)}</div>`;
  const intro = `<div class="boards-intro"><p class="muted-note">${t('boardsIntro')}</p><button class="secondary-btn" id="board-new">${icon('plus')}<span>${t('boardNew')}</span></button></div>`;
  if (!insp.boards.length) return `${intro}${empty(t('boardsEmpty'), t('boardsEmptyText'))}`;
  return `${intro}<div class="board-grid">${insp.boards.map(boardTile).join('')}</div>`;
}
async function openBoard(id) {
  insp.board = { board: insp.boards?.find(b => b.id === id) || { id, name: '', description: '', isPublic: false, own: true }, posts: [], nextBefore: null, loading: true, error: null };
  render();
  await loadBoardPosts(id);
}
async function loadBoardPosts(id, { more = false } = {}) {
  const open = insp.board;
  if (!open) return;
  open.loading = true;
  try {
    const result = await callDesktop(inspirationApi.boardPosts, { id, before: more ? open.nextBefore : undefined });
    if (insp.board !== open) return;
    rememberPosts(result.posts);
    Object.assign(open, { board: result.board, posts: more ? [...open.posts, ...result.posts] : result.posts, nextBefore: result.nextBefore, error: null });
  } catch (error) {
    open.error = error;
  } finally {
    open.loading = false;
    if (state.page === 'inspiration' && insp.board === open) render();
  }
}
function boardDetailBody() {
  const { board, posts, loading, error, nextBefore } = insp.board;
  const head = `<section class="board-head panel panel-pad"><button class="secondary-btn small-chip" id="board-back">${t('boardsBack')}</button><div class="board-head-copy"><h2>${esc(board.name)}</h2>${board.description ? `<p>${esc(board.description)}</p>` : ''}<small class="board-privacy">${icon('lock')}${board.isPublic ? t('boardPublic') : t('boardPrivateNote')}</small></div>${board.own ? `<div class="button-row"><button class="secondary-btn small-chip" id="board-edit">${icon('edit')}<span>${t('boardEdit')}</span></button><button class="tertiary-btn small-chip" id="board-delete">${icon('trash')}<span>${t('boardDelete')}</span></button></div>` : ''}</section>`;
  let body;
  if (error) body = `<div class="empty-state is-error" role="alert"><b>${t('boardsLoadFailed')}</b><p>${esc(errorMessage(error))}</p></div>`;
  else if (loading && !posts.length) body = `<div class="masonry" aria-hidden="true">${'<div class="post-card skeleton-card"><span class="skeleton" style="height:240px"></span></div>'.repeat(3)}</div>`;
  else if (!posts.length) body = empty(t('boardNoPosts'), t('boardNoPostsText'), `<button class="secondary-btn" data-insp-view="discover">${t('inspDiscover')}</button>`);
  else body = `<div class="masonry">${posts.map(post => postCard(post, { board })).join('')}</div>${nextBefore ? `<div class="load-more"><button class="secondary-btn" id="board-more" ${loading ? 'disabled' : ''}>${t('loadMore')}</button></div>` : ''}`;
  return `${head}${body}`;
}
function boardDialog(board = null) {
  openDialog(
    `${closeButton()}<form class="form-dialog" id="board-form" data-board-id="${esc(board?.id || '')}" novalidate><div class="eyebrow">${t('boardsTitle')}</div><h2 id="dialog-title">${board ? t('boardEdit') : t('boardNew')}</h2><label class="field" for="board-name">${t('boardName')}<input id="board-name" maxlength="60" required value="${esc(board?.name || '')}" placeholder="${esc(t('boardNamePlaceholder'))}"></label><label class="field" for="board-description">${t('boardDescription')}<textarea id="board-description" maxlength="300" rows="3" placeholder="${esc(t('boardDescriptionPlaceholder'))}">${esc(board?.description || '')}</textarea></label><p class="setting-help">${icon('lock')} ${t('boardPrivateNote')}</p><p class="field-error" id="board-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit">${board ? t('save') : t('create')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`
  );
}
async function submitBoard(form) {
  const id = form.dataset.boardId;
  const error = document.getElementById('board-error');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const values = { name: document.getElementById('board-name').value, description: document.getElementById('board-description').value };
    if (id) await callDesktop(inspirationApi.updateBoard, { id, ...values });
    else await callDesktop(inspirationApi.createBoard, values);
    closeDialog();
    toast(id ? t('boardSaved') : t('boardCreated'));
    insp.boards = null;
    if (id && insp.board) await loadBoardPosts(id);
    else render();
  } catch (failure) {
    submit.disabled = false;
    error.hidden = false;
    error.textContent = errorMessage(failure);
  }
}
async function deleteBoard() {
  const board = insp.board?.board;
  if (!board) return;
  const ok = await confirmAction({ title: t('boardDelete'), body: format(t('boardDeleteText'), { name: board.name }), confirmLabel: t('boardDelete'), danger: true });
  if (!ok) return;
  try {
    await callDesktop(inspirationApi.deleteBoard, { id: board.id });
    insp.board = null;
    insp.boards = null;
    render();
    toast(t('boardDeleted'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}
async function removeFromBoard(postId) {
  const open = insp.board;
  if (!open) return;
  try {
    await callDesktop(inspirationApi.unsavePost, { boardId: open.board.id, postId });
    open.posts = open.posts.filter(post => String(post.id) !== String(postId));
    insp.boards = null;
    render();
    toast(t('boardRemoved'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

// "Save": the player's boards with a check on those that already have the post, and a quick "new board".
async function boardPicker(postId, slot) {
  slot.innerHTML = `<div class="board-picker"><span class="skeleton skeleton-line"></span></div>`;
  const boards = await loadBoards({ postId });
  if (!slot.isConnected) return;
  if (insp.boardsError) {
    slot.innerHTML = `<p class="field-error" role="alert">${esc(errorMessage(insp.boardsError))}</p>`;
    return;
  }
  slot.innerHTML = `<div class="board-picker" data-picker-post="${esc(postId)}"><b>${t('boardSaveTo')}</b>${boards.length ? `<ul>${boards.map(board => `<li><label class="check-row"><input type="checkbox" data-picker-board="${esc(board.id)}" ${board.hasPost ? 'checked' : ''}><span>${esc(board.name)}</span><small>${n(board.count)}</small></label></li>`).join('')}</ul>` : `<p class="muted-note">${t('boardsEmptyPicker')}</p>`}<form class="inline-row board-quick" id="board-quick" novalidate><input id="board-quick-name" maxlength="60" placeholder="${esc(t('boardNamePlaceholder'))}" aria-label="${esc(t('boardNew'))}"><button class="secondary-btn small-chip" type="submit">${icon('plus')}<span>${t('boardCreateAndSave')}</span></button></form></div>`;
}
function openSaveDialog(postId) {
  openDialog(`${closeButton()}<div class="form-dialog"><div class="eyebrow">${t('boardsTitle')}</div><h2 id="dialog-title">${t('boardSave')}</h2><div id="save-dialog-slot"></div><div class="detail-actions"><button class="secondary-btn" data-close>${t('done')}</button></div></div>`);
  boardPicker(postId, document.getElementById('save-dialog-slot'));
}
async function togglePicker(input) {
  const postId = input.closest('[data-picker-post]').dataset.pickerPost;
  const boardId = input.dataset.pickerBoard;
  input.disabled = true;
  try {
    await callDesktop(input.checked ? inspirationApi.savePost : inspirationApi.unsavePost, { boardId, postId });
    toast(input.checked ? t('boardSavedPost') : t('boardRemoved'));
    insp.boards = null;
  } catch (error) {
    input.checked = !input.checked;
    toast(errorMessage(error), 'error');
  } finally {
    input.disabled = false;
  }
}
async function quickBoard(form) {
  const picker = form.closest('[data-picker-post]');
  const name = form.querySelector('input').value.trim();
  if (!name) return form.querySelector('input').focus();
  try {
    const { id } = await callDesktop(inspirationApi.createBoard, { name });
    await callDesktop(inspirationApi.savePost, { boardId: id, postId: picker.dataset.pickerPost });
    toast(format(t('boardCreatedSaved'), { name }));
    insp.boards = null;
    boardPicker(picker.dataset.pickerPost, picker.parentElement);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Following simlings ---------- */
async function setFollow(userId, follow) {
  try {
    await callDesktop(follow ? inspirationApi.follow : inspirationApi.unfollow, { userId });
    const update = profile => {
      if (profile?.id !== userId) return;
      profile.iFollow = follow;
      if (typeof profile.followers === 'number') profile.followers = Math.max(0, profile.followers + (follow ? 1 : -1));
    };
    update(insp.profile);
    document.querySelectorAll(`[data-follow="${CSS.escape(userId)}"], [data-unfollow="${CSS.escape(userId)}"]`).forEach(button => {
      button.outerHTML = followButton({ id: userId, iFollow: follow, own: false });
    });
    // The own profile shows how many simlings the player follows; keep it in step.
    if (typeof account !== 'undefined' && typeof account.profile?.following === 'number') account.profile.following = Math.max(0, account.profile.following + (follow ? 1 : -1));
    if (state.page === 'inspiration' && insp.userId === userId) render();
    toast(follow ? t('followDone') : t('unfollowDone'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}
async function openFollowList(userId, kind) {
  openDialog(`${closeButton()}<div class="form-dialog follow-dialog"><div class="eyebrow">simlings</div><h2 id="dialog-title">${kind === 'following' ? t('followingLabelTitle') : t('followersLabelTitle')}</h2><div id="follow-list"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span></div></div>`);
  try {
    const result = await callDesktop(inspirationApi.follows, { userId, kind });
    const list = document.getElementById('follow-list');
    if (!list) return;
    list.innerHTML = result.people.length
      ? `<ul class="people-list">${result.people.map(person => `<li><button class="post-author" data-inspiration-user="${esc(person.id)}">${avatarMarkup({ username: person.username, avatarUrl: person.avatarUrl }, 'avatar-sm')}<span>@${esc(person.username || '?')}</span></button>${person.isMe ? `<small class="muted-note">${t('youLabel')}</small>` : followButton({ id: person.id, iFollow: person.iFollow, own: false })}</li>`).join('')}</ul>`
      : `<p class="muted-note">${kind === 'following' ? t('followingNone') : t('followersNone')}</p>`;
  } catch (error) {
    const list = document.getElementById('follow-list');
    if (list) list.innerHTML = `<p class="field-error" role="alert">${esc(errorMessage(error))}</p>`;
  }
}

/* ---------- Deleting ---------- */
async function deletePost(id) {
  const ok = await confirmAction({ title: t('postDelete'), body: t('postDeleteText'), confirmLabel: t('postDelete'), danger: true });
  if (!ok) return;
  try {
    const result = await callDesktop(inspirationApi.remove, { id });
    insp.posts = insp.posts.filter(p => String(p.id) !== String(id));
    postCache.delete(String(id));
    if (insp.profile) insp.profile.postCount = Math.max(0, insp.profile.postCount - 1);
    account.profile = freshProfile('');
    insp.boards = null;
    render();
    toast(result.imageRemoved ? t('postDeleted') : t('postDeletedImageLeft'), result.imageRemoved ? undefined : 'error');
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Publishing and editing ---------- */
function categoryChoices(selected) {
  return `<fieldset class="choice-row"><legend>${t('category')}</legend>${INSPIRATION_CATEGORIES.map(value => `<label class="choice-chip"><input type="radio" name="post-category" value="${value}" ${selected === value ? 'checked' : ''}><span>${t(`inspCat_${value}`)}</span></label>`).join('')}</fieldset>`;
}
function uploadDialogBody() {
  const up = insp.upload;
  const preview = up?.previewUrl ? `<img src="${esc(up.previewUrl)}" alt="">` : `${icon('upload', 'dropzone-icon')}<b>${t('postChooseImage')}</b><small>${t('postImageHint')}</small>`;
  const category = INSPIRATION_CATEGORIES.includes(insp.category) ? insp.category : INSPIRATION_CATEGORIES[0];
  return `${closeButton()}<form class="form-dialog post-form" id="post-form" novalidate><div class="eyebrow">${t('inspiration')}</div><h2 id="dialog-title">${t('postNew')}</h2><label class="dropzone ${up?.previewUrl ? 'has-image' : ''}" for="post-file" id="post-dropzone">${preview}<input type="file" id="post-file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden"></label><label class="field" for="post-caption">${t('postCaption')}<textarea id="post-caption" maxlength="500" rows="3" placeholder="${esc(t('postCaptionPlaceholder'))}"></textarea><small class="field-hint" id="post-caption-count">0 / 500</small></label>${categoryChoices(category)}${insp.social !== false ? tagInputMarkup() : ''}<p class="setting-help">${t('postPublicNote')}</p><p class="field-error" id="post-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit" id="post-submit" ${up?.file && !up.busy ? '' : 'disabled'}>${up?.busy ? t('postPublishing') : t('postPublish')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`;
}
function openUploadDialog() {
  if (insp.upload?.previewUrl) URL.revokeObjectURL(insp.upload.previewUrl);
  insp.upload = { file: null, previewUrl: '', busy: false };
  editingTags = insp.tags.map(tag => tag.name);
  openDialog(uploadDialogBody());
}
function openEditDialog(id) {
  const post = postCache.get(String(id));
  if (!post?.own) return;
  editingTags = (post.tags || []).map(tag => tag.name);
  openDialog(
    `${closeButton()}<form class="form-dialog post-form" id="post-edit-form" data-post-id="${esc(post.id)}" novalidate><div class="eyebrow">${t('inspiration')}</div><h2 id="dialog-title">${t('postEditTitle')}</h2><div class="edit-preview">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="" referrerpolicy="no-referrer">` : ''}<small>${esc(format(t('postPublishedOn'), { date: longDate(post.createdAt) }))}</small></div><label class="field" for="post-caption">${t('postCaption')}<textarea id="post-caption" maxlength="500" rows="3">${esc(post.caption)}</textarea><small class="field-hint" id="post-caption-count">${post.caption.length} / 500</small></label>${categoryChoices(post.category)}${insp.social !== false ? tagInputMarkup() : ''}<p class="field-error" id="post-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit" id="post-submit">${t('save')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`
  );
}
// A tag still being typed when the form is sent counts as added.
function pendingTagsFromForm() {
  const typed = document.getElementById('post-tag-input')?.value.trim();
  if (typed && !addEditingTag(typed)) return null;
  return editingTags;
}
async function saveEditedPost(form) {
  const submit = document.getElementById('post-submit');
  const error = document.getElementById('post-error');
  const tags = insp.social !== false ? pendingTagsFromForm() : undefined;
  if (tags === null) return;
  submit.disabled = true;
  try {
    const { post } = await callDesktop(inspirationApi.update, { id: form.dataset.postId, caption: form.querySelector('#post-caption').value, category: form.querySelector('[name="post-category"]:checked')?.value, tags });
    rememberPosts([post]);
    const replace = list => list.map(p => (String(p.id) === String(post.id) ? post : p));
    insp.posts = replace(insp.posts);
    if (insp.board) insp.board.posts = replace(insp.board.posts);
    account.profile = freshProfile('');
    closeDialog();
    render();
    toast(t('postUpdated'));
  } catch (failure) {
    submit.disabled = false;
    error.hidden = false;
    error.textContent = errorMessage(failure);
  }
}
function setUploadFile(file) {
  const error = document.getElementById('post-error');
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    error.hidden = false;
    error.textContent = mt('err_IMAGE_TYPE');
    return;
  }
  if (insp.upload.previewUrl) URL.revokeObjectURL(insp.upload.previewUrl);
  insp.upload.file = file;
  insp.upload.previewUrl = URL.createObjectURL(file);
  const zone = document.getElementById('post-dropzone');
  zone.classList.add('has-image');
  zone.querySelectorAll(':scope > :not(input)').forEach(node => node.remove());
  zone.insertAdjacentHTML('afterbegin', `<img src="${esc(insp.upload.previewUrl)}" alt="">`);
  error.hidden = true;
  document.getElementById('post-submit').disabled = false;
}
// GIFs keep their animation and are sent as they are (up to 10 MB); other images are resized to 1920 px.
async function imageForPost(file) {
  if (file.type === 'image/gif') {
    if (file.size > INSPIRATION_UPLOAD_MAX) throw Object.assign(new Error('large'), { code: 'IMAGE_TOO_LARGE' });
    return { data: new Uint8Array(await file.arrayBuffer()), type: 'image/gif' };
  }
  const image = await prepareImage(file, { maxSide: 1920, quality: 0.9 });
  if (image.data.byteLength > INSPIRATION_UPLOAD_MAX) throw Object.assign(new Error('large'), { code: 'IMAGE_TOO_LARGE' });
  return image;
}
async function publishPost(form) {
  const up = insp.upload;
  if (!up?.file || up.busy) return;
  const tags = insp.social !== false ? pendingTagsFromForm() : [];
  if (tags === null) return;
  const submit = document.getElementById('post-submit');
  const error = document.getElementById('post-error');
  up.busy = true;
  submit.disabled = true;
  submit.textContent = t('postPublishing');
  try {
    const image = await imageForPost(up.file);
    const result = await callDesktop(inspirationApi.create, { data: image.data, type: image.type, caption: form.querySelector('#post-caption').value, category: form.querySelector('[name="post-category"]:checked')?.value || 'other', tags });
    URL.revokeObjectURL(up.previewUrl);
    insp.upload = null;
    closeDialog();
    toast(result.tagsSaved === false ? t('postPublishedNoTags') : t('postPublished'), result.tagsSaved === false ? 'error' : undefined);
    account.profile = freshProfile('');
    if (state.page === 'account') render();
    insp.loaded = false;
    loadInspiration();
  } catch (failure) {
    up.busy = false;
    submit.disabled = false;
    submit.textContent = t('postPublish');
    error.hidden = false;
    error.textContent = errorMessage(failure);
  }
}

function showInspirationUser(userId) {
  insp.userId = userId || '';
  insp.profile = null;
  insp.board = null;
  if (insp.view === 'boards') insp.view = 'discover';
  insp.loaded = false;
  if (!overlay.hidden) closeDialog();
  if (state.page !== 'inspiration') goTo('inspiration');
  else loadInspiration();
}

/* ---------- Events ---------- */
document.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  const d = target.dataset;
  if (d.inspirationUser !== undefined) return showInspirationUser(d.inspirationUser);
  if (d.inspView) return setInspirationView(d.inspView);
  if (d.inspTag) return filterByTag(d.inspTag, d.tagName);
  if (d.inspUntag) {
    insp.tags = insp.tags.filter(tag => tag.slug !== d.inspUntag);
    insp.loaded = false;
    return loadInspiration();
  }
  if (d.suggestSlug && target.closest('#tag-search-suggestions')) {
    document.getElementById('insp-tag-search').value = '';
    hideTagSuggestions();
    return filterByTag(d.suggestSlug, d.suggestName);
  }
  if (d.suggestSlug && target.closest('#post-tag-suggestions')) return addEditingTag(d.suggestName);
  if (d.tagRemove !== undefined) {
    editingTags = editingTags.filter((_, i) => i !== Number(d.tagRemove));
    return refreshTagInput();
  }
  if (d.postView) return viewPost(d.postView);
  if (d.postDelete) return deletePost(d.postDelete);
  if (d.postEdit) return openEditDialog(d.postEdit);
  if (d.postSave) return openSaveDialog(d.postSave);
  if (d.boardOpen) return openBoard(d.boardOpen);
  if (d.boardRemove) return removeFromBoard(d.boardRemove);
  if (d.follow) return setFollow(d.follow, true);
  if (d.unfollow) return setFollow(d.unfollow, false);
  if (d.followList) return openFollowList(d.followUser, d.followList);
  if (d.commentReply) {
    viewer.replyTo = viewer.replyTo === d.commentReply ? '' : d.commentReply;
    viewer.editing = '';
    renderComments();
    return document.querySelector(`[data-comment-form="reply:${CSS.escape(d.commentReply)}"] textarea`)?.focus();
  }
  if (d.commentEdit) {
    viewer.editing = d.commentEdit;
    viewer.replyTo = '';
    renderComments();
    return document.querySelector(`[data-comment-form="edit:${CSS.escape(d.commentEdit)}"] textarea`)?.focus();
  }
  if (d.commentCancel !== undefined) {
    viewer.editing = '';
    viewer.replyTo = '';
    return renderComments();
  }
  if (d.commentDelete) {
    viewer.confirmDelete = d.commentDelete;
    return renderComments();
  }
  if (d.commentDeleteNo !== undefined) {
    viewer.confirmDelete = '';
    return renderComments();
  }
  if (d.commentDeleteYes) return removeComment(d.commentDeleteYes);
  if (d.filter === 'insp-category') {
    insp.category = d.value;
    insp.loaded = false;
    return loadInspiration();
  }
  switch (target.id) {
    case 'post-new':
    case 'post-new-empty':
      return openUploadDialog();
    case 'insp-more':
      return loadInspiration({ more: true });
    case 'insp-retry':
      insp.loaded = false;
      return loadInspiration();
    case 'insp-clear-tags':
      insp.tags = [];
      insp.loaded = false;
      return loadInspiration();
    case 'viewer-save': {
      const slot = document.getElementById('viewer-save-panel');
      viewer.savePanel = !viewer.savePanel;
      if (!viewer.savePanel) return (slot.innerHTML = '');
      return boardPicker(viewer.postId, slot);
    }
    case 'board-new':
      return boardDialog();
    case 'board-edit':
      return boardDialog(insp.board?.board);
    case 'board-delete':
      return deleteBoard();
    case 'board-back':
      insp.board = null;
      return render();
    case 'board-more':
      return loadBoardPosts(insp.board.board.id, { more: true });
    case 'boards-retry':
      insp.boardsError = null;
      insp.boards = null;
      return render();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'post-file') setUploadFile(event.target.files?.[0]);
  if (event.target.dataset?.pickerBoard) togglePicker(event.target);
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'post-caption') {
    const counter = document.getElementById('post-caption-count');
    if (counter) counter.textContent = `${el.value.length} / 500`;
  } else if (el.id === 'insp-tag-search') {
    const typed = el.value.trim();
    if (tagSlugOf(typed).length < 1) return hideTagSuggestions();
    suggestTagsSoon('tag-search-suggestions', typed);
  } else if (el.id === 'post-tag-input') {
    if (/,/.test(el.value)) {
      const parts = el.value.split(',');
      el.value = parts.pop();
      parts.forEach(part => part.trim() && addEditingTag(part));
    }
    const typed = el.value.trim();
    if (tagSlugOf(typed).length < 1) return hideTagSuggestions('post-tag-suggestions');
    suggestTagsSoon('post-tag-suggestions', typed, { allowNew: true });
  } else if (el.matches?.('.comment-form textarea')) {
    const counter = el.closest('form').querySelector('[data-comment-count]');
    if (counter) counter.textContent = `${el.value.length} / ${COMMENT_LIMIT}`;
  }
});
document.addEventListener('keydown', event => {
  const el = event.target;
  if (el.id === 'post-tag-input') {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (el.value.trim()) addEditingTag(el.value);
    } else if (event.key === 'Backspace' && !el.value && editingTags.length) {
      editingTags = editingTags.slice(0, -1);
      refreshTagInput();
    } else if (event.key === 'Escape') hideTagSuggestions('post-tag-suggestions');
  } else if (el.id === 'insp-tag-search') {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = document.querySelector('#tag-search-suggestions:not([hidden]) .tag-suggestion');
      const slug = first?.dataset.suggestSlug || tagSlugOf(el.value);
      if (slug.length >= 2) {
        el.value = '';
        hideTagSuggestions();
        filterByTag(slug, first?.dataset.suggestName || el.value.trim());
      }
    } else if (event.key === 'Escape') hideTagSuggestions();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      document.querySelector('#tag-search-suggestions .tag-suggestion')?.focus();
    }
  } else if (el.matches?.('.tag-suggestion') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    (event.key === 'ArrowDown' ? el.nextElementSibling : el.previousElementSibling)?.focus();
  } else if (el.matches?.('.comment-form textarea') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    el.closest('form').requestSubmit();
  }
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest?.('.tag-search, .tag-field')) {
    hideTagSuggestions();
    hideTagSuggestions('post-tag-suggestions');
  }
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (form.id === 'post-form') {
    event.preventDefault();
    publishPost(form);
  } else if (form.id === 'post-edit-form') {
    event.preventDefault();
    saveEditedPost(form);
  } else if (form.id === 'board-form') {
    event.preventDefault();
    submitBoard(form);
  } else if (form.id === 'board-quick') {
    event.preventDefault();
    quickBoard(form);
  } else if (form.dataset?.commentForm) {
    event.preventDefault();
    submitComment(form);
  }
});
// Images can also be dropped onto the upload area.
document.addEventListener('dragover', event => {
  if (event.target.closest?.('#post-dropzone')) event.preventDefault();
});
document.addEventListener('drop', event => {
  if (!event.target.closest?.('#post-dropzone')) return;
  event.preventDefault();
  setUploadFile(event.dataTransfer.files?.[0]);
});
