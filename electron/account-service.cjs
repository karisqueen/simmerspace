/* SimmerSpace accounts and the community features (profiles, avatars, Inspiration posts, feedback).
   Uses Supabase through the official supabase-js client, in the desktop process only, with the project's
   publishable key: every table and storage bucket is protected by row-level security (see supabase/migrations).
   Passwords go straight to Supabase and are never stored by SimmerSpace. The session is kept in the user-data
   folder, encrypted with the operating system's protection (Electron safeStorage); when that is not available
   it is kept in memory only and the player signs in again next time. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');
const { createCommunityService } = require('./community-service.cjs');

const SESSION_FILE = 'account-session.json';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.]{3,24}$/;
const MIN_PASSWORD = 8;
const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const POST_CATEGORIES = ['cas', 'build', 'gameplay', 'story', 'other'];
const FEEDBACK_CATEGORIES = ['suggestion', 'bug_report', 'feature_request', 'donation_feedback', 'other'];
const USERNAME_CHANGE_DAYS = 30;

// Supabase error codes (https://supabase.com/docs/guides/auth/debugging/error-codes) mapped to our own.
const AUTH_CODES = {
  invalid_credentials: 'ACCOUNT_INVALID_CREDENTIALS',
  email_not_confirmed: 'ACCOUNT_EMAIL_NOT_CONFIRMED',
  user_already_exists: 'ACCOUNT_EXISTS',
  email_exists: 'ACCOUNT_EXISTS',
  weak_password: 'ACCOUNT_WEAK_PASSWORD',
  over_email_send_rate_limit: 'ACCOUNT_RATE_LIMITED',
  over_request_rate_limit: 'ACCOUNT_RATE_LIMITED',
  otp_expired: 'ACCOUNT_CODE_INVALID',
  signup_disabled: 'ACCOUNT_SIGNUP_DISABLED',
  email_address_invalid: 'ACCOUNT_EMAIL_INVALID',
  same_password: 'ACCOUNT_SAME_PASSWORD',
  // Database (PostgREST) codes.
  23505: 'ACCOUNT_USERNAME_TAKEN',
  42501: 'ACCOUNT_FORBIDDEN',
  23514: 'INVALID_INPUT'
};

function accountError(error) {
  if (error instanceof AppError) return error;
  // Raised by the profiles trigger (supabase/migrations/20261030120000_username_changes.sql); the hint is when a
  // new change is allowed.
  if (error?.code === 'SS030') return new AppError('ACCOUNT_USERNAME_TOO_SOON', 'The username was changed less than 30 days ago.', { availableAt: Date.parse(error.hint) ? error.hint : null });
  const status = Number(error?.status || error?.statusCode);
  const code = AUTH_CODES[error?.code] || (status === 429 ? 'ACCOUNT_RATE_LIMITED' : status === 413 ? 'IMAGE_TOO_LARGE' : status === 415 ? 'IMAGE_TYPE' : '');
  if (code) return new AppError(code, 'The account request was not accepted.');
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || /fetch failed|network|ENOTFOUND|ECONNRE/i.test(error?.message || '')) {
    return new AppError('ACCOUNT_OFFLINE', 'Could not reach the account service.');
  }
  return new AppError('ACCOUNT_FAILED', 'The account service could not complete the request.');
}

function checkEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new AppError('ACCOUNT_EMAIL_INVALID', 'Enter a valid email address.');
  return email;
}
// At least 8 characters, with at least one letter and one number.
function passwordProblems(value) {
  const text = typeof value === 'string' ? value : '';
  return { length: text.length >= MIN_PASSWORD && text.length <= 128, letter: /\p{L}/u.test(text), number: /\p{N}/u.test(text) };
}
function checkPassword(value) {
  const rules = passwordProblems(value);
  if (!rules.length || !rules.letter || !rules.number) throw new AppError('ACCOUNT_WEAK_PASSWORD', `Use at least ${MIN_PASSWORD} characters with letters and numbers.`);
  return value;
}
function checkCode(value) {
  const code = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (!/^\d{6,10}$/.test(code)) throw new AppError('ACCOUNT_CODE_INVALID', 'Enter the code from the email.');
  return code;
}
function checkUsernameFormat(value) {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!USERNAME.test(name)) throw new AppError('ACCOUNT_USERNAME_INVALID', 'Use 3 to 24 letters, numbers, dots or underscores.');
  return name;
}
function checkImage(input, types, maxBytes) {
  const data = input?.data;
  if (!ArrayBuffer.isView(data) || !data.byteLength) throw new AppError('INVALID_INPUT', 'An image was expected.');
  const ext = types[input.type];
  if (!ext) throw new AppError('IMAGE_TYPE', 'This image type is not supported.');
  if (data.byteLength > maxBytes) throw new AppError('IMAGE_TOO_LARGE', 'The image is too large.', { maxBytes });
  return { body: Buffer.from(data.buffer, data.byteOffset, data.byteLength), type: input.type, ext };
}
function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
}

// The saved session belongs to one copy of the app: `installId` names it (in the packaged app, a hash of the
// app version and where its .exe is). A session saved by another copy or version is discarded, so deleting
// the app and downloading a new one asks to sign in again instead of reusing the old session.
function createSessionStorage({ userDataPath, safeStorage, installId = '' }) {
  const memory = new Map();
  const file = () => path.join(userDataPath(), SESSION_FILE);
  const canEncrypt = () => {
    try {
      return !!safeStorage?.isEncryptionAvailable?.();
    } catch {
      return false;
    }
  };
  let loaded = null;

  async function load() {
    if (loaded) return loaded;
    loaded = (async () => {
      if (!canEncrypt()) return;
      try {
        const stored = JSON.parse(await fs.readFile(file(), 'utf8'));
        if (stored?.version !== 1 || typeof stored.data !== 'string') return;
        if ((stored.install || '') !== installId) {
          await fs.unlink(file()).catch(() => {});
          return;
        }
        const values = JSON.parse(safeStorage.decryptString(Buffer.from(stored.data, 'base64')));
        for (const [key, value] of Object.entries(values || {})) if (typeof value === 'string') memory.set(key, value);
      } catch {}
    })();
    return loaded;
  }
  async function save() {
    if (!canEncrypt()) return;
    const target = file();
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (!memory.size) {
      await fs.unlink(target).catch(() => {});
      return;
    }
    const data = safeStorage.encryptString(JSON.stringify(Object.fromEntries(memory))).toString('base64');
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ version: 1, install: installId, data }), 'utf8');
    await fs.rename(temp, target);
  }
  return {
    persistent: canEncrypt,
    adapter: {
      getItem: async key => {
        await load();
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem: async (key, value) => {
        await load();
        memory.set(key, String(value));
        await save();
      },
      removeItem: async key => {
        await load();
        memory.delete(key);
        await save();
      }
    }
  };
}

// Where the confirmation link in the sign-up email lands: a page on the project site that says the account is ready and
// the player can go back to the app. It must be listed under Authentication > URL Configuration in Supabase.
const EMAIL_CONFIRMED_URL = 'https://karisqueen.github.io/simmerspace/cuenta-confirmada.html';

function createAccountService({ getConfig, userDataPath, safeStorage, installId = '', createClient, onChange = () => {} }) {
  const storage = createSessionStorage({ userDataPath, safeStorage, installId });
  let client = null;
  let clientKey = '';
  let pendingEmail = '';
  // Password of the sign-up waiting for its confirmation link, kept only in memory, so that once the link was opened
  // the app can sign in without asking for it again.
  let pendingPassword = '';
  let profileCache = null; // { id, username, avatar_url } of the signed-in user

  async function supabase() {
    const { url, anonKey } = (await getConfig()).supabase;
    if (!url || !anonKey) throw new AppError('ACCOUNT_NOT_CONFIGURED', 'Accounts are not set up in this copy of SimmerSpace.');
    const key = `${url}|${anonKey}`;
    if (!client || clientKey !== key) {
      const factory = createClient || require('@supabase/supabase-js').createClient;
      client = factory(url, anonKey, {
        auth: { storage: storage.adapter, storageKey: 'simmerspace-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' }
      });
      clientKey = key;
      client.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') profileCache = null;
        setTimeout(() => status().then(onChange, () => {}), 0);
      });
    }
    return client;
  }

  async function run(action) {
    try {
      return await action(await supabase());
    } catch (error) {
      throw accountError(error);
    }
  }

  async function sessionUser(sb) {
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }
  async function requireUser(sb) {
    const user = await sessionUser(sb);
    if (!user) throw new AppError('ACCOUNT_SIGNED_OUT', 'Sign in first.');
    return user;
  }

  function avatarUrl(sb, value) {
    if (!value) return '';
    if (/^https:\/\//i.test(value)) return value;
    return sb.storage.from(AVATAR_BUCKET).getPublicUrl(value).data?.publicUrl || '';
  }

  // When the next username change is allowed, or null when it is allowed now.
  function usernameChangeAvailableAt(profile) {
    const changed = Date.parse(profile?.username_changed_at || '');
    if (!changed) return null;
    const next = changed + USERNAME_CHANGE_DAYS * 24 * 60 * 60 * 1000;
    return next > Date.now() ? new Date(next).toISOString() : null;
  }

  function publicUser(sb, user, profile) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      emailConfirmed: !!(user.email_confirmed_at || user.confirmed_at),
      username: profile?.username || user.user_metadata?.username || (user.email || '').split('@')[0],
      avatarUrl: avatarUrl(sb, profile?.avatar_url),
      memberSince: profile?.created_at || user.created_at || null,
      usernameChangeAvailableAt: usernameChangeAvailableAt(profile),
      profileMissing: !profile
    };
  }

  // The signed-in user's profile, created if it is missing (ensure_my_profile in the migration). When offline the
  // last known profile, or the sign-up username, is used instead.
  async function loadProfile(sb, user, { refresh = false } = {}) {
    if (!refresh && profileCache?.id === user.id) return profileCache;
    try {
      const { data, error } = await sb.rpc('ensure_my_profile');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        // Older databases have no username_changed_at yet; then there is simply no limit to show.
        const extra = await sb.from('profiles').select('username_changed_at').eq('id', user.id).maybeSingle();
        profileCache = { id: row.id, username: row.username, avatar_url: row.avatar_url || '', created_at: row.created_at || null, username_changed_at: extra.error ? null : extra.data?.username_changed_at || null };
      }
    } catch {
      if (profileCache?.id !== user.id) profileCache = null;
    }
    return profileCache?.id === user.id ? profileCache : null;
  }

  async function status() {
    const { url, anonKey } = (await getConfig()).supabase;
    if (!url || !anonKey) return { configured: false, user: null, persistent: storage.persistent(), pendingEmail: '' };
    try {
      const sb = await supabase();
      const user = await sessionUser(sb);
      return { configured: true, user: user ? publicUser(sb, user, await loadProfile(sb, user)) : null, persistent: storage.persistent(), pendingEmail };
    } catch (error) {
      throw accountError(error);
    }
  }

  async function checkUsername({ username } = {}) {
    let name;
    try {
      name = checkUsernameFormat(username);
    } catch {
      return { valid: false, available: false };
    }
    return run(async sb => {
      const { data, error } = await sb.rpc('username_available', { name });
      if (error) throw error;
      return { valid: true, available: data === true };
    });
  }

  async function signUp({ email, password, username } = {}) {
    const address = checkEmail(email);
    const secret = checkPassword(password);
    const name = checkUsernameFormat(username);
    return run(async sb => {
      const free = await sb.rpc('username_available', { name });
      if (!free.error && free.data === false) throw new AppError('ACCOUNT_USERNAME_TAKEN', 'That username is taken.');
      const { data, error } = await sb.auth.signUp({ email: address, password: secret, options: { data: { username: name }, emailRedirectTo: EMAIL_CONFIRMED_URL } });
      if (error) throw error;
      // With "confirm email" on, Supabase answers an existing address with a user that has no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new AppError('ACCOUNT_EXISTS', 'There is already an account with this email.');
      pendingEmail = data.session ? '' : address;
      pendingPassword = data.session ? '' : secret;
      return { needsConfirmation: !data.session, user: data.session ? publicUser(sb, data.session.user, await loadProfile(sb, data.session.user, { refresh: true })) : null };
    });
  }

  // Signs in with the pending sign-up when its email is already confirmed. Returns the user, or null.
  async function signInIfConfirmed(sb, address) {
    if (!pendingPassword || address !== pendingEmail) return null;
    const { data, error } = await sb.auth.signInWithPassword({ email: address, password: pendingPassword });
    if (error || !data?.user) return null;
    pendingEmail = '';
    pendingPassword = '';
    return publicUser(sb, data.user, await loadProfile(sb, data.user, { refresh: true }));
  }

  // Supabase confirms the email through the link in the message, in the browser; the app cannot see that happen.
  // "I confirmed my email" asks again: it signs in with the sign-up typed in this session, or, when the app was
  // closed in between (the password is never stored), it asks for a normal sign-in.
  async function checkConfirmation({ email } = {}) {
    const address = checkEmail(email || pendingEmail);
    return run(async sb => {
      if (!pendingPassword || address !== pendingEmail) return { confirmed: false, needsSignIn: true };
      const user = await signInIfConfirmed(sb, address);
      return user ? { confirmed: true, user } : { confirmed: false, needsSignIn: false };
    });
  }

  async function signIn({ email, password } = {}) {
    const address = checkEmail(email);
    if (typeof password !== 'string' || !password) throw new AppError('ACCOUNT_INVALID_CREDENTIALS', 'Enter your password.');
    return run(async sb => {
      const { data, error } = await sb.auth.signInWithPassword({ email: address, password });
      if (error) {
        if (error.code === 'email_not_confirmed') {
          pendingEmail = address;
          pendingPassword = password;
        }
        throw error;
      }
      pendingEmail = '';
      pendingPassword = '';
      return { user: publicUser(sb, data.user, await loadProfile(sb, data.user, { refresh: true })) };
    });
  }

  async function signOut() {
    return run(async sb => {
      const { error } = await sb.auth.signOut({ scope: 'local' });
      if (error) throw error;
      profileCache = null;
      return { signedOut: true };
    });
  }

  async function requestPasswordReset({ email } = {}) {
    const address = checkEmail(email);
    return run(async sb => {
      const { error } = await sb.auth.resetPasswordForEmail(address);
      if (error) throw error;
      return { sent: true };
    });
  }

  async function completePasswordReset({ email, code, password } = {}) {
    const address = checkEmail(email);
    const token = checkCode(code);
    const secret = checkPassword(password);
    return run(async sb => {
      const verified = await sb.auth.verifyOtp({ email: address, token, type: 'recovery' });
      if (verified.error) throw verified.error;
      const { error } = await sb.auth.updateUser({ password: secret });
      if (error) throw error;
      const user = verified.data?.user;
      return { user: user ? publicUser(sb, user, await loadProfile(sb, user, { refresh: true })) : null };
    });
  }

  // Changing the username asks for the password again and is allowed once every 30 days (the database trigger
  // enforces the limit too).
  async function updateProfile({ username, password } = {}) {
    const name = checkUsernameFormat(username);
    if (typeof password !== 'string' || !password) throw new AppError('ACCOUNT_PASSWORD_REQUIRED', 'Enter your password to change the username.');
    return run(async sb => {
      const user = await requireUser(sb);
      const profile = await loadProfile(sb, user, { refresh: true });
      if (profile?.username === name) throw new AppError('ACCOUNT_USERNAME_SAME', 'That is already your username.');
      const availableAt = usernameChangeAvailableAt(profile);
      if (availableAt) throw new AppError('ACCOUNT_USERNAME_TOO_SOON', 'The username was changed less than 30 days ago.', { availableAt });
      const confirmed = await sb.auth.signInWithPassword({ email: user.email, password });
      if (confirmed.error) throw confirmed.error.code === 'invalid_credentials' ? new AppError('ACCOUNT_WRONG_PASSWORD', 'The password is not correct.') : confirmed.error;
      const { error } = await sb.from('profiles').update({ username: name }).eq('id', user.id);
      if (error) throw error;
      return { user: publicUser(sb, user, await loadProfile(sb, user, { refresh: true })) };
    });
  }

  // Avatars live at avatars/<user id>/avatar-<time>.<ext>; older files in that folder are removed afterwards.
  async function uploadAvatar(input = {}) {
    const image = checkImage(input, AVATAR_TYPES, AVATAR_MAX_BYTES);
    return run(async sb => {
      const user = await requireUser(sb);
      const objectPath = `${user.id}/avatar-${Date.now()}.${image.ext}`;
      const bucket = sb.storage.from(AVATAR_BUCKET);
      const uploaded = await bucket.upload(objectPath, image.body, { contentType: image.type, upsert: true, cacheControl: '3600' });
      if (uploaded.error) throw uploaded.error;
      const url = bucket.getPublicUrl(objectPath).data?.publicUrl || '';
      const saved = await sb.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (saved.error) {
        await bucket.remove([objectPath]);
        throw saved.error;
      }
      const listed = await bucket.list(user.id, { limit: 100 });
      const old = (listed.data || []).map(file => `${user.id}/${file.name}`).filter(name => name !== objectPath);
      if (old.length) await bucket.remove(old);
      return { user: publicUser(sb, user, await loadProfile(sb, user, { refresh: true })) };
    });
  }

  async function removeAvatar() {
    return run(async sb => {
      const user = await requireUser(sb);
      const saved = await sb.from('profiles').update({ avatar_url: null }).eq('id', user.id);
      if (saved.error) throw saved.error;
      const bucket = sb.storage.from(AVATAR_BUCKET);
      const listed = await bucket.list(user.id, { limit: 100 });
      const files = (listed.data || []).map(file => `${user.id}/${file.name}`);
      if (files.length) await bucket.remove(files);
      return { user: publicUser(sb, user, await loadProfile(sb, user, { refresh: true })) };
    });
  }

  /* ---------- Inspiration (community-service.cjs) ---------- */
  const community = createCommunityService({ run, requireUser, avatarUrl });

  /* ---------- Feedback ---------- */
  async function sendFeedback({ category, message, email } = {}) {
    const text = cleanText(message, 4000);
    if (!text) throw new AppError('INVALID_INPUT', 'Write a message first.');
    const kind = FEEDBACK_CATEGORIES.includes(category) ? category : 'other';
    const contact = typeof email === 'string' && email.trim() ? checkEmail(email) : null;
    return run(async sb => {
      const user = await requireUser(sb);
      const { error } = await sb.from('feedback').insert({ user_id: user.id, category: kind, message: text, email: contact });
      if (error) throw error;
      return { sent: true };
    });
  }

  /* ---------- Account deletion ----------
     The request and its 60-minute schedule live in the database; a backend worker carries it out, whether or not
     this app is open (see supabase/migrations/20261101000000_maintenance_0122.sql). */
  const missingFeature = error => error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01' || error?.code === '42883';
  function deletionView(row) {
    return row ? { status: row.status, scheduledFor: row.scheduled_for, requestedAt: row.requested_at } : { status: 'none', scheduledFor: null, requestedAt: null };
  }
  async function deletionStatus() {
    return run(async sb => {
      const user = await requireUser(sb);
      const { data, error } = await sb.from('account_deletions').select('status, scheduled_for, requested_at').eq('user_id', user.id).in('status', ['pending', 'processing', 'failed']).maybeSingle();
      if (error) {
        if (missingFeature(error)) return { status: 'unavailable', scheduledFor: null, requestedAt: null };
        throw error;
      }
      return deletionView(data);
    });
  }
  async function requestDeletion() {
    return run(async sb => {
      await requireUser(sb);
      const { data, error } = await sb.rpc('request_account_deletion');
      if (error) throw missingFeature(error) ? new AppError('ACCOUNT_DELETION_UNAVAILABLE', 'Account deletion is not available yet.') : error;
      return deletionView(Array.isArray(data) ? data[0] : data);
    });
  }
  async function cancelDeletion() {
    return run(async sb => {
      await requireUser(sb);
      const { data, error } = await sb.rpc('cancel_account_deletion');
      if (error) throw error;
      if (data !== true) throw new AppError('ACCOUNT_DELETION_TOO_LATE', 'The deletion has already started.');
      return deletionView(null);
    });
  }

  /* ---------- Creator index ----------
     One page of the creators table the backend keeps up to date. Returns null when the table is not there yet. */
  const CREATOR_ORDER = { az: ['name_key', true], popular: ['total_downloads', false], uploaded: ['last_created_at', false], updated: ['last_updated_at', false] };
  async function listCreators({ query = '', sort = 'popular', style = 'all', page = 1, pageSize = 12 } = {}) {
    const sb = await supabase();
    const user = await sessionUser(sb);
    if (!user) return null;
    const start = (page - 1) * pageSize;
    let request = sb.from('cf_creators').select('id, name, url, avatar_url, project_count, total_downloads, last_created_at, last_updated_at, categories, style, top_projects, indexed_at', { count: 'exact' });
    if (query) request = request.ilike('name_key', `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`);
    if (style !== 'all') request = style === 'unknown' ? request.eq('style', 'unknown') : request.in('style', [style, 'both']);
    const [column, ascending] = CREATOR_ORDER[sort] || CREATOR_ORDER.popular;
    // The id breaks ties, so no creator appears on two pages.
    const { data, count, error } = await request.order(column, { ascending, nullsFirst: false }).order('id', { ascending: true }).range(start, start + pageSize - 1);
    if (error) return null;
    return {
      total: count || 0,
      updatedAt: data?.[0]?.indexed_at || '',
      creators: (data || []).map(row => ({ id: Number(row.id), name: row.name, url: row.url || '', avatarUrl: row.avatar_url || '', projectCount: row.project_count, downloads: Number(row.total_downloads) || 0, lastCreatedAt: row.last_created_at || '', lastUpdatedAt: row.last_updated_at || '', categories: row.categories || [], style: row.style || 'unknown', projects: Array.isArray(row.top_projects) ? row.top_projects : [] }))
    };
  }

  async function proxyToken() {
    const { anonKey } = (await getConfig()).supabase;
    if (!anonKey) return null;
    // The CurseForge proxy only answers signed-in users, so without a session there is nothing to send.
    try {
      const { data } = await (await supabase()).auth.getSession();
      const bearer = data?.session?.access_token;
      return bearer ? { bearer, apikey: anonKey } : null;
    } catch {
      return null;
    }
  }

  return {
    status,
    checkUsername,
    signUp,
    checkConfirmation,
    signIn,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    ...community,
    sendFeedback,
    deletionStatus,
    requestDeletion,
    cancelDeletion,
    listCreators,
    proxyToken
  };
}

module.exports = { createAccountService, EMAIL_CONFIRMED_URL, createSessionStorage, accountError, passwordProblems, MIN_PASSWORD, POST_CATEGORIES, FEEDBACK_CATEGORIES };
