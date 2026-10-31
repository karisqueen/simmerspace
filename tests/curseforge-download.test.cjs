// The download path: each condition keeps its own name, the key goes only where CurseForge asks for it, and nothing
// half-downloaded ever reaches the Mods folder. All responses here are mocked; real runs are reported separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCurseForgeService } = require('../electron/curseforge-service.cjs');
const { moveNoOverwrite } = require('../electron/mods-service.cjs');

const API = 'https://api.curseforge.com';
const EDGE = 'https://edge.forgecdn.net/files/882/3491/Cozy.package';
const MEDIA = 'https://mediafilez.forgecdn.net/files/882/3491/Cozy.package';
const WEBSITE = 'https://www.curseforge.com/sims4/mods/cozy';
const KEY = 'test-key-not-real';
const BYTES = Buffer.from('DBPF package bytes');
const SHA1 = crypto.createHash('sha1').update(BYTES).digest('hex');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const games = () => json({ data: [{ id: 78062, slug: 'sims4', name: 'The Sims 4' }], pagination: { totalCount: 1 } });
const binary = (body = BYTES, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length) } });

function fileRecord(overrides = {}) {
  return { id: 7, modId: 42, fileName: 'Cozy.package', displayName: 'Cozy', fileLength: BYTES.length, downloadUrl: EDGE, isAvailable: true, hashes: [{ algo: 1, value: SHA1 }], ...overrides };
}
function modRecord(overrides = {}) {
  return { id: 42, name: 'Cozy', authors: [{ name: 'moss' }], links: { websiteUrl: WEBSITE }, allowModDistribution: true, ...overrides };
}

// `cdn` answers file-server requests; `link` answers the download-url endpoint.
async function setup(t, { mod = modRecord(), file = fileRecord(), link = () => json({ data: EDGE }), cdn = () => binary(), config = {}, proxy, onInstalled } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-dl-test-'));
  const mods = path.join(base, 'Mods');
  await fs.mkdir(mods);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const calls = [];
  const progress = [];
  const service = createCurseForgeService({
    getConfig: async () => ({ curseforge: { apiKey: KEY, baseUrl: API, proxyUrl: '', gameId: 0, ...config } }),
    getProxyToken: async () => ({ bearer: 'session', apikey: 'public' }),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, headers: options.headers || {} });
      if (url.startsWith(`${API}/v1/games`)) return games();
      if (url.includes('/download-url')) return link();
      if (url.includes('/cdn-resolve')) return proxy();
      if (url.includes('/v1/mods/42/files/7')) return json({ data: file });
      if (url.includes('/v1/mods/42')) return json({ data: mod });
      return cdn(url, options);
    },
    wait: async () => {},
    userDataPath: () => path.join(base, 'data'),
    getModsRoot: async () => mods,
    moveNoOverwrite,
    onProgress: item => progress.push(item),
    onInstalled
  });
  return { service, calls, mods, base, progress };
}
const noFilesIn = async f => {
  const walk = async dir => (await fs.readdir(dir, { withFileTypes: true })).flatMap(entry => entry.name).length;
  assert.equal(await walk(f.mods), 0, 'nothing may be left in Mods');
};

test('a file with its own link downloads, is checked and is registered', async t => {
  let registered = null;
  const f = await setup(t, { onInstalled: item => (registered = item) });
  const result = await f.service.install(42, 7);
  assert.equal(result.verified, true);
  assert.equal(await fs.readFile(path.join(f.mods, result.files[0]), 'utf8'), BYTES.toString());
  assert.equal(registered.files[0].originalName, 'Cozy.package');
  assert.equal(registered.files[0].sha256, crypto.createHash('sha256').update(BYTES).digest('hex'));
  assert.ok(f.progress.some(item => item.done), 'progress reaches the page');
  assert.ok(!f.calls.some(call => call.url.includes('/download-url')), 'no extra request when the file already has a link');
});

test('a file without a link asks the download-url endpoint before concluding anything', async t => {
  const f = await setup(t, { file: fileRecord({ downloadUrl: null }) });
  const result = await f.service.install(42, 7);
  assert.equal(result.verified, true);
  assert.ok(f.calls.some(call => call.url.includes('/download-url')));
});

