/* CurseForge integration, running only in the desktop process so the API key never reaches the page.
   Uses the official REST API (https://docs.curseforge.com/rest-api/): base https://api.curseforge.com,
   the key sent as the `x-api-key` header, pages of at most 50 results and index + pageSize <= 10,000.
   Files download directly when CurseForge provides a link for them. Authors can turn third-party distribution off;
   those files are downloaded on the website by the player and installed here after a checksum check. */
const crypto = require('node:crypto');
const { constants: fsConstants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');
const { readZip } = require('./zip-reader.cjs');

const SIMS4_SLUG = 'sims4';
const MAX_PAGE_SIZE = 50;
const MAX_RESULT_WINDOW = 10000;
const SORT_FIELDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // Featured, Popularity, LastUpdated, Name, Author, TotalDownloads, Category, GameVersion, EarlyAccess, FeaturedReleased, ReleasedDate
const HASH_ALGOS = { 1: 'sha1', 2: 'md5' };
const MOD_EXTENSIONS = new Set(['.package', '.ts4script']);
// Saved Sims, households, lots and rooms live in the game's Tray folder, not in Mods.
const TRAY_EXTENSIONS = new Set(['.trayitem', '.householdbinary', '.hhi', '.sgi', '.blueprint', '.bpi', '.room', '.rmi']);
const DOWNLOAD_EXTENSIONS = new Set(['.package', '.ts4script', '.zip']);
const MAX_DOWNLOAD_BYTES = 1024 ** 3;
const REQUEST_TIMEOUT_MS = 15000;
const DOWNLOAD_IDLE_MS = 60 * 1000; // a download that receives nothing for this long is stopped
const DOWNLOAD_ATTEMPTS = 3;
const RETRYABLE = new Set(['CF_OFFLINE', 'CF_NETWORK', 'CF_TIMEOUT', 'CF_CDN_FAILED']);
const MAX_CATEGORY_FILTERS = 10;
const MAX_FOLLOWED = 100;
const FOLLOWED_PAGES = 20; // projects read per followed creator, in pages of MAX_PAGE_SIZE
const CREATORS_PAGE_SIZE = 12;
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
// CurseForge asks for the API key on this host only (blog.curseforge.com, 2026-06-10). It answers with a redirect to
// mediafilez.forgecdn.net, which needs no key, so the key never travels further than this one request.
const needsCdnKey = url => {
  try {
    return new URL(url).hostname.toLowerCase() === 'edge.forgecdn.net';
  } catch {
    return false;
  }
};

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
    downloadAllowed: typeof file.downloadUrl === 'string' && !!file.downloadUrl && file.isAvailable !== false,
    available: file.isAvailable !== false
  };
}

function summarizeMod(mod) {
  if (!mod || typeof mod !== 'object') return null;
  // A file that came without a link can still have one at the download-url endpoint when the author allows it.
  const distributable = mod.allowModDistribution === true;
  const latestFiles = (Array.isArray(mod.latestFiles) ? mod.latestFiles : [])
    .map(summarizeFile)
    .filter(Boolean)
    .map(file => ({ ...file, downloadAllowed: file.downloadAllowed || (distributable && file.available) }));
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
      url: isCurseForgePage(author?.url) ? author.url : '',
      // Not part of the documented ModAuthor schema; kept only when CurseForge sends one on its own image CDN.
      avatarUrl: isImageUrl(author?.avatarUrl) ? author.avatarUrl : ''
    })),
    logo: isImageUrl(mod.logo?.thumbnailUrl) ? mod.logo.thumbnailUrl : '',
    screenshots: (Array.isArray(mod.screenshots) ? mod.screenshots : [])
      .filter(shot => isImageUrl(shot?.thumbnailUrl))
      .slice(0, 6)
      .map(shot => ({ thumbnailUrl: shot.thumbnailUrl, title: text(shot.title, 200) })),
    websiteUrl: isCurseForgePage(website) ? website : '',
    downloadCount: Number(mod.downloadCount) || 0,
    dateModified: text(mod.dateModified, 40),
    dateCreated: text(mod.dateCreated, 40),
    classId: Number(mod.classId) || 0,
    categories: (Array.isArray(mod.categories) ? mod.categories : []).slice(0, 12).map(category => ({ id: Number(category?.id) || 0, name: text(category?.name, 120) })),
    allowModDistribution: mod.allowModDistribution !== false,
    mainFileId: Number(mod.mainFileId) || 0,
    gameVersions: [...new Set(latestFiles.flatMap(file => file.gameVersions))].slice(0, 12),
    latestFiles: latestFiles.slice(0, 5)
  };
}

