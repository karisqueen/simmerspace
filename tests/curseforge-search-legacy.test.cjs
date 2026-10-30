// Tests written for the 0.9.0 search API, kept unchanged against the 0.10.0 service.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCurseForgeService } = require('../electron/curseforge-service.cjs');

function response(data, pagination) {
  return { ok: true, status: 200, json: async () => ({ data, ...(pagination ? { pagination } : {}) }) };
}

test('search discovers the Sims 4 game from the API and keeps the key in main-process request headers', async () => {
  const calls = [];
  const api = createCurseForgeService({ getApiKey: () => 'private-key', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? response([{ id: 7, name: 'The Sims 4' }])
      : response([{ id: 11, name: 'Cozy set', summary: '<unsafe>', links: { websiteUrl: 'https://www.curseforge.com/sims4/mods/cozy-set' }, authors: [{ name: 'Creator' }] }], { index: 0, pageSize: 24, totalCount: 1 });
  } });
  const result = await api.searchMods('  cozy home  ');
  assert.equal(result.items[0].name, 'Cozy set');
  assert.equal(result.items[0].summary, '<unsafe>');
  assert.equal(new URL(calls[1].url).searchParams.get('gameId'), '7');
  assert.equal(new URL(calls[1].url).searchParams.get('searchFilter'), 'cozy home');
  assert.equal(calls[0].options.headers['x-api-key'], 'private-key');
  assert.equal(calls[1].options.cache, 'no-store');
});

test('file metadata is returned without persisting it and download URLs stay on the official CDN', async () => {
  // 0.9.0 listed a games reply first here, but fetching files never asks for the game list, so that reply
  // was handed to the files request and this test failed in 0.9.0 too. The assertions are unchanged.
  const urls = [
    response([{ id: 52, displayName: 'Latest', fileName: 'latest.package', allowModDistribution: true }], { index: 0, pageSize: 24, totalCount: 1 }),
    response('https://edge.forgecdn.net/files/1/2/latest.package?sig=abc')
  ];
  const api = createCurseForgeService({ getApiKey: () => 'key', fetchImpl: async () => urls.shift() });
  assert.equal((await api.getModFiles(88)).items[0].allowModDistribution, true);
  assert.match(await api.getDownloadUrl(88, 52), /^https:\/\/edge\.forgecdn\.net\//);

  const bad = createCurseForgeService({ getApiKey: () => 'key', fetchImpl: async () => response('https://evil.example/file') });
  await assert.rejects(bad.getDownloadUrl(88, 52), { code: 'CURSEFORGE_DOWNLOAD_UNAVAILABLE' });
});

test('missing keys and invalid input make no network requests', async () => {
  let calls = 0;
  const api = createCurseForgeService({ getApiKey: () => '', fetchImpl: async () => { calls++; } });
  assert.equal(api.isConfigured(), false);
  await assert.rejects(api.searchMods('chair'), { code: 'CURSEFORGE_NOT_CONFIGURED' });
  await assert.rejects(api.searchMods('   '), { code: 'CURSEFORGE_SEARCH_EMPTY' });
  assert.equal(calls, 0);
});
