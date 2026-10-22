const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createModsService } = require('../electron/mods-service.cjs');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-mods-test-'));
  const mods = path.join(base, 'Mods');
  const source = path.join(base, 'source');
  const data = path.join(base, 'appdata');
  await Promise.all([fs.mkdir(mods), fs.mkdir(source), fs.mkdir(data)]);
  let chosen = { canceled: true, filePaths: [] };
  const trashed = [];
  const service = createModsService({
    app: { getPath: () => data },
    dialog: { showOpenDialog: async () => chosen },
    shell: { trashItem: async file => trashed.push(file) },
    getModsRoot: async () => mods
  });
  t.after(async () => {
    const safeBase = path.resolve(os.tmpdir(), 'simmerspace-mods-test-');
    const resolved = path.resolve(base);
    assert.ok(resolved.startsWith(safeBase), 'cleanup path must stay in its dedicated temp prefix');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return { base, mods, source, service, trashed, choose: value => { chosen = value; } };
}

test('scans supported active and disabled files; toggle round-trips extensions', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.mods, 'Deep', 'Nested'), { recursive: true });
  await fs.writeFile(path.join(f.mods, 'A.package'), 'package');
  await fs.writeFile(path.join(f.mods, 'Deep', 'B.ts4script'), 'script');
  await fs.writeFile(path.join(f.mods, 'off.packageoff'), 'disabled');
  await fs.writeFile(path.join(f.mods, 'ignore.zip'), 'ignored');
  const scan = await f.service.scan();
  assert.equal(scan.files.length, 3);
  assert.equal(scan.files.find(file => file.name === 'B.ts4script').depth, 1);
  const disabled = await f.service.toggleMod('A.package');
  assert.equal(disabled.newPath, 'A.packageoff');
  assert.equal((await fs.readFile(path.join(f.mods, 'A.packageoff'), 'utf8')), 'package');
  const enabled = await f.service.toggleMod(disabled.newPath);
  assert.equal(enabled.newPath, 'A.package');
});

test('renames, organizes and creates selected folders without overwriting conflicts', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'Original.package'), 'one');
  await fs.mkdir(path.join(f.mods, 'Clothing'));
  await fs.writeFile(path.join(f.mods, 'Clothing', 'Renamed.package'), 'existing');
  const renamed = await f.service.renameMod('Original.package', 'Renamed');
  assert.equal(renamed.newPath, 'Renamed.package');
  const result = await f.service.organizeMods([{ relativePath: renamed.newPath, folderName: 'Clothing' }]);
  assert.equal(result.moved, 0);
  assert.equal(result.skipped, 1);
  assert.equal(await fs.readFile(path.join(f.mods, 'Renamed.package'), 'utf8'), 'one');
  assert.deepEqual((await f.service.createCategoryFolders(['Hair', 'Clothing'])).folders, ['Hair', 'Clothing']);
});

test('moves selected files into the chosen first-level category folder', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'Hair.package'), 'cc');
  const result = await f.service.organizeMods([{ relativePath: 'Hair.package', folderName: 'Hair' }]);
  assert.equal(result.moved, 1);
  assert.equal(await fs.readFile(path.join(f.mods, 'Hair', 'Hair.package'), 'utf8'), 'cc');
  assert.equal((await f.service.scan()).files[0].depth, 1);
});

test('imports by copying, disambiguates names, and routes folder imports under Imported', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'Same.package'), 'existing');
  await fs.writeFile(path.join(f.source, 'Same.package'), 'copy');
  f.choose({ canceled: false, filePaths: [path.join(f.source, 'Same.package')] });
  const filesResult = await f.service.importMods('files');
  assert.equal(filesResult.imported, 1);
  assert.equal(await fs.readFile(path.join(f.mods, 'Same (2).package'), 'utf8'), 'copy');
  const folder = path.join(f.base, 'bundle');
  await fs.mkdir(path.join(folder, 'nested'), { recursive: true });
  await fs.writeFile(path.join(folder, 'nested', 'Script.ts4script'), 'script');
  f.choose({ canceled: false, filePaths: [folder] });
  const folderResult = await f.service.importMods('folder');
  assert.equal(folderResult.imported, 1);
  assert.equal(await fs.readFile(path.join(f.mods, 'Imported', 'bundle', 'nested', 'Script.ts4script'), 'utf8'), 'script');
  assert.equal(await fs.readFile(path.join(f.source, 'Same.package'), 'utf8'), 'copy');
});

test('catalog metadata is stored per selected Mods root and deletion uses the provided Recycle Bin adapter', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'Tagged.package'), 'package');
  await f.service.saveCatalog({ files: { 'Tagged.package': { categoryId: 'cas-hair', creatorId: 'creator-a' } }, categories: [], creators: [] });
  assert.deepEqual((await f.service.loadCatalog()).files['Tagged.package'], { categoryId: 'cas-hair', creatorId: 'creator-a' });
  await f.service.trashMod('Tagged.package');
  assert.deepEqual(f.trashed, [path.join(f.mods, 'Tagged.package')]);
});

test('rejects traversal paths and unsupported extensions', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.toggleMod('../outside.package'));
  await fs.writeFile(path.join(f.mods, 'notes.txt'), 'no');
  await assert.rejects(f.service.renameMod('notes.txt', 'renamed'));
});

