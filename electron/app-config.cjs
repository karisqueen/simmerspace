/* Integration settings (CurseForge and SimmerSpace accounts), read only in the desktop process.
   Sources, highest priority first:
     1. Environment variables (CURSEFORGE_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ...). When running from
        source (not packaged), a git-ignored .env.local next to package.json fills in variables that are not set.
     2. simmerspace.config.json in the app's user-data folder (local to this PC, never packaged).
     3. electron/public-config.json, bundled with the app. It may hold only PUBLIC values; a CurseForge key
        found there is ignored, because anything packaged with the app can be extracted from it.
   Secrets never reach the page: the renderer only ever receives the redacted summary from describeConfig(). */
const fs = require('node:fs/promises');
const path = require('node:path');

const LOCAL_CONFIG_FILE = 'simmerspace.config.json';
const PUBLIC_CONFIG_FILE = path.join(__dirname, 'public-config.json');
const DEFAULT_CURSEFORGE_BASE_URL = 'https://api.curseforge.com';
const PLACEHOLDER = /^(|your[-_ ].*|<.*>|changeme|xxx+|placeholder)$/i;

async function readJson(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function clean(value, max = 4096) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length <= max && !PLACEHOLDER.test(text) ? text : '';
}

// Only https URLs (or http on this computer, for a local Supabase stack) without credentials in them.
function cleanUrl(value) {
  const text = clean(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(text);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password) return '';
    return url.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Reads KEY=VALUE lines from a dotenv-style file. Only used for a development copy run from source.
async function readEnvFile(file) {
  let text = '';
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

// Supabase secret keys (sb_secret_...) and service_role JWTs bypass row-level security: refuse them.
function publicKey(value) {
  const text = clean(value);
  if (!text || /^sb_secret_/i.test(text)) return '';
  const payload = text.split('.')[1];
  if (payload) {
    try {
      if (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.role === 'service_role') return '';
    } catch {}
  }
  return text;
}

function pick(...values) {
  return values.find(value => value) || '';
}

async function loadAppConfig({ userDataPath, env = process.env, publicConfigFile = PUBLIC_CONFIG_FILE, devEnvFile = '' } = {}) {
  if (devEnvFile) env = { ...(await readEnvFile(devEnvFile)), ...env };
  const localFile = userDataPath ? path.join(userDataPath, LOCAL_CONFIG_FILE) : '';
  const local = localFile ? await readJson(localFile) : {};
  const bundled = await readJson(publicConfigFile);
  const localCf = local.curseforge && typeof local.curseforge === 'object' ? local.curseforge : {};
  const localSb = local.supabase && typeof local.supabase === 'object' ? local.supabase : {};
  const bundledCf = bundled.curseforge && typeof bundled.curseforge === 'object' ? bundled.curseforge : {};
  const bundledSb = bundled.supabase && typeof bundled.supabase === 'object' ? bundled.supabase : {};

  const envKey = clean(env.CURSEFORGE_API_KEY);
  const fileKey = clean(localCf.apiKey);
  const proxyUrl = pick(cleanUrl(env.CURSEFORGE_PROXY_URL), cleanUrl(localCf.proxyUrl), cleanUrl(bundledCf.proxyUrl));
  const gameId = Number(pick(clean(env.CURSEFORGE_GAME_ID), String(localCf.gameId || ''), String(bundledCf.gameId || '')));

  return {
    localFile,
    curseforge: {
      apiKey: pick(envKey, fileKey),
      keySource: envKey ? 'env' : fileKey ? 'file' : '',
      baseUrl: pick(cleanUrl(env.CURSEFORGE_API_BASE_URL), cleanUrl(localCf.baseUrl), DEFAULT_CURSEFORGE_BASE_URL),
      proxyUrl,
      gameId: Number.isInteger(gameId) && gameId > 0 ? gameId : 0,
      ignoredBundledKey: !!clean(bundledCf.apiKey)
    },
    supabase: {
      url: pick(cleanUrl(env.SUPABASE_URL), cleanUrl(localSb.url), cleanUrl(bundledSb.url)),
      // The publishable key is public by design (row-level security protects the data). Never a secret key.
      anonKey: pick(publicKey(env.SUPABASE_PUBLISHABLE_KEY), publicKey(env.SUPABASE_ANON_KEY), publicKey(localSb.publishableKey), publicKey(localSb.anonKey), publicKey(bundledSb.publishableKey), publicKey(bundledSb.anonKey))
    }
  };
}

// What the page (and the developer panel) may see: whether things are set, never the values of secrets.
function describeConfig(config) {
  const cf = config.curseforge;
  let host = '';
  try {
    host = new URL(config.supabase.url).host;
  } catch {}
  return {
    localFile: config.localFile,
    curseforge: {
      configured: !!(cf.apiKey || cf.proxyUrl),
      mode: cf.proxyUrl ? 'proxy' : cf.apiKey ? 'direct' : 'none',
      keySource: cf.keySource,
      keyLength: cf.apiKey ? cf.apiKey.length : 0,
      baseUrl: cf.proxyUrl || cf.baseUrl,
      gameId: cf.gameId || null,
      ignoredBundledKey: cf.ignoredBundledKey
    },
    supabase: { configured: !!(config.supabase.url && config.supabase.anonKey), host }
  };
}

module.exports = { loadAppConfig, describeConfig, cleanUrl, LOCAL_CONFIG_FILE, DEFAULT_CURSEFORGE_BASE_URL };
