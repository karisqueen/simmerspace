const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DICT, MODS_TEXT } = require('../renderer/js/i18n.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rendererCode = ['app.js', 'mods-manager.js', 'organizer.js', 'folders.js', 'ui.js', 'main.js', 'appearance.js', 'curseforge.js', 'account.js', 'tour.js', 'library.js', 'library-care.js', 'game-config.js', 'creators.js', 'inspiration.js'].map(name => read(`renderer/js/${name}`)).join('\n');

test('English and Spanish have the same keys and no empty text', () => {
  for (const [name, table] of [['DICT', DICT], ['MODS_TEXT', MODS_TEXT]]) {
    assert.deepEqual(Object.keys(table.es).sort(), Object.keys(table.en).sort(), `${name} keys differ`);
    for (const lang of ['en', 'es']) {
      for (const [key, value] of Object.entries(table[lang])) assert.ok(typeof value === 'string' && value.trim(), `${name}.${lang}.${key} is empty`);
    }
  }
});

test('every literal text key used by the interface exists', () => {
  for (const [, key] of rendererCode.matchAll(/\bt\('([A-Za-z_]+)'\)/g)) assert.ok(key in DICT.en, `t('${key}') is missing`);
  for (const [, key] of rendererCode.matchAll(/\bmtC?o?u?n?t?\('([A-Za-z_]+)'/g)) assert.ok(key in MODS_TEXT.en, `mt('${key}') is missing`);
  // Keys passed through t(...) inside lists and helpers (labels for chips, sorts, accents and pages).
  for (const [, key] of rendererCode.matchAll(/\[\s*\d+,\s*'(cf[A-Za-z]+)'\s*\]/g)) assert.ok(key in DICT.en, `sort label '${key}' is missing`);
  // Tutorial steps name their text keys in TOUR_STEPS.
  for (const [, key] of read('renderer/js/tour.js').matchAll(/(?:title|text): '([A-Za-z]+)'/g)) assert.ok(key in DICT.en, `tour key '${key}' is missing`);
  for (const [, body] of rendererCode.matchAll(/const (?:PART_KEYS|OCCULT_KEYS|THEME_LABEL_KEYS|PAGE_TITLES) = \{([^}]*)\}/g)) {
    for (const [, key] of body.matchAll(/:\s*'([A-Za-z]+)'/g)) assert.ok(key in DICT.en, `label key '${key}' is missing`);
  }
});

test('every error code the desktop app can send has a translation', () => {
  const electron = ['errors.cjs', 'mods-service.cjs', 'ipc.cjs', 'curseforge-service.cjs', 'account-service.cjs', 'community-service.cjs', 'game-launcher.cjs', 'zip-reader.cjs', 'main.cjs', 'library-tools.cjs', 'sims4-config.cjs'].map(name => read(`electron/${name}`)).join('\n');
  const codes = new Set([...electron.matchAll(/AppError\('([A-Z_]+)'/g), ...electron.matchAll(/:\s*'([A-Z_]{4,})'/g)].map(match => match[1]));
  codes.add('FORBIDDEN');
  codes.add('UNKNOWN');
  codes.add('DESKTOP_ONLY');
  for (const code of codes) assert.ok(`err_${code}` in MODS_TEXT.en, `missing err_${code}`);
});

test('category labels exist for every Inspiration and feedback category the desktop app accepts', () => {
  const { POST_CATEGORIES, FEEDBACK_CATEGORIES } = require('../electron/account-service.cjs');
  for (const value of POST_CATEGORIES) assert.ok(`inspCat_${value}` in DICT.en, `inspCat_${value}`);
  for (const value of FEEDBACK_CATEGORIES) assert.ok(`feedbackCat_${value}` in DICT.en, `feedbackCat_${value}`);
  assert.ok('hidePassword' in DICT.en && 'creatorFollowSaved' in DICT.en && 'creatorFollowRemoved' in DICT.en);
});
