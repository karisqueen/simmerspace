/* SimmerSpace account page: optional sign-up, sign-in, password reset and sync. Guest mode is the default and
   everything keeps working without an account. Requests go through the desktop app (electron/account-service.cjs). */
const accountApi = desktop?.account || null;
const account = {
  status: null, // { configured, user, persistent, pendingEmail }
  view: 'signin', // signin | signup | verify | reset | reset-code
  busy: false,
  error: '',
  email: '',
  syncing: false,
  lastSync: Number(safeRead('last-sync', 0)) || 0
};

function accountUser() {
  return account.status?.user || null;
}

async function loadAccountStatus() {
  if (!accountApi) return;
  try {
    account.status = await callDesktop(accountApi.status);
    if (account.status.pendingEmail && !account.status.user) {
      account.view = 'verify';
      account.email = account.status.pendingEmail;
    }
  } catch (error) {
    account.status = { configured: true, user: null, error: errorMessage(error) };
  }
}

function field(id, label, { type = 'text', autocomplete = '', value = '', hint = '', attrs = '' } = {}) {
  return `<label class="field" for="${id}">${label}<input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" ${attrs}>${hint ? `<small class="field-hint">${hint}</small>` : ''}</label>`;
}
function accountForm(id, title, body, submit, footer = '') {
  return `<form class="account-form" id="${id}" novalidate><h2 class="section-title">${title}</h2>${account.error ? `<p class="field-error" role="alert">${esc(account.error)}</p>` : ''}${body}<button class="primary-btn" type="submit" ${account.busy ? 'disabled' : ''}>${account.busy ? t('working') : submit}</button>${footer}</form>`;
}

function signedOutView() {
  const tabs = ['signin', 'signup'].includes(account.view)
    ? `<div class="segmented segmented-wide" role="tablist" aria-label="${esc(t('accountTitle'))}"><button class="segment ${account.view === 'signin' ? 'is-selected' : ''}" role="tab" aria-selected="${account.view === 'signin'}" data-account-view="signin">${t('signIn')}</button><button class="segment ${account.view === 'signup' ? 'is-selected' : ''}" role="tab" aria-selected="${account.view === 'signup'}" data-account-view="signup">${t('createAccount')}</button></div>`
    : '';
  const forms = {
    signin: () =>
      accountForm(
        'account-signin',
        t('signIn'),
        `${field('account-email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' })}${field('account-password', t('password'), { type: 'password', autocomplete: 'current-password', attrs: 'required' })}`,
        t('signIn'),
        `<button class="text-link" type="button" data-account-view="reset">${t('forgotPassword')}</button>`
      ),
    signup: () =>
      accountForm(
        'account-signup',
        t('createAccount'),
        `${field('account-name', t('displayName'), { autocomplete: 'nickname', attrs: 'maxlength="60"' })}${field('account-email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' })}${field('account-password', t('password'), { type: 'password', autocomplete: 'new-password', hint: t('passwordHint'), attrs: 'required minlength="8"' })}`,
        t('createAccount')
      ),
    verify: () =>
      accountForm(
        'account-verify',
        t('verifyTitle'),
        `<p class="setting-help">${esc(format(t('verifyText'), { email: account.email }))}</p>${field('account-code', t('emailCode'), { autocomplete: 'one-time-code', attrs: 'inputmode="numeric" maxlength="12" required' })}`,
        t('verifyButton'),
        `<button class="text-link" type="button" data-account-view="signin">${t('verifyLater')}</button>`
      ),
    reset: () =>
      accountForm(
        'account-reset',
        t('resetTitle'),
        `<p class="setting-help">${t('resetText')}</p>${field('account-email', t('email'), { type: 'email', autocomplete: 'email', value: account.email, attrs: 'required' })}`,
        t('resetSend'),
        `<button class="text-link" type="button" data-account-view="signin">${t('backToSignIn')}</button>`
      ),
    'reset-code': () =>
      accountForm(
        'account-reset-code',
        t('resetTitle'),
        `<p class="setting-help">${esc(format(t('resetCodeText'), { email: account.email }))}</p>${field('account-code', t('emailCode'), { autocomplete: 'one-time-code', attrs: 'inputmode="numeric" maxlength="12" required' })}${field('account-password', t('newPassword'), { type: 'password', autocomplete: 'new-password', hint: t('passwordHint'), attrs: 'required minlength="8"' })}`,
        t('resetSave'),
        `<button class="text-link" type="button" data-account-view="signin">${t('backToSignIn')}</button>`
      )
  };
  return `<div class="account-layout"><section class="panel panel-pad">${tabs}${(forms[account.view] || forms.signin)()}</section><aside class="panel panel-pad account-aside"><h2 class="section-title">${icon('cloud')} ${t('guestModeTitle')}</h2><p class="setting-help">${t('guestModeText')}</p><h3 class="subheading">${t('syncWhatTitle')}</h3><ul class="plain-list"><li>${t('syncWhatYes')}</li><li>${t('syncWhatNo')}</li></ul><p class="setting-help">${t('accountSeparate')}</p></aside></div>`;
}

