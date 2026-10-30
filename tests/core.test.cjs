const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../renderer/js/core.js');

test('escapes HTML and fills placeholders', () => {
  assert.equal(core.esc(`<b a="1">'&`), '&lt;b a=&quot;1&quot;&gt;&#39;&amp;');
  assert.equal(core.esc(null), '');
  assert.equal(core.format('Moved {moved}; {missing}', { moved: 3 }), 'Moved 3; {missing}');
});

test('collection links round-trip without exposing local paths and still read 0.6.1 links', () => {
  const link = core.collectionLink('Cozy', ['cf:1', 'cf:2']);
  assert.match(link, /^simmerspace:\/\/collection#collection=/);
  assert.deepEqual(core.readCollectionLink(link), { name: 'Cozy', items: ['cf:1', 'cf:2'] });
  // Older links can name sample items that no longer exist; only CurseForge items are kept.
  const legacy = `file:///C:/Users/x/app.asar/index.html#collection=${encodeURIComponent(JSON.stringify({ format: 'simmerspace-collection-link-v1', name: 'Old', items: ['cf:1', 'soft-cloud-bob', 'cf:1'] }))}`;
  assert.deepEqual(core.readCollectionLink(legacy), { name: 'Old', items: ['cf:1'] });
  assert.equal(core.readCollectionLink('https://example.com'), null);
  assert.equal(core.readCollectionLink('#collection={bad json'), null);
});

test('depth warnings follow the game rules for scripts and packages', () => {
  assert.equal(core.modDepthWarning({ extension: 'ts4script', depth: 1 }), '');
  assert.equal(core.modDepthWarning({ extension: 'ts4script', depth: 2 }), 'scriptTooDeep');
  assert.equal(core.modDepthWarning({ extension: 'package', depth: 5 }), '');
  assert.equal(core.modDepthWarning({ extension: 'package', depth: 6 }), 'packageTooDeep');
});

test('filters large file lists by state, category and text', () => {
  const files = Array.from({ length: 50000 }, (_, i) => ({
    relativePath: `Creator ${i % 50}\\file${i}.${i % 3 ? 'package' : 'ts4script'}`,
    extension: i % 3 ? 'package' : 'ts4script',
    enabled: i % 4 !== 0,
    depth: 1
  }));
  const tags = { 'Creator 1\\file1.package': { categoryId: 'hair' } };
  const lookup = { tags: p => tags[p] || {}, categoryName: id => (id === 'hair' ? 'Hair' : ''), creatorName: () => '' };
  const started = Date.now();
  assert.equal(core.filterModFiles(files, { state: 'disabled' }, lookup).length, 12500);
  assert.deepEqual(core.filterModFiles(files, { query: 'hair' }, lookup).map(f => f.relativePath), ['Creator 1\\file1.package']);
  assert.equal(core.filterModFiles(files, { categoryId: 'hair' }, lookup).length, 1);
  assert.equal(core.filterModFiles(files, { categoryId: '__none__' }, lookup).length, 49999);
  assert.ok(Date.now() - started < 1500, 'filtering 50,000 files stays fast');
  assert.deepEqual(core.summarizeModFiles(files.slice(0, 4)), { total: 4, enabled: 3, disabled: 1, tooDeep: 0 });
});

test('desktop replies unwrap to values or coded errors', () => {
  assert.equal(core.unwrapDesktopResult({ ok: true, value: 7 }), 7);
  assert.throws(() => core.unwrapDesktopResult({ ok: false, error: { code: 'FILE_BUSY', message: 'Busy' } }), { code: 'FILE_BUSY', message: 'Busy' });
  assert.throws(() => core.unwrapDesktopResult(undefined), { code: 'UNKNOWN' });
  assert.equal(core.modStateFromPath('a\\B.PACKAGEOFF'), false);
  assert.equal(core.modStateFromPath('a/b.ts4script'), true);
});