test('reports stable error codes for missing folders, missing files and name conflicts', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'A.package'), 'a');
  await fs.writeFile(path.join(f.mods, 'A.packageoff'), 'old copy');
  await assert.rejects(f.service.toggleMod('A.package'), { code: 'NAME_CONFLICT' });
  assert.equal(await fs.readFile(path.join(f.mods, 'A.packageoff'), 'utf8'), 'old copy');
  await assert.rejects(f.service.toggleMod('Gone.package'), { code: 'NOT_FOUND' });
  await assert.rejects(f.service.renameMod('A.package', 'bad:name'), { code: 'NAME_INVALID' });
  await assert.rejects(f.service.toggleMod('../outside.package'), { code: 'INVALID_PATH' });
  const unset = createModsService({ app: { getPath: () => f.base }, dialog: {}, shell: {}, getModsRoot: async () => '' });
  await assert.rejects(unset.scan(), { code: 'MODS_ROOT_NOT_SET' });
  const missing = createModsService({ app: { getPath: () => f.base }, dialog: {}, shell: {}, getModsRoot: async () => path.join(f.base, 'nope') });
  await assert.rejects(missing.scan(), { code: 'MODS_ROOT_UNAVAILABLE' });
});

test('batch actions skip failures per file with a code and keep going', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'One.package'), '1');
  await fs.writeFile(path.join(f.mods, 'Two.package'), '2');
  await fs.writeFile(path.join(f.mods, 'Two.packageoff'), 'conflict');
  const result = await f.service.toggleMods(['One.package', 'Two.package', 'Missing.package'], false);
  assert.equal(result.changed, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.results.filter(item => !item.ok).map(item => item.code), ['NAME_CONFLICT', 'NOT_FOUND']);
  const trash = await f.service.trashMods(['One.packageoff', 'Missing.package']);
  assert.equal(trash.deleted, 1);
  assert.equal(trash.results[1].code, 'NOT_FOUND');
  await assert.rejects(f.service.toggleMods('One.package', true), { code: 'INVALID_INPUT' });
});

test('scan results are sorted, read-only, and a second concurrent scan is refused', async t => {
  const f = await fixture(t);
  for (const name of ['b10.package', 'b2.package', 'a.ts4script']) await fs.writeFile(path.join(f.mods, name), 'x');
  const before = (await fs.readdir(f.mods)).sort();
  const [first, second] = await Promise.allSettled([f.service.scan(), f.service.scan()]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.reason.code, 'SCAN_IN_PROGRESS');
  assert.deepEqual(first.value.files.map(file => file.name), ['a.ts4script', 'b2.package', 'b10.package']);
  assert.deepEqual((await fs.readdir(f.mods)).sort(), before);
  assert.equal(f.service.isScanning(), false);
});

test('a cancelled scan stops early and says so', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 2500; i++) await fs.writeFile(path.join(f.mods, `m${i}.package`), '');
  let service;
  service = createModsService({
    app: { getPath: () => f.base },
    dialog: {},
    shell: {},
    getModsRoot: async () => f.mods,
    report: progress => {
      if (!progress.done) service.cancel();
    }
  });
  const result = await service.scan();
  assert.equal(result.cancelled, true);
  assert.ok(result.files.length < 2500);
});

test('rename keeps the extension, ignores its case, and supports case-only changes', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'Hair.Package'), 'h');
  const typed = await f.service.renameMod('Hair.Package', 'Pretty Hair.package');
  assert.equal(typed.newPath, 'Pretty Hair.Package');
  const caseOnly = await f.service.renameMod('Pretty Hair.Package', 'PRETTY HAIR');
  assert.equal(caseOnly.newPath, 'PRETTY HAIR.Package');
  assert.deepEqual(await fs.readdir(f.mods), ['PRETTY HAIR.Package']);
});

test('imports report skipped files instead of failing the whole import', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, 'Good.package'), 'g');
  await fs.writeFile(path.join(f.source, 'notes.txt'), 'n');
  await fs.writeFile(path.join(f.mods, 'Inside.package'), 'i');
  f.choose({ canceled: false, filePaths: [path.join(f.source, 'Good.package'), path.join(f.source, 'notes.txt'), path.join(f.mods, 'Inside.package')] });
  const result = await f.service.importMods('files');
  assert.equal(result.imported, 1);
  assert.equal(result.unsupported, 1);
  assert.equal(result.failures[0].code, 'IMPORT_INSIDE_ROOT');
  f.choose({ canceled: false, filePaths: [f.mods] });
  await assert.rejects(f.service.importMods('folder'), { code: 'IMPORT_INSIDE_ROOT' });
  f.choose({ canceled: true, filePaths: [] });
  assert.equal((await f.service.importMods('files')).canceled, true);
});

test('organize refuses a folder named Mods and never overwrites', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.mods, 'X.package'), 'x');
  const result = await f.service.organizeMods([{ relativePath: 'X.package', folderName: 'mods' }]);
  assert.equal(result.results[0].code, 'NAME_RESERVED');
  await assert.rejects(f.service.createCategoryFolders(['Mods']), { code: 'NAME_RESERVED' });
  assert.deepEqual((await f.service.createCategoryFolders(['Hair', 'hair'])).folders, ['Hair']);
});

test('catalog writes are tracked so the app can wait for them before quitting', async t => {
  const f = await fixture(t);
  const pending = f.service.saveCatalog({ files: { 'A.package': { categoryId: 'cas-hair', bogus: 'x' } } });
  assert.equal(f.service.hasPendingWrites(), true);
  await pending;
  await f.service.whenIdle();
  assert.equal(f.service.hasPendingWrites(), false);
  assert.deepEqual((await f.service.loadCatalog()).files['A.package'], { categoryId: 'cas-hair' });
});
