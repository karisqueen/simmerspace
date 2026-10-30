/* Accounts. SimmerSpace needs a signed-in account: until there is one, a sign-in screen covers the app
   (renderAuthGate). A session saved on this computer is restored at start, also without internet.
   Requests go through the desktop app (electron/account-service.cjs); the page never sees keys or passwords
   after they are typed. */
const accountApi = desktop?.account || null;
const account = {
  status: null, // { configured, user, persistent, pendingEmail }
  loadError: null,
  view: 'signin', // signin | signup | verify | reset | reset-code
  busy: false,
  error: '',
  notice: '',
  email: '',
  username: { value: '', state: 'idle' }, // idle | checking | invalid | taken | free | error
  devBypass: false,
  tourOffered: false,
  avatarBusy: false,
  profile: freshProfile('')
};
// The player's own posts and counts on the profile page, loaded when it opens.
function freshProfile(userId) {
  return { userId, posts: [], postCount: null, more: false, loaded: false, loading: false, error: null };
}

function accountUser() {
  return account.status?.user || null;
}

function avatarMarkup(user, className = '') {
  const initial = esc((user?.username || 'S').slice(0, 1).toUpperCase());
  return user?.avatarUrl
    ? `<span class="avatar ${className}" aria-hidden="true"><img src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<span class="avatar ${className}" aria-hidden="true">${initial}</span>`;
}

async function loadAccountStatus() {
  if (!accountApi) return;
  try {
    account.status = await callDesktop(accountApi.status);
    account.loadError = null;
    if (account.status.pendingEmail && !account.status.user) {
      account.view = 'verify';
      account.email = account.status.pendingEmail;
    }
  } catch (error) {
    account.loadError = error;
  }
}

/* ---------- Password and username rules (the desktop app checks them again) ---------- */
function passwordRules(value) {
  return { length: value.length >= 8, letter: /\p{L}/u.test(value), number: /\p{N}/u.test(value) };
}
function passwordChecklist(id) {
  return `<ul class="rule-list" id="${id}" aria-live="polite">${[
    ['length', t('pwRuleLength')],
    ['letter', t('pwRuleLetter')],
    ['number', t('pwRuleNumber')],
    ['match', t('pwRuleMatch')]
  ]
    .map(([rule, text]) => `<li data-rule="${rule}">${icon('check', 'rule-icon')}<span>${esc(text)}</span></li>`)
    .join('')}</ul>`;
}
// Updates the live checklist next to a new-password field without redrawing the form.
function refreshPasswordChecklist(form) {
  const list = form?.querySelector('.rule-list');
  if (!list) return true;
  const password = form.querySelector('[name="password"]')?.value || '';
  const confirm = form.querySelector('[name="confirm"]')?.value || '';
  const rules = { ...passwordRules(password), match: !!password && password === confirm };
  for (const [rule, ok] of Object.entries(rules)) list.querySelector(`[data-rule="${rule}"]`)?.classList.toggle('is-met', ok);
  return Object.values(rules).every(Boolean);
}
const USERNAME_FORMAT = /^[a-z0-9_.]{3,24}$/;
let usernameTimer = 0;
function usernameStatusText(stateName) {
  return { checking: t('usernameChecking'), invalid: t('usernameInvalid'), taken: t('usernameTaken'), free: t('usernameFree'), error: t('usernameUnknown') }[stateName] || t('usernameHint');
}
function refreshUsernameStatus() {
  const hint = document.getElementById('auth-username-status');
  if (!hint) return;
  hint.textContent = usernameStatusText(account.username.state);
  hint.dataset.state = account.username.state;
}
function checkUsernameSoon(raw) {
  const value = raw.trim().toLowerCase();
  account.username = { value, state: !value ? 'idle' : USERNAME_FORMAT.test(value) ? 'checking' : 'invalid' };
  refreshUsernameStatus();
  clearTimeout(usernameTimer);
  if (account.username.state !== 'checking') return;
  usernameTimer = setTimeout(async () => {
    try {
      const result = await callDesktop(accountApi.checkUsername, { username: value });
      if (account.username.value !== value) return;
      account.username.state = !result.valid ? 'invalid' : result.available ? 'free' : 'taken';
    } catch {
      if (account.username.value === value) account.username.state = 'error';
    }
    refreshUsernameStatus();
    refreshSubmit();
  }, 450);
}
// The sign-up and new-password forms can be sent only when every rule is met.
function refreshSubmit() {
  const form = document.querySelector('.auth-card form');
  const submit = form?.querySelector('[type="submit"]');
  if (!submit || account.busy) return;
  let ok = refreshPasswordChecklist(form);
  if (form.id === 'auth-signup') ok = ok && ['free', 'error'].includes(account.username.state);
  submit.disabled = !ok;
}

