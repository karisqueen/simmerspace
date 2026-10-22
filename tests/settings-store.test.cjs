const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore, normalizeRoutes } = require('../electron/settings-store.cjs');

test('only well-formed absolute folder routes for known ids are kept', () => {
  const absolute = path.resolve(os.tmpdir(), 'Mods');
  const routes = normalizeRoutes({
    mods: { path: absolute, name: 'Mods', updated: 5, count: 3 },
    documents: { path: 'relative\\path' },
    game: { name: 'no path' },
    evil: { path: absolute },
    s4s: 'not an object'
  });
  assert.deepEqual(Object.keys(routes), ['mods']);
  assert.deepEqual(routes.mods, { id: 'mods', path: absolute, name: 'Mods', updated: 5 });
});

test('settings are written atomically and keep unrelated keys', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-settings-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ other: 1, routes: { mods: { path: 'bad' } } }));
  const store = createSettingsStore({ getUserDataPath: () => dir });
  assert.deepEqual(await store.loadRoutes(), {});
  const folder = path.join(dir, 'My Mods');
  const saved = await store.saveRoute('mods', folder);
  assert.equal(saved.name, 'My Mods');
  const data = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8'));
  assert.equal(data.other, 1);
  assert.equal(data.routes.mods.path, folder);
  assert.deepEqual((await fs.readdir(dir)).filter(name => name.endsWith('.tmp')), []);
  await assert.rejects(store.saveRoute('nope', folder));
});

test('a damaged settings file falls back to empty settings', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-settings-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'settings.json'), '{not json');
  assert.deepEqual(await createSettingsStore({ getUserDataPath: () => dir }).loadRoutes(), {});
});
