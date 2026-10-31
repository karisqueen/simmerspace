// Library metadata, Library Care and the game's Options.ini, with real files in temporary folders.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLibraryMetadata } = require('../electron/library-metadata.cjs');
const { createLibraryTools, classify } = require('../electron/library-tools.cjs');
const { createModsService } = require('../electron/mods-service.cjs');
const { createSims4Config, readValues, applyValues, BACKUP_SUFFIX } = require('../electron/sims4-config.cjs');

const PACKAGE = text => Buffer.from(`DBPF${text}`);

async function setup(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-care-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'Mods');
  const data = path.join(base, 'data');
  await fs.mkdir(root);
  await fs.mkdir(data);
  const metadata = createLibraryMetadata({ userDataPath: () => data });
  const put = async (relative, content = PACKAGE('x')) => {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), content);
  };
  const scan = list => metadata.reconcile(root, list.map(relativePath => ({ relativePath })));
  const changed = [];
  const deleted = [];
  const tools = createLibraryTools({ getRoot: async () => root, metadata, userDataPath: () => data, onPathsChanged: async (_r, pairs) => changed.push(...pairs), onDeleted: async (_r, paths) => deleted.push(...paths) });
  return { base, root, data, metadata, put, scan, tools, changed, deleted };
}
const exists = file => fs.lstat(file).then(() => true, () => false);

test('a file renamed outside the app keeps its identity, found by content', async t => {
  const f = await setup(t);
  await f.put('Old name.package', PACKAGE('one'));
  await f.scan(['Old name.package']);
  const before = (await f.metadata.summary(f.root))['Old name.package'];
  await fs.rename(path.join(f.root, 'Old name.package'), path.join(f.root, 'New name.package'));
  const result = await f.scan(['New name.package']);
  assert.deepEqual(result.moved, [['Old name.package', 'New name.package']]);
  assert.equal((await f.metadata.summary(f.root))['New name.package'].id, before.id);
});

test('new contents under a new name never inherit the metadata of a missing file', async t => {
  const f = await setup(t);
  await f.put('a.package', PACKAGE('one'));
  await f.scan(['a.package']);
  await fs.rm(path.join(f.root, 'a.package'));
  await f.put('b.package', PACKAGE('two'));
  const result = await f.scan(['b.package']);
  assert.deepEqual(result.moved, []);
});

test('two identical copies do not fight over one entry', async t => {
  const f = await setup(t);
  await f.put('a.package');
  await f.put('folder/b.package');
  await f.scan(['a.package', path.join('folder', 'b.package')]);
  const summary = await f.metadata.summary(f.root);
  assert.notEqual(summary['a.package'].id, summary[path.join('folder', 'b.package')].id);
});

test('a second scan only reads what changed', async t => {
  const f = await setup(t);
  await f.put('a.package');
  assert.equal((await f.scan(['a.package'])).hashed, 1);
  assert.equal((await f.scan(['a.package'])).hashed, 0);
});

test('tags survive the loss of the catalog', async t => {
  const f = await setup(t);
  await f.put('a.package');
  await f.scan(['a.package']);
  await f.metadata.snapshotTags(f.root, { 'a.package': { categoryId: 'cas-hair', labels: ['cozy'] } });
  assert.deepEqual(await f.metadata.recoverTags(f.root, {}), { 'a.package': { categoryId: 'cas-hair', labels: ['cozy'] } });
  assert.deepEqual(await f.metadata.recoverTags(f.root, { 'a.package': { categoryId: 'other' } }), {});
});

test('an unreadable metadata file is set aside and the backup takes over', async t => {
  const f = await setup(t);
  await f.put('a.package');
  await f.scan(['a.package']);
  await f.scan(['a.package']);
  await f.metadata.whenIdle();
  await fs.writeFile(path.join(f.data, 'library-metadata.json'), '{ broken');
  const again = createLibraryMetadata({ userDataPath: () => f.data });
  assert.ok((await again.summary(f.root))['a.package'], 'the backup still knows the file');
  assert.ok((await fs.readdir(f.data)).some(name => name.includes('.unreadable-')), 'the damaged file is kept');
});