/* ---------- Sign-in screen ---------- */
function authField(name, label, { type = 'text', autocomplete = '', value = '', hint = '', attrs = '', reveal = false } = {}) {
  const id = `auth-${name}`;
  const input = `<input id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" ${attrs}>`;
  return `<label class="field" for="${id}">${label}${reveal ? `<span class="input-with-action">${input}<button class="icon-btn icon-btn-sm" type="button" data-reveal="${id}" aria-label="${esc(t('showPassword'))}" aria-pressed="false">${icon('eye')}</button></span>` : input}${hint}</label>`;
}
function authForm(id, title, lead, body, submit, footer = '') {
  return `<form class="account-form" id="${id}" novalidate><h1 class="auth-title">${title}</h1>${lead ? `<p class="auth-lead">${lead}</p>` : ''}${account.notice ? `<p class="field-notice" role="status">${esc(account.notice)}</p>` : ''}${account.error ? `<p class="field-error" role="alert">${esc(account.error)}</p>` : ''}${body}<button class="primary-btn auth-submit" type="submit" ${account.busy ? 'disabled' : ''}>${account.busy ? t('working') : submit}</button>${footer ? `<div class="auth-footer">${footer}</div>` : ''}</form>`;
}
// After sign-up Supabase emails a confirmation LINK (not a code). These steps say what to do with it.
function verifySteps() {
  return `<ol class="verify-steps">${['verifyStepOpen', 'verifyStepClick', 'verifyStepReturn'].map(key => `<li>${esc(t(key))}</li>`).join('')}</ol>`;
}

const AUTH_VIEWS = {
  signin: () =>
    authForm(
      'auth-signin',
      t('signInTitle'),
      t('signInLead'),
      `${authField('email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' })}${authField('password', t('password'), { type: 'password', autocomplete: 'current-password', attrs: 'required', reveal: true })}`,
      t('signIn'),
      `<button class="text-link" type="button" data-auth-view="reset">${t('forgotPassword')}</button><span>${t('noAccountYet')} <button class="text-link" type="button" data-auth-view="signup">${t('createAccount')}</button></span>`
    ),
  signup: () =>
    authForm(
      'auth-signup',
      t('signUpTitle'),
      t('signUpLead'),
      `${authField('username', t('username'), { autocomplete: 'username', value: account.username.value, attrs: 'required maxlength="24" autocapitalize="none" spellcheck="false" aria-describedby="auth-username-status"', hint: `<small class="field-hint username-status" id="auth-username-status" data-state="${account.username.state}">${esc(usernameStatusText(account.username.state))}</small>` })}${authField('email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' })}${authField('password', t('password'), { type: 'password', autocomplete: 'new-password', attrs: 'required minlength="8"', reveal: true })}${authField('confirm', t('confirmPassword'), { type: 'password', autocomplete: 'new-password', attrs: 'required' })}${passwordChecklist('signup-rules')}`,
      t('createAccount'),
      `<span>${t('haveAccount')} <button class="text-link" type="button" data-auth-view="signin">${t('signIn')}</button></span>`
    ),
  verify: () =>
    authForm(
      'auth-verify',
      t('verifyTitle'),
      `${esc(t('verifyText'))} <b class="verify-email">${esc(account.email)}</b>`,
      `<div class="verify-mail" aria-hidden="true">${icon('mail')}</div>${verifySteps()}<p class="setting-help">${esc(t('verifySpamNote'))}</p>`,
      t('verifyButton'),
      `<button class="text-link" type="button" data-auth-view="signup">${t('changeEmail')}</button><button class="text-link" type="button" data-auth-view="signin">${t('backToSignIn')}</button>`
    ),
  reset: () =>
    authForm(
      'auth-reset',
      t('resetTitle'),
      t('resetText'),
      authField('email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' }),
      t('resetSend'),
      `<button class="text-link" type="button" data-auth-view="signin">${t('backToSignIn')}</button>`
    ),
  'reset-code': () =>
    authForm(
      'auth-reset-code',
      t('resetTitle'),
      esc(format(t('resetCodeText'), { email: account.email })),
      `${authField('code', t('emailCode'), { autocomplete: 'one-time-code', attrs: 'inputmode="numeric" maxlength="12" required class="code-input"' })}${authField('password', t('newPassword'), { type: 'password', autocomplete: 'new-password', attrs: 'required minlength="8"', reveal: true })}${authField('confirm', t('confirmPassword'), { type: 'password', autocomplete: 'new-password', attrs: 'required' })}${passwordChecklist('reset-rules')}`,
      t('resetSave'),
      `<button class="text-link" type="button" id="auth-reset-again">${t('resendCode')}</button><button class="text-link" type="button" data-auth-view="signin">${t('backToSignIn')}</button>`
    )
};

