const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createCurseForgeService, summarizeMod, htmlToText, folderNameForMod } = require('../electron/curseforge-service.cjs');
const { moveNoOverwrite } = require('../electron/mods-service.cjs');
const { readZip, safeEntryPath } = require('../electron/zip-reader.cjs');

// A fake key used only in these tests. No real key is needed or read.
const FAKE_KEY = 'test-key-not-real';
const API = 'https://api.curseforge.com';
const CDN = 'https://edge.forgecdn.net/files/1/2';

// Builds a ZIP in memory (stored or deflated entries) so the installer can be tested without fixtures.
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate = true } of entries) {
    const body = Buffer.from(data);
    const packed = deflate ? zlib.deflateRawSync(body) : body;
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(zlib.crc32(body), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(zlib.crc32(body), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const GAMES = { data: [{ id: 1, slug: 'other', name: 'Other' }, { id: 78062, slug: 'sims4', name: 'The Sims 4' }], pagination: { index: 0, pageSize: 50, resultCount: 2, totalCount: 2 } };

function modRecord(overrides = {}) {
  return {
    id: 42,
    name: 'Cozy Kitchen',
    summary: 'A kitchen set',
    authors: [{ name: 'mossyhome', url: 'https://www.curseforge.com/members/mossyhome' }],
    logo: { thumbnailUrl: 'https://media.forgecdn.net/avatars/thumbnails/1/2/256/256/x.png' },
    links: { websiteUrl: 'https://www.curseforge.com/sims4/build-buy/cozy-kitchen' },
    latestFiles: [{ id: 7, modId: 42, fileName: 'Cozy.package', fileDate: '2026-01-01T00:00:00Z', releaseType: 1, downloadUrl: CDN }],
    allowModDistribution: true,
    ...overrides
  };
}

async function setup(t, { routes = {}, config = {}, proxyToken } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-cf-test-'));
  const mods = path.join(base, 'Mods');
  const data = path.join(base, 'data');
  await fs.mkdir(mods);
  await fs.mkdir(data);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const calls = [];
  const trashed = [];
  let clock = 1_000_000;
  const service = createCurseForgeService({
    getConfig: async () => ({ curseforge: { apiKey: FAKE_KEY, baseUrl: API, proxyUrl: '', gameId: 0, ...config } }),
    ...(proxyToken ? { getProxyToken: proxyToken } : {}),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      for (const [pattern, reply] of Object.entries(routes)) {
        if (url.startsWith(pattern) || url.includes(pattern)) return typeof reply === 'function' ? reply(url, options) : reply.clone();
      }
      if (url.startsWith(`${API}/v1/games`)) return json(GAMES);
      return json({ error: 'not found' }, 404);
    },
    now: () => clock,
    wait: async () => {},
    userDataPath: () => data,
    getModsRoot: async () => mods,
    moveNoOverwrite,
    trashItem: async file => trashed.push(file)
  });
  return { service, calls, mods, data, trashed, advance: ms => (clock += ms) };
}

test('sends the key only as the x-api-key header and finds The Sims 4 by its slug', async t => {
  const f = await setup(t, { routes: { [`${API}/v1/mods/search`]: json({ data: [modRecord()], pagination: { index: 0, pageSize: 20, resultCount: 1, totalCount: 1 } }) } });
  const result = await f.service.search({ query: ' kitchen ', pageSize: 500, index: 99999, sortField: 99 });
  const searchCall = f.calls.find(call => call.url.includes('/v1/mods/search'));
  const url = new URL(searchCall.url);
  assert.equal(searchCall.options.headers['x-api-key'], FAKE_KEY);
  assert.ok(!searchCall.url.includes(FAKE_KEY), 'the key must never be part of a URL');
  assert.equal(url.searchParams.get('gameId'), '78062');
  assert.equal(url.searchParams.get('searchFilter'), 'kitchen');
  assert.equal(url.searchParams.get('pageSize'), '50', 'page size is capped at the documented 50');
  assert.equal(Number(url.searchParams.get('index')) + 50, 10000, 'index + pageSize stays within the 10,000 window');
  assert.equal(url.searchParams.get('sortField'), '2', 'unknown sort fields fall back to popularity');
  assert.equal(result.mods[0].name, 'Cozy Kitchen');
  assert.equal(result.mods[0].latestFiles[0].downloadAllowed, true);
});

test('reports a missing key without making any request', async t => {
  const f = await setup(t, { config: { apiKey: '' } });
  await assert.rejects(f.service.search({}), { code: 'CF_NOT_CONFIGURED' });
  assert.equal(f.calls.length, 0);
});

test('maps rejected keys, missing mods and rate limits to clear codes and respects Retry-After', async t => {
  const f = await setup(t, { routes: { [`${API}/v1/games`]: json({}, 403) } });
  await assert.rejects(f.service.search({}), { code: 'CF_UNAUTHORIZED' });

  const g = await setup(t, { routes: { [`${API}/v1/mods/search`]: json({}, 429, { 'retry-after': '20' }) } });
  await assert.rejects(g.service.search({}), error => error.code === 'CF_RATE_LIMITED' && error.details.retryAfter === 20);
  const before = g.calls.length;
  await assert.rejects(g.service.search({ query: 'x' }), { code: 'CF_RATE_LIMITED' });
  assert.equal(g.calls.length, before, 'no request is sent while rate limited');
  g.advance(21000);
  await assert.rejects(g.service.search({}), { code: 'CF_RATE_LIMITED' }, 'a new request is allowed again after the wait');
  assert.equal(g.calls.length, before + 1);
});

test('retries a server error once, then reports it; offline and bad JSON have their own codes', async t => {
  let attempts = 0;
  const f = await setup(t, { routes: { [`${API}/v1/mods/search`]: () => (attempts++, json({}, 503)) } });
  await assert.rejects(f.service.search({}), { code: 'CF_SERVER' });
  assert.equal(attempts, 2);

  const g = await setup(t, { routes: { [`${API}/v1/games`]: () => Promise.reject(new TypeError('fetch failed')) } });
  await assert.rejects(g.service.search({}), { code: 'CF_OFFLINE' });

  const h = await setup(t, { routes: { [`${API}/v1/games`]: new Response('<html>', { status: 200 }) } });
  await assert.rejects(h.service.search({}), { code: 'CF_BAD_RESPONSE' });
});

test('times out slow requests', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-cf-test-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const service = createCurseForgeService({
    getConfig: async () => ({ curseforge: { apiKey: FAKE_KEY, baseUrl: API, proxyUrl: '', gameId: 0 } }),
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    userDataPath: () => base,
    timeoutMs: 20
  });
  await assert.rejects(service.testConnection(), { code: 'CF_TIMEOUT' });
});

test('caches repeated searches for a few minutes', async t => {
  const f = await setup(t, { routes: { [`${API}/v1/mods/search`]: json({ data: [], pagination: {} }) } });
  await f.service.search({ query: 'a' });
  await f.service.search({ query: 'a' });
  assert.equal(f.calls.filter(call => call.url.includes('/v1/mods/search')).length, 1);
  f.advance(6 * 60 * 1000);
  await f.service.search({ query: 'a' });
  assert.equal(f.calls.filter(call => call.url.includes('/v1/mods/search')).length, 2);
});

test('mod details keep only CurseForge links and images, and turn the description into plain text', async t => {
  const evil = modRecord({ links: { websiteUrl: 'https://evil.example/curseforge.com' }, logo: { thumbnailUrl: 'http://media.forgecdn.net/x.png' } });
  const f = await setup(t, {
    routes: {
      [`${API}/v1/mods/42/description`]: json({ data: '<p>Hello&nbsp;<b>there</b></p><script>alert(1)</script><ul><li>One</li></ul>' }),
      [`${API}/v1/mods/42`]: json({ data: evil })
    }
  });
  const details = await f.service.details(42);
  assert.equal(details.websiteUrl, '');
  assert.equal(details.logo, '');
  assert.equal(details.description, 'Hello there\n• One');
  assert.equal(htmlToText('a &lt;b&gt; &#39;c&#39; &#x41;'), "a <b> 'c' A");
});

test('installs a verified .package into its own folder and never overwrites an existing file', async t => {
  const content = Buffer.from('package bytes');
  const sha1 = crypto.createHash('sha1').update(content).digest('hex');
  const file = { id: 7, modId: 42, fileName: 'Cozy.package', displayName: 'Cozy 1.0', fileLength: content.length, downloadUrl: CDN, hashes: [{ algo: 1, value: sha1 }] };
  const f = await setup(t, {
    routes: {
      [`${API}/v1/mods/42/files/7`]: json({ data: file }),
      [`${API}/v1/mods/42`]: json({ data: modRecord() }),
      [CDN]: () => new Response(content, { status: 200, headers: { 'content-length': String(content.length) } })
    }
  });
  const folder = path.join(f.mods, folderNameForMod('Cozy Kitchen'));
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'Cozy.package'), 'players own file');
  const result = await f.service.install(42, 7);
  assert.equal(result.verified, true);
  assert.deepEqual(result.files, [path.join('CurseForge - Cozy Kitchen', 'Cozy (2).package')]);
  assert.equal(await fs.readFile(path.join(folder, 'Cozy.package'), 'utf8'), 'players own file');
  assert.equal(await fs.readFile(path.join(f.mods, result.files[0]), 'utf8'), 'package bytes');
  const installs = await f.service.installs();
  assert.equal(installs[0].fileId, 7);
  const downloadCall = f.calls.find(call => call.url === CDN);
  assert.equal(downloadCall.options.headers, undefined, 'the API key is not sent to the file server');
  assert.deepEqual((await fs.readdir(folder)).filter(name => name.endsWith('.tmp')), []);
});

