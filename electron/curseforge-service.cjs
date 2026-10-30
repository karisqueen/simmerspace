/* CurseForge integration, running only in the desktop process so the API key never reaches the page.
   Uses the official REST API (https://docs.curseforge.com/rest-api/): base https://api.curseforge.com,
   the key sent as the `x-api-key` header, pages of at most 50 results and index + pageSize <= 10,000.
   Files are installed only when CurseForge returns a downloadUrl for them (authors can turn third-party
   distribution off); otherwise the player is sent to the mod's CurseForge page. */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');
const { readZip } = require('./zip-reader.cjs');

const SIMS4_SLUG = 'sims4';
const MAX_PAGE_SIZE = 50;
const MAX_RESULT_WINDOW = 10000;
const SORT_FIELDS = new Set([1, 2, 3, 4, 5, 6, 7, 8]); // Featured, Popularity, LastUpdated, Name, Author, TotalDownloads, Category, GameVersion
const HASH_ALGOS = { 1: 'sha1', 2: 'md5' };
const MOD_EXTENSIONS = new Set(['.package', '.ts4script']);
const DOWNLOAD_EXTENSIONS = new Set(['.package', '.ts4script', '.zip']);
const MAX_DOWNLOAD_BYTES = 1024 ** 3;
const REQUEST_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 300;
const MAX_CONCURRENT = 4;
const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function hostAllowed(url, suffixes) {
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password) return false;
    const host = target.hostname.toLowerCase();
    return suffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}
const isImageUrl = url => hostAllowed(url, ['forgecdn.net']);
const isCurseForgePage = url => hostAllowed(url, ['curseforge.com']);
const isDownloadUrl = url => hostAllowed(url, ['forgecdn.net', 'curseforge.com']);

function int(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value, max = 500) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Mod descriptions arrive as HTML. The page shows plain text only, so no remote markup is ever rendered.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : ' ';
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20000);
}

function summarizeFile(file) {
  if (!file || typeof file !== 'object') return null;
  return {
    id: Number(file.id) || 0,
    modId: Number(file.modId) || 0,
    displayName: text(file.displayName, 300) || text(file.fileName, 300),
    fileName: text(file.fileName, 300),
    fileDate: text(file.fileDate, 40),
    fileLength: Number(file.fileLength) || 0,
    releaseType: Number(file.releaseType) || 0,
    gameVersions: Array.isArray(file.gameVersions) ? file.gameVersions.filter(v => typeof v === 'string').slice(0, 20) : [],
    downloadAllowed: typeof file.downloadUrl === 'string' && !!file.downloadUrl && file.isAvailable !== false
  };
}

function summarizeMod(mod) {
  if (!mod || typeof mod !== 'object') return null;
  const latestFiles = (Array.isArray(mod.latestFiles) ? mod.latestFiles : []).map(summarizeFile).filter(Boolean);
  latestFiles.sort((a, b) => String(b.fileDate).localeCompare(String(a.fileDate)));
  const website = mod.links?.websiteUrl;
  return {
    id: Number(mod.id) || 0,
    name: text(mod.name, 200),
    slug: text(mod.slug, 200),
    summary: text(mod.summary, 600),
    authors: (Array.isArray(mod.authors) ? mod.authors : []).slice(0, 8).map(author => ({
      id: Number(author?.id) || 0,
      name: text(author?.name, 120),
      url: isCurseForgePage(author?.url) ? author.url : ''
    })),
    logo: isImageUrl(mod.logo?.thumbnailUrl) ? mod.logo.thumbnailUrl : '',
    screenshots: (Array.isArray(mod.screenshots) ? mod.screenshots : [])
      .filter(shot => isImageUrl(shot?.thumbnailUrl))
      .slice(0, 6)
      .map(shot => ({ thumbnailUrl: shot.thumbnailUrl, title: text(shot.title, 200) })),
    websiteUrl: isCurseForgePage(website) ? website : '',
    downloadCount: Number(mod.downloadCount) || 0,
    dateModified: text(mod.dateModified, 40),
    classId: Number(mod.classId) || 0,
    categories: (Array.isArray(mod.categories) ? mod.categories : []).slice(0, 12).map(category => ({ id: Number(category?.id) || 0, name: text(category?.name, 120) })),
    allowModDistribution: mod.allowModDistribution !== false,
    mainFileId: Number(mod.mainFileId) || 0,
    gameVersions: [...new Set(latestFiles.flatMap(file => file.gameVersions))].slice(0, 12),
    latestFiles: latestFiles.slice(0, 5)
  };
}

