const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createModsService, moveNoOverwrite } = require('../electron/mods-service.cjs');

async function fixture(t, extra = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-organize-test-'));
  const mods = path.join(base, 'Mods');
  const data = path.join(base, 'appdata');
  await Promise.all([fs.mkdir(mods), fs.mkdir(data)]);
  const progress = [];
  let service;
  service = createModsService({
    app: { getPath: () => data },
    dialog: {},
    shell: {},
    getModsRoot: async () => mods,
    reportOrganize: value => {
      progress.push(value);
      extra.onProgress?.(value, service);
    }
  });
  t.after(async () => {
    const resolved = path.resolve(base);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir(), 'simmerspace-organize-test-')), 'cleanup stays in its temp prefix');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const write = async (relative, content = relative) => {
    await fs.mkdir(path.dirname(path.join(mods, relative)), { recursive: true });
    await fs.writeFile(path.join(mods, relative), content);
  };
  const read = relative => fs.readFile(path.join(mods, relative), 'utf8');
  const has = relative => fs.access(path.join(mods, relative)).then(() => true, () => false);
  return { base, mods, service, progress, write, read, has };
}

// Every file under Mods, with its content, as { 'a/b.package': 'content' } using forward slashes.
async function snapshot(root) {
  const out = {};
  async function walk(folder, prefix) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(folder, entry.name), rel);
      else out[rel] = await fs.readFile(path.join(folder, entry.name), 'utf8');
    }
  }
  await walk(root, '');
  return out;
}
const p = value => value.split('/').join(path.sep);

test('the preview is read-only and lists where every nested file would go', async t => {
  const f = await fixture(t);
  await f.write(p('Creator A/Set 1/Bob.package'));
  await f.write(p('Loose.package'));
  const before = await snapshot(f.mods);
  const plan = await f.service.planOrganize(
    [
      { relativePath: p('Creator A/Set 1/Bob.package'), folderName: 'Hair' },
      { relativePath: 'Loose.package', folderName: 'Hair' },
      { relativePath: 'Missing.package', folderName: 'Hair' }
    ],
    { layout: 'keep', duplicates: 'skip' }
  );
  assert.deepEqual(await snapshot(f.mods), before, 'planning must not change any file');
  assert.deepEqual(
    plan.items.map(item => [item.status, item.destination]),
    [
      ['move', p('Hair/Creator A/Set 1/Bob.package')],
      ['move', p('Hair/Loose.package')],
      ['error', '']
    ]
  );
  assert.equal(plan.items[2].code, 'NOT_FOUND');
  assert.deepEqual(plan.counts, { move: 2, unchanged: 0, duplicate: 0, error: 1, renamed: 0 });
  assert.equal('size' in plan.items[0], false, 'file fingerprints stay in the desktop app');
});

test('keep and flatten layouts; files already in a category folder are not nested twice', async t => {
  const f = await fixture(t);
  await f.write(p('Tops/Creator/Shirt.package'));
  await f.write(p('Hair/Creator/Bob.package'));
  const entries = [
    { relativePath: p('Tops/Creator/Shirt.package'), folderName: 'Dresses' },
    { relativePath: p('Hair/Creator/Bob.package'), folderName: 'Hair' }
  ];
  const keep = await f.service.planOrganize(entries, { layout: 'keep', categoryFolders: ['Tops', 'Hair', 'Dresses'] });
  assert.deepEqual(
    keep.items.map(item => [item.status, item.destination]),
    [
      ['move', p('Dresses/Creator/Shirt.package')],
      ['unchanged', p('Hair/Creator/Bob.package')]
    ]
  );
  const flat = await f.service.planOrganize(entries, { layout: 'flatten' });
  assert.deepEqual(
    flat.items.map(item => item.destination),
    [p('Dresses/Shirt.package'), p('Hair/Bob.package')]
  );
});

test('script mods that would end up too deep for the game go straight into the category folder', async t => {
  const f = await fixture(t);
  await f.write(p('Creator/Scripts/mccc.ts4script'));
  await f.write(p('Creator/Scripts/mccc.package'));
  const plan = await f.service.planOrganize(
    [
      { relativePath: p('Creator/Scripts/mccc.ts4script'), folderName: 'Script mods' },
      { relativePath: p('Creator/Scripts/mccc.package'), folderName: 'Script mods' }
    ],
    { layout: 'keep' }
  );
  assert.equal(plan.items[0].destination, p('Script mods/mccc.ts4script'));
  assert.equal(plan.items[0].flattenedForGame, true);
  assert.equal(plan.items[1].destination, p('Script mods/Creator/Scripts/mccc.package'));
  assert.equal(plan.items[1].flattenedForGame, false);
});