test('the author restriction is only reported when the project flag and the endpoint both say so', async t => {
  const f = await setup(t, { mod: modRecord({ allowModDistribution: false }), file: fileRecord({ downloadUrl: null }), link: () => new Response(null, { status: 403 }) });
  await assert.rejects(f.service.install(42, 7), error => error.code === 'CF_DOWNLOAD_NOT_ALLOWED' && error.details.pageUrl === `${WEBSITE}/files/7`);
  await noFilesIn(f);
});

test('a project that allows distribution is never blamed on the author', async t => {
  const denied = await setup(t, { file: fileRecord({ downloadUrl: null }), link: () => new Response(null, { status: 403 }) });
  await assert.rejects(denied.service.install(42, 7), { code: 'CF_LINK_DENIED' });
  const missing = await setup(t, { file: fileRecord({ downloadUrl: null }), link: () => new Response(null, { status: 404 }) });
  await assert.rejects(missing.service.install(42, 7), { code: 'CF_NO_LINK' });
  const unknownFlag = await setup(t, { mod: modRecord({ allowModDistribution: null }), file: fileRecord({ downloadUrl: null }), link: () => new Response(null, { status: 403 }) });
  await assert.rejects(unknownFlag.service.install(42, 7), { code: 'CF_LINK_DENIED' });
});

test('a project with the flag off still downloads if CurseForge provides the link', async t => {
  const f = await setup(t, { mod: modRecord({ allowModDistribution: false }), file: fileRecord({ downloadUrl: null }) });
  assert.equal((await f.service.install(42, 7)).verified, true);
});

test('an unavailable file is not reported as an author decision', async t => {
  const f = await setup(t, { file: fileRecord({ isAvailable: false }) });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_FILE_UNAVAILABLE' });
});

test('a rejected API key at the endpoint stays an authentication failure', async t => {
  const f = await setup(t, { file: fileRecord({ downloadUrl: null }), link: () => new Response(null, { status: 401 }) });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_UNAUTHORIZED' });
});

test('the key goes to edge.forgecdn.net as a header and never follows the redirect', async t => {
  const f = await setup(t, { cdn: url => (url === EDGE ? new Response(null, { status: 302, headers: { location: MEDIA } }) : binary()) });
  await f.service.install(42, 7);
  const edge = f.calls.find(call => call.url === EDGE);
  const media = f.calls.find(call => call.url === MEDIA);
  assert.equal(edge.headers['x-api-key'], KEY);
  assert.equal(media.headers['x-api-key'], undefined, 'the key must not reach the redirect target');
  assert.ok(f.calls.every(call => !call.url.includes(KEY)), 'the key is never part of an address');
});

test('with the proxy the app has no key: the server resolves the CDN address', async t => {
  const f = await setup(t, { config: { apiKey: '', proxyUrl: 'https://x.supabase.co/functions/v1/curseforge-proxy' }, proxy: () => json({ url: MEDIA }), cdn: url => (url === MEDIA ? binary() : new Response(null, { status: 401 })) });
  const result = await f.service.install(42, 7);
  assert.equal(result.verified, true);
  assert.ok(!f.calls.some(call => call.url === EDGE), 'the CDN is reached through the resolved address');
});

test('a proxy without the CDN route falls back to a plain request', async t => {
  const f = await setup(t, { config: { apiKey: '', proxyUrl: 'https://x.supabase.co/functions/v1/curseforge-proxy' }, proxy: () => json({ error: 'not allowed' }, 404) });
  assert.equal((await f.service.install(42, 7)).verified, true);
});

test('file-server failures are told apart', async t => {
  for (const [status, code] of [[401, 'CF_CDN_AUTH'], [403, 'CF_CDN_AUTH'], [404, 'CF_CDN_NOT_FOUND'], [503, 'CF_CDN_FAILED']]) {
    const f = await setup(t, { cdn: () => new Response('no', { status }) });
    await assert.rejects(f.service.install(42, 7), { code });
    await noFilesIn(f);
  }
});

test('a web page instead of the file is refused, by header or by content', async t => {
  const page = Buffer.from('<!doctype html><title>x</title>');
  const byHeader = await setup(t, { cdn: () => new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }) });
  await assert.rejects(byHeader.service.install(42, 7), { code: 'CF_NOT_A_FILE' });
  const byContent = await setup(t, { file: fileRecord({ fileLength: page.length, hashes: [] }), cdn: () => binary(page) });
  await assert.rejects(byContent.service.install(42, 7), { code: 'CF_NOT_A_FILE' });
  await noFilesIn(byContent);
});