function authAside() {
  const points = [
    ['library', t('authPointLibrary')],
    ['curseforge', t('authPointExplore')],
    ['inspiration', t('authPointCommunity')]
  ];
  return `<aside class="auth-aside"><div class="auth-brand">${brandMark()}<span class="auth-wordmark">${wordmark()}</span></div><p class="auth-tagline">${t('authTagline')}</p><ul class="auth-points">${points.map(([name, text]) => `<li>${icon(name)}<span>${esc(text)}</span></li>`).join('')}</ul><div class="auth-gem" aria-hidden="true">${brandMark()}</div></aside>`;
}

function authCard() {
  if (!accountApi) return `<div class="auth-message">${icon('warning', 'empty-icon')}<h1 class="auth-title">${mt('desktopOnlyTitle')}</h1><p>${t('desktopOnly')}</p></div>`;
  if (!account.status && !account.loadError) return `<div class="auth-message" role="status">${brandMark()}<p>${t('loading')}</p></div>`;
  if (account.loadError) return `<div class="auth-message" role="alert">${icon('cloud', 'empty-icon')}<h1 class="auth-title">${t('accountLoadFailed')}</h1><p>${esc(errorMessage(account.loadError))}</p><button class="primary-btn" id="auth-retry">${icon('refresh')}<span>${mt('tryAgain')}</span></button></div>`;
  if (!account.status.configured) {
    return `<div class="auth-message">${icon('user', 'empty-icon')}<h1 class="auth-title">${t('accountsUnavailableTitle')}</h1><p>${t('accountsRequiredText')}</p>${state.appInfo.developer ? `<button class="secondary-btn" id="auth-dev-bypass">${t('devContinueWithoutAccount')}</button>` : ''}</div>`;
  }
  return (AUTH_VIEWS[account.view] || AUTH_VIEWS.signin)();
}

// Covers the app with the sign-in screen while nobody is signed in. Returns true while it is shown.
function renderAuthGate() {
  const screen = document.getElementById('auth-screen');
  const shell = document.querySelector('.app-shell');
  const locked = !account.devBypass && !accountUser();
  if (screen) screen.hidden = !locked;
  if (shell) shell.inert = locked;
  document.body.classList.toggle('is-locked', locked);
  if (!locked) {
    if (!account.tourOffered && account.status) {
      account.tourOffered = true;
      setTimeout(maybeStartTour, 300);
    }
    return false;
  }
  applyAppearance(state.appearance);
  document.documentElement.lang = state.lang;
  document.title = `${t('signIn')} · simmerspace`;
  if (!screen) return true;
  const focusedId = document.activeElement?.id;
  screen.innerHTML = `<div class="auth-layout">${authAside()}<main class="auth-main"><div class="auth-card">${authCard()}</div><p class="auth-legal">simmerspace ${esc(APP_VERSION)} · ${t('preBeta')}</p></main></div>`;
  const again = focusedId && document.getElementById(focusedId);
  (again || screen.querySelector('.field-error ~ .field input, .account-form input, .auth-message button'))?.focus({ preventScroll: true });
  refreshSubmit();
  return true;
}