test('refuses files that fail the hash check and leaves nothing behind', async t => {
  const file = { id: 7, modId: 42, fileName: 'Cozy.package', fileLength: 5, downloadUrl: CDN, hashes: [{ algo: 1, value: '0'.repeat(40) }] };
  const f = await setup(t, {
    routes: { [`${API}/v1/mods/42/files/7`]: json({ data: file }), [`${API}/v1/mods/42`]: json({ data: modRecord() }), [CDN]: () => new Response('abcde') }
  });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_HASH_MISMATCH' });
  assert.deepEqual(await fs.readdir(f.mods), []);
});

test('sends players to CurseForge when the author does not allow third-party downloads', async t => {
  const file = { id: 7, modId: 42, fileName: 'Cozy.package', fileLength: 5, downloadUrl: null };
  const f = await setup(t, { routes: { [`${API}/v1/mods/42/files/7`]: json({ data: file }), [`${API}/v1/mods/42`]: json({ data: modRecord() }) } });
  await assert.rejects(f.service.install(42, 7), error => error.code === 'CF_DOWNLOAD_NOT_ALLOWED' && error.details.websiteUrl.startsWith('https://www.curseforge.com/'));
});

test('only downloads from CurseForge file servers, following redirects that stay there', async t => {
  const file = { id: 7, modId: 42, fileName: 'Cozy.package', fileLength: 0, downloadUrl: 'https://evil.example/file.package' };
  const f = await setup(t, { routes: { [`${API}/v1/mods/42/files/7`]: json({ data: file }), [`${API}/v1/mods/42`]: json({ data: modRecord() }) } });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_DOWNLOAD_FAILED' });

  const redirect = { ...file, downloadUrl: CDN };
  const g = await setup(t, {
    routes: {
      [`${API}/v1/mods/42/files/7`]: json({ data: redirect }),
      [`${API}/v1/mods/42`]: json({ data: modRecord() }),
      [CDN]: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })
    }
  });
  await assert.rejects(g.service.install(42, 7), { code: 'CF_DOWNLOAD_FAILED' });
});