test('temporary failures are retried, permanent ones are not', async t => {
  let attempts = 0;
  const flaky = await setup(t, { cdn: () => (++attempts < 3 ? new Response('busy', { status: 503 }) : binary()) });
  assert.equal((await flaky.service.install(42, 7)).verified, true);
  assert.equal(attempts, 3);
  let denied = 0;
  const f = await setup(t, {
    cdn: () => {
      denied++;
      return new Response('no', { status: 403 });
    }
  });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_CDN_AUTH' });
  assert.equal(denied, 1);
});

test('a connection that drops mid-download is retried, and never counts as installed', async t => {
  const broken = () => new Response(new ReadableStream({ start: c => { c.enqueue(BYTES.subarray(0, 4)); c.error(new Error('reset')); } }), { status: 200 });
  const f = await setup(t, { cdn: broken });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_NETWORK' });
  await noFilesIn(f);
  assert.deepEqual(await fs.readdir(path.join(f.base, 'data', 'downloads-tmp')), [], 'no partial file is kept');
});

test('a corrupted transfer is tried again once, then refused', async t => {
  const wrong = Buffer.from('XBPF package bytes');
  let attempts = 0;
  const recovers = await setup(t, { cdn: () => binary(++attempts === 1 ? wrong : BYTES) });
  assert.equal((await recovers.service.install(42, 7)).verified, true);
  const f = await setup(t, { cdn: () => binary(wrong) });
  await assert.rejects(f.service.install(42, 7), { code: 'CF_HASH_MISMATCH' });
  await noFilesIn(f);
});

test('stopping a download leaves nothing behind', async t => {
  let release;
  const f = await setup(t, {
    cdn: (url, options) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(BYTES.subarray(0, 2));
            release();
            options.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
          }
        }),
        { status: 200 }
      )
  });
  const started = new Promise(resolve => (release = resolve));
  const running = f.service.install(42, 7);
  await started;
  assert.deepEqual(f.service.cancelInstall(42, 7), { cancelled: true });
  await assert.rejects(running, { code: 'CF_CANCELLED' });
  await noFilesIn(f);
});

test('the same version is not installed twice unless asked', async t => {
  const f = await setup(t);
  await f.service.install(42, 7);
  await assert.rejects(f.service.install(42, 7), { code: 'CF_ALREADY_INSTALLED' });
  assert.equal((await f.service.install(42, 7, { reinstall: true })).verified, true);
});

test('a website download is installed only if it matches CurseForge exactly, and is left in place', async t => {
  const f = await setup(t, { mod: modRecord({ allowModDistribution: false }), file: fileRecord({ downloadUrl: null }) });
  const downloads = path.join(f.base, 'Downloads');
  await fs.mkdir(downloads);
  const good = path.join(downloads, 'Cozy (1).package');
  assert.equal(await f.service.findDownloaded(42, 7, downloads), null, 'nothing there yet');
  await fs.writeFile(good, BYTES);
  assert.equal(await f.service.findDownloaded(42, 7, downloads), good, 'a browser may rename the file');
  const result = await f.service.installLocalFile(42, 7, good);
  assert.equal(result.verified, true);
  assert.equal(await fs.readFile(good, 'utf8'), BYTES.toString(), "the player's download is not touched");
  const fake = path.join(downloads, 'other.package');
  await fs.writeFile(fake, Buffer.alloc(BYTES.length, 1));
  await assert.rejects(f.service.installLocalFile(42, 7, fake, { reinstall: true }), { code: 'CF_LOCAL_FILE_MISMATCH' });
});

test('the page never shares one global name between two scripts', async () => {
  const dir = path.join(__dirname, '..', 'renderer', 'js');
  const owners = new Map();
  for (const name of await fs.readdir(dir)) {
    const source = await fs.readFile(path.join(dir, name), 'utf8');
    for (const match of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
      const key = match[1] || match[2];
      assert.ok(!owners.has(key) || owners.get(key) === name, `${key} is declared in ${owners.get(key)} and ${name}`);
      owners.set(key, name);
    }
  }
});