test('a damaged tag catalog is never replaced by nothing', async t => {
  const f = await setup(t);
  const app = { getPath: () => f.data };
  const service = createModsService({ app, dialog: {}, shell: {}, getModsRoot: async () => f.root });
  await service.saveCatalog({ files: { 'a.package': { categoryId: 'cas-hair', labels: ['cozy'] } } });
  await service.saveCatalog({ files: { 'a.package': { categoryId: 'cas-hair', labels: ['cozy'] }, 'b.package': { age: 'adult' } } });
  await fs.writeFile(path.join(f.data, 'mods-catalog.json'), 'not json');
  const loaded = await service.loadCatalog();
  assert.deepEqual(loaded.files['a.package'], { categoryId: 'cas-hair', labels: ['cozy'] });
  assert.ok((await fs.readdir(f.data)).some(name => name.startsWith('mods-catalog.json.unreadable-')));
});

test('duplicates: identical content by hash, same name listed apart', async t => {
  const f = await setup(t);
  await f.put('one/Hair.package', PACKAGE('same'));
  await f.put('two/Copy.package', PACKAGE('same'));
  await f.put('three/Dress.package', PACKAGE('first'));
  await f.put('four/Dress.package', PACKAGE('second'));
  await f.scan([path.join('one', 'Hair.package'), path.join('two', 'Copy.package'), path.join('three', 'Dress.package'), path.join('four', 'Dress.package')]);
  const result = await f.tools.findDuplicates();
  assert.equal(result.exact.length, 1);
  assert.deepEqual(result.exact[0].files.map(file => file.name).sort(), ['Copy.package', 'Hair.package']);
  assert.equal(result.possible.length, 1);
  assert.equal(result.possible[0].name, 'dress.package');
});

test('deleting is limited to what the scan found, and reports each outcome', async t => {
  const f = await setup(t);
  await f.put('one/a.package');
  await f.put('two/a.package');
  await f.put('safe.package', PACKAGE('other'));
  await f.scan([path.join('one', 'a.package'), path.join('two', 'a.package'), 'safe.package']);
  await f.tools.findDuplicates();
  const result = await f.tools.deletePermanently({ files: [path.join('one', 'a.package'), 'safe.package', '..\\outside.package'] });
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 2);
  assert.equal(await exists(path.join(f.root, 'one', 'a.package')), false);
  assert.equal(await exists(path.join(f.root, 'safe.package')), true, 'a file the scan did not list is refused');
  assert.equal(result.results.find(item => item.relativePath === 'safe.package').code, 'NOT_IN_SCAN');
  assert.deepEqual(f.deleted, [path.join('one', 'a.package')]);
});

test('empty folders: nested ones count, a hidden file does not make a folder empty', async t => {
  const f = await setup(t);
  await fs.mkdir(path.join(f.root, 'outer', 'inner'), { recursive: true });
  await fs.mkdir(path.join(f.root, 'kept'));
  await fs.writeFile(path.join(f.root, 'kept', '.hidden'), 'x');
  await f.put('used/a.package');
  const { folders } = await f.tools.findEmptyFolders();
  assert.deepEqual(folders, ['outer', path.join('outer', 'inner')]);
  const result = await f.tools.deletePermanently({ folders });
  assert.equal(result.deleted, 2, 'the deepest goes first');
  assert.equal(await exists(path.join(f.root, 'outer')), false);
  assert.equal(await exists(path.join(f.root, 'kept', '.hidden')), true);
});

test('a folder that filled up after the scan is left alone', async t => {
  const f = await setup(t);
  await fs.mkdir(path.join(f.root, 'later'));
  await f.tools.findEmptyFolders();
  await f.put('later/new.package');
  const result = await f.tools.deletePermanently({ folders: ['later'] });
  assert.equal(result.results[0].code, 'FOLDER_NOT_EMPTY');
  assert.equal(await exists(path.join(f.root, 'later', 'new.package')), true);
});