test('unpacks ZIP downloads safely: mod files only, scripts one folder deep, unsafe names skipped', async t => {
  const zip = makZipFixture();
  const file = { id: 8, modId: 42, fileName: 'Cozy.zip', fileLength: zip.length, downloadUrl: CDN, hashes: [{ algo: 2, value: crypto.createHash('md5').update(zip).digest('hex') }] };
  const f = await setup(t, {
    routes: { [`${API}/v1/mods/42/files/8`]: json({ data: file }), [`${API}/v1/mods/42`]: json({ data: modRecord() }), [CDN]: () => new Response(zip) }
  });
  const result = await f.service.install(42, 8);
  const folder = 'CurseForge - Cozy Kitchen';
  assert.deepEqual(result.files.sort(), [path.join(folder, 'Script.ts4script'), path.join(folder, 'Set', 'Part A', 'Chair.package'), path.join(folder, 'Table.package')].sort());
  assert.ok(result.skipped.includes('readme.txt'));
  assert.ok(result.skipped.includes('../escape.package'));
  await assert.rejects(fs.stat(path.join(path.dirname(f.mods), 'escape.package')));
});

function makZipFixture() {
  return makeZip([
    { name: 'Table.package', data: 'table' },
    { name: 'Deep/Set/Part A/Chair.package', data: 'chair', deflate: false },
    { name: 'Scripts/Inner/Script.ts4script', data: 'script' },
    { name: 'readme.txt', data: 'hello' },
    { name: '../escape.package', data: 'bad' }
  ]);
}

