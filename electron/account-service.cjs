/* SimmerSpace accounts (optional). Uses Supabase Auth through the official supabase-js client, in the desktop
   process only. Passwords go straight to Supabase and are never stored by SimmerSpace. The session is kept in
   the user-data folder, encrypted with the operating system's protection (Electron safeStorage); when that is
   not available the session is kept in memory only and the player signs in again next time.
   Synced data lives in tables protected by row-level security (see supabase/migrations). */
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');

const SESSION_FILE = 'account-session.json';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MIN_PASSWORD = 8;

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
  same_password: 'ACCOUNT_SAME_PASSWORD'
};

function accountError(error) {
  if (error instanceof AppError) return error;
  const code = AUTH_CODES[error?.code] || (error?.status === 429 ? 'ACCOUNT_RATE_LIMITED' : '');
  if (code) return new AppError(code, 'The account request was not accepted.');
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || /fetch failed|network/i.test(error?.message || '')) {
    return new AppError('ACCOUNT_OFFLINE', 'Could not reach the account service.');
  }
  return new AppError('ACCOUNT_FAILED', 'The account service could not complete the request.');
}

function checkEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new AppError('ACCOUNT_EMAIL_INVALID', 'Enter a valid email address.');
  return email;
}
function checkPassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD || value.length > 128) throw new AppError('ACCOUNT_WEAK_PASSWORD', `Use at least ${MIN_PASSWORD} characters.`);
  return value;
}
function checkCode(value) {
  const code = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (!/^\d{6,10}$/.test(code)) throw new AppError('ACCOUNT_CODE_INVALID', 'Enter the code from the email.');
  return code;
}
function displayName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 60) : '';
}

// Only well-formed values leave this computer.
function cleanCollections(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 500).flatMap((item, index) => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.name !== 'string') return [];
    const updated = Number(item.updated);
    return [
      {
        client_id: item.id,
        name: item.name.trim().slice(0, 80) || 'Collection',
        color: HEX_COLOR.test(item.color || '') ? item.color.toLowerCase() : null,
        position: Number.isInteger(item.position) ? item.position : index,
        items: (Array.isArray(item.items) ? item.items : []).filter(id => typeof id === 'string' && id.length <= 120).slice(0, 2000),
        updated_at: new Date(Number.isFinite(updated) && updated > 0 ? updated : Date.now()).toISOString()
      }
    ];
  });
}
function cleanPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  return json.length <= 20000 ? JSON.parse(json) : {};
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
      client.auth.onAuthStateChange(() => {
        setTimeout(() => status().then(onChange, () => {}), 0);
      });
    }
    return client;
  }

  async function currentUser() {
    const { data } = await (await supabase()).auth.getSession();
    return data?.session?.user || null;
  }

  function publicUser(user, profile) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      emailConfirmed: !!(user.email_confirmed_at || user.confirmed_at),
      displayName: displayName(profile?.display_name) || displayName(user.user_metadata?.display_name) || (user.email || '').split('@')[0]
    };
  }

  async function status() {
    const { url, anonKey } = (await getConfig()).supabase;
    if (!url || !anonKey) return { configured: false, user: null, persistent: storage.persistent(), pendingEmail: '' };
    try {
      const user = await currentUser();
      return { configured: true, user: publicUser(user), persistent: storage.persistent(), pendingEmail };
    } catch (error) {
      throw accountError(error);
    }
  }

  async function run(action) {
    try {
      return await action(await supabase());
    } catch (error) {
      throw accountError(error);
    }
  }

  async function signUp({ email, password, name } = {}) {
    const address = checkEmail(email);
    const secret = checkPassword(password);
    return run(async sb => {
      const { data, error } = await sb.auth.signUp({ email: address, password: secret, options: { data: { display_name: displayName(name) } } });
      if (error) throw error;
      pendingEmail = data.session ? '' : address;
      return { needsConfirmation: !data.session, user: publicUser(data.session?.user || null) };
    });
  }

  async function verifyEmail({ email, code } = {}) {
    const address = checkEmail(email || pendingEmail);
    const token = checkCode(code);
    return run(async sb => {
      const { data, error } = await sb.auth.verifyOtp({ email: address, token, type: 'email' });
      if (error) throw error;
      pendingEmail = '';
      return { user: publicUser(data.user) };
    });
  }

  async function signIn({ email, password } = {}) {
    const address = checkEmail(email);
    if (typeof password !== 'string' || !password) throw new AppError('ACCOUNT_INVALID_CREDENTIALS', 'Enter your password.');
    return run(async sb => {
      const { data, error } = await sb.auth.signInWithPassword({ email: address, password });
      if (error) throw error;
      pendingEmail = '';
      return { user: publicUser(data.user) };
    });
  }

  async function signOut() {
    return run(async sb => {
      const { error } = await sb.auth.signOut({ scope: 'local' });
      if (error) throw error;
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
      return { user: publicUser(verified.data.user) };
    });
  }

  async function requireUser(sb) {
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user;
    if (!user) throw new AppError('ACCOUNT_SIGNED_OUT', 'Sign in to sync.');
    return user;
  }

  async function updateProfile({ name } = {}) {
    const value = displayName(name);
    if (!value) throw new AppError('INVALID_INPUT', 'Enter a display name.');
    return run(async sb => {
      const user = await requireUser(sb);
      const { error } = await sb.from('profiles').update({ display_name: value }).eq('id', user.id);
      if (error) throw error;
      return { user: publicUser(user, { display_name: value }) };
    });
  }

  // Downloads everything this account has synced. Row-level security returns only the signed-in user's rows.
  async function pullData() {
    return run(async sb => {
      const user = await requireUser(sb);
      const [profile, settings, collections] = await Promise.all([
        sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
        sb.from('user_settings').select('preferences, favorites, updated_at').eq('user_id', user.id).maybeSingle(),
        sb.from('collections').select('client_id, name, color, position, items, updated_at').eq('user_id', user.id).order('position')
      ]);
      for (const result of [profile, settings, collections]) if (result.error) throw result.error;
      return {
        user: publicUser(user, profile.data),
        preferences: settings.data?.preferences || null,
        favorites: Array.isArray(settings.data?.favorites) ? settings.data.favorites : [],
        settingsUpdatedAt: settings.data?.updated_at ? Date.parse(settings.data.updated_at) : 0,
        collections: (collections.data || []).map(row => ({
          id: row.client_id,
          name: row.name,
          color: row.color || '',
          position: row.position,
          items: Array.isArray(row.items) ? row.items : [],
          updated: Date.parse(row.updated_at) || 0
        }))
      };
    });
  }

  async function pushData({ preferences, favorites, collections } = {}) {
    return run(async sb => {
      const user = await requireUser(sb);
      const rows = cleanCollections(collections).map(row => ({ ...row, user_id: user.id }));
      const settings = await sb.from('user_settings').upsert(
        {
          user_id: user.id,
          preferences: cleanPreferences(preferences),
          favorites: (Array.isArray(favorites) ? favorites : []).filter(id => typeof id === 'string' && id.length <= 120).slice(0, 5000),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );
      if (settings.error) throw settings.error;
      if (rows.length) {
        const saved = await sb.from('collections').upsert(rows, { onConflict: 'user_id,client_id' });
        if (saved.error) throw saved.error;
      }
      return { collections: rows.length };
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

  return { status, signUp, verifyEmail, signIn, signOut, requestPasswordReset, completePasswordReset, updateProfile, pullData, pushData, proxyToken };
}

module.exports = { createAccountService, createSessionStorage, cleanCollections, accountError, MIN_PASSWORD };
