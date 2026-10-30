const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../renderer/js/core.js');

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
  // New installs start on the blue theme, the brand's color.
  assert.equal(core.normalizeAppearance(null).family, 'blue');
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

test('CurseForge items in collections and links', () => {
  assert.equal(core.isCurseForgeItem('cf:12345'), true);
  for (const bad of ['cf:', 'cf:0', 'cf:abc', 'cf:-1', 'demo-item', 12]) assert.equal(core.isCurseForgeItem(bad), false, String(bad));
  const link = core.collectionLink('Mixed', ['cf:42', 'soft-cloud-bob']);
  assert.deepEqual(core.readCollectionLink(link).items, ['cf:42']);
});
