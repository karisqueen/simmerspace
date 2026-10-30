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
  resendAt: 0,
  devBypass: false,
  tourOffered: false,
  avatarBusy: false
};

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
function resendButton() {
  const wait = Math.max(0, Math.ceil((account.resendAt - Date.now()) / 1000));
  return `<button class="text-link" type="button" id="auth-resend" ${wait ? 'disabled' : ''}>${wait ? esc(format(t('resendIn'), { seconds: wait })) : t('resendCode')}</button>`;
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
      esc(format(t('verifyText'), { email: account.email })),
      authField('code', t('emailCode'), { autocomplete: 'one-time-code', attrs: 'inputmode="numeric" maxlength="12" required class="code-input"' }),
      t('verifyButton'),
      `${resendButton()}<button class="text-link" type="button" data-auth-view="signup">${t('changeEmail')}</button><button class="text-link" type="button" data-auth-view="signin">${t('backToSignIn')}</button>`
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
  document.title = `${t('signIn')} · SimmerSpace`;
  if (!screen) return true;
  const focusedId = document.activeElement?.id;
  screen.innerHTML = `<div class="auth-layout">${authAside()}<main class="auth-main"><div class="auth-card">${authCard()}</div><p class="auth-legal">SimmerSpace ${esc(APP_VERSION)} · ${t('preBeta')}</p></main></div>`;
  const again = focusedId && document.getElementById(focusedId);
  (again || screen.querySelector('.field-error ~ .field input, .account-form input, .auth-message button'))?.focus({ preventScroll: true });
  refreshSubmit();
  return true;
}

/* ---------- Account page ---------- */
function renderAccount() {
  const user = accountUser();
  const header = pageHeader(t('accountTitle'));
  if (!user) {
    content.innerHTML = `${header}${empty(t('accountsUnavailableTitle'), t('accountsRequiredText'))}`;
    return;
  }
  const profile = `<section class="panel panel-pad profile-panel"><div class="profile-head"><div class="avatar-edit">${avatarMarkup(user, 'avatar-xl')}${account.avatarBusy ? `<span class="avatar-busy" role="status">${t('working')}</span>` : ''}</div><div class="profile-copy"><h2 class="profile-name">@${esc(user.username)}</h2><p class="setting-help">${esc(user.email)}</p><div class="button-row"><button class="secondary-btn small-chip" id="avatar-change" ${account.avatarBusy ? 'disabled' : ''}>${icon('upload')}<span>${t('avatarChange')}</span></button>${user.avatarUrl ? `<button class="tertiary-btn small-chip" id="avatar-remove" ${account.avatarBusy ? 'disabled' : ''}>${t('avatarRemove')}</button>` : ''}<button class="tertiary-btn small-chip" data-inspiration-user="${esc(user.id)}">${icon('inspiration')}<span>${t('myPosts')}</span></button></div><input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" hidden></div></div><form class="account-form inline-form" id="account-profile" novalidate>${authField('profile-username', t('username'), { value: user.username, autocomplete: 'username', attrs: 'maxlength="24" autocapitalize="none" spellcheck="false"', hint: `<small class="field-hint">${t('usernameHint')}</small>` })}<button class="secondary-btn" type="submit" ${account.busy ? 'disabled' : ''}>${t('saveUsername')}</button></form>${account.error ? `<p class="field-error" role="alert">${esc(account.error)}</p>` : ''}${account.status.persistent ? '' : `<p class="setting-help">${t('sessionNotKept')}</p>`}<div class="button-row"><button class="tertiary-btn" id="account-sign-out">${icon('logout')}<span>${t('signOut')}</span></button></div></section>`;
  const feedback = `<section class="panel panel-pad"><h2 class="section-title">${icon('help')} ${t('feedbackTitle')}</h2><p class="setting-help">${t('feedbackText')}</p><div class="button-row"><button class="primary-btn" data-open-feedback>${icon('edit')}<span>${t('feedbackOpen')}</span></button></div></section>`;
  content.innerHTML = `${header}<div class="account-layout">${profile}${feedback}</div>`;
}

