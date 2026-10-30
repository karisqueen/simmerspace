/* SimmerSpace accounts and the community features (profiles, avatars, Inspiration posts, feedback).
   Uses Supabase through the official supabase-js client, in the desktop process only, with the project's
   publishable key: every table and storage bucket is protected by row-level security (see supabase/migrations).
   Passwords go straight to Supabase and are never stored by SimmerSpace. The session is kept in the user-data
   folder, encrypted with the operating system's protection (Electron safeStorage); when that is not available
   it is kept in memory only and the player signs in again next time. */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');

const SESSION_FILE = 'account-session.json';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.]{3,24}$/;
const MIN_PASSWORD = 8;
const AVATAR_BUCKET = 'avatars';
const POST_BUCKET = 'inspiration';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const POST_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const POST_TYPES = { ...AVATAR_TYPES, 'image/gif': 'gif' };
const POST_CATEGORIES = ['cas', 'build', 'gameplay', 'story', 'other'];
const FEEDBACK_CATEGORIES = ['suggestion', 'bug_report', 'feature_request', 'donation_feedback', 'other'];
const PAGE_SIZE = 24;
const SIGNED_URL_SECONDS = 60 * 60;

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

function createSessionStorage({ userDataPath, safeStorage }) {
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
    await fs.writeFile(temp, JSON.stringify({ version: 1, data }), 'utf8');
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

function createAccountService({ getConfig, userDataPath, safeStorage, createClient, onChange = () => {} }) {
  const storage = createSessionStorage({ userDataPath, safeStorage });
  let client = null;
  let clientKey = '';
  let pendingEmail = '';
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

  function publicUser(sb, user, profile) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      emailConfirmed: !!(user.email_confirmed_at || user.confirmed_at),
      username: profile?.username || user.user_metadata?.username || (user.email || '').split('@')[0],
      avatarUrl: avatarUrl(sb, profile?.avatar_url),
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
      if (row) profileCache = { id: row.id, username: row.username, avatar_url: row.avatar_url || '' };
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
      const { data, error } = await sb.auth.signUp({ email: address, password: secret, options: { data: { username: name } } });
      if (error) throw error;
      // With "confirm email" on, Supabase answers an existing address with a user that has no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new AppError('ACCOUNT_EXISTS', 'There is already an account with this email.');
      pendingEmail = data.session ? '' : address;
      return { needsConfirmation: !data.session, user: data.session ? publicUser(sb, data.session.user, await loadProfile(sb, data.session.user, { refresh: true })) : null };
    });
  }

  async function verifyEmail({ email, code } = {}) {
    const address = checkEmail(email || pendingEmail);
    const token = checkCode(code);
    return run(async sb => {
      const { data, error } = await sb.auth.verifyOtp({ email: address, token, type: 'email' });
      if (error) throw error;
      pendingEmail = '';
      return { user: data.user ? publicUser(sb, data.user, await loadProfile(sb, data.user, { refresh: true })) : null };
    });
  }

  async function resendConfirmation({ email } = {}) {
    const address = checkEmail(email || pendingEmail);
    return run(async sb => {
      const { error } = await sb.auth.resend({ type: 'signup', email: address });
      if (error) throw error;
      return { sent: true };
    });
  }

  async function signIn({ email, password } = {}) {
    const address = checkEmail(email);
    if (typeof password !== 'string' || !password) throw new AppError('ACCOUNT_INVALID_CREDENTIALS', 'Enter your password.');
    return run(async sb => {
      const { data, error } = await sb.auth.signInWithPassword({ email: address, password });
      if (error) {
        if (error.code === 'email_not_confirmed') pendingEmail = address;
        throw error;
      }
      pendingEmail = '';
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

  async function updateProfile({ username } = {}) {
    const name = checkUsernameFormat(username);
    return run(async sb => {
      const user = await requireUser(sb);
      await loadProfile(sb, user);
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

  /* ---------- Inspiration ---------- */
  async function signedUrls(sb, paths) {
    if (!paths.length) return new Map();
    const { data, error } = await sb.storage.from(POST_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    return new Map((data || []).filter(item => item.signedUrl && !item.error).map(item => [item.path, item.signedUrl]));
  }

  // One page of the community feed, newest first. `before` is the created_at of the last post already shown.
  async function listPosts({ before, category, userId, limit } = {}) {
    const size = Number.isInteger(limit) && limit > 0 && limit <= 48 ? limit : PAGE_SIZE;
    return run(async sb => {
      const me = await requireUser(sb);
      let query = sb.from('inspiration_posts').select('id, user_id, image_path, caption, category, created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(size + 1);
      if (POST_CATEGORIES.includes(category)) query = query.eq('category', category);
      if (typeof userId === 'string' && /^[0-9a-f-]{36}$/i.test(userId)) query = query.eq('user_id', userId);
      if (typeof before === 'string' && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []).slice(0, size);
      const ids = [...new Set(rows.map(row => row.user_id))];
      const [authors, urls] = await Promise.all([
        ids.length ? sb.from('profiles').select('id, username, avatar_url').in('id', ids) : Promise.resolve({ data: [] }),
        signedUrls(sb, rows.map(row => row.image_path))
      ]);
      if (authors.error) throw authors.error;
      const byId = new Map((authors.data || []).map(row => [row.id, row]));
      return {
        posts: rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          author: { username: byId.get(row.user_id)?.username || '', avatarUrl: avatarUrl(sb, byId.get(row.user_id)?.avatar_url) },
          imageUrl: urls.get(row.image_path) || '',
          caption: row.caption || '',
          category: POST_CATEGORIES.includes(row.category) ? row.category : 'other',
          createdAt: row.created_at,
          own: row.user_id === me.id
        })),
        nextBefore: (data || []).length > size ? rows.at(-1).created_at : null
      };
    });
  }

  async function getProfile({ userId } = {}) {
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) throw new AppError('INVALID_INPUT', 'A profile id was expected.');
    return run(async sb => {
      await requireUser(sb);
      const [profile, posts] = await Promise.all([
        sb.from('profiles').select('id, username, avatar_url, created_at').eq('id', userId).maybeSingle(),
        sb.from('inspiration_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      ]);
      if (profile.error) throw profile.error;
      if (!profile.data) throw new AppError('NOT_FOUND', 'This profile does not exist.');
      return { id: profile.data.id, username: profile.data.username || '', avatarUrl: avatarUrl(sb, profile.data.avatar_url), createdAt: profile.data.created_at, postCount: posts.count || 0 };
    });
  }

  // Images go to inspiration/<user id>/<random id>.<ext>. If saving the post fails, the image is removed again.
  async function createPost(input = {}) {
    const image = checkImage(input, POST_TYPES, POST_MAX_BYTES);
    const caption = cleanText(input.caption, 500);
    const category = POST_CATEGORIES.includes(input.category) ? input.category : 'other';
    return run(async sb => {
      const user = await requireUser(sb);
      const objectPath = `${user.id}/${crypto.randomUUID()}.${image.ext}`;
      const bucket = sb.storage.from(POST_BUCKET);
      const uploaded = await bucket.upload(objectPath, image.body, { contentType: image.type, upsert: false, cacheControl: '86400' });
      if (uploaded.error) throw uploaded.error;
      const saved = await sb.from('inspiration_posts').insert({ user_id: user.id, image_path: objectPath, caption, category }).select('id').single();
      if (saved.error) {
        await bucket.remove([objectPath]);
        throw saved.error;
      }
      return { id: saved.data.id };
    });
  }

  // Deletes the post and its image. Row-level security only lets the author do this.
  async function deletePost({ id } = {}) {
    if (typeof id !== 'string' && !Number.isInteger(id)) throw new AppError('INVALID_INPUT', 'A post id was expected.');
    return run(async sb => {
      const user = await requireUser(sb);
      const found = await sb.from('inspiration_posts').select('id, image_path').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (found.error) throw found.error;
      if (!found.data) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the author can delete this post.');
      const removed = await sb.from('inspiration_posts').delete().eq('id', id).eq('user_id', user.id);
      if (removed.error) throw removed.error;
      const image = await sb.storage.from(POST_BUCKET).remove([found.data.image_path]);
      return { deleted: true, imageRemoved: !image.error };
    });
  }

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

  async function proxyToken() {
    const { anonKey } = (await getConfig()).supabase;
    if (!anonKey) return null;
    try {
      const { data } = await (await supabase()).auth.getSession();
      return { bearer: data?.session?.access_token || anonKey, apikey: anonKey };
    } catch {
      return { bearer: anonKey, apikey: anonKey };
    }
  }

  return {
    status,
    checkUsername,
    signUp,
    verifyEmail,
    resendConfirmation,
    signIn,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    listPosts,
    getProfile,
    createPost,
    deletePost,
    sendFeedback,
    proxyToken
  };
}

module.exports = { createAccountService, createSessionStorage, accountError, passwordProblems, MIN_PASSWORD, POST_CATEGORIES, FEEDBACK_CATEGORIES };