test('a ZIP with no mod files is refused and a corrupted entry fails its CRC check', async () => {
  const zip = makeZip([{ name: 'a.package', data: 'aaaa', deflate: false }]);
  const entries = readZip(zip).entries;
  assert.equal(entries[0].read().toString(), 'aaaa');
  const broken = Buffer.from(zip);
  broken[30 + 'a.package'.length] ^= 0xff;
  assert.throws(() => readZip(broken).entries[0].read(), { code: 'ZIP_INVALID' });
  assert.equal(safeEntryPath('C:/Windows/x.package'), '');
  assert.equal(safeEntryPath('a\\..\\..\\b.package'), '');
  assert.equal(safeEntryPath('__MACOSX/x.package'), '');
  assert.equal(safeEntryPath('ok/./x.package'), 'ok/x.package');
});

test('finds updates by comparing installed files with the newest release', async t => {
  const content = Buffer.from('v1');
  const file = { id: 7, modId: 42, fileName: 'Cozy.package', fileLength: content.length, downloadUrl: CDN, hashes: [] };
  const newer = { id: 9, modId: 42, fileName: 'Cozy.package', fileDate: '2026-05-01T00:00:00Z', releaseType: 1, downloadUrl: CDN };
  const beta = { id: 11, modId: 42, fileName: 'Cozy-beta.package', fileDate: '2026-06-01T00:00:00Z', releaseType: 2, downloadUrl: CDN };
  const f = await setup(t, {
    routes: {
      [`${API}/v1/mods/42/files/7`]: json({ data: file }),
      [`${API}/v1/mods/42`]: json({ data: modRecord() }),
      [CDN]: () => new Response(content),
      [`${API}/v1/mods`]: (url, options) => (options.method === 'POST' ? json({ data: [modRecord({ latestFiles: [newer, beta] })] }) : json({}, 404))
    }
  });
  const installed = await f.service.install(42, 7);
  assert.equal(installed.verified, false, 'files without hashes are installed but reported as unverified');
  const result = await f.service.checkUpdates();
  assert.equal(result.checked, 1);
  assert.equal(result.updates[0].latest.id, 9, 'betas are not offered over a release');
  const body = JSON.parse(f.calls.find(call => call.options.method === 'POST').options.body);
  assert.deepEqual(body, { modIds: [42], filterPcOnly: true });
});