test('duplicate names are skipped or numbered, and never overwrite', async t => {
  const f = await fixture(t);
  await f.write(p('Hair/Bob.package'), 'already there');
  await f.write(p('A/Bob.package'), 'from A');
  await f.write(p('B/Bob.package'), 'from B');
  const entries = [
    { relativePath: p('A/Bob.package'), folderName: 'Hair' },
    { relativePath: p('B/Bob.package'), folderName: 'Hair' }
  ];
  const skip = await f.service.planOrganize(entries, { layout: 'flatten', duplicates: 'skip' });
  assert.deepEqual(skip.items.map(item => [item.status, item.code]), [['duplicate', 'DUPLICATE_SKIPPED'], ['duplicate', 'DUPLICATE_SKIPPED']]);
  const skipped = await f.service.applyOrganize(skip.planId);
  assert.equal(skipped.moved, 0);
  assert.equal(await f.read(p('Hair/Bob.package')), 'already there');

  const rename = await f.service.planOrganize(entries, { layout: 'flatten', duplicates: 'rename' });
  assert.deepEqual(rename.items.map(item => item.destination), [p('Hair/Bob (2).package'), p('Hair/Bob (3).package')]);
  assert.equal(rename.counts.renamed, 2);
  const moved = await f.service.applyOrganize(rename.planId);
  assert.equal(moved.moved, 2);
  assert.deepEqual(await snapshot(f.mods), {
    'Hair/Bob.package': 'already there',
    'Hair/Bob (2).package': 'from A',
    'Hair/Bob (3).package': 'from B'
  });
});

test('two files that would land on the same new name: the second is skipped in skip mode', async t => {
  const f = await fixture(t);
  await f.write(p('A/Same.package'), 'a');
  await f.write(p('B/Same.package'), 'b');
  const plan = await f.service.planOrganize(
    [
      { relativePath: p('A/Same.package'), folderName: 'Hair' },
      { relativePath: p('B/Same.package'), folderName: 'Hair' }
    ],
    { layout: 'flatten', duplicates: 'skip' }
  );
  assert.deepEqual(plan.items.map(item => item.status), ['move', 'duplicate']);
  await f.service.applyOrganize(plan.planId);
  assert.equal(await f.read(p('Hair/Same.package')), 'a');
  assert.equal(await f.read(p('B/Same.package')), 'b');
});

test('files changed, removed or blocked after the preview are left alone', async t => {
  const f = await fixture(t);
  await f.write('Changed.package', 'v1');
  await f.write('Removed.package', 'x');
  await f.write('Blocked.package', 'mine');
  await f.write('Fine.package', 'ok');
  const plan = await f.service.planOrganize(
    ['Changed.package', 'Removed.package', 'Blocked.package', 'Fine.package'].map(relativePath => ({ relativePath, folderName: 'Hair' })),
    { layout: 'flatten' }
  );
  await f.write('Changed.package', 'version two is longer');
  await fs.rm(path.join(f.mods, 'Removed.package'));
  await f.write(p('Hair/Blocked.package'), 'someone else');
  const result = await f.service.applyOrganize(plan.planId);
  assert.deepEqual(result.results.map(item => item.code || 'ok'), ['CHANGED_SINCE_PREVIEW', 'NOT_FOUND', 'NAME_CONFLICT', 'ok']);
  assert.equal(await f.read('Changed.package'), 'version two is longer');
  assert.equal(await f.read('Blocked.package'), 'mine');
  assert.equal(await f.read(p('Hair/Blocked.package')), 'someone else');
  assert.equal(await f.read(p('Hair/Fine.package')), 'ok');
});