function signedInView(user) {
  return `<div class="account-layout"><section class="panel panel-pad"><div class="profile-head"><span class="avatar avatar-lg" aria-hidden="true">${esc(user.displayName.slice(0, 1).toUpperCase())}</span><div><h2 class="section-title">${esc(user.displayName)}</h2><p class="setting-help">${esc(user.email)}${user.emailConfirmed ? '' : ` · ${t('emailNotConfirmed')}`}</p></div></div><form class="account-form inline-form" id="account-profile" novalidate>${field('account-name', t('displayName'), { value: user.displayName, autocomplete: 'nickname', attrs: 'maxlength="60"' })}<button class="secondary-btn" type="submit" ${account.busy ? 'disabled' : ''}>${t('save')}</button></form>${account.error ? `<p class="field-error" role="alert">${esc(account.error)}</p>` : ''}${account.status.persistent ? '' : `<p class="setting-help">${t('sessionNotKept')}</p>`}<div class="button-row"><button class="tertiary-btn" id="account-sign-out">${icon('logout')}<span>${t('signOut')}</span></button></div></section><section class="panel panel-pad"><h2 class="section-title">${icon('sync')} ${t('syncTitle')}</h2><p class="setting-help">${t('syncText')}</p><ul class="plain-list"><li>${t('syncWhatYes')}</li><li>${t('syncWhatNo')}</li></ul><div class="button-row"><button class="primary-btn" id="account-sync" ${account.syncing ? 'disabled' : ''}>${icon('sync')}<span>${account.syncing ? t('syncing') : t('syncNow')}</span></button><span class="muted-note" role="status">${account.lastSync ? esc(format(t('lastSynced'), { date: new Date(account.lastSync).toLocaleString(state.lang) })) : t('neverSynced')}</span></div></section></div>`;
}

function renderAccount() {
  const header = pageHeader(t('accountTitle'), { meta: accountUser() ? t('accountSignedInShort') : t('guestLocal') });
  if (!accountApi) {
    content.innerHTML = `${header}${empty(mt('desktopOnlyTitle'), t('desktopOnly'))}`;
    return;
  }
  if (!account.status) {
    content.innerHTML = `${header}<p role="status">${t('loading')}</p>`;
    loadAccountStatus().then(render);
    return;
  }
  if (!account.status.configured) {
    content.innerHTML = `${header}<div class="empty-state setup-state">${icon('user', 'empty-icon')}<b>${t('accountsUnavailableTitle')}</b><p>${t('accountsUnavailableText')}</p></div>`;
    return;
  }
  const user = accountUser();
  content.innerHTML = `${header}${user ? signedInView(user) : signedOutView()}`;
}

function accountSettingsSection() {
  if (!accountApi) return `<p class="setting-help">${t('desktopOnly')}</p>`;
  const user = accountUser();
  const configured = account.status?.configured ?? state.integrations?.supabase?.configured;
  return `<div class="setting-row"><span class="setting-label">${t('status')}</span><div class="inline-row">${
    user ? `<span class="status-pill status-installed">${esc(format(t('signedInAs'), { name: user.displayName }))}</span>` : `<span class="status-pill status-saved">${t('guest')}</span>`
  }</div></div><p class="setting-help">${configured ? t('accountSettingsText') : t('accountsUnavailableText')}</p><div class="button-row">${configured ? `<button class="secondary-btn" data-page="account">${user ? t('manageAccount') : t('signInOrCreate')}</button>` : ''}</div>`;
}