/* ---------- Account page: the player's own profile ---------- */
const PROFILE_POSTS = 12;
async function loadOwnProfile() {
  const user = accountUser();
  const profile = account.profile;
  if (!user || typeof inspirationApi === 'undefined' || !inspirationApi || profile.loading) return;
  profile.loading = true;
  try {
    const [page, info] = await Promise.all([callDesktop(inspirationApi.list, { userId: user.id, limit: PROFILE_POSTS }), callDesktop(inspirationApi.profile, { userId: user.id })]);
    Object.assign(profile, { posts: page.posts, more: !!page.nextBefore, postCount: info.postCount, error: null });
  } catch (error) {
    profile.error = error;
  } finally {
    profile.loading = false;
    profile.loaded = true;
    if (state.page === 'account') render();
  }
}
function longDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(state.lang, { year: 'numeric', month: 'long', day: 'numeric' });
}
function profileTile(post) {
  const label = post.caption || t('postNoCaption');
  return `<div class="profile-tile"><button class="profile-tile-image" data-post-view="${esc(post.id)}" aria-label="${esc(label)}">${post.imageUrl ? `<img src="${esc(post.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="post-missing">${icon('inspiration')}</span>`}<span class="profile-tile-caption">${esc(post.caption || t(`inspCat_${post.category}`))}</span></button><button class="icon-btn icon-btn-sm profile-tile-delete" data-post-delete="${esc(post.id)}" aria-label="${esc(t('postDelete'))}" data-tip="${esc(t('postDelete'))}">${icon('trash')}</button></div>`;
}
function profileStat(value, label, page = '') {
  const inner = `<b>${esc(value)}</b><span>${esc(label)}</span>`;
  return page ? `<button class="profile-stat" data-page="${page}">${inner}</button>` : `<div class="profile-stat">${inner}</div>`;
}
function renderAccount() {
  const user = accountUser();
  if (!user) {
    content.innerHTML = `${pageHeader(t('accountTitle'))}${empty(t('accountsUnavailableTitle'), t('accountsRequiredText'))}`;
    return;
  }
  if (account.profile.userId !== user.id) account.profile = freshProfile(user.id);
  const p = account.profile;
  if (!p.loaded && !p.loading) loadOwnProfile();
  const busy = account.avatarBusy;
  const count = value => (value === null ? '—' : Number(value).toLocaleString(state.lang));
  const since = user.memberSince ? format(t('profileMemberSince'), { date: longDate(user.memberSince) }) : '';
  const hero = `<section class="profile-hero panel"><div class="profile-cover" aria-hidden="true"></div><div class="profile-main"><div class="profile-avatar">${avatarMarkup(user, 'avatar-profile')}${busy ? `<span class="avatar-busy" role="status">${t('working')}</span>` : ''}<button class="profile-avatar-btn" id="avatar-change" aria-label="${esc(t('avatarChange'))}" data-tip="${esc(t('avatarChange'))}" ${busy ? 'disabled' : ''}>${icon('upload')}</button><input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" hidden></div><div class="profile-identity"><div class="profile-name-row"><h1 class="profile-name">@${esc(user.username)}</h1><button class="icon-btn icon-btn-sm profile-rename" id="username-change" aria-label="${esc(t('usernameChange'))}" data-tip="${esc(t('usernameChange'))}">${icon('edit')}</button></div>${since ? `<p class="profile-meta">${icon('sparkle')}<span>${esc(since)}</span></p>` : ''}</div><div class="profile-actions"><button class="primary-btn" id="post-new">${icon('upload')}<span>${t('postNew')}</span></button>${user.avatarUrl ? `<button class="tertiary-btn" id="avatar-remove" ${busy ? 'disabled' : ''}>${t('avatarRemove')}</button>` : ''}</div></div><div class="profile-stats">${profileStat(count(p.postCount), t('profilePosts'))}${profileStat(count(state.collections.length), t('collectionsTitle'), 'collections')}${profileStat(count(state.followingCreators.length), t('profileFollowing'), 'creators')}</div></section>`;
  let posts;
  if (!p.loaded) posts = `<div class="profile-grid">${'<span class="profile-tile skeleton"></span>'.repeat(6)}</div>`;
  else if (p.error) posts = `<div class="empty-state"><b>${t('profilePostsError')}</b><p>${esc(errorMessage(p.error))}</p><button class="secondary-btn" id="profile-retry">${mt('tryAgain')}</button></div>`;
  else if (!p.posts.length) posts = `<div class="empty-state profile-empty">${icon('inspiration', 'empty-icon')}<b>${t('profileNoPosts')}</b><p>${t('profileNoPostsText')}</p></div>`;
  else posts = `<div class="profile-grid">${p.posts.map(profileTile).join('')}</div>${p.more ? `<div class="button-row profile-more"><button class="secondary-btn" data-inspiration-user="${esc(user.id)}">${t('profileSeeAll')}</button></div>` : ''}`;
  const postsPanel = `<section class="panel panel-pad profile-posts"><h2 class="section-title">${icon('inspiration')} ${t('profilePosts')}</h2>${posts}</section>`;
  const accountPanel = `<section class="panel panel-pad profile-side"><h2 class="section-title">${icon('user')} ${t('profileAccount')}</h2><dl class="facts"><div><dt>${t('email')}</dt><dd>${esc(user.email)}</dd></div></dl>${account.status.persistent ? '' : `<p class="setting-help">${t('sessionNotKept')}</p>`}<div class="button-row"><button class="tertiary-btn" id="account-sign-out">${icon('logout')}<span>${t('signOut')}</span></button></div></section>`;
  const feedback = `<section class="panel panel-pad profile-side"><h2 class="section-title">${icon('help')} ${t('feedbackTitle')}</h2><p class="setting-help">${t('feedbackText')}</p><div class="button-row"><button class="secondary-btn" data-open-feedback>${icon('edit')}<span>${t('feedbackOpen')}</span></button></div></section>`;
  content.innerHTML = `<div class="profile-page">${hero}<div class="profile-columns">${postsPanel}<div class="profile-aside">${accountPanel}${feedback}</div></div></div>`;
}

