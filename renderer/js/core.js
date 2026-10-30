/* Pure helpers shared by the interface. No DOM access here, so tests can load this file in Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
  }

  // Replaces {name} placeholders; values are inserted as given (escape them first if they go into HTML).
  function format(template, values = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
  }

  // Collection links carry only a name and CurseForge item ids. They use a neutral simmerspace:// address so
  // that sharing a link never reveals where the app is installed on this PC.
  const COLLECTION_FORMAT = 'simmerspace-collection-link-v1';
  const COLLECTION_LINK_BASE = 'simmerspace://collection';

  function collectionLink(name, items) {
    const payload = { format: COLLECTION_FORMAT, name: String(name || '').slice(0, 40), items: items.filter(id => typeof id === 'string') };
    return `${COLLECTION_LINK_BASE}#collection=${encodeURIComponent(JSON.stringify(payload))}`;
  }

  // CurseForge mods saved to a collection are stored as "cf:<mod id>".
  const CURSEFORGE_ITEM = /^cf:[1-9]\d{0,9}$/;
  const isCurseForgeItem = id => typeof id === 'string' && CURSEFORGE_ITEM.test(id);

  // Also accepts links made by 0.6.1, which used the app's own file:// address.
  function readCollectionLink(value) {
    try {
      const text = String(value || '').trim();
      const hashStart = text.indexOf('#');
      if (hashStart < 0) return null;
      const raw = new URLSearchParams(text.slice(hashStart + 1)).get('collection');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.format !== COLLECTION_FORMAT || !Array.isArray(data.items)) return null;
      return {
        name: String(data.name || '').trim().slice(0, 40),
        items: [...new Set(data.items.filter(isCurseForgeItem))]
      };
    } catch {
      return null;
    }
  }

  // The Sims 4 loads script mods at most one folder deep and package files at most five folders deep.
  function modDepthWarning(file) {
    if (file.extension === 'ts4script' && file.depth > 1) return 'scriptTooDeep';
    if (file.extension === 'package' && file.depth > 5) return 'packageTooDeep';
    return '';
  }

  function modStateFromPath(relativePath) {
    const lower = relativePath.toLowerCase();
    if (lower.endsWith('.packageoff') || lower.endsWith('.ts4scriptoff')) return false;
    if (lower.endsWith('.package') || lower.endsWith('.ts4script')) return true;
    return null;
  }

  function fileNameOf(relativePath) {
    return relativePath.split(/[\\/]/).pop();
  }

  // Filters a scanned file list. `lookup` supplies tag-dependent text so the caller can use cached maps.
  // `creatorKey` and `origin` are optional: lookup.creatorKey(file) gives the creator a file is grouped under
  // ('' when it has none) and lookup.origin(file) gives 'simmerspace' or 'external'.
  function filterModFiles(files, { query = '', state = 'all', categoryId = '', creatorKey = '', origin = 'all' }, lookup) {
    const needle = query.trim().toLocaleLowerCase();
    const result = [];
    for (const file of files) {
      if (state === 'enabled' && !file.enabled) continue;
      if (state === 'disabled' && file.enabled) continue;
      if (state === 'tooDeep' && !modDepthWarning(file)) continue;
      if (origin !== 'all' && lookup.origin && lookup.origin(file) !== origin) continue;
      const tags = lookup.tags(file.relativePath);
      // A tag pointing at a deleted category counts as "No category", the same as in the folder view.
      if (categoryId === '__none__' ? tags.categoryId && lookup.categoryName(tags.categoryId) : categoryId && tags.categoryId !== categoryId) continue;
      if (creatorKey && lookup.creatorKey) {
        const key = lookup.creatorKey(file);
        if (creatorKey === '__none__' ? key : key !== creatorKey) continue;
      }
      if (needle) {
        const creator = lookup.creatorKey ? lookup.creatorLabel?.(file) || '' : lookup.creatorName(tags.creatorId);
        const text = `${file.relativePath} ${lookup.categoryName(tags.categoryId)} ${creator} ${tags.gender || ''} ${tags.age || ''}`;
        if (!text.toLocaleLowerCase().includes(needle)) continue;
      }
      result.push(file);
    }
    return result;
  }

  /* ---------- Library origin and grouping ---------- */
  // Paths from the scanner and from the CurseForge install log are compared without case or slash style.
  function modPathKey(relativePath) {
    return String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  }
  // A file is a SimmerSpace download only when the install log lists its path; everything else is external.
  function modOrigin(relativePath, installedKeys) {
    return installedKeys && installedKeys.has(modPathKey(relativePath)) ? 'simmerspace' : 'external';
  }
  // Groups files into folders by category or creator. The fallback folder ('__none__', "No category" or
  // "No creator") always exists, even when empty, and is listed last. Each file is counted once.
  function groupModFiles(files, mode, lookup) {
    const groups = new Map();
    const none = { key: '__none__', name: '', count: 0, external: 0, fallback: true };
    for (const file of files) {
      let key = '';
      let name = '';
      if (mode === 'creator') {
        key = lookup.creatorKey(file);
        name = key ? lookup.creatorLabel(file) : '';
      } else {
        key = lookup.tags(file.relativePath).categoryId || '';
        name = key ? lookup.categoryName(key) : '';
        if (key && !name) key = '';
      }
      const group = key ? groups.get(key) || { key, name, count: 0, external: 0, fallback: false } : none;
      group.count++;
      if (lookup.origin?.(file) === 'external') group.external++;
      if (key) groups.set(key, group);
    }
    const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return [...sorted, none];
  }
  // External files the player has not classified yet (no category and no creator) and has not skipped.
  function unclassifiedExternal(files, lookup, skipped = new Set()) {
    return files.filter(file => lookup.origin(file) === 'external' && !skipped.has(modPathKey(file.relativePath)) && !lookup.tags(file.relativePath).categoryId && !lookup.tags(file.relativePath).creatorId);
  }

  function summarizeModFiles(files) {
    let enabled = 0;
    let tooDeep = 0;
    for (const file of files) {
      if (file.enabled) enabled++;
      if (modDepthWarning(file)) tooDeep++;
    }
    return { total: files.length, enabled, disabled: files.length - enabled, tooDeep };
  }

  /* ---------- Appearance ---------- */
  // Eight themes: four color families, each in light and dark. Versions 0.8–0.10 used a "soft" or
  // "sims-blue" family plus a chosen accent; those accents map onto the family with the same color.
  const THEME_FAMILIES = ['pink', 'purple', 'green', 'blue'];
  const LEGACY_ACCENT_FAMILY = Object.freeze({ rose: 'pink', lavender: 'purple', sage: 'green', blue: 'blue' });
  const MODES = ['light', 'dark', 'system'];
  const DENSITIES = ['comfortable', 'compact'];
  const MOTION = ['system', 'reduced', 'full'];
  const DEFAULT_APPEARANCE = Object.freeze({ family: 'purple', mode: 'light', density: 'comfortable', motion: 'system' });

  // Reads saved appearance settings. Anything missing or unknown falls back to a default. Carried over:
  // the single theme value saved by 0.7.x and earlier ("soft-rose", "dark-sage", "dark"), the main color
  // saved by 0.8.x and 0.9.x ("primary-hue") and the family + accent saved by 0.10.0.
  function normalizeAppearance(raw, legacyTheme, legacyHues = {}) {
    const result = { ...DEFAULT_APPEARANCE };
    if (typeof legacyTheme === 'string') {
      const [tone, hue] = legacyTheme === 'dark' ? ['dark', 'lavender'] : legacyTheme.split('-');
      if (['soft', 'dark'].includes(tone) && LEGACY_ACCENT_FAMILY[hue]) Object.assign(result, { mode: tone === 'dark' ? 'dark' : 'light', family: LEGACY_ACCENT_FAMILY[hue] });
    }
    if (LEGACY_ACCENT_FAMILY[legacyHues?.primary]) result.family = LEGACY_ACCENT_FAMILY[legacyHues.primary];
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (THEME_FAMILIES.includes(source.family)) result.family = source.family;
    else if (source.family === 'sims-blue') result.family = 'blue';
    else if (LEGACY_ACCENT_FAMILY[source.primary]) result.family = LEGACY_ACCENT_FAMILY[source.primary];
    if (MODES.includes(source.mode)) result.mode = source.mode;
    if (DENSITIES.includes(source.density)) result.density = source.density;
    if (MOTION.includes(source.motion)) result.motion = source.motion;
    return result;
  }

  /* ---------- Collections ---------- */
  const COLLECTION_COLORS = ['#d16f91', '#8f6fc1', '#5f9a6a', '#2f7fe0', '#d99a3d', '#3fa3a3'];
  // The ten pastel swatches offered by 0.7.1–0.9.0. Collections saved with them keep their color.
  const COLLECTION_PASTELS = ['#f5c9d3', '#f8d9bd', '#f4e9ae', '#d5e8c3', '#c5e6df', '#c8e3f2', '#cfd8f5', '#dfd0f0', '#f0d3e8', '#d9d9d1'];
  function collectionColor(value, index = 0) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : COLLECTION_COLORS[Math.abs(index) % COLLECTION_COLORS.length];
  }
  // Relative luminance (WCAG) of a #rrggbb color, used to keep the plumbob outline visible on any background.
  function luminance(hex) {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  function contrastRatio(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }

  // Followed CurseForge creators: { id, name, url }. Older builds stored ids of other creators as plain
  // strings; those do not exist on CurseForge, so they are dropped.
  function normalizeFollowing(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.flatMap(entry => {
      const id = Number(entry?.id);
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id) || typeof entry.name !== 'string' || !entry.name.trim()) return [];
      seen.add(id);
      let url = '';
      try {
        const parsed = new URL(String(entry.url || ''));
        if (parsed.protocol === 'https:' && /(^|\.)curseforge\.com$/i.test(parsed.hostname)) url = parsed.href;
      } catch {}
      return [{ id, name: entry.name.trim().slice(0, 80), url }];
    });
  }

  // Moves mods by followed creators to the front, keeping CurseForge's order inside each group.
  function rankByFollowing(mods, following) {
    const ids = new Set((following || []).map(f => f.id));
    if (!ids.size || !Array.isArray(mods)) return mods;
    const followed = mods.filter(mod => (mod.authors || []).some(a => ids.has(a.id)));
    return followed.length ? [...followed, ...mods.filter(mod => !followed.includes(mod))] : mods;
  }

  // Turns a { ok, value | error } desktop reply into a value, or throws an Error carrying `code`.
  function unwrapDesktopResult(result) {
    if (result && result.ok === true) return result.value;
    const error = new Error(result?.error?.message || 'The operation could not be completed.');
    error.code = result?.error?.code || 'UNKNOWN';
    throw error;
  }

  return {
    esc,
    format,
    collectionLink,
    readCollectionLink,
    modDepthWarning,
    modStateFromPath,
    fileNameOf,
    filterModFiles,
    summarizeModFiles,
    unwrapDesktopResult,
    isCurseForgeItem,
    LEGACY_ACCENT_FAMILY,
    THEME_FAMILIES,
    DEFAULT_APPEARANCE,
    normalizeAppearance,
    COLLECTION_COLORS,
    COLLECTION_PASTELS,
    collectionColor,
    contrastRatio,
    modPathKey,
    modOrigin,
    groupModFiles,
    unclassifiedExternal,
    normalizeFollowing,
    rankByFollowing
  };
});
