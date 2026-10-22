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
        items: [...new Set(data.items.filter(id => typeof id === 'string' && known.has(id)))]
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
  function filterModFiles(files, { query = '', state = 'all', categoryId = '' }, lookup) {
    const needle = query.trim().toLocaleLowerCase();
    const result = [];
    for (const file of files) {
      if (state === 'enabled' && !file.enabled) continue;
      if (state === 'disabled' && file.enabled) continue;
      if (state === 'tooDeep' && !modDepthWarning(file)) continue;
      const tags = lookup.tags(file.relativePath);
      if (categoryId === '__none__' ? tags.categoryId : categoryId && tags.categoryId !== categoryId) continue;
      if (needle) {
        const text = `${file.relativePath} ${lookup.categoryName(tags.categoryId)} ${lookup.creatorName(tags.creatorId)} ${tags.gender || ''} ${tags.age || ''}`;
        if (!text.toLocaleLowerCase().includes(needle)) continue;
      }
      result.push(file);
    }
    return result;
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
    unwrapDesktopResult
  };
});
