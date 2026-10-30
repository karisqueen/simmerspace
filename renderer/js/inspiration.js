/* Inspiration: a community feed of images shared by SimmerSpace users (stored in Supabase). Posts load a page
   at a time, newest first, and can be filtered by category or by person. Only the author can delete a post,
   which also deletes its image. */
const inspirationApi = desktop?.inspiration || null;
const INSPIRATION_CATEGORIES = ['cas', 'build', 'gameplay', 'story', 'other'];
const INSPIRATION_UPLOAD_MAX = 10 * 1024 * 1024;
const insp = {
  category: 'all',
  userId: '',
  profile: null,
  posts: [],
  nextBefore: null,
  loaded: false,
  loading: false,
  error: null,
  request: 0,
  upload: null // { file, previewUrl, busy }
};

async function loadInspiration({ more = false } = {}) {
  if (!inspirationApi || !accountUser()) return;
  const request = ++insp.request;
  insp.loading = true;
  insp.error = null;
  if (!more) {
    insp.posts = [];
    insp.nextBefore = null;
  }
  if (state.page === 'inspiration') render();
  try {
    const filters = { category: insp.category === 'all' ? undefined : insp.category, userId: insp.userId || undefined, before: more ? insp.nextBefore : undefined };
    const [page, profile] = await Promise.all([callDesktop(inspirationApi.list, filters), insp.userId && !more ? callDesktop(inspirationApi.profile, { userId: insp.userId }) : Promise.resolve(insp.profile)]);
    if (request !== insp.request) return;
    insp.posts = more ? [...insp.posts, ...page.posts] : page.posts;
    insp.nextBefore = page.nextBefore;
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

function postCard(post) {
  const author = post.author.username ? `@${post.author.username}` : t('unknownUser');
  return `<article class="post-card"><button class="post-image" data-post-view="${esc(post.id)}" aria-label="${esc(format(t('postOpen'), { name: author }))}">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="${esc(post.caption || t('postNoCaption'))}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="post-missing">${icon('inspiration')}</span>`}</button><div class="post-body">${post.caption ? `<p class="post-caption">${esc(post.caption)}</p>` : ''}<div class="post-meta"><button class="post-author" data-inspiration-user="${esc(post.userId)}">${avatarMarkup({ username: post.author.username, avatarUrl: post.author.avatarUrl }, 'avatar-sm')}<span>${esc(author)}</span></button><span class="meta-pill meta-pill-quiet">${t(`inspCat_${post.category}`)}</span></div><div class="post-foot"><time datetime="${esc(post.createdAt)}">${esc(relativeDate(post.createdAt))}</time>${post.own ? `<button class="icon-btn icon-btn-sm" data-post-delete="${esc(post.id)}" aria-label="${esc(t('postDelete'))}" data-tip="${esc(t('postDelete'))}">${icon('trash')}</button>` : ''}</div></div></article>`;
}

function inspirationFilters() {
  const me = accountUser();
  const chips = [['all', t('all')], ...INSPIRATION_CATEGORIES.map(value => [value, t(`inspCat_${value}`)])];
  return `<div class="toolbar-row inspiration-filters">${chipGroup({ name: 'insp-category', label: t('category'), options: chips, selected: insp.category, hideLabel: true, size: 'sm' })}${
    me ? `<button class="chip chip-sm ${insp.userId === me.id ? 'is-selected' : ''}" data-inspiration-user="${esc(insp.userId === me.id ? '' : me.id)}" aria-pressed="${insp.userId === me.id}">${icon('user', 'chip-check')}<span>${t('myPosts')}</span></button>` : ''
  }</div>`;
}

function profileBanner() {
  const p = insp.profile;
  if (!insp.userId) return '';
  if (!p) return `<div class="profile-banner"><span class="skeleton skeleton-line"></span></div>`;
  return `<section class="profile-banner">${avatarMarkup({ username: p.username, avatarUrl: p.avatarUrl }, 'avatar-lg')}<div><h2>@${esc(p.username)}</h2><p class="muted-note">${esc(format(t('profilePostCount'), { count: n(p.postCount) }))} · ${esc(format(t('profileSince'), { date: shortDate(p.createdAt) }))}</p></div><button class="secondary-btn small-chip" data-inspiration-user="">${t('backToFeed')}</button></section>`;
}

function renderInspirationFeed() {
  const header = pageHeader(t('inspiration'), { actions: inspirationApi ? `<button class="primary-btn" id="post-new">${icon('upload')}<span>${t('postNew')}</span></button>` : '' });
  if (!inspirationApi || !accountUser()) {
    content.innerHTML = `${header}${empty(mt('desktopOnlyTitle'), t('desktopOnly'))}`;
    return;
  }
  let body;
  if (insp.error && !insp.posts.length) body = `<div class="empty-state is-error" role="alert">${icon('cloud', 'empty-icon')}<b>${t('inspLoadFailed')}</b><p>${esc(errorMessage(insp.error))}</p><button class="secondary-btn" id="insp-retry">${icon('refresh')}<span>${mt('tryAgain')}</span></button></div>`;
  else if (!insp.loaded || (insp.loading && !insp.posts.length)) body = `<p class="visually-hidden" role="status">${t('loading')}</p><div class="masonry" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<div class="post-card skeleton-card"><span class="skeleton" style="height:${[220, 300, 180, 260, 340, 200][i]}px"></span></div>`).join('')}</div>`;
  else if (!insp.posts.length) body = empty(insp.userId ? t('inspNoPostsUser') : t('inspNoPosts'), insp.userId ? '' : t('inspNoPostsText'), insp.userId && insp.userId !== accountUser().id ? '' : `<button class="primary-btn" id="post-new-empty">${icon('upload')}<span>${t('postNew')}</span></button>`);
  else
    body = `<div class="masonry">${insp.posts.map(postCard).join('')}</div>${
      insp.nextBefore ? `<div class="load-more"><button class="secondary-btn" id="insp-more" ${insp.loading ? 'disabled' : ''}>${insp.loading ? t('loading') : t('loadMore')}</button></div>` : `<p class="muted-note feed-end">${t('feedEnd')}</p>`
    }${insp.error ? `<p class="field-error" role="alert">${esc(errorMessage(insp.error))}</p>` : ''}`;
  content.innerHTML = `${header}${profileBanner()}${inspirationFilters()}${body}`;
  if (!insp.loaded && !insp.loading && !insp.error) loadInspiration();
}

/* ---------- Viewing and deleting ---------- */
// Posts can be open from the feed or from the player's own profile page.
const findPost = id => [...insp.posts, ...account.profile.posts].find(p => String(p.id) === String(id));
function viewPost(id) {
  const post = findPost(id);
  if (!post) return;
  openDialog(
    `${closeButton()}<figure class="post-viewer"><img src="${esc(post.imageUrl)}" alt="${esc(post.caption || t('postNoCaption'))}" referrerpolicy="no-referrer"><figcaption><button class="post-author" data-inspiration-user="${esc(post.userId)}">${avatarMarkup({ username: post.author.username, avatarUrl: post.author.avatarUrl }, 'avatar-sm')}<span>@${esc(post.author.username)}</span></button>${post.caption ? `<p id="dialog-title">${esc(post.caption)}</p>` : `<p id="dialog-title" class="visually-hidden">${t('inspiration')}</p>`}<small>${t(`inspCat_${post.category}`)} · ${esc(relativeDate(post.createdAt))}</small></figcaption></figure>`,
    { wide: true }
  );
}
async function deletePost(id) {
  const ok = await confirmAction({ title: t('postDelete'), body: t('postDeleteText'), confirmLabel: t('postDelete'), danger: true });
  if (!ok) return;
  try {
    const result = await callDesktop(inspirationApi.remove, { id });
    insp.posts = insp.posts.filter(p => String(p.id) !== String(id));
    if (insp.profile) insp.profile.postCount = Math.max(0, insp.profile.postCount - 1);
    account.profile = freshProfile('');
    render();
    toast(result.imageRemoved ? t('postDeleted') : t('postDeletedImageLeft'), result.imageRemoved ? undefined : 'error');
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Publishing ---------- */
function uploadDialogBody() {
  const up = insp.upload;
  const preview = up?.previewUrl ? `<img src="${esc(up.previewUrl)}" alt="">` : `${icon('upload', 'dropzone-icon')}<b>${t('postChooseImage')}</b><small>${t('postImageHint')}</small>`;
  return `${closeButton()}<form class="form-dialog post-form" id="post-form" novalidate><div class="eyebrow">${t('inspiration')}</div><h2 id="dialog-title">${t('postNew')}</h2><label class="dropzone ${up?.previewUrl ? 'has-image' : ''}" for="post-file" id="post-dropzone">${preview}<input type="file" id="post-file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden"></label><label class="field" for="post-caption">${t('postCaption')}<textarea id="post-caption" maxlength="500" rows="3" placeholder="${esc(t('postCaptionPlaceholder'))}"></textarea><small class="field-hint" id="post-caption-count">0 / 500</small></label><fieldset class="choice-row"><legend>${t('category')}</legend>${INSPIRATION_CATEGORIES.map(
    (value, i) => `<label class="choice-chip"><input type="radio" name="post-category" value="${value}" ${(insp.category === value || (insp.category === 'all' && i === 0)) ? 'checked' : ''}><span>${t(`inspCat_${value}`)}</span></label>`
  ).join('')}</fieldset><p class="setting-help">${t('postPublicNote')}</p><p class="field-error" id="post-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit" id="post-submit" ${up?.file && !up.busy ? '' : 'disabled'}>${up?.busy ? t('postPublishing') : t('postPublish')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`;
}
function openUploadDialog() {
  if (insp.upload?.previewUrl) URL.revokeObjectURL(insp.upload.previewUrl);
  insp.upload = { file: null, previewUrl: '', busy: false };
  openDialog(uploadDialogBody());
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
  const submit = document.getElementById('post-submit');
  const error = document.getElementById('post-error');
  up.busy = true;
  submit.disabled = true;
  submit.textContent = t('postPublishing');
  try {
    const image = await imageForPost(up.file);
    await callDesktop(inspirationApi.create, { data: image.data, type: image.type, caption: form.querySelector('#post-caption').value, category: form.querySelector('[name="post-category"]:checked')?.value || 'other' });
    URL.revokeObjectURL(up.previewUrl);
    insp.upload = null;
    closeDialog();
    toast(t('postPublished'));
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
  insp.loaded = false;
  if (!overlay.hidden) closeDialog();
  if (state.page !== 'inspiration') goTo('inspiration');
  else loadInspiration();
}

document.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.dataset.inspirationUser !== undefined) return showInspirationUser(target.dataset.inspirationUser);
  if (target.dataset.postView) return viewPost(target.dataset.postView);
  if (target.dataset.postDelete) return deletePost(target.dataset.postDelete);
  if (target.dataset.filter === 'insp-category') {
    insp.category = target.dataset.value;
    insp.loaded = false;
    return loadInspiration();
  }
  if (target.id === 'post-new' || target.id === 'post-new-empty') return openUploadDialog();
  if (target.id === 'insp-more') return loadInspiration({ more: true });
  if (target.id === 'insp-retry') {
    insp.loaded = false;
    return loadInspiration();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'post-file') setUploadFile(event.target.files?.[0]);
});
document.addEventListener('input', event => {
  if (event.target.id !== 'post-caption') return;
  const counter = document.getElementById('post-caption-count');
  if (counter) counter.textContent = `${event.target.value.length} / 500`;
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'post-form') return;
  event.preventDefault();
  publishPost(event.target);
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
