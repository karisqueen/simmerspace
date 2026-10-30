const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../renderer/js/core.js');

const files = [
  { relativePath: 'CC\\Hair One.package', enabled: true, depth: 1 },
  { relativePath: 'CC\\Sofa.package', enabled: true, depth: 1 },
  { relativePath: 'Cozy by Pix\\Sweater.package', enabled: false, depth: 1 },
  { relativePath: 'Loose.package', enabled: true, depth: 0 }
];
const tags = { 'CC\\Hair One.package': { categoryId: 'cas-hair', creatorId: 'c1' }, 'CC\\Sofa.package': { categoryId: 'gone' } };
const installed = new Set(['cozy by pix/sweater.package']);
const lookup = {
  tags: p => tags[p] || {},
  categoryName: id => ({ 'cas-hair': 'Hair' })[id] || '',
  creatorName: id => ({ c1: 'Simstrouble' })[id] || '',
  origin: file => core.modOrigin(file.relativePath, installed),
  creatorKey: file => (tags[file.relativePath]?.creatorId ? tags[file.relativePath].creatorId : file.relativePath.startsWith('Cozy') ? 'cf:pix' : ''),
  creatorLabel: file => (tags[file.relativePath]?.creatorId ? 'Simstrouble' : file.relativePath.startsWith('Cozy') ? 'Pix' : '')
};

test('install-log paths match scanned paths regardless of slashes and case', () => {
  assert.equal(core.modPathKey('Cozy by Pix\\Sweater.package'), 'cozy by pix/sweater.package');
  assert.equal(core.modPathKey('/A/B.package'), 'a/b.package');
  assert.equal(core.modOrigin('COZY BY PIX/Sweater.package', installed), 'simmerspace');
  assert.equal(core.modOrigin('CC\\Hair One.package', installed), 'external');
  assert.equal(core.modOrigin('x.package', null), 'external');
});

test('category folders always include "No category", count each file once, and ignore unknown categories', () => {
  const groups = core.groupModFiles(files, 'category', lookup);
  assert.deepEqual(groups.map(g => [g.key, g.count]), [['cas-hair', 1], ['__none__', 3]]);
  assert.equal(groups.at(-1).fallback, true);
  assert.equal(groups.reduce((sum, g) => sum + g.count, 0), files.length);
  assert.equal(groups.find(g => g.key === '__none__').external, 2);
  // The fallback exists even when every file has a category.
  assert.deepEqual(core.groupModFiles([], 'category', lookup), [{ key: '__none__', name: '', count: 0, external: 0, fallback: true }]);
});

test('creator folders use the creator tag, then the CurseForge author, then "No creator"', () => {
  const groups = core.groupModFiles(files, 'creator', lookup);
  assert.deepEqual(groups.map(g => [g.key, g.name, g.count]), [['cf:pix', 'Pix', 1], ['c1', 'Simstrouble', 1], ['__none__', '', 2]]);
});

test('filters by origin and creator, including the "No creator" folder', () => {
  const pick = filter => core.filterModFiles(files, filter, lookup).map(f => f.relativePath);
  assert.deepEqual(pick({ origin: 'simmerspace' }), ['Cozy by Pix\\Sweater.package']);
  assert.equal(pick({ origin: 'external' }).length, 3);
  assert.deepEqual(pick({ creatorKey: 'c1' }), ['CC\\Hair One.package']);
  assert.deepEqual(pick({ creatorKey: '__none__' }), ['CC\\Sofa.package', 'Loose.package']);
  assert.deepEqual(pick({ query: 'pix' }), ['Cozy by Pix\\Sweater.package']);
  // Filters written for 0.10.0 (no creator or origin lookups) keep working.
  assert.equal(core.filterModFiles(files, { categoryId: '__none__' }, { tags: lookup.tags, categoryName: lookup.categoryName, creatorName: lookup.creatorName }).length, 3);
});

test('only untagged external files are offered for classification, minus skipped ones', () => {
  const pending = core.unclassifiedExternal(files, lookup).map(f => f.relativePath);
  assert.deepEqual(pending, ['Loose.package']); // the sofa has a (stale) category tag, the sweater is a download
  assert.deepEqual(core.unclassifiedExternal(files, lookup, new Set(['loose.package'])), []);
});

test('following keeps only real CurseForge creators and ranks their mods first', () => {
  const following = core.normalizeFollowing(['sample-creator', { id: 7, name: ' Ana ', url: 'https://www.curseforge.com/members/ana' }, { id: 7, name: 'dup' }, { id: 9, name: 'Bo', url: 'https://evil.example/x' }]);
  assert.deepEqual(following, [
    { id: 7, name: 'Ana', url: 'https://www.curseforge.com/members/ana' },
    { id: 9, name: 'Bo', url: '' }
  ]);
  const mods = [{ id: 1, authors: [{ id: 3 }] }, { id: 2, authors: [{ id: 9 }] }, { id: 3, authors: [] }, { id: 4, authors: [{ id: 7 }] }];
  assert.deepEqual(core.rankByFollowing(mods, following).map(m => m.id), [2, 4, 1, 3]);
  assert.equal(core.rankByFollowing(mods, []), mods);
});

test('folder names are safe for Windows and never "Mods"', () => {
  assert.equal(core.safeFolderName('Cabello: largo/corto?'), 'Cabello largo corto');
  assert.equal(core.safeFolderName('  Pix...  '), 'Pix');
  assert.equal(core.safeFolderName('CON'), 'CON CC');
  assert.equal(core.safeFolderName('mods'), 'Mods CC');
  assert.equal(core.safeFolderName('x'.repeat(80)).length, 60);
  assert.equal(core.safeFolderName('???'), '');
});

test('organizing the whole library by category or creator puts unsorted files in the fallback folder', () => {
  const byCategory = core.organizeFolderEntries(files, 'category', lookup, { fallbackName: 'Sin Categoría' });
  assert.deepEqual(byCategory.entries.map(e => e.folderName), ['Hair', 'Sin Categoría', 'Sin Categoría', 'Sin Categoría']);
  assert.deepEqual(byCategory.folders.map(f => [f.name, f.count, f.fallback]), [['Hair', 1, false], ['Sin Categoría', 3, true]]);
  const byCreator = core.organizeFolderEntries(files, 'creator', lookup, { fallbackName: 'Sin Creador' });
  assert.deepEqual(byCreator.entries.map(e => e.folderName), ['Simstrouble', 'Sin Creador', 'Pix', 'Sin Creador']);
  // Leaving unsorted files alone moves only the sorted ones and says how many stay.
  const keep = core.organizeFolderEntries(files, 'creator', lookup, { fallbackName: 'Sin Creador', includeUnsorted: false });
  assert.equal(keep.entries.length, 2);
  assert.equal(keep.left, 2);
  // A custom folder name for a category wins over the category's display name.
  const custom = core.organizeFolderEntries(files, 'category', lookup, { fallbackName: 'Sin Categoría', folderFor: id => (id === 'cas-hair' ? 'Pelo' : '') });
  assert.equal(custom.entries[0].folderName, 'Pelo');
});