test('summaries drop unexpected values', () => {
  const summary = summarizeMod({ id: '5', name: 7, authors: 'x', latestFiles: [{ id: 1, downloadUrl: '' }], screenshots: [{ thumbnailUrl: 'javascript:alert(1)' }] });
  assert.equal(summary.id, 5);
  assert.equal(summary.name, '');
  assert.deepEqual(summary.authors, []);
  assert.deepEqual(summary.screenshots, []);
  assert.equal(summary.latestFiles[0].downloadAllowed, false);
});

test('popular creators are built only from authors CurseForge returns, ranked by their projects\' downloads', async t => {
  const projects = [
    modRecord({ id: 1, name: 'A', downloadCount: 100, authors: [{ id: 5, name: 'mossyhome', url: 'https://www.curseforge.com/members/mossyhome' }] }),
    modRecord({ id: 2, name: 'B', downloadCount: 900, authors: [{ id: 6, name: 'pixelpine', url: 'https://evil.example/x' }] }),
    modRecord({ id: 3, name: 'C', downloadCount: 50, authors: [{ id: 5, name: 'mossyhome' }] }),
    modRecord({ id: 4, name: 'D', downloadCount: 10, authors: [] })
  ];
  const f = await setup(t, { routes: { [`${API}/v1/mods/search`]: url => json({ data: new URL(url).searchParams.get('index') === '0' ? projects : [], pagination: { index: 0, pageSize: 50, resultCount: 4, totalCount: 4 } }) } });
  const creators = await f.service.popularCreators({ limit: 12 });
  assert.deepEqual(creators.map(c => [c.id, c.name, c.downloads, c.projectCount]), [[6, 'pixelpine', 900, 1], [5, 'mossyhome', 150, 2]]);
  assert.equal(creators[1].url, 'https://www.curseforge.com/members/mossyhome');
  assert.equal(creators[0].url, '', 'only curseforge.com profile links are kept');
  assert.equal(creators[1].projects[0].name, 'A');
  const searches = f.calls.filter(call => call.url.includes('/v1/mods/search'));
  assert.equal(searches.length, 2);
  for (const call of searches) assert.equal(new URL(call.url).searchParams.get('sortField'), '2');
});

test('search can be limited to one author', async t => {
  const f = await setup(t, { routes: { [`${API}/v1/mods/search`]: json({ data: [modRecord()], pagination: { index: 0, pageSize: 20, resultCount: 1, totalCount: 1 } }) } });
  await f.service.search({ authorId: 77 });
  assert.equal(new URL(f.calls.find(call => call.url.includes('/v1/mods/search')).url).searchParams.get('authorId'), '77');
});

test('with a proxy, sends the signed-in token instead of the key, and needs a session', async t => {
  const PROXY = 'https://project.supabase.co/functions/v1/curseforge-proxy';
  const routes = {
    [`${PROXY}/v1/games`]: json(GAMES),
    [`${PROXY}/v1/mods/search`]: json({ data: [modRecord()], pagination: { index: 0, pageSize: 20, resultCount: 1, totalCount: 1 } })
  };
  const f = await setup(t, { routes, config: { apiKey: '', proxyUrl: PROXY }, proxyToken: async () => ({ bearer: 'user-token', apikey: 'sb_publishable_test' }) });
  const result = await f.service.search({ query: 'kitchen' });
  assert.equal(result.mods.length, 1);
  assert.ok(f.calls.length >= 2);
  for (const call of f.calls) {
    assert.ok(call.url.startsWith(PROXY), call.url);
    assert.equal(call.options.headers.Authorization, 'Bearer user-token');
    assert.equal(call.options.headers['x-api-key'], undefined);
  }
  const signedOut = await setup(t, { routes, config: { apiKey: '', proxyUrl: PROXY }, proxyToken: async () => null });
  await assert.rejects(signedOut.service.search({ query: 'kitchen' }), error => error.code === 'CF_NOT_CONFIGURED');
});