// Changing the username is deliberately a little slow: a dialog, the password, and once every 30 days.
function openUsernameDialog() {
  const user = accountUser();
  if (!user) return;
  const availableAt = user.usernameChangeAvailableAt;
  if (availableAt && Date.parse(availableAt) > Date.now()) {
    openDialog(`${closeButton()}<div class="form-dialog confirm-dialog"><div class="eyebrow">${t('usernameChange')}</div><h2 id="dialog-title">${t('usernameWaitTitle')}</h2><p>${esc(format(t('usernameWaitText'), { date: longDate(availableAt) }))}</p><div class="detail-actions"><button class="secondary-btn" data-close autofocus>${t('close')}</button></div></div>`);
    return;
  }
  openDialog(
    `${closeButton()}<form class="form-dialog account-form" id="username-form" novalidate><div class="eyebrow">${t('usernameChange')}</div><h2 id="dialog-title">${t('usernameChangeTitle')}</h2><p class="setting-help">${t('usernameChangeText')}</p>${authField('new-username', t('usernameNew'), { value: user.username, autocomplete: 'username', attrs: 'maxlength="24" autocapitalize="none" spellcheck="false" required', hint: `<small class="field-hint">${t('usernameHint')}</small>` })}${authField('confirm-password', t('usernameConfirmPassword'), { type: 'password', autocomplete: 'current-password', reveal: true, attrs: 'required' })}<p class="field-error" id="username-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit" id="username-submit">${t('usernameSave')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`
  );
}
async function changeUsername(form) {
  const submit = form.querySelector('#username-submit');
  const error = form.querySelector('#username-error');
  submit.disabled = true;
  error.hidden = true;
  try {
    const result = await callDesktop(accountApi.updateProfile, { username: formValue(form, 'new-username'), password: formValue(form, 'confirm-password') });
    account.status.user = result.user;
    closeDialog();
    toast(t('usernameChanged'));
    render();
  } catch (failure) {
    error.hidden = false;
    error.textContent = failure?.code === 'ACCOUNT_USERNAME_TOO_SOON' && failure.details?.availableAt ? format(t('usernameWaitText'), { date: longDate(failure.details.availableAt) }) : errorMessage(failure);
    submit.disabled = false;
  }
}

