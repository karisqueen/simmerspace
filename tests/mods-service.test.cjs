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