// Newest release file (falls back to newest of any kind) from a mod's latestFiles.
// Maxis Match or Alpha, only when the creator's categories or their projects' own words say so; otherwise "unknown".
function creatorStyle(categoryNames, texts = []) {
  const names = [...categoryNames, ...texts].map(name => String(name).toLowerCase());
  const maxis = names.some(name => /maxis[\s-]*match/.test(name));
  const alpha = names.some(name => /\balpha\b/.test(name));
  if (maxis && alpha) return 'both';
  return maxis ? 'maxis' : alpha ? 'alpha' : 'unknown';
}

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
  onProgress = () => {},
  onInstalled = () => {},
  creatorIndex = async () => null,
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
    // Several categories at once: CurseForge returns the projects that have all of them.
    const categoryIds = (Array.isArray(options.categoryIds) ? options.categoryIds : []).map(value => int(value, 0, 1, 2 ** 31)).filter(Boolean).slice(0, MAX_CATEGORY_FILTERS);
    const result = await request('GET', '/v1/mods/search', {
      query: {
        gameId: id,
        classId: int(options.classId, undefined, 1, 2 ** 31),
        categoryId: categoryIds.length ? undefined : int(options.categoryId, undefined, 1, 2 ** 31),
        categoryIds: categoryIds.length ? JSON.stringify(categoryIds) : undefined,
        authorId: int(options.authorId, undefined, 1, 2 ** 53 - 1),
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

  // Mods of several creators at once, for the "Followed creators" view of Explore. CurseForge filters by one author
  // per request, so each creator's projects are read (a short cache keeps paging cheap), merged and ordered here.
  async function searchFollowed(options = {}) {
    const authors = (Array.isArray(options.authorIds) ? options.authorIds : []).map(value => int(value, 0, 1, 2 ** 53 - 1)).filter(Boolean).slice(0, MAX_FOLLOWED);
    const pageSize = int(options.pageSize, 20, 1, MAX_PAGE_SIZE);
    const index = int(options.index, 0, 0, MAX_RESULT_WINDOW - pageSize);
    const seen = new Map();
    let truncated = false;
    for (const authorId of authors) {
      for (let start = 0; start < FOLLOWED_PAGES * MAX_PAGE_SIZE; start += MAX_PAGE_SIZE) {
        const page = await search({ ...options, authorId, index: start, pageSize: MAX_PAGE_SIZE, sortField: 2, sortOrder: 'desc' });
        for (const item of page.mods) seen.set(item.id, item);
        if (start + MAX_PAGE_SIZE >= page.pagination.totalCount) break;
        if (start + MAX_PAGE_SIZE >= FOLLOWED_PAGES * MAX_PAGE_SIZE) truncated = true;
      }
    }
    const field = Number(options.sortField);
    const direction = options.sortOrder === 'asc' ? 1 : -1;
    const compare = {
      3: (a, b) => String(a.dateModified).localeCompare(String(b.dateModified)),
      4: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }[field] || ((a, b) => a.downloadCount - b.downloadCount);
    const all = [...seen.values()].sort((a, b) => direction * compare(a, b) || a.id - b.id);
    return { mods: all.slice(index, index + pageSize), pagination: { index, pageSize, resultCount: Math.min(pageSize, Math.max(0, all.length - index)), totalCount: all.length, reachable: all.length }, truncated };
  }

  // Groups projects by author, using only what the API returns: the picture is the author's avatar when CurseForge
  // sends one, otherwise their most downloaded project's image. Content types come from the projects' real
  // categories. CurseForge has no Maxis Match / Alpha category, so the style is read from the projects' own titles
  // and summaries, and stays "unknown" when they do not say.
  function groupCreators(projects) {
    const byAuthor = new Map();
    for (const project of projects) {
      for (const author of project.authors.slice(0, 2)) {
        if (!author.name) continue;
        const key = author.id ? `id:${author.id}` : `name:${author.name.toLowerCase()}`;
        const entry = byAuthor.get(key) || { id: author.id, name: author.name, url: author.url, avatarUrl: '', downloads: 0, projectCount: 0, projects: [], categoryCounts: new Map(), texts: [], lastCreatedAt: '', lastUpdatedAt: '' };
        if (!entry.avatarUrl && author.avatarUrl) entry.avatarUrl = author.avatarUrl;
        entry.downloads += project.downloadCount;
        entry.projectCount++;
        entry.texts.push(project.name, project.summary);
        if (project.dateCreated > entry.lastCreatedAt) entry.lastCreatedAt = project.dateCreated;
        if (project.dateModified > entry.lastUpdatedAt) entry.lastUpdatedAt = project.dateModified;
        for (const category of project.categories) if (category.name) entry.categoryCounts.set(category.name, (entry.categoryCounts.get(category.name) || 0) + 1);
        if (entry.projects.length < 3) entry.projects.push({ id: project.id, name: project.name, logo: project.logo, summary: project.summary, downloadCount: project.downloadCount, websiteUrl: project.websiteUrl, categories: project.categories.map(c => c.name).filter(Boolean).slice(0, 3) });
        byAuthor.set(key, entry);
      }
    }
    return [...byAuthor.values()].map(({ categoryCounts, texts, ...entry }) => {
      const names = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
      return { ...entry, categories: names.slice(0, 12), style: creatorStyle(names, texts) };
    });
  }

  // Popular creators: CurseForge has no creator ranking, so this ranks the authors of the most popular projects.
  async function popularCreators({ limit = 12 } = {}) {
    const wanted = int(limit, 12, 1, 100);
    const pages = await Promise.all([0, MAX_PAGE_SIZE].map(index => search({ sortField: 2, pageSize: MAX_PAGE_SIZE, index })));
    return groupCreators(pages.flatMap(page => page.mods)).sort((a, b) => b.downloads - a.downloads).slice(0, wanted);
  }

  const CREATOR_SORTS = {
    az: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    popular: (a, b) => b.downloads - a.downloads,
    uploaded: (a, b) => String(b.lastCreatedAt).localeCompare(String(a.lastCreatedAt)),
    updated: (a, b) => String(b.lastUpdatedAt).localeCompare(String(a.lastUpdatedAt))
  };
  // A sample of the catalog read straight from CurseForge: what a search can reach when the creator index has
  // nothing for it, or before the index exists. `query` uses CurseForge's text search, which also matches authors.
  async function liveCreators({ query = '', sort = 'popular', style = 'all' }) {
    const needle = text(query, 100).trim().toLowerCase();
    const fields = { az: 4, popular: 2, uploaded: 11, updated: 3 };
    const sortField = SORT_FIELDS.has(fields[sort]) ? fields[sort] : 2;
    const pages = await Promise.all([0, MAX_PAGE_SIZE, 2 * MAX_PAGE_SIZE].map(index => search({ sortField, sortOrder: sort === 'az' ? 'asc' : 'desc', query: needle || undefined, pageSize: MAX_PAGE_SIZE, index }).catch(error => {
      if (index === 0) throw error;
      return { mods: [] };
    })));
    return groupCreators(pages.flatMap(page => page.mods))
      .filter(item => (!needle || item.name.toLowerCase().includes(needle)) && (style === 'all' || item.style === style || item.style === 'both'))
      .sort(CREATOR_SORTS[sort] || CREATOR_SORTS.popular);
  }

  // One page of creators. The full catalog comes from the creator index kept by the backend; when the index is not
  // available the page says so (`source: 'live'`) and shows what CurseForge can answer directly.
  async function creatorsPage(options = {}) {
    const sort = CREATOR_SORTS[options.sort] ? options.sort : 'popular';
    const style = ['all', 'maxis', 'alpha', 'unknown'].includes(options.style) ? options.style : 'all';
    const query = text(options.query, 100).trim();
    const pageSize = int(options.pageSize, CREATORS_PAGE_SIZE, 1, 48);
    const page = int(options.page, 1, 1, 100000);
    const indexed = await creatorIndex({ query, sort, style, page, pageSize }).catch(() => null);
    if (indexed && (indexed.total > 0 || !query)) return { creators: indexed.creators, source: 'index', updatedAt: indexed.updatedAt || '', pagination: { page, pageSize, total: indexed.total, pages: Math.max(1, Math.ceil(indexed.total / pageSize)) } };
    const list = await liveCreators({ query, sort, style });
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const current = Math.min(page, pages);
    return { creators: list.slice((current - 1) * pageSize, current * pageSize), source: 'live', updatedAt: '', pagination: { page: current, pageSize, total: list.length, pages } };
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

  /* ---------- Downloads and installs ----------
     1. CurseForge is asked for the file and, when the author allows third-party downloads, for its link.
     2. The file is streamed to a temporary folder (never into Mods) while its checksum is calculated.
     3. Length and checksum are checked; only then anything is written inside Mods, under names that replace nothing.
     4. The install is recorded, so a failure at any step leaves no half-installed mod behind.
     When the author turned third-party downloads off the API gives no link at all (downloadUrl is null and the
     download-url endpoint answers 403). That choice is respected: no address is ever built by hand. The player can
     download the file on the CurseForge website and SimmerSpace installs that copy after checking its checksum. */
  const tempFolder = () => path.join(userDataPath(), 'downloads-tmp');
  const jobs = new Map(); // "modId:fileId" -> { cancelled, abort }

  // Removes what a download cut short by a crash or a power cut left behind. Runs once at startup.
  async function cleanTemporaryDownloads() {
    if (!jobs.size) await fs.rm(tempFolder(), { recursive: true, force: true }).catch(() => {});
  }

  function startJob(key) {
    if (jobs.has(key)) throw cfError('CF_INSTALL_RUNNING', 'This file is already being installed.');
    const job = { cancelled: false, abort: () => {} };
    jobs.set(key, job);
    return job;
  }
  function cancelInstall(modId, fileId) {
    const job = jobs.get(`${modId}:${fileId}`);
    if (!job) return { cancelled: false };
    job.cancelled = true;
    job.abort();
    return { cancelled: true };
  }

  // Headers for one CDN request. With the proxy the key stays on the server: it follows edge.forgecdn.net's redirect
  // and gives back the address that needs no key. A proxy without that route just means a plain request.
  async function cdnRequest(url) {
    if (!needsCdnKey(url)) return { url, headers: undefined };
    const config = (await getConfig()).curseforge;
    if (!config.proxyUrl) return { url, headers: config.apiKey ? { 'x-api-key': config.apiKey } : undefined };
    try {
      const token = await getProxyToken();
      if (!token) return { url, headers: undefined };
      const response = await fetchWithTimeout(`${config.proxyUrl}/cdn-resolve?url=${encodeURIComponent(url)}`, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token.bearer}`, apikey: token.apikey } }, timeoutMs);
      const resolved = response.ok ? (await response.json())?.url : '';
      return { url: isDownloadUrl(resolved) ? resolved : url, headers: undefined };
    } catch {
      return { url, headers: undefined };
    }
  }

  async function downloadToTemp(url, expectedLength, job, modId, fileId) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await downloadOnce(url, expectedLength, job, modId, fileId);
      } catch (error) {
        if (job.cancelled || attempt >= DOWNLOAD_ATTEMPTS || !RETRYABLE.has(error.code)) throw error;
        onProgress({ modId, fileId, received: 0, total: expectedLength, retry: attempt });
        await wait(1000 * attempt);
      }
    }
  }

  async function downloadOnce(url, expectedLength, job, modId, fileId) {
    await fs.mkdir(tempFolder(), { recursive: true });
    const temp = path.join(tempFolder(), `${crypto.randomUUID()}.part`);
    const fail = error => (job.cancelled ? cfError('CF_CANCELLED', 'The download was stopped.') : error);
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      if (!isDownloadUrl(current)) throw cfError('CF_DOWNLOAD_FAILED', 'The download address is not a CurseForge file server.');
      const controller = new AbortController();
      job.abort = () => controller.abort();
      let idle = null;
      const watch = () => {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), DOWNLOAD_IDLE_MS);
      };
      watch();
      try {
        let response;
        try {
          const target = await cdnRequest(current);
          current = target.url;
          response = await fetchImpl(current, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal, ...(target.headers ? { headers: target.headers } : {}) });
        } catch {
          throw fail(controller.signal.aborted ? cfError('CF_TIMEOUT', 'CurseForge took too long to answer.') : cfError('CF_OFFLINE', 'Could not reach CurseForge. Check your internet connection.'));
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw cfError('CF_DOWNLOAD_FAILED', 'The file server gave no address to follow.');
          current = new URL(location, current).href;
          continue;
        }
        if (response.status === 401 || response.status === 403) throw cfError('CF_CDN_AUTH', 'The file server did not accept this request.', { status: response.status });
        if (response.status === 404 || response.status === 410) throw cfError('CF_CDN_NOT_FOUND', 'The file server does not have this file.', { status: response.status });
        if (!response.ok) throw cfError('CF_CDN_FAILED', `The file server answered with status ${response.status}.`, { status: response.status });
        if (/text\/html/i.test(response.headers.get('content-type') || '')) throw cfError('CF_NOT_A_FILE', 'The file server sent a web page instead of the file.');
        const declared = Number(response.headers.get('content-length'));
        const limit = expectedLength > 0 ? expectedLength : MAX_DOWNLOAD_BYTES;
        if (declared > limit || declared > MAX_DOWNLOAD_BYTES) throw cfError('CF_DOWNLOAD_FAILED', 'The file is larger than CurseForge said it would be.');
        const digests = { sha1: crypto.createHash('sha1'), md5: crypto.createHash('md5'), sha256: crypto.createHash('sha256') };
        const output = await fs.open(temp, 'wx');
        let received = 0;
        let reported = 0;
        let head = Buffer.alloc(0);
        try {
          for await (const chunk of response.body) {
            watch();
            received += chunk.length;
            if (received > limit) throw cfError('CF_DOWNLOAD_FAILED', 'The file is larger than CurseForge said it would be.');
            const bytes = Buffer.from(chunk.buffer ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length) : chunk);
            if (head.length < 16) head = Buffer.concat([head, bytes.subarray(0, 16)]);
            await output.write(bytes);
            for (const digest of Object.values(digests)) digest.update(bytes);
            if (now() - reported >= 150) {
              reported = now();
              onProgress({ modId, fileId, received, total: expectedLength || declared || 0 });
            }
          }
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw fail(controller.signal.aborted ? cfError('CF_TIMEOUT', 'The download stalled and was stopped.') : cfError('CF_NETWORK', 'The connection dropped during the download.'));
        } finally {
          await output.close().catch(() => {});
        }
        onProgress({ modId, fileId, received, total: expectedLength || received, done: true });
        return { path: temp, size: received, head, sha1: digests.sha1.digest('hex'), md5: digests.md5.digest('hex'), sha256: digests.sha256.digest('hex') };
      } catch (error) {
        await fs.unlink(temp).catch(() => {});
        throw error;
      } finally {
        clearTimeout(idle);
      }
    }
    throw cfError('CF_DOWNLOAD_FAILED', 'The download was redirected too many times.');
  }

  async function hashLocalFile(file) {
    const digests = { sha1: crypto.createHash('sha1'), md5: crypto.createHash('md5'), sha256: crypto.createHash('sha256') };
    const input = await fs.open(file, 'r');
    const head = Buffer.alloc(16);
    let size = 0;
    try {
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      for (;;) {
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        const part = buffer.subarray(0, bytesRead);
        if (size < 16) part.copy(head, size, 0, Math.min(16 - size, bytesRead));
        size += bytesRead;
        for (const digest of Object.values(digests)) digest.update(part);
      }
    } finally {
      await input.close();
    }
    return { path: file, size, head, sha1: digests.sha1.digest('hex'), md5: digests.md5.digest('hex'), sha256: digests.sha256.digest('hex') };
  }

  function verify(received, file) {
    const start = received.head.subarray(0, 16).toString('latin1').trimStart().toLowerCase();
    if (start.startsWith('<!doctype') || start.startsWith('<html')) throw cfError('CF_NOT_A_FILE', 'The file server sent a web page instead of the file.');
    if (file.fileLength > 0 && received.size !== file.fileLength) throw cfError('CF_HASH_MISMATCH', 'The downloaded file is incomplete.');
    const hashes = Array.isArray(file.hashes) ? file.hashes : [];
    const known = hashes.find(hash => hash?.algo === 1) || hashes.find(hash => hash?.algo === 2);
    if (!known || typeof known.value !== 'string') return false;
    if (received[HASH_ALGOS[known.algo]].toLowerCase() !== known.value.toLowerCase()) throw cfError('CF_HASH_MISMATCH', 'The downloaded file failed its integrity check, so it was not installed.');
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
  // `source` is the file's bytes, or { copyFrom } for a verified file that is still in the temporary folder.
  async function place(root, folder, fileName, source, written) {
    const resolvedFolder = path.resolve(folder);
    const realRoot = await fs.realpath(root);
    if (!resolvedFolder.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) throw cfError('OUTSIDE_ROOT', 'Files must stay inside the Mods folder.');
    await fs.mkdir(resolvedFolder, { recursive: true });
    const realFolder = await fs.realpath(resolvedFolder);
    if (!realFolder.toLowerCase().startsWith(realRoot.toLowerCase() + path.sep)) throw cfError('OUTSIDE_ROOT', 'Files must stay inside the Mods folder.');
    const temp = path.join(resolvedFolder, `.simmerspace-${crypto.randomUUID()}.tmp`);
    if (source?.copyFrom) await fs.copyFile(source.copyFrom, temp, fsConstants.COPYFILE_EXCL);
    else await fs.writeFile(temp, source, { flag: 'wx' });
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

  // Keeps the install log pointing at files that were renamed, moved, or deleted, so they stay "from SimmerSpace".
  async function remapInstalledPaths(root, pairs) {
    const moved = new Map(pairs.map(([from, to]) => [String(from).toLowerCase(), to]));
    if (!moved.size) return;
    await writeInstalls(store => {
      for (const item of Object.values(store.roots[root.toLowerCase()] || {})) {
        if (Array.isArray(item?.files)) item.files = item.files.flatMap(file => (moved.has(file.toLowerCase()) ? (moved.get(file.toLowerCase()) ? [moved.get(file.toLowerCase())] : []) : [file]));
      }
    });
  }

  // The mod and file as CurseForge describes them, and the link to use: the file's own, or the download-url
  // endpoint when the file came without one and the author does not forbid it.
  async function fileRecord(id, fid) {
    const modData = await mod(id);
    const file = (await request('GET', `/v1/mods/${id}/files/${fid}`, { useCache: false }))?.data;
    if (!file || Number(file.modId) !== id) throw cfError('CF_NOT_FOUND', 'That file does not belong to this mod.');
    const websiteUrl = isCurseForgePage(modData?.links?.websiteUrl) ? modData.links.websiteUrl : '';
    const pageUrl = websiteUrl ? `${websiteUrl}/files/${fid}` : '';
    if (file.isAvailable === false) throw cfError('CF_FILE_UNAVAILABLE', 'CurseForge does not offer this file right now.', { websiteUrl, pageUrl });
    return { modData, file, websiteUrl, pageUrl };
  }
  // A missing downloadUrl proves nothing on its own, so the download-url endpoint is always asked. Saying the author
  // forbids downloads needs both signals: the project's own flag and the endpoint's refusal. Metadata has already been
  // read with this key by now, so a refusal here is about this file and not about the key.
  async function authorizedLink({ modData, file, websiteUrl, pageUrl }, id, fid) {
    const details = { websiteUrl, pageUrl, fileName: text(file.fileName, 300), fileLength: Number(file.fileLength) || 0 };
    if (file.downloadUrl) return file.downloadUrl;
    const authorSaysNo = modData?.allowModDistribution === false;
    let refused = false;
    try {
      const link = (await request('GET', `/v1/mods/${id}/files/${fid}/download-url`, { useCache: false }))?.data;
      if (typeof link === 'string' && link) return link;
    } catch (error) {
      if (!['CF_UNAUTHORIZED', 'CF_NOT_FOUND'].includes(error.code)) throw error;
      refused = error.code === 'CF_UNAUTHORIZED';
      if (error.details?.status === 401) throw error;
    }
    if (authorSaysNo) throw cfError('CF_DOWNLOAD_NOT_ALLOWED', 'The author only allows downloads from the CurseForge website.', details);
    throw cfError(refused ? 'CF_LINK_DENIED' : 'CF_NO_LINK', refused ? 'CurseForge refused a download link for this file.' : 'CurseForge gave no download link for this file.', details);
  }

  // Everything after the file has been received and verified. `received.path` is left for the caller to clean up.
  async function installVerified({ id, fid, record, received, verified, replacePrevious }) {
    const { modData, file, websiteUrl } = record;
    const root = await getModsRoot();
    const fileName = safeFileName(path.basename(String(file.fileName || '')));
    const extension = path.extname(fileName).toLowerCase();
    if (!fileName || !DOWNLOAD_EXTENSIONS.has(extension)) throw cfError('CF_UNSUPPORTED_FILE', 'This kind of file has to be installed by hand.', { websiteUrl });
    const folder = path.join(root, folderNameForMod(modData?.name));
    const written = [];
    const skipped = [];
    const added = []; // { absolute, sha256, originalName }
    try {
      if (extension === '.zip') {
        const archive = readZip(await fs.readFile(received.path));
        skipped.push(...archive.unsafe);
        const wanted = archive.entries.filter(entry => MOD_EXTENSIONS.has(path.extname(entry.path).toLowerCase()));
        skipped.push(...archive.entries.filter(entry => !wanted.includes(entry)).map(entry => entry.path));
        if (!wanted.length && archive.entries.some(entry => TRAY_EXTENSIONS.has(path.extname(entry.path).toLowerCase()))) throw cfError('CF_TRAY_CONTENT', 'This download goes in the game\'s Tray folder, not in Mods.', { websiteUrl });
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
          const data = entry.read();
          const absolute = await place(root, path.join(folder, ...subfolders), name, data, written);
          added.push({ absolute, sha256: crypto.createHash('sha256').update(data).digest('hex'), originalName: name });
          await new Promise(resolve => setImmediate(resolve));
        }
      } else {
        const absolute = await place(root, folder, fileName, { copyFrom: received.path }, written);
        added.push({ absolute, sha256: received.sha256, originalName: fileName });
      }
    } catch (error) {
      // Undo only the files this install created.
      await Promise.all(written.map(item => fs.unlink(item).catch(() => {})));
      throw error;
    }

    const relative = written.map(item => path.relative(root, item));
    const key = root.toLowerCase();
    const logo = isImageUrl(modData?.logo?.thumbnailUrl) ? modData.logo.thumbnailUrl : '';
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
        logo,
        installedAt: new Date(now()).toISOString(),
        files: relative
      };
    });
    await Promise.resolve(onInstalled({ root, modId: id, fileId: fid, name: text(modData?.name, 200), logo, files: added.map(item => ({ relativePath: path.relative(root, item.absolute), sha256: item.sha256, originalName: item.originalName })) })).catch(() => {});

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

  // The same file is installed once, unless the player asks again or a file of the earlier install has gone.
  async function assertNotInstalled(root, id, fid, reinstall) {
    if (reinstall) return;
    const previous = (await readInstalls()).roots[root.toLowerCase()]?.[id];
    if (!previous || Number(previous.fileId) !== fid || !Array.isArray(previous.files) || !previous.files.length) return;
    for (const relative of previous.files) {
      const stat = await fs.lstat(path.resolve(root, relative)).catch(() => null);
      if (!stat?.isFile()) return;
    }
    throw cfError('CF_ALREADY_INSTALLED', 'This version is already installed.', { name: previous.name, files: previous.files.slice(0, 20) });
  }

  function ids(modId, fileId) {
    const id = int(modId, 0, 1, 2 ** 31);
    const fid = int(fileId, 0, 1, 2 ** 31);
    if (!id || !fid) throw cfError('INVALID_INPUT', 'A CurseForge mod and file were expected.');
    return { id, fid };
  }

  async function install(modId, fileId, { replacePrevious = false, reinstall = false } = {}) {
    const { id, fid } = ids(modId, fileId);
    const root = await getModsRoot();
    await assertNotInstalled(root, id, fid, reinstall || replacePrevious);
    const job = startJob(`${id}:${fid}`);
    let received = null;
    try {
      const record = await fileRecord(id, fid);
      const link = await authorizedLink(record, id, fid);
      const expected = { fileLength: Number(record.file.fileLength) || 0, hashes: record.file.hashes };
      let verified = false;
      // A corrupted transfer gets one more try before it counts as a failure.
      for (let attempt = 1; ; attempt++) {
        received = await downloadToTemp(link, expected.fileLength, job, id, fid);
        try {
          verified = verify(received, expected);
          break;
        } catch (error) {
          await fs.unlink(received.path).catch(() => {});
          received = null;
          if (error.code !== 'CF_HASH_MISMATCH' || attempt >= 2) throw error;
        }
      }
      return await installVerified({ id, fid, record, received, verified, replacePrevious });
    } finally {
      jobs.delete(`${id}:${fid}`);
      if (received) await fs.unlink(received.path).catch(() => {});
    }
  }

  /* ---------- Files the player downloaded from the website ---------- */
  async function assistedInfo(modId, fileId) {
    const { id, fid } = ids(modId, fileId);
    const { modData, file, pageUrl, websiteUrl } = await fileRecord(id, fid);
    return { modId: id, fileId: fid, name: text(modData?.name, 200), fileName: text(file.fileName, 300), fileLength: Number(file.fileLength) || 0, pageUrl, websiteUrl, canVerify: (Array.isArray(file.hashes) ? file.hashes : []).some(hash => hash?.algo === 1 || hash?.algo === 2) };
  }

  // Checks a file on this PC against what CurseForge says about the file. Reads it; never changes or moves it.
  async function checkLocalFile(record, absolute) {
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile()) throw cfError('CF_LOCAL_FILE_MISSING', 'That file is no longer there.');
    const fileLength = Number(record.file.fileLength) || 0;
    if (fileLength > 0 && stat.size !== fileLength) throw cfError('CF_LOCAL_FILE_MISMATCH', 'This is not the file CurseForge offers for this mod.');
    const received = await hashLocalFile(absolute);
    try {
      return { received, verified: verify(received, { fileLength, hashes: record.file.hashes }) };
    } catch (error) {
      if (error.code === 'CF_HASH_MISMATCH') throw cfError('CF_LOCAL_FILE_MISMATCH', 'This is not the file CurseForge offers for this mod.');
      throw error;
    }
  }

  // Looks in a folder (the player's Downloads) for the exact file: same size, then same checksum. Browsers may
  // rename a download, so the name is only a hint. Partial downloads are ignored until they are complete.
  async function findDownloaded(modId, fileId, folder) {
    const { id, fid } = ids(modId, fileId);
    const record = await fileRecord(id, fid);
    const wanted = Number(record.file.fileLength) || 0;
    const extension = path.extname(String(record.file.fileName || '')).toLowerCase();
    let entries = [];
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch {
      return null;
    }
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== extension) continue;
      const absolute = path.join(folder, entry.name);
      const stat = await fs.stat(absolute).catch(() => null);
      if (stat && (!wanted || stat.size === wanted)) candidates.push({ absolute, exact: entry.name === record.file.fileName, modified: stat.mtimeMs });
    }
    candidates.sort((a, b) => b.exact - a.exact || b.modified - a.modified);
    for (const candidate of candidates.slice(0, 5)) {
      try {
        const { verified } = await checkLocalFile(record, candidate.absolute);
        if (verified || candidate.exact) return candidate.absolute;
      } catch {}
    }
    return null;
  }

  async function installLocalFile(modId, fileId, absolute, { replacePrevious = false, reinstall = false } = {}) {
    const { id, fid } = ids(modId, fileId);
    await assertNotInstalled(await getModsRoot(), id, fid, reinstall || replacePrevious);
    startJob(`${id}:${fid}`);
    try {
      const record = await fileRecord(id, fid);
      const { received, verified } = await checkLocalFile(record, absolute);
      return await installVerified({ id, fid, record, received, verified, replacePrevious });
    } finally {
      jobs.delete(`${id}:${fid}`);
    }
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

  return { isConfigured, searchMods, getModFiles, getDownloadUrl, request, sims4GameId, classes, categories, search, searchFollowed, popularCreators, creatorsPage, details, files, install, installs, cancelInstall, assistedInfo, findDownloaded, installLocalFile, remapInstalledPaths, cleanTemporaryDownloads, checkUpdates, testConnection, diagnostics, clearCache: () => cache.clear() };
}

module.exports = { createCurseForgeService, summarizeMod, summarizeFile, newestFile, htmlToText, folderNameForMod, isDownloadUrl, isImageUrl, isCurseForgePage, creatorStyle };