function accountSettingsSection() {
  const user = accountUser();
  if (!user) return `<p class="setting-help">${t('accountsRequiredText')}</p>`;
  return `<div class="setting-row"><span class="setting-label">${t('status')}</span><div class="inline-row">${avatarMarkup(user)}<span class="status-pill status-installed">${esc(format(t('signedInAs'), { name: `@${user.username}` }))}</span></div></div><div class="button-row"><button class="secondary-btn" data-page="account">${t('manageAccount')}</button><button class="tertiary-btn" data-open-feedback>${t('feedbackOpen')}</button></div>`;
}

/* ---------- Feedback ---------- */
const FEEDBACK_CATEGORIES = ['suggestion', 'bug_report', 'feature_request', 'donation_feedback', 'other'];
function openFeedbackDialog(category = 'suggestion') {
  const user = accountUser();
  openDialog(
    `${closeButton()}<form class="form-dialog" id="feedback-form" novalidate><div class="eyebrow">${t('feedbackTitle')}</div><h2 id="dialog-title">${t('feedbackOpen')}</h2><p>${t('feedbackDialogText')}</p><fieldset class="choice-row"><legend>${t('feedbackCategory')}</legend>${FEEDBACK_CATEGORIES.map(
      value => `<label class="choice-chip"><input type="radio" name="feedback-category" value="${value}" ${value === category ? 'checked' : ''}><span>${t(`feedbackCat_${value}`)}</span></label>`
    ).join('')}</fieldset><label class="field" for="feedback-message">${t('feedbackMessage')}<textarea id="feedback-message" maxlength="4000" rows="6" required></textarea></label><label class="field" for="feedback-email">${t('feedbackEmail')}<input id="feedback-email" type="email" autocomplete="email" value="${esc(user?.email || '')}"><small class="field-hint">${t('feedbackEmailHint')}</small></label><p class="field-error" id="feedback-error" role="alert" hidden></p><div class="detail-actions"><button class="primary-btn" type="submit">${t('feedbackSend')}</button><button class="secondary-btn" type="button" data-close>${t('cancel')}</button></div></form>`
  );
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
    closeDialog();
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
        account.resendAt = Date.now() + 60000;
        account.notice = t('accountCreatedCheckEmail');
      } else if (result.user) signedIn(result.user);
    }),
  'auth-verify': form =>
    accountAction(async () => {
      const result = await callDesktop(accountApi.verifyEmail, { email: account.email, code: formValue(form, 'code') });
      await loadAccountStatus();
      if (result.alreadyConfirmed) toast(t('alreadyConfirmed'));
      if (accountUser()) signedIn(accountUser());
      else {
        account.view = 'signin';
        account.notice = result.user ? '' : t('emailConfirmed');
      }
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
  'account-profile': form =>
    accountAction(async () => {
      const result = await callDesktop(accountApi.updateProfile, { username: formValue(form, 'profile-username') });
      account.status.user = result.user;
      toast(t('profileSaved'));
    }),
  'feedback-form': form => sendFeedback(form)
};

document.addEventListener('submit', event => {
  const form = event.target.closest('form');
  if (!form || !ACCOUNT_FORMS[form.id]) return;
  event.preventDefault();
  ACCOUNT_FORMS[form.id](form);
});
document.addEventListener('input', event => {
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
let resendTimer = 0;
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
    case 'auth-resend':
      return accountAction(async () => {
        const result = await callDesktop(accountApi.resendConfirmation, { email: account.email });
        if (result.user) {
          signedIn(result.user);
          return toast(t('alreadyConfirmed'));
        }
        account.resendAt = Date.now() + 60000;
        account.notice = t('codeResent');
        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
          const button = document.getElementById('auth-resend');
          if (!button || Date.now() >= account.resendAt) clearInterval(resendTimer);
          if (button) button.outerHTML = resendButton();
        }, 1000);
      });
    case 'auth-reset-again':
      return accountAction(async () => {
        await callDesktop(accountApi.requestReset, { email: account.email });
        account.notice = t('codeResent');
      });
    case 'avatar-change':
      return document.getElementById('avatar-file')?.click();
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
      return accountAction(async () => {
        await callDesktop(accountApi.signOut);
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