test('stray files are sorted without assuming anything is useless', async t => {
  assert.deepEqual(classify('readme.txt'), { kind: 'unnecessary', reason: 'document' });
  assert.deepEqual(classify('Thumbs.db'), { kind: 'unnecessary', reason: 'system' });
  assert.deepEqual(classify('pack.zip'), { kind: 'review', reason: 'archive' });
  assert.deepEqual(classify('settings.cfg'), { kind: 'review', reason: 'modSupport' });
  assert.deepEqual(classify('Resource.cfg'), { kind: 'recognized', reason: 'gameConfig' });
  assert.deepEqual(classify('thing.xyz'), { kind: 'unrecognized', reason: 'unknownType' });
  const f = await setup(t);
  await f.put('good.package', PACKAGE('x'));
  await f.put('script.ts4script', Buffer.from('PK\u0003\u0004'));
  await f.put('fake.package', Buffer.from('not a package'));
  await f.put('notes.txt', 'hello');
  const result = await f.tools.findStrayFiles();
  assert.equal(result.recognized, 2);
  assert.deepEqual(result.review.map(item => [item.name, item.reason]), [['fake.package', 'damaged']]);
  assert.deepEqual(result.unnecessary.map(item => item.name), ['notes.txt']);
  assert.equal(await exists(path.join(f.root, 'notes.txt')), true, 'scanning deletes nothing');
});

test('the original name comes back, and never over another file', async t => {
  const f = await setup(t);
  await f.put('folder/Renamed.package');
  await f.metadata.register(f.root, [{ relativePath: path.join('folder', 'Renamed.package'), sha256: 'abc', originalName: 'Original.package' }], { modId: 1, fileId: 2 });
  const result = await f.tools.restoreOriginalName(path.join('folder', 'Renamed.package'));
  assert.equal(result.newPath, path.join('folder', 'Original.package'));
  assert.equal(await exists(path.join(f.root, 'folder', 'Original.package')), true);
  assert.equal(f.changed.length, 1);
  await f.put('folder/Other.package', PACKAGE('b'));
  await f.metadata.register(f.root, [{ relativePath: path.join('folder', 'Other.package'), sha256: 'b', originalName: 'Original.package' }], null);
  await assert.rejects(f.tools.restoreOriginalName(path.join('folder', 'Other.package')), { code: 'NAME_CONFLICT' });
});

test('without a recorded name nothing is guessed', async t => {
  const f = await setup(t);
  await f.put('mine.package');
  await f.scan(['mine.package']);
  assert.equal((await f.tools.originalNameStatus('mine.package')).known, false);
  await assert.rejects(f.tools.restoreOriginalName('mine.package'), { code: 'ORIGINAL_NAME_UNKNOWN' });
});

test('previews stay local, follow the file, and are not added to the mod', async t => {
  const f = await setup(t);
  await f.put('a.package', PACKAGE('one'));
  await f.scan(['a.package']);
  const before = await fs.readFile(path.join(f.root, 'a.package'));
  const saved = await f.tools.savePreview('a.package', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(await exists(path.join(f.data, 'library-previews', `${saved.id}.jpg`)), true);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'a.package')), before);
  await fs.rename(path.join(f.root, 'a.package'), path.join(f.root, 'b.package'));
  await f.scan(['b.package']);
  assert.equal((await f.metadata.summary(f.root))['b.package'].preview, saved.preview);
  assert.equal(f.tools.previewFile('../secret'), '', 'an address can only name a preview');
  await assert.rejects(f.tools.savePreview('b.package', new Uint8Array([1, 2, 3])), { code: 'IMAGE_TYPE' });
  assert.equal((await f.tools.removePreview('b.package')).removed, true);
});

/* ---------- Options.ini ---------- */
const INI = '[options]\r\nedgescrolling = 1\r\n\r\nshowmodliststartup = 1\r\nscriptmodsenabled = 0\r\nmodsdisabled = 0\r\naudiooutputmode = 1\r\n';

async function gameSetup(t, content = INI, running = false) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-game-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const folder = path.join(base, 'Electronic Arts', 'Los Sims 4');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'Options.ini');
  if (content !== null) await fs.writeFile(file, content);
  let selected = '';
  const config = createSims4Config({ getDocumentsRoute: async () => '', getDocumentsFolder: () => base, getSelected: async () => selected, saveSelected: async value => (selected = value), isGameRunning: async () => ({ running, checked: true }) });
  return { config, file, folder, base };
}