test('a preview can be used once, and only for the folder it was made for', async t => {
  const f = await fixture(t);
  await f.write('One.package');
  const plan = await f.service.planOrganize([{ relativePath: 'One.package', folderName: 'Hair' }], {});
  const older = await f.service.planOrganize([{ relativePath: 'One.package', folderName: 'Hair' }], {});
  await assert.rejects(f.service.applyOrganize(plan.planId), { code: 'PLAN_EXPIRED' });
  await f.service.applyOrganize(older.planId);
  await assert.rejects(f.service.applyOrganize(older.planId), { code: 'PLAN_EXPIRED' });
});

test('progress is reported and Stop leaves the remaining files where they were', async t => {
  const f = await fixture(t, {
    // Pressing Stop as soon as the first progress update arrives (progress is throttled, so this is before any move).
    onProgress: (value, service) => {
      if (!value.finished) service.cancelOrganize();
    }
  });
  for (let i = 0; i < 5; i++) await f.write(`m${i}.package`);
  const plan = await f.service.planOrganize(
    Array.from({ length: 5 }, (_, i) => ({ relativePath: `m${i}.package`, folderName: 'Hair' })),
    { layout: 'flatten' }
  );
  const result = await f.service.applyOrganize(plan.planId);
  assert.equal(result.cancelled, true);
  assert.equal(result.moved, 0);
  assert.equal(result.results.filter(item => item.code === 'CANCELLED').length, 5);
  assert.equal(f.progress[0].done, 0);
  assert.equal(f.progress.at(-1).finished, true);
  assert.equal(f.service.isOrganizing(), false);
  for (const item of result.results.filter(item => item.code === 'CANCELLED')) assert.equal(await f.has(item.oldPath), true);
});

test('tags follow files when they are organized, toggled or renamed', async t => {
  const f = await fixture(t);
  await f.write(p('Deep/Bob.package'));
  await f.write('Script.ts4script');
  await f.service.saveCatalog({
    files: { [p('Deep/Bob.package')]: { categoryId: 'cas-hair' }, 'Script.ts4script': { creatorId: 'c1' }, 'Gone.package': { age: 'Teen' } },
    creators: [{ id: 'c1', name: 'Someone' }]
  });
  const plan = await f.service.planOrganize([{ relativePath: p('Deep/Bob.package'), folderName: 'Hair' }], { layout: 'keep' });
  await f.service.applyOrganize(plan.planId);
  await f.service.toggleMod('Script.ts4script');
  await f.service.renameMod(p('Hair/Deep/Bob.package'), 'Bob Hair');
  await f.service.whenIdle();
  const catalog = await f.service.loadCatalog();
  assert.deepEqual({ ...catalog.files }, {
    [p('Hair/Deep/Bob Hair.package')]: { categoryId: 'cas-hair' },
    'Script.ts4scriptoff': { creatorId: 'c1' },
    'Gone.package': { age: 'Teen' }
  });
  assert.equal(await f.has(p('Hair/Deep/Bob Hair.package')), true);
});

test('moving never replaces an existing file, even if it appears at the last moment', async t => {
  const f = await fixture(t);
  await f.write('a.package', 'a');
  await f.write('b.package', 'b');
  await assert.rejects(moveNoOverwrite(path.join(f.mods, 'a.package'), path.join(f.mods, 'b.package')), { code: 'NAME_CONFLICT' });
  assert.deepEqual(await snapshot(f.mods), { 'a.package': 'a', 'b.package': 'b' });
  await moveNoOverwrite(path.join(f.mods, 'a.package'), path.join(f.mods, 'c.package'));
  assert.deepEqual(await snapshot(f.mods), { 'b.package': 'b', 'c.package': 'a' });
});

test('organize options and entries are validated', async t => {
  const f = await fixture(t);
  await f.write('X.package');
  await assert.rejects(f.service.planOrganize('X.package', {}), { code: 'INVALID_INPUT' });
  const plan = await f.service.planOrganize(
    [
      { relativePath: 'X.package', folderName: 'Mods' },
      { relativePath: 'X.package', folderName: 'bad:name' },
      { relativePath: p('../escape.package'), folderName: 'Hair' }
    ],
    { layout: 'sideways', duplicates: 'overwrite' }
  );
  assert.equal(plan.layout, 'flatten');
  assert.equal(plan.duplicates, 'skip');
  assert.deepEqual(plan.items.map(item => item.code), ['NAME_RESERVED', 'NAME_INVALID', 'INVALID_PATH']);
});