// Newest release file (falls back to newest of any kind) from a mod's latestFiles.
function newestFile(mod) {
  const files = (Array.isArray(mod?.latestFiles) ? mod.latestFiles : []).filter(file => file && file.isAvailable !== false);
  const pool = files.some(file => file.releaseType === 1) ? files.filter(file => file.releaseType === 1) : files;
  return pool.sort((a, b) => String(b.fileDate).localeCompare(String(a.fileDate)))[0] || null;
}

function folderNameForMod(name) {
  const cleaned = String(name || '')
    .replace(INVALID_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return `CurseForge - ${cleaned || 'Mod'}`;
}

function cfError(code, message, details) {
  return new AppError(code, message, details);
}

// Error codes used by the 0.9.0 search API (kept for code and tests written against it).
const LEGACY_CODES = {
  CF_NOT_CONFIGURED: 'CURSEFORGE_NOT_CONFIGURED',
  CF_TIMEOUT: 'CURSEFORGE_TIMEOUT',
  CF_OFFLINE: 'CURSEFORGE_UNAVAILABLE',
  CF_UNAUTHORIZED: 'CURSEFORGE_KEY_REJECTED',
  CF_RATE_LIMITED: 'CURSEFORGE_RATE_LIMITED',
  CF_GAME_UNAVAILABLE: 'CURSEFORGE_GAME_UNAVAILABLE',
  CF_BAD_RESPONSE: 'CURSEFORGE_INVALID_RESPONSE',
  CF_NOT_FOUND: 'CURSEFORGE_REQUEST_FAILED',
  CF_BAD_REQUEST: 'CURSEFORGE_REQUEST_FAILED',
  CF_SERVER: 'CURSEFORGE_REQUEST_FAILED'
};
const SEARCH_EMPTY = 'CURSEFORGE_SEARCH_EMPTY';
const DOWNLOAD_UNAVAILABLE = 'CURSEFORGE_DOWNLOAD_UNAVAILABLE';

function createCurseForgeService({
  getApiKey,
  getConfig = () => ({ curseforge: { apiKey: String(getApiKey?.() || '').trim(), baseUrl: 'https://api.curseforge.com', proxyUrl: '', gameId: 0 } }),
  getProxyToken = async () => '',
  fetchImpl = globalThis.fetch,
  now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  userDataPath,
  getModsRoot,
  moveNoOverwrite,
  trashItem = async () => {},
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  const cache = new Map();
  let gameId = 0;
  let gameName = '';
  let blockedUntil = 0;
  let active = 0;
  const queue = [];
  const stats = { requests: 0, failures: 0, rateLimited: 0, lastStatus: null, lastError: '', lastAt: 0 };
  let installsWrite = Promise.resolve();
  const installsFile = () => path.join(userDataPath(), 'curseforge-installs.json');

  async function slot() {
    if (active < MAX_CONCURRENT) {
      active++;
      return;
    }
    await new Promise(resolve => queue.push(resolve));
    active++;
  }
  function release() {
    active--;
    queue.shift()?.();
  }

  async function connection() {
    const config = (await getConfig()).curseforge;
    if (config.proxyUrl) {
      const token = await getProxyToken();
      if (!token) throw cfError('CF_NOT_CONFIGURED', 'The CurseForge proxy needs SimmerSpace account settings.');
      return { base: config.proxyUrl, headers: { Authorization: `Bearer ${token.bearer}`, apikey: token.apikey } };
    }
    if (!config.apiKey) throw cfError('CF_NOT_CONFIGURED', 'CurseForge is not set up on this computer.');
    return { base: config.baseUrl, headers: { 'x-api-key': config.apiKey }, gameId: config.gameId };
  }

  async function fetchWithTimeout(url, options, limitMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limitMs);
    try {
      return await fetchImpl(url, { ...options, cache: 'no-store', signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw cfError('CF_TIMEOUT', 'CurseForge took too long to answer.');
      throw cfError('CF_OFFLINE', 'Could not reach CurseForge. Check your internet connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  function retryAfterSeconds(response) {
    const header = response.headers?.get?.('retry-after');
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 3600);
    const date = Date.parse(header || '');
    if (Number.isFinite(date)) return Math.min(Math.max(1, Math.ceil((date - now()) / 1000)), 3600);
    return 30;
  }

  // Every API call goes through here: one place for the key header, timeouts, rate limits and errors.
  async function request(method, apiPath, { query = {}, body, useCache = method === 'GET' } = {}) {
    const remaining = Math.ceil((blockedUntil - now()) / 1000);
    if (remaining > 0) throw cfError('CF_RATE_LIMITED', 'CurseForge asked SimmerSpace to slow down.', { retryAfter: remaining });
    const { base, headers } = await connection();
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    const url = `${base}${apiPath}${search.size ? `?${search}` : ''}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const cacheKey = `${method} ${url} ${payload || ''}`;
    const hit = useCache && cache.get(cacheKey);
    if (hit && hit.expires > now()) return hit.value;

    for (let attempt = 0; ; attempt++) {
      await slot();
      let response;
      try {
        stats.requests++;
        response = await fetchWithTimeout(
          url,
          { method, headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: payload },
          timeoutMs
        );
      } catch (error) {
        stats.failures++;
        stats.lastError = error.code;
        stats.lastAt = now();
        throw error;
      } finally {
        release();
      }
      stats.lastStatus = response.status;
      stats.lastAt = now();
      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch {
          stats.lastError = 'CF_BAD_RESPONSE';
          throw cfError('CF_BAD_RESPONSE', 'CurseForge sent an answer SimmerSpace could not read.');
        }
        if (useCache) {
          if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
          cache.set(cacheKey, { value: data, expires: now() + CACHE_TTL_MS });
        }
        stats.lastError = '';
        return data;
      }
      stats.failures++;
      if (response.status === 429) {
        const seconds = retryAfterSeconds(response);
        blockedUntil = now() + seconds * 1000;
        stats.rateLimited++;
        stats.lastError = 'CF_RATE_LIMITED';
        throw cfError('CF_RATE_LIMITED', 'CurseForge asked SimmerSpace to slow down.', { retryAfter: seconds });
      }
      if (response.status >= 500 && attempt === 0) {
        await wait(600);
        continue;
      }
      const code =
        response.status === 401 || response.status === 403 ? 'CF_UNAUTHORIZED' : response.status === 404 ? 'CF_NOT_FOUND' : response.status === 400 ? 'CF_BAD_REQUEST' : 'CF_SERVER';
      stats.lastError = code;
      throw cfError(code, `CurseForge answered with status ${response.status}.`, { status: response.status });
    }
  }

  async function sims4GameId() {
    if (gameId) return gameId;
    const configured = (await getConfig()).curseforge.gameId;
    for (let index = 0; index < 1000; index += MAX_PAGE_SIZE) {
      const page = await request('GET', '/v1/games', { query: { index, pageSize: MAX_PAGE_SIZE } });
      const games = Array.isArray(page?.data) ? page.data : [];
      const match = games.find(game => (configured ? game.id === configured : game.slug === SIMS4_SLUG || String(game.name || '').trim().toLowerCase() === 'the sims 4'));
      if (match) {
        gameId = Number(match.id);
        gameName = text(match.name, 120);
        return gameId;
      }
      const total = Number(page?.pagination?.totalCount) || 0;
      if (!games.length || index + MAX_PAGE_SIZE >= total) break;
    }
    if (configured) {
      gameId = configured;
      return gameId;
    }
    throw cfError('CF_GAME_UNAVAILABLE', 'This CurseForge key does not have access to The Sims 4.');
  }

  async function classes() {
    const id = await sims4GameId();
    const result = await request('GET', '/v1/categories', { query: { gameId: id, classesOnly: true } });
    return (Array.isArray(result?.data) ? result.data : [])
      .map(item => ({ id: Number(item.id) || 0, name: text(item.name, 120), slug: text(item.slug, 120), displayIndex: Number(item.displayIndex) || 0 }))
      .filter(item => item.id)
      .sort((a, b) => a.displayIndex - b.displayIndex || a.name.localeCompare(b.name));
  }

  async function categories(classId) {
    const id = await sims4GameId();
    const result = await request('GET', '/v1/categories', { query: { gameId: id, classId: int(classId, undefined, 1, 2 ** 31) } });
    return (Array.isArray(result?.data) ? result.data : [])
      .filter(item => !item.isClass)
      .map(item => ({ id: Number(item.id) || 0, name: text(item.name, 120), classId: Number(item.classId) || 0 }))
      .filter(item => item.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function search(options = {}) {
    const id = await sims4GameId();
    const pageSize = int(options.pageSize, 20, 1, MAX_PAGE_SIZE);
    const index = int(options.index, 0, 0, MAX_RESULT_WINDOW - pageSize);
    const sortField = SORT_FIELDS.has(Number(options.sortField)) ? Number(options.sortField) : 2;
    const result = await request('GET', '/v1/mods/search', {
      query: {
        gameId: id,
        classId: int(options.classId, undefined, 1, 2 ** 31),
        categoryId: int(options.categoryId, undefined, 1, 2 ** 31),
        authorId: int(options.authorId, undefined, 1, 2 ** 31),
        searchFilter: text(options.query, 100).trim() || undefined,
        sortField,
        sortOrder: options.sortOrder === 'asc' ? 'asc' : 'desc',
        index,
        pageSize
      }
    });
    const pagination = result?.pagination || {};
    const totalCount = Number(pagination.totalCount) || 0;
    return {
      mods: (Array.isArray(result?.data) ? result.data : []).map(summarizeMod).filter(Boolean),
      pagination: { index, pageSize, resultCount: Number(pagination.resultCount) || 0, totalCount, reachable: Math.min(totalCount, MAX_RESULT_WINDOW) }
    };
  }

  // Popular creators: CurseForge has no creator ranking, so this groups the authors of the most popular Sims 4
  // projects and ranks them by those projects' downloads. Only data the API returns is used (no avatars exist
  // in the API, so the card shows the creator's most downloaded project image).
  async function popularCreators({ limit = 12 } = {}) {
    const wanted = int(limit, 12, 1, 24);
    const pages = await Promise.all([0, MAX_PAGE_SIZE].map(index => search({ sortField: 2, pageSize: MAX_PAGE_SIZE, index })));
    const byAuthor = new Map();
    for (const project of pages.flatMap(page => page.mods)) {
      for (const author of project.authors.slice(0, 2)) {
        if (!author.name) continue;
        const key = author.id ? `id:${author.id}` : `name:${author.name.toLowerCase()}`;
        const entry = byAuthor.get(key) || { id: author.id, name: author.name, url: author.url, downloads: 0, projectCount: 0, projects: [] };
        entry.downloads += project.downloadCount;
        entry.projectCount++;
        if (entry.projects.length < 3) entry.projects.push({ id: project.id, name: project.name, logo: project.logo, summary: project.summary, downloadCount: project.downloadCount, websiteUrl: project.websiteUrl });
        byAuthor.set(key, entry);
      }
    }
    return [...byAuthor.values()].sort((a, b) => b.downloads - a.downloads).slice(0, wanted);
  }

  async function mod(modId) {
    const id = int(modId, 0, 1, 2 ** 31);
    if (!id) throw cfError('INVALID_INPUT', 'A CurseForge mod id was expected.');
    return (await request('GET', `/v1/mods/${id}`))?.data;
  }

  async function details(modId) {
    const raw = await mod(modId);
    const summary = summarizeMod(raw);
    let description = '';
    try {
      description = htmlToText((await request('GET', `/v1/mods/${summary.id}/description`))?.data);
    } catch (error) {
      if (error.code === 'CF_RATE_LIMITED') throw error;
    }
    return { ...summary, description };
  }

  async function files(modId, options = {}) {
    const id = int(modId, 0, 1, 2 ** 31);
    if (!id) throw cfError('INVALID_INPUT', 'A CurseForge mod id was expected.');
    const pageSize = int(options.pageSize, 10, 1, MAX_PAGE_SIZE);
    const index = int(options.index, 0, 0, MAX_RESULT_WINDOW - pageSize);
    const result = await request('GET', `/v1/mods/${id}/files`, { query: { index, pageSize } });
    return { files: (Array.isArray(result?.data) ? result.data : []).map(summarizeFile).filter(Boolean), pagination: result?.pagination || {} };
  }

  /* ---------- Downloads and installs ---------- */
  async function download(url, expectedLength) {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      if (!isDownloadUrl(current)) throw cfError('CF_DOWNLOAD_FAILED', 'The download address is not a CurseForge file server.');
      const response = await fetchWithTimeout(current, { method: 'GET', redirect: 'manual' }, DOWNLOAD_TIMEOUT_MS);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw cfError('CF_DOWNLOAD_FAILED', `The file server answered with status ${response.status}.`, { status: response.status });
      const declared = Number(response.headers.get('content-length'));
      const limit = expectedLength > 0 ? expectedLength : MAX_DOWNLOAD_BYTES;
      if (declared > limit || declared > MAX_DOWNLOAD_BYTES) throw cfError('CF_DOWNLOAD_FAILED', 'The file is larger than CurseForge said it would be.');
      const chunks = [];
      let received = 0;
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received > limit) throw cfError('CF_DOWNLOAD_FAILED', 'The file is larger than CurseForge said it would be.');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, received);
    }
    throw cfError('CF_DOWNLOAD_FAILED', 'The download was redirected too many times.');
  }

  function verify(buffer, file) {
    if (file.fileLength > 0 && buffer.length !== file.fileLength) throw cfError('CF_HASH_MISMATCH', 'The downloaded file is incomplete.');
    const hashes = Array.isArray(file.hashes) ? file.hashes : [];
    const known = hashes.find(hash => hash?.algo === 1) || hashes.find(hash => hash?.algo === 2);
    if (!known || typeof known.value !== 'string') return false;
    const actual = crypto.createHash(HASH_ALGOS[known.algo]).update(buffer).digest('hex');
    if (actual.toLowerCase() !== known.value.toLowerCase()) throw cfError('CF_HASH_MISMATCH', 'The downloaded file failed its integrity check, so it was not installed.');
    return true;
  }

  async function uniqueDestination(folder, fileName) {
    const extension = path.extname(fileName);
    const stem = fileName.slice(0, -extension.length) || 'file';
    for (let index = 1; index <= 1000; index++) {
      const candidate = path.join(folder, index === 1 ? fileName : `${stem} (${index})${extension}`);
      try {
        await fs.lstat(candidate);
      } catch (error) {
        if (error.code === 'ENOENT') return candidate;
        throw error;
      }
    }
    throw cfError('NAME_CONFLICT', 'Could not find an unused file name.');
  }

  function safeFileName(name) {
    const cleaned = String(name || '')
      .replace(INVALID_NAME_CHARS, '_')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 180);
    return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : '';
  }

  // Writes one file next to its final place, then claims the final name without replacing anything.
  async function place(root, folder, fileName, data, written) {
    const resolvedFolder = path.resolve(folder);
    const realRoot = await fs.realpath(root);
    if (!resolvedFolder.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) throw cfError('OUTSIDE_ROOT', 'Files must stay inside the Mods folder.');
    await fs.mkdir(resolvedFolder, { recursive: true });
    const realFolder = await fs.realpath(resolvedFolder);
    if (!realFolder.toLowerCase().startsWith(realRoot.toLowerCase() + path.sep)) throw cfError('OUTSIDE_ROOT', 'Files must stay inside the Mods folder.');
    const temp = path.join(resolvedFolder, `.simmerspace-${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temp, data, { flag: 'wx' });
    try {
      const destination = await uniqueDestination(resolvedFolder, fileName);
      await moveNoOverwrite(temp, destination);
      written.push(destination);
      return destination;
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }

  async function readInstalls() {
    try {
      const store = JSON.parse(await fs.readFile(installsFile(), 'utf8'));
      return store && typeof store.roots === 'object' && store.roots ? store : { version: 1, roots: {} };
    } catch {
      return { version: 1, roots: {} };
    }
  }
  function writeInstalls(change) {
    const next = installsWrite.then(async () => {
      const store = await readInstalls();
      change(store);
      const file = installsFile();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temp, JSON.stringify(store, null, 2), 'utf8');
      await fs.rename(temp, file);
    });
    installsWrite = next.catch(() => {});
    return next;
  }

  async function installs() {
    const root = await getModsRoot();
    const entry = (await readInstalls()).roots[root.toLowerCase()] || {};
    return Object.values(entry).filter(item => item && Number(item.modId) && Number(item.fileId));
  }

  async function install(modId, fileId, { replacePrevious = false } = {}) {
    const id = int(modId, 0, 1, 2 ** 31);
    const fid = int(fileId, 0, 1, 2 ** 31);
    if (!id || !fid) throw cfError('INVALID_INPUT', 'A CurseForge mod and file were expected.');
    const root = await getModsRoot();
    const modData = await mod(id);
    const file = (await request('GET', `/v1/mods/${id}/files/${fid}`, { useCache: false }))?.data;
    if (!file || Number(file.modId) !== id) throw cfError('CF_NOT_FOUND', 'That file does not belong to this mod.');
    const websiteUrl = isCurseForgePage(modData?.links?.websiteUrl) ? modData.links.websiteUrl : '';
    if (!file.downloadUrl || file.isAvailable === false) throw cfError('CF_DOWNLOAD_NOT_ALLOWED', 'The author only allows downloads from the CurseForge website.', { websiteUrl });
    const fileName = safeFileName(path.basename(String(file.fileName || '')));
    const extension = path.extname(fileName).toLowerCase();
    if (!fileName || !DOWNLOAD_EXTENSIONS.has(extension)) throw cfError('CF_UNSUPPORTED_FILE', 'This kind of file has to be installed by hand.', { websiteUrl });

    const data = await download(file.downloadUrl, Number(file.fileLength) || 0);
    const verified = verify(data, { fileLength: Number(file.fileLength) || 0, hashes: file.hashes });
    const folder = path.join(root, folderNameForMod(modData?.name));
    const written = [];
    const skipped = [];
    try {
      if (extension === '.zip') {
        const archive = readZip(data);
        skipped.push(...archive.unsafe);
        const wanted = archive.entries.filter(entry => MOD_EXTENSIONS.has(path.extname(entry.path).toLowerCase()));
        skipped.push(...archive.entries.filter(entry => !wanted.includes(entry)).map(entry => entry.path));
        if (!wanted.length) throw cfError('CF_UNSUPPORTED_FILE', 'This download has no .package or .ts4script files to install.', { websiteUrl });
        for (const entry of wanted) {
          const parts = entry.path.split('/');
          const name = safeFileName(parts.pop());
          if (!name) {
            skipped.push(entry.path);
            continue;
          }
          // The game loads scripts at most one folder deep and packages at most five: scripts sit directly in
          // the mod's folder, packages keep up to two of their own subfolders.
          const subfolders = path.extname(name).toLowerCase() === '.ts4script' ? [] : parts.map(safeFileName).filter(Boolean).slice(-2);
          await place(root, path.join(folder, ...subfolders), name, entry.read(), written);
        }
      } else {
        await place(root, folder, fileName, data, written);
      }
    } catch (error) {
      // Undo only the files this install created.
      await Promise.all(written.map(file => fs.unlink(file).catch(() => {})));
      throw error;
    }

    const relative = written.map(file => path.relative(root, file));
    const key = root.toLowerCase();
    let previous = null;
    await writeInstalls(store => {
      store.roots[key] ||= {};
      previous = store.roots[key][id] || null;
      store.roots[key][id] = {
        modId: id,
        fileId: fid,
        name: text(modData?.name, 200),
        fileName,
        displayName: text(file.displayName, 300) || fileName,
        authors: (modData?.authors || []).slice(0, 4).map(author => text(author?.name, 120)).filter(Boolean),
        websiteUrl,
        logo: isImageUrl(modData?.logo?.thumbnailUrl) ? modData.logo.thumbnailUrl : '',
        installedAt: new Date(now()).toISOString(),
        files: relative
      };
    });

    let replaced = 0;
    if (replacePrevious && previous && previous.fileId !== fid && Array.isArray(previous.files)) {
      for (const old of previous.files) {
        if (typeof old !== 'string' || relative.includes(old)) continue;
        const absolute = path.resolve(root, old);
        if (!absolute.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) continue;
        try {
          await fs.lstat(absolute);
          await trashItem(absolute);
          replaced++;
        } catch {}
      }
    }
    return { modId: id, fileId: fid, name: text(modData?.name, 200), authors: (modData?.authors || []).map(a => text(a?.name, 120)).filter(Boolean), files: relative, skipped: skipped.slice(0, 50), skippedCount: skipped.length, verified, replaced };
  }

  async function checkUpdates() {
    const installed = await installs();
    if (!installed.length) return { checked: 0, updates: [] };
    const updates = [];
    for (let start = 0; start < installed.length; start += 100) {
      const batch = installed.slice(start, start + 100);
      const result = await request('POST', '/v1/mods', { body: { modIds: batch.map(item => Number(item.modId)), filterPcOnly: true }, useCache: false });
      const byId = new Map((Array.isArray(result?.data) ? result.data : []).map(item => [Number(item.id), item]));
      for (const item of batch) {
        const latest = newestFile(byId.get(Number(item.modId)));
        if (latest && Number(latest.id) !== Number(item.fileId) && Number(latest.id) > 0) {
          updates.push({ modId: Number(item.modId), name: item.name, installedFileId: Number(item.fileId), latest: summarizeFile(latest) });
        }
      }
    }
    return { checked: installed.length, updates };
  }

  async function testConnection() {
    const id = await sims4GameId();
    const list = await classes();
    return { ok: true, gameId: id, gameName, classes: list.length };
  }

  function diagnostics() {
    return { ...stats, gameId: gameId || null, cacheEntries: cache.size, rateLimitedFor: Math.max(0, Math.ceil((blockedUntil - now()) / 1000)) };
  }

  /* ---------- 0.9.0 search API ----------
     searchMods, getModFiles and getDownloadUrl return the shapes and error codes of 0.9.0. */
  async function legacy(run) {
    try {
      return await run();
    } catch (error) {
      if (LEGACY_CODES[error.code]) throw new AppError(LEGACY_CODES[error.code], error.message);
      throw error;
    }
  }
  // Synchronous with a getApiKey source (as in 0.9.0); otherwise resolves after reading the settings.
  function isConfigured() {
    if (getApiKey) return Boolean(String(getApiKey() || '').trim());
    return Promise.resolve(getConfig()).then(config => Boolean(config.curseforge.apiKey || config.curseforge.proxyUrl));
  }
  function legacyOffset(index) {
    const offset = Number(index);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_RESULT_WINDOW - 24) throw new AppError('INVALID_INPUT', 'Unsupported page.');
    return offset;
  }
  async function searchMods(query, index = 0) {
    const textQuery = String(query || '').trim().slice(0, 100);
    if (!textQuery) throw new AppError(SEARCH_EMPTY, 'Enter a title or creator to search.');
    const offset = legacyOffset(index);
    return legacy(async () => {
      const result = await search({ query: textQuery, index: offset, pageSize: 24 });
      return {
        items: result.mods.map(mod => ({
          id: mod.id,
          name: mod.name,
          summary: mod.summary,
          websiteUrl: mod.websiteUrl || '',
          authors: mod.authors.map(author => author.name).slice(0, 5),
          category: mod.categories[0]?.name || '',
          updatedAt: mod.dateModified || '',
          downloadCount: Number.isFinite(mod.downloadCount) ? mod.downloadCount : null,
          logoUrl: mod.logo || ''
        })),
        pagination: { index: offset, pageSize: 24, totalCount: result.pagination.totalCount }
      };
    });
  }
  async function getModFiles(modId, index = 0) {
    const id = Number(modId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('INVALID_INPUT', 'A valid CurseForge project is required.');
    const offset = legacyOffset(index);
    return legacy(async () => {
      const payload = await request('GET', `/v1/mods/${id}/files`, { query: { index: offset, pageSize: 24 } });
      return {
        items: (Array.isArray(payload?.data) ? payload.data : [])
          .map(file => ({
            id: file.id,
            name: text(file.displayName || file.fileName, 200),
            fileName: text(file.fileName, 200),
            releasedAt: text(file.fileDate, 40),
            size: Number.isFinite(file.fileLength) ? file.fileLength : null,
            allowModDistribution: file.allowModDistribution === true
          }))
          .filter(file => Number.isSafeInteger(file.id) && file.id > 0),
        pagination: { index: Number(payload?.pagination?.index) || offset, pageSize: Number(payload?.pagination?.pageSize) || 24, totalCount: Number(payload?.pagination?.totalCount) || 0 }
      };
    });
  }
  // GET /v1/mods/{modId}/files/{fileId}/download-url. Only official CDN links are returned.
  async function getDownloadUrl(modId, fileId) {
    const [mid, fid] = [Number(modId), Number(fileId)];
    if (!Number.isSafeInteger(mid) || mid <= 0 || !Number.isSafeInteger(fid) || fid <= 0) throw new AppError('INVALID_INPUT', 'A valid CurseForge file is required.');
    return legacy(async () => {
      const payload = await request('GET', `/v1/mods/${mid}/files/${fid}/download-url`, { useCache: false });
      if (typeof payload?.data !== 'string' || !hostAllowed(payload.data, ['forgecdn.net'])) throw new AppError(DOWNLOAD_UNAVAILABLE, 'CurseForge did not provide an available file link.');
      return new URL(payload.data).href;
    });
  }

  return { isConfigured, searchMods, getModFiles, getDownloadUrl, request, sims4GameId, classes, categories, search, popularCreators, details, files, install, installs, checkUpdates, testConnection, diagnostics, clearCache: () => cache.clear() };
}

module.exports = { createCurseForgeService, summarizeMod, summarizeFile, newestFile, htmlToText, folderNameForMod, isDownloadUrl, isImageUrl, isCurseForgePage };