test('reads the real keys, including the inverted one', () => {
  assert.deepEqual(readValues(INI).values, { showModList: true, modsEnabled: true, scriptMods: false });
  assert.equal(readValues(INI.replace('modsdisabled = 0', 'modsdisabled = 1')).values.modsEnabled, false);
  assert.throws(() => readValues('not ini'), { code: 'CONFIG_INVALID' });
  assert.throws(() => readValues(INI.replace('modsdisabled = 0', 'modsdisabled = maybe')), { code: 'CONFIG_INVALID' });
});

test('writes only the three settings: every other byte stays', () => {
  const next = applyValues(INI, { showModList: false, modsEnabled: false, scriptMods: true });
  assert.equal(next, '[options]\r\nedgescrolling = 1\r\n\r\nshowmodliststartup = 0\r\nscriptmodsenabled = 1\r\nmodsdisabled = 1\r\naudiooutputmode = 1\r\n');
  assert.match(applyValues('[options]\r\nedgescrolling = 1\r\n', { scriptMods: true }), /^\[options\]\r\nscriptmodsenabled = 1\r\nedgescrolling = 1\r\n$/);
});

test('saves to the real file, keeps one backup of the original', async t => {
  const f = await gameSetup(t);
  const read = await f.config.read();
  assert.equal(read.status, 'ready');
  const saved = await f.config.write({ values: { scriptMods: true }, version: read.version });
  assert.equal(saved.saved, true);
  assert.equal(saved.values.scriptMods, true);
  assert.equal(await fs.readFile(`${f.file}${BACKUP_SUFFIX}`, 'utf8'), INI);
  await f.config.write({ values: { scriptMods: false }, version: saved.version });
  assert.equal(await fs.readFile(`${f.file}${BACKUP_SUFFIX}`, 'utf8'), INI, 'the first original is the one kept');
  assert.deepEqual((await fs.readdir(f.folder)).filter(name => name.endsWith('.tmp')), []);
});

test('nothing is written while the game runs, after outside changes, or over a bad file', async t => {
  const running = await gameSetup(t, INI, true);
  await assert.rejects(running.config.write({ values: { scriptMods: true } }), { code: 'CONFIG_GAME_RUNNING' });
  assert.equal(await fs.readFile(running.file, 'utf8'), INI);
  const f = await gameSetup(t);
  const { version } = await f.config.read();
  await fs.appendFile(f.file, 'newkey = 1\r\n');
  await assert.rejects(f.config.write({ values: { scriptMods: true }, version }), { code: 'CONFIG_CHANGED' });
  const bad = await gameSetup(t, 'garbage');
  assert.equal((await bad.config.read()).status, 'invalid');
  await assert.rejects(bad.config.write({ values: { scriptMods: true } }), { code: 'CONFIG_INVALID' });
  assert.equal(await fs.readFile(bad.file, 'utf8'), 'garbage');
  const missing = await gameSetup(t, null);
  await assert.rejects(missing.config.write({ values: { scriptMods: true } }), { code: 'CONFIG_MISSING' });
});

test('finds every Sims 4 folder and lets the player choose', async t => {
  const f = await gameSetup(t);
  const other = path.join(f.base, 'Electronic Arts', 'The Sims 4');
  await fs.mkdir(other);
  await fs.writeFile(path.join(other, 'Options.ini'), INI.replace('scriptmodsenabled = 0', 'scriptmodsenabled = 1'));
  await fs.mkdir(path.join(f.base, 'Electronic Arts', 'Los Sims 3'));
  await fs.writeFile(path.join(f.base, 'Electronic Arts', 'Los Sims 3', 'Options.ini'), INI);
  const read = await f.config.read();
  assert.equal(read.folders.length, 2, 'Sims 3 is not offered');
  const chosen = await f.config.selectFolder(other);
  assert.equal(chosen.folder, other);
  assert.equal(chosen.values.scriptMods, true);
  await assert.rejects(f.config.selectFolder(path.join(f.base, 'nope')), { code: 'CONFIG_FOLDER_UNKNOWN' });
});