/* ---------- Actions ---------- */
async function accountAction(work) {
  if (account.busy) return;
  account.busy = true;
  account.error = '';
  render();
  try {
    await work();
  } catch (error) {
    account.error = errorMessage(error);
  } finally {
    account.busy = false;
    render();
    (document.querySelector('.field-error') ? document.querySelector('.account-form input') : null)?.focus();
  }
}
const value = id => document.getElementById(id)?.value || '';

const ACCOUNT_FORMS = {
  'account-signin': () =>
    accountAction(async () => {
      account.email = value('account-email').trim();
      await callDesktop(accountApi.signIn, { email: account.email, password: value('account-password') });
      await loadAccountStatus();
      toast(t('signedIn'));
      syncAccount({ quiet: true });
    }),
  'account-signup': () =>
    accountAction(async () => {
      account.email = value('account-email').trim();
      const result = await callDesktop(accountApi.signUp, { email: account.email, password: value('account-password'), name: value('account-name') });
      if (result.needsConfirmation) account.view = 'verify';
      await loadAccountStatus();
      if (!result.needsConfirmation) toast(t('accountCreated'));
    }),
  'account-verify': () =>
    accountAction(async () => {
      await callDesktop(accountApi.verifyEmail, { email: account.email, code: value('account-code') });
      await loadAccountStatus();
      account.view = 'signin';
      toast(t('emailConfirmed'));
      if (accountUser()) syncAccount({ quiet: true });
    }),
  'account-reset': () =>
    accountAction(async () => {
      account.email = value('account-email').trim();
      await callDesktop(accountApi.requestReset, { email: account.email });
      account.view = 'reset-code';
    }),
  'account-reset-code': () =>
    accountAction(async () => {
      await callDesktop(accountApi.completeReset, { email: account.email, code: value('account-code'), password: value('account-password') });
      await loadAccountStatus();
      account.view = 'signin';
      toast(t('passwordChanged'));
    }),
  'account-profile': () =>
    accountAction(async () => {
      await callDesktop(accountApi.updateProfile, { name: value('account-name') });
      account.status.user = { ...account.status.user, displayName: value('account-name').trim() };
      toast(t('profileSaved'));
    })
};

// Sync: download, merge (newer copy of each collection wins; nothing is deleted), then upload the result.
async function syncAccount({ quiet = false } = {}) {
  if (!accountUser() || account.syncing) return;
  account.syncing = true;
  render();
  try {
    const remote = await callDesktop(accountApi.pull);
    state.collections = normalizeCollections(mergeCollections(state.collections, remote.collections));
    state.favorites = [...new Set([...state.favorites, ...remote.favorites.filter(id => typeof id === 'string')])];
    const localUpdated = Number(safeRead('preferences-updated', 0)) || 0;
    if (remote.preferences && remote.settingsUpdatedAt > localUpdated) {
      state.appearance = normalizeAppearance(remote.preferences.appearance);
      if (remote.preferences.lang === 'es' || remote.preferences.lang === 'en') state.lang = remote.preferences.lang;
      safeWrite('appearance', state.appearance);
      safeSet('language', state.lang);
    }
    persist();
    await callDesktop(accountApi.push, {
      preferences: { appearance: state.appearance, lang: state.lang },
      favorites: state.favorites,
      collections: state.collections.map((c, position) => ({ ...c, position }))
    });
    safeWrite('preferences-updated', Date.now());
    account.lastSync = Date.now();
    safeWrite('last-sync', account.lastSync);
    if (!quiet) toast(t('syncDone'));
  } catch (error) {
    toast(`${t('syncFailed')} ${errorMessage(error)}`, 'error');
  } finally {
    account.syncing = false;
    render();
  }
}

document.addEventListener('submit', event => {
  const form = event.target.closest('.account-form');
  if (!form) return;
  event.preventDefault();
  ACCOUNT_FORMS[form.id]?.();
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.accountView) {
    account.view = target.dataset.accountView;
    account.error = '';
    render();
    document.querySelector('.account-form input')?.focus();
    return;
  }
  if (target.id === 'account-sync') return syncAccount();
  if (target.id === 'account-sign-out') {
    const ok = await confirmAction({ title: t('signOut'), body: t('signOutText'), confirmLabel: t('signOut') });
    if (!ok) return;
    return accountAction(async () => {
      await callDesktop(accountApi.signOut);
      await loadAccountStatus();
      toast(t('signedOut'));
    });
  }
});
accountApi?.onChange(status => {
  account.status = { ...(account.status || {}), ...status };
  render();
});
