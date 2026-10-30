const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../renderer/js/core.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// demo-data.js is a plain browser script; run it in a sandbox to read its catalog.
const { ITEMS, SUBS } = vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '../renderer/js/demo-data.js'), 'utf8')}\n;({ ITEMS, SUBS })`, {});

test('appearance falls back to safe defaults and accepts the eight themes', () => {
  assert.deepEqual(core.normalizeAppearance(null), core.DEFAULT_APPEARANCE);
  assert.deepEqual(core.normalizeAppearance({ family: 'neon', mode: 'x', primary: 'red', density: 'tiny', motion: 'fast' }), core.DEFAULT_APPEARANCE);
  assert.deepEqual(core.normalizeAppearance('nonsense'), core.DEFAULT_APPEARANCE);
  assert.deepEqual(core.THEME_FAMILIES, ['pink', 'purple', 'green', 'blue']);
  for (const family of core.THEME_FAMILIES) {
    for (const mode of ['light', 'dark']) assert.deepEqual(core.normalizeAppearance({ family, mode }), { ...core.DEFAULT_APPEARANCE, family, mode });
  }
  assert.deepEqual(core.normalizeAppearance({ family: 'green', mode: 'system', density: 'compact', motion: 'reduced' }), { family: 'green', mode: 'system', density: 'compact', motion: 'reduced' });
});

test('appearance settings from 0.7.x, 0.8.x / 0.9.x and 0.10.0 are carried over', () => {
  assert.deepEqual(core.normalizeAppearance(null, 'dark-sage'), { ...core.DEFAULT_APPEARANCE, mode: 'dark', family: 'green' });
  assert.deepEqual(core.normalizeAppearance(null, 'soft-rose'), { ...core.DEFAULT_APPEARANCE, mode: 'light', family: 'pink' });
  assert.deepEqual(core.normalizeAppearance(null, 'dark'), { ...core.DEFAULT_APPEARANCE, mode: 'dark', family: 'purple' });
  // 0.8.0 and 0.9.0 saved "soft-blue" / "dark-blue" plus separate main and second colors.
  assert.deepEqual(core.normalizeAppearance(null, 'dark-blue', { primary: 'blue', secondary: 'rose' }), { ...core.DEFAULT_APPEARANCE, mode: 'dark', family: 'blue' });
  assert.equal(core.normalizeAppearance(null, 'soft-lavender', { primary: 'bogus', secondary: 'bogus' }).family, 'purple');
  // 0.10.0 saved a family ("soft" or "sims-blue") plus an accent; it wins over the older values.
  assert.equal(core.normalizeAppearance({ family: 'soft', primary: 'sage' }, 'dark-blue', { primary: 'blue' }).family, 'green');
  assert.equal(core.normalizeAppearance({ family: 'sims-blue', primary: 'rose', mode: 'dark' }).family, 'blue');
  assert.deepEqual(Object.keys(core.normalizeAppearance({ family: 'soft', primary: 'rose', secondary: 'sage' })).sort(), ['density', 'family', 'mode', 'motion']);
});

test('collection colors accept only #rrggbb and fall back to the palette', () => {
  assert.equal(core.collectionColor('#ABCDEF'), '#abcdef');
  assert.equal(core.collectionColor('#f5c9d3'), '#f5c9d3'); // a 0.7.1 pastel keeps its color
  for (const bad of ['red', '#abc', 'url(x)', '#12345g', '', null, 42, '#abcdef; background:red']) {
    assert.ok(core.COLLECTION_COLORS.includes(core.collectionColor(bad, 2)), String(bad));
  }
  assert.equal(core.collectionColor('nope', 7), core.COLLECTION_COLORS[7 % core.COLLECTION_COLORS.length]);
  assert.ok(core.contrastRatio('#000000', '#ffffff') > 20);
});

test('syncing collections keeps both sides, lets the newer copy win and keeps local covers', () => {
  const local = [
    { id: 'a', name: 'Local A', color: '#111111', items: ['x'], updated: 10, cover: 'data:image/jpeg;base64,AAA' },
    { id: 'b', name: 'Only here', items: [], updated: 5 }
  ];
  const remote = [
    { id: 'a', name: 'Remote A', color: '#222222', items: ['x', 'y', 3], updated: 20 },
    { id: 'c', name: 'Only remote', items: ['z'], updated: 1 },
    { name: 'no id' }
  ];
  const merged = core.mergeCollections(local, remote);
  assert.deepEqual(merged.map(c => c.id), ['a', 'b', 'c']);
  assert.equal(merged[0].name, 'Remote A');
  assert.deepEqual(merged[0].items, ['x', 'y']);
  assert.equal(merged[0].cover, 'data:image/jpeg;base64,AAA');
  assert.equal(core.mergeCollections([{ id: 'a', name: 'Newer', items: [], updated: 30 }], remote)[0].name, 'Newer');
  assert.equal(local[0].name, 'Local A', 'the input is not modified');
});

test('CurseForge items in collections and links', () => {
  assert.equal(core.isCurseForgeItem('cf:12345'), true);
  for (const bad of ['cf:', 'cf:0', 'cf:abc', 'cf:-1', 'demo-item', 12]) assert.equal(core.isCurseForgeItem(bad), false, String(bad));
  const link = core.collectionLink('Mixed', ['cf:42', ITEMS[0].id]);
  const read = core.readCollectionLink(link, new Set(ITEMS.map(i => i.id)));
  assert.deepEqual(read.items, ['cf:42', ITEMS[0].id]);
});

const base = { parent: 'all', sub: 'All', gender: 'All', age: 'All ages', style: 'All', source: 'All', sort: 'curated', query: '', parts: [], occult: [] };
const run = changes => core.filterDemoItems(ITEMS, { ...base, ...changes });

test('Create a Sim body parts and clothing pieces filter the same way', () => {
  assert.ok(SUBS.cas.includes('Animals'));
  const body = run({ parent: 'cas', sub: 'Body' });
  assert.ok(body.length > 0);
  assert.ok(body.every(i => core.CAS_PARTS.Body.values.includes(i.sub)));
  const hair = run({ parent: 'cas', sub: 'Body', parts: ['Hair'] });
  assert.ok(hair.length > 0 && hair.length < body.length);
  assert.ok(hair.every(i => i.sub === 'Hair'));
  const clothing = run({ parent: 'cas', sub: 'Clothing' });
  const fullBody = run({ parent: 'cas', sub: 'Clothing', parts: ['Full body'] });
  assert.ok(fullBody.length > 0 && fullBody.every(i => i.piece === 'Full body'));
  const either = run({ parent: 'cas', sub: 'Clothing', parts: ['Full body', 'Tops'] });
  assert.ok(either.length > fullBody.length && either.length <= clothing.length, 'several pieces match any of them');
  assert.deepEqual(run({ parent: 'cas', sub: 'Accessories', parts: ['Jewelry'] }).map(i => i.piece), run({ parent: 'cas', sub: 'Accessories', parts: ['Jewelry'] }).map(() => 'Jewelry'));
  for (const group of ['Clothing', 'Accessories']) assert.ok(core.CAS_PARTS[group].values.length >= 6, `${group} keeps the 0.7.1 subfilters`);
});

test('supernatural, age and combined filters', () => {
  const vampires = run({ occult: ['Vampire'] });
  assert.ok(vampires.length >= 2 && vampires.every(i => i.occult.includes('Vampire')));
  const vampireOrFairy = run({ occult: ['Vampire', 'Fairy'] });
  assert.ok(vampireOrFairy.length > vampires.length);
  assert.equal(core.OCCULTS.length, 10);
  // Combined with a category the filters narrow the results (AND between groups).
  const casVampires = run({ parent: 'cas', occult: ['Vampire'] });
  assert.ok(casVampires.every(i => i.department === 'cas' && i.occult.includes('Vampire')));
  assert.equal(run({ occult: ['Servo'] }).length, 0);
  // Singular and plural life stages both match; "All ages" items always match.
  const elders = core.filterDemoItems([{ ...ITEMS[0], age: 'Elder' }, { ...ITEMS[1], age: 'All ages' }, { ...ITEMS[2], age: 'Teen' }], { ...base, age: 'Elders' });
  assert.equal(elders.length, 2);
  assert.ok(run({ age: 'Toddlers' }).every(i => ['Toddlers', 'All ages'].includes(i.age)));
});