/* ---------- Profile menu (the avatar in the top bar) ----------
   Everything about the account is here and on the profile page: there is no separate Account section in Settings. */
let profileMenu = null;
function closeProfileMenu() {
  if (!profileMenu) return;
  profileMenu.remove();
  profileMenu = null;
  document.getElementById('profile-button')?.setAttribute('aria-expanded', 'false');
}
function toggleProfileMenu() {
  if (profileMenu) return closeProfileMenu();
  const user = accountUser();
  const button = document.getElementById('profile-button');
  if (!user || !button) return goTo('account');
  profileMenu = document.createElement('div');
  profileMenu.className = 'profile-menu';
  profileMenu.setAttribute('role', 'menu');
  profileMenu.setAttribute('aria-label', t('profileMenu'));
  const item = (id, iconName, label, attrs = '') => `<button class="profile-menu-item" role="menuitem" ${id ? `id="${id}"` : ''} ${attrs}>${icon(iconName)}<span>${esc(label)}</span></button>`;
  profileMenu.innerHTML = `<div class="profile-menu-head">${avatarMarkup(user)}<div><b>@${esc(user.username)}</b><small>${esc(user.email)}</small></div></div>${item('', 'user', t('profileView'), 'data-page="account"')}${item('username-change', 'edit', t('usernameChange'))}${item('menu-avatar-change', 'upload', t('avatarChange'))}${item('', 'comment', t('feedbackNav'), 'data-settings-section="feedback"')}<hr>${item('account-sign-out', 'logout', t('signOut'), 'data-danger')}`;
  document.body.append(profileMenu);
  const box = button.getBoundingClientRect();
  profileMenu.style.top = `${Math.round(box.bottom + 8)}px`;
  profileMenu.style.right = `${Math.round(window.innerWidth - box.right)}px`;
  button.setAttribute('aria-expanded', 'true');
  profileMenu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown', event => {
  if (profileMenu && !profileMenu.contains(event.target) && !event.target.closest('#profile-button')) closeProfileMenu();
});
document.addEventListener('click', event => {
  if (profileMenu && event.target.closest('.profile-menu [data-page], .profile-menu [data-settings-section]')) setTimeout(closeProfileMenu, 0);
});
document.addEventListener('keydown', event => {
  if (!profileMenu) return;
  if (event.key === 'Escape') {
    closeProfileMenu();
    document.getElementById('profile-button')?.focus();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const items = [...profileMenu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
});

/* ---------- Feedback ---------- */
const FEEDBACK_CATEGORIES = ['suggestion', 'bug_report', 'feature_request', 'donation_feedback', 'other'];
// The same form inside Settings → Feedback (inline) and in a dialog (from the profile or About).
function feedbackFormMarkup({ category = 'suggestion', inline = false } = {}) {
  const user = accountUser();
  const head = inline ? `<p class="setting-help">${t('feedbackDialogText')}</p>` : `<div class="eyebrow">${t('feedbackTitle')}</div><h2 id="dialog-title">${t('feedbackOpen')}</h2><p>${t('feedbackDialogText')}</p>`;
  const actions = inline ? `<button class="primary-btn" type="submit">${icon('comment')}<span>${t('feedbackSend')}</span></button>` : `<button class="primary-btn" type="submit">${t('feedbackSend')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button>`;
  return `<form class="form-dialog ${inline ? 'feedback-inline' : ''}" id="feedback-form" novalidate>${head}<fieldset class="choice-row"><legend>${t('feedbackCategory')}</legend>${FEEDBACK_CATEGORIES.map(
    value => `<label class="choice-chip"><input type="radio" name="feedback-category" value="${value}" ${value === category ? 'checked' : ''}><span>${t(`feedbackCat_${value}`)}</span></label>`
  ).join('')}</fieldset><label class="field" for="feedback-message">${t('feedbackMessage')}<textarea id="feedback-message" maxlength="4000" rows="6" required></textarea></label><label class="field" for="feedback-email">${t('feedbackEmail')}<input id="feedback-email" type="email" autocomplete="email" value="${esc(user?.email || '')}"><small class="field-hint">${t('feedbackEmailHint')}</small></label><p class="field-error" id="feedback-error" role="alert" hidden></p><div class="detail-actions">${actions}</div></form>`;
}
function openFeedbackDialog(category = 'suggestion') {
  openDialog(`${closeButton()}${feedbackFormMarkup({ category })}`);
  document.getElementById('feedback-message')?.focus();
}
async function sendFeedback(form) {
  const submit = form.querySelector('[type="submit"]');
  const error = document.getElementById('feedback-error');
  const message = document.getElementById('feedback-message').value.trim();
  if (!message) {
    error.hidden = false;
    error.textContent = t('feedbackEmpty');
    return;
  }
  submit.disabled = true;
  try {
    await callDesktop(accountApi.sendFeedback, { category: form.querySelector('[name="feedback-category"]:checked')?.value || 'other', message, email: document.getElementById('feedback-email').value.trim() });
    if (form.classList.contains('feedback-inline')) {
      form.reset();
      submit.disabled = false;
    } else closeDialog();
    toast(t('feedbackSent'));
  } catch (failure) {
    error.hidden = false;
    error.textContent = errorMessage(failure);
    submit.disabled = false;
  }
}

/* ---------- Images (avatars and posts) ---------- */
// Resizes in the page so only small files are uploaded. `square` crops the centre (avatars).
async function prepareImage(file, { maxSide, square = false, quality = 0.88 }) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = square ? (bitmap.width - side) / 2 : 0;
  const sy = square ? (bitmap.height - side) / 2 : 0;
  const sw = square ? side : bitmap.width;
  const sh = square ? side : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw Object.assign(new Error('image'), { code: 'IMAGE_TYPE' });
  return { data: new Uint8Array(await blob.arrayBuffer()), type: 'image/webp', width: canvas.width, height: canvas.height };
}

async function changeAvatar(file) {
  if (!file) return;
  account.avatarBusy = true;
  render();
  try {
    const image = await prepareImage(file, { maxSide: 512, square: true });
    const result = await callDesktop(accountApi.uploadAvatar, { data: image.data, type: image.type });
    account.status.user = result.user;
    toast(t('avatarSaved'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    account.avatarBusy = false;
    render();
  }
}

/* ---------- Actions ---------- */
async function accountAction(work) {
  if (account.busy) return;
  account.busy = true;
  account.error = '';
  account.notice = '';
  render();
  try {
    await work();
  } catch (error) {
    account.error = errorMessage(error);
    if (error?.code === 'ACCOUNT_EMAIL_NOT_CONFIRMED') {
      account.view = 'verify';
      account.notice = t('verifyFirst');
      account.error = '';
    }
  } finally {
    account.busy = false;
    render();
  }
}
const formValue = (form, name) => form.querySelector(`[name="${name}"]`)?.value || '';

function signedIn(user) {
  account.status = { ...(account.status || {}), user };
  account.view = 'signin';
  account.username = { value: '', state: 'idle' };
  state.page = 'home';
  toast(format(t('welcomeUser'), { name: user.username }));
}

const ACCOUNT_FORMS = {
  'auth-signin': form =>
    accountAction(async () => {
      account.email = formValue(form, 'email').trim();
      const result = await callDesktop(accountApi.signIn, { email: account.email, password: formValue(form, 'password') });
      signedIn(result.user);
    }),
  'auth-signup': form =>
    accountAction(async () => {
      account.email = formValue(form, 'email').trim();
      if (!refreshPasswordChecklist(form)) throw Object.assign(new Error('weak'), { code: 'ACCOUNT_WEAK_PASSWORD' });
      const result = await callDesktop(accountApi.signUp, { email: account.email, password: formValue(form, 'password'), username: formValue(form, 'username') });
      if (result.needsConfirmation) {
        account.view = 'verify';
        account.notice = '';
      } else if (result.user) signedIn(result.user);
    }),
  'auth-verify': form =>
    accountAction(async () => {
      const result = await callDesktop(accountApi.checkConfirmation, { email: account.email });
      if (result.user) return signedIn(result.user);
      if (result.needsSignIn) {
        account.view = 'signin';
        account.notice = t('verifySignInNow');
      } else account.notice = t('verifyNotYet');
    }),
  'auth-reset': form =>
    accountAction(async () => {
      account.email = formValue(form, 'email').trim();
      await callDesktop(accountApi.requestReset, { email: account.email });
      account.view = 'reset-code';
      account.notice = t('resetSentNotice');
    }),
  'auth-reset-code': form =>
    accountAction(async () => {
      if (!refreshPasswordChecklist(form)) throw Object.assign(new Error('weak'), { code: 'ACCOUNT_WEAK_PASSWORD' });
      const result = await callDesktop(accountApi.completeReset, { email: account.email, code: formValue(form, 'code'), password: formValue(form, 'password') });
      if (result.user) signedIn(result.user);
      else {
        account.view = 'signin';
        account.notice = t('passwordChanged');
      }
    }),
  'username-form': form => changeUsername(form),
  'feedback-form': form => sendFeedback(form)
};

document.addEventListener('submit', event => {
  const form = event.target.closest('form');
  if (!form || !ACCOUNT_FORMS[form.id]) return;
  event.preventDefault();
  ACCOUNT_FORMS[form.id](form);
});
document.addEventListener('input', event => {
  if (event.target.id === 'auth-new-username') {
    const lower = event.target.value.toLowerCase();
    if (lower !== event.target.value) event.target.value = lower;
    return;
  }
  const form = event.target.closest?.('.auth-card form');
  if (!form) return;
  if (event.target.name === 'username') {
    const lower = event.target.value.toLowerCase();
    if (lower !== event.target.value) event.target.value = lower;
    checkUsernameSoon(lower);
  }
  refreshSubmit();
});
document.addEventListener('change', event => {
  if (event.target.id === 'avatar-file') changeAvatar(event.target.files?.[0]);
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.authView) {
    account.view = target.dataset.authView;
    account.error = '';
    account.notice = '';
    return render();
  }
  if (target.dataset.reveal) {
    const input = document.getElementById(target.dataset.reveal);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    target.setAttribute('aria-pressed', String(show));
    target.setAttribute('aria-label', t(show ? 'hidePassword' : 'showPassword'));
    target.innerHTML = icon(show ? 'eyeOff' : 'eye');
    return;
  }
  if (target.hasAttribute('data-open-feedback')) return openFeedbackDialog();
  switch (target.id) {
    case 'auth-retry':
      account.loadError = null;
      render();
      await loadAccountStatus();
      return render();
    case 'auth-dev-bypass':
      account.devBypass = true;
      return render();
    case 'auth-reset-again':
      return accountAction(async () => {
        await callDesktop(accountApi.requestReset, { email: account.email });
        account.notice = t('codeResent');
      });
    case 'avatar-change':
      return document.getElementById('avatar-file')?.click();
    case 'menu-avatar-change':
      closeProfileMenu();
      if (state.page !== 'account') goTo('account');
      return document.getElementById('avatar-file')?.click();
    case 'username-change':
      closeProfileMenu();
      return openUsernameDialog();
    case 'profile-retry':
      account.profile = freshProfile('');
      return render();
    case 'avatar-remove': {
      const ok = await confirmAction({ title: t('avatarRemove'), body: t('avatarRemoveText'), confirmLabel: t('avatarRemove') });
      if (!ok) return;
      account.avatarBusy = true;
      render();
      try {
        account.status.user = (await callDesktop(accountApi.removeAvatar)).user;
      } catch (error) {
        toast(errorMessage(error), 'error');
      } finally {
        account.avatarBusy = false;
        render();
      }
      return;
    }
    case 'account-sign-out': {
      const ok = await confirmAction({ title: t('signOut'), body: t('signOutText'), confirmLabel: t('signOut') });
      if (!ok) return;
      closeProfileMenu();
      return accountAction(async () => {
        await callDesktop(accountApi.signOut);
        // Nothing from the account stays on screen or in memory for the next person at this computer.
        account.profile = freshProfile('');
        if (typeof resetCommunityCache === 'function') resetCommunityCache();
        await loadAccountStatus();
        account.view = 'signin';
        account.notice = t('signedOut');
      });
    }
  }
});
accountApi?.onChange(status => {
  const wasSignedIn = !!accountUser();
  account.status = { ...(account.status || {}), ...status };
  if (wasSignedIn && !status.user) account.notice = t('sessionEnded');
  render();
});
