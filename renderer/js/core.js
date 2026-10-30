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

  function normalizePatreonProfile(raw) {
    try {
      const url = new URL(String(raw).trim());
      if (
        url.protocol !== 'https:' ||
        !['patreon.com', 'www.patreon.com'].includes(url.hostname.toLowerCase()) ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443')
      ) {
        return null;
      }
      const profilePath = url.pathname.replace(/\/+$/, '');
      const firstSegment = profilePath.split('/').filter(Boolean)[0]?.toLowerCase();
      if (!firstSegment || ['login', 'oauth2', 'api', 'about', 'home', 'settings'].includes(firstSegment)) return null;
      url.hostname = 'www.patreon.com';
      url.pathname = profilePath;
      url.search = '';
      url.hash = '';
      return url.href.replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  // Collection links carry only a name and demo item ids. They use a neutral simmerspace:// address so
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
  function readCollectionLink(value, knownIds) {
    try {
      const text = String(value || '').trim();
      const hashStart = text.indexOf('#');
      if (hashStart < 0) return null;
      const raw = new URLSearchParams(text.slice(hashStart + 1)).get('collection');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.format !== COLLECTION_FORMAT || !Array.isArray(data.items)) return null;
      const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
      return {
        name: String(data.name || '').trim().slice(0, 40),
        items: [...new Set(data.items.filter(id => typeof id === 'string' && (known.has(id) || isCurseForgeItem(id))))]
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

  // Combines this PC's collections with the ones saved in the account. The newer copy of each collection
  // wins; collections that exist on only one side are kept. Nothing is deleted by a sync.
  function mergeCollections(local, remote) {
    const merged = (Array.isArray(local) ? local : []).map(item => ({ ...item }));
    const byId = new Map(merged.map(item => [item.id, item]));
    for (const item of Array.isArray(remote) ? remote : []) {
      if (!item || typeof item.id !== 'string') continue;
      const mine = byId.get(item.id);
      const clean = { id: item.id, name: String(item.name || ''), color: item.color || '', items: Array.isArray(item.items) ? item.items.filter(id => typeof id === 'string') : [], updated: Number(item.updated) || 0 };
      // A cover image chosen on this PC is never replaced by a sync (covers are not uploaded).
      if (mine?.cover) clean.cover = mine.cover;
      if (!mine) {
        merged.push(clean);
        byId.set(clean.id, clean);
      } else if (clean.updated > (Number(mine.updated) || 0)) {
        Object.assign(mine, clean);
      }
    }
    return merged;
  }

  /* ---------- Discover filters ---------- */
  // Sub-filters shown under Create a Sim categories. Body uses the item's `sub`, clothing and accessories use
  // `piece`, and animal CC uses `animal`.
  const CAS_PARTS = Object.freeze({
    Body: { field: 'sub', values: ['Hair', 'Makeup', 'Eyes', 'Lashes', 'Eyebrows'] },
    Clothing: { field: 'piece', values: ['Tops', 'Bottoms', 'Full body', 'Shoes', 'Swimwear', 'Outerwear'] },
    Accessories: { field: 'piece', values: ['Jewelry', 'Hats', 'Glasses', 'Bags', 'Gloves', 'Socks'] },
    Animals: { field: 'animal', values: ['Skins', 'Clothing', 'Eyes', 'Accessories', 'Objects'] }
  });
  const OCCULTS = ['Vampire', 'Werewolf', 'Mermaid', 'Fairy', 'PlantSim', 'Genie', 'Spellcaster', 'Alien', 'Ghost', 'Servo'];
  // Life stages that the catalog may spell in the singular.
  const AGE_ALIASES = { Elders: ['Elder', 'Elders'], Infants: ['Infant', 'Infants'], Babies: ['Baby', 'Babies'] };

  // One function for every Discover filter, so the redesigned controls cannot drift from the results.
  // Single-value filters combine with AND; multi-select groups (parts, occult) match any of their choices.
  function filterDemoItems(items, f, labelOf = item => item.name) {
    const query = String(f.query || '').trim().toLowerCase();
    const parts = Array.isArray(f.parts) ? f.parts : [];
    const occult = Array.isArray(f.occult) ? f.occult : [];
    const result = items.filter(i => {
      if (query && !`${i.name} ${i.es || ''} ${i.creator} ${i.category} ${i.sub} ${i.piece || ''} ${i.source} ${i.tag} ${i.type}`.toLowerCase().includes(query)) return false;
      if (f.parent && f.parent !== 'all' && i.department !== f.parent) return false;
      const sub = f.sub || 'All';
      if (sub === 'Body' && f.parent === 'cas') {
        if (!CAS_PARTS.Body.values.includes(i.sub)) return false;
      } else if (sub !== 'All' && i.sub !== sub && i.category !== sub) return false;
      if (parts.length && CAS_PARTS[sub] && !parts.includes(i[CAS_PARTS[sub].field])) return false;
      if (f.gender && f.gender !== 'All' && i.gender !== 'All' && i.gender !== f.gender && i.gender !== 'Unisex') return false;
      if (f.age && f.age !== 'All ages' && i.age !== 'All ages' && !(AGE_ALIASES[f.age] || [f.age]).includes(i.age)) return false;
      if (f.style && f.style !== 'All' && i.type !== f.style && i.type !== 'Both') return false;
      if (f.source && f.source !== 'All' && i.source !== f.source) return false;
      if (occult.length && !(Array.isArray(i.occult) && i.occult.some(value => occult.includes(value)))) return false;
      return true;
    });
    if (f.sort === 'az') result.sort((a, b) => labelOf(a).localeCompare(labelOf(b), f.lang));
    if (f.sort === 'updated') result.sort((a, b) => b.updated - a.updated);
    if (f.sort === 'popular') result.sort((a, b) => b.popularity - a.popularity);
    return result;
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
    normalizePatreonProfile,
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
    mergeCollections,
    CAS_PARTS,
    OCCULTS,
    filterDemoItems,
    modPathKey,
    modOrigin,
    groupModFiles,
    unclassifiedExternal
  };
});
