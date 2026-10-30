/* SimmerSpace icon family: 24×24, rounded 1.75px strokes drawn with currentColor. Most icons add one soft
   "duotone" shape (class="d"), filled with the same color at low opacity, which gives each icon a distinct
   silhouette at small sizes in every theme. Icons are decorative (aria-hidden); the button or link around
   them carries the accessible name. The plumbob (collections) and the brand crystal are below. */
const ICON_PATHS = {
  // Navigation
  home: '<path class="d" d="M5 10.5 12 5l7 5.5V19a1 1 0 0 1-1 1h-3.5v-5h-5v5H6a1 1 0 0 1-1-1z"/><path d="M3.5 11.5 12 4.8l8.5 6.7"/><path d="M5.5 10v9a1 1 0 0 0 1 1h3.5v-5h4v5h3.5a1 1 0 0 0 1-1v-9"/>',
  discover: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  library: '<rect class="d" x="4" y="4" width="7" height="7" rx="2"/><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
  creators: '<circle class="d" cx="9.5" cy="8.5" r="3.5"/><circle cx="9.5" cy="8.5" r="3.5"/><path d="M3.5 19.5c.7-3.3 3-5 6-5s5.3 1.7 6 5"/><path d="M17.8 3.8c.25 1.3.7 1.75 2 2-1.3.25-1.75.7-2 2-.25-1.3-.7-1.75-2-2 1.3-.25 1.75-.7 2-2z"/><path d="M16 12.6c2.2.4 3.8 2.3 4.4 5.4"/>',
  collections: '<path class="d" d="M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M6.5 5.5h11M8.5 3h7"/>',
  inspiration: '<rect class="d" x="3.5" y="4.5" width="17" height="15" rx="3"/><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="m4.5 17 4.6-4.3 3.3 3 2.6-2.3 4.7 4"/><path d="M15.5 7.2c.2 1 .55 1.35 1.55 1.55-1 .2-1.35.55-1.55 1.55-.2-1-.55-1.35-1.55-1.55 1-.2 1.35-.55 1.55-1.55z"/>',
  settings: '<circle class="d" cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5c.9 0 1.6.7 1.7 1.5l.1.8a6.8 6.8 0 0 1 1.9 1.1l.8-.3a1.7 1.7 0 0 1 2.1.8 1.7 1.7 0 0 1-.4 2.2l-.6.5a6.8 6.8 0 0 1 0 2.2l.6.5a1.7 1.7 0 0 1 .4 2.2 1.7 1.7 0 0 1-2.1.8l-.8-.3a6.8 6.8 0 0 1-1.9 1.1l-.1.8a1.7 1.7 0 0 1-3.4 0l-.1-.8a6.8 6.8 0 0 1-1.9-1.1l-.8.3a1.7 1.7 0 0 1-2.1-.8 1.7 1.7 0 0 1 .4-2.2l.6-.5a6.8 6.8 0 0 1 0-2.2l-.6-.5a1.7 1.7 0 0 1-.4-2.2 1.7 1.7 0 0 1 2.1-.8l.8.3a6.8 6.8 0 0 1 1.9-1.1l.1-.8c.1-.8.8-1.5 1.7-1.5z"/>',
  user: '<circle class="d" cx="12" cy="8.5" r="3.8"/><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
  bell: '<path class="d" d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2H5z"/><path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  // Content types
  mods: '<path class="d" d="M9 4h6v3a1.5 1.5 0 0 0 3 0h2v6h-2a1.5 1.5 0 0 0 0 3h2v4H4v-4h2a1.5 1.5 0 0 0 0-3H4V7h5z"/><path d="M9 4.5h6M4.5 7v5.5h1.6a2 2 0 0 1 0 4H4.5V19.5h15V16.5h-1.6a2 2 0 0 1 0-4h1.6V7H17.5"/><path d="M9 4.5v2.6a1.5 1.5 0 0 1-3 .1V7H4.5M15 4.5v2.6a1.5 1.5 0 0 0 3 .1V7"/>',
  cc: '<path class="d" d="M12 6a2 2 0 1 1 2-2"/><path d="M12 6.5a2.2 2.2 0 1 1 2.2-2.2"/><path d="M12 6.5v1.2L3.6 14a1.4 1.4 0 0 0 .9 2.5h15a1.4 1.4 0 0 0 .9-2.5L12 7.7"/><path class="d" d="m12 8 8 6.2a1.2 1.2 0 0 1-.8 2.1H4.8a1.2 1.2 0 0 1-.8-2.1z"/>',
  clothing: '<path class="d" d="m8.5 4-4.6 2.7 1.8 4 2.3-.9V20h8V9.8l2.3.9 1.8-4L15.5 4a3.5 3.5 0 0 1-7 0z"/><path d="m8.5 4-4.6 2.7 1.8 4 2.3-.9V20h8V9.8l2.3.9 1.8-4L15.5 4a3.5 3.5 0 0 1-7 0z"/>',
  hair: '<path class="d" d="M12 3.5c-4.4 0-7 3.2-7 7.2 0 3 .6 5.6-.8 8.3 2.6.6 4.4-.6 5-2.3h5.6c.6 1.7 2.4 2.9 5 2.3-1.4-2.7-.8-5.3-.8-8.3 0-4-2.6-7.2-7-7.2z"/><path d="M12 3.5c-4.4 0-7 3.2-7 7.2 0 3 .6 5.6-.8 8.3 2.6.6 4.4-.6 5-2.3M12 3.5c4.4 0 7 3.2 7 7.2 0 3-.6 5.6.8 8.3-2.6.6-4.4-.6-5-2.3"/><path d="M8.2 9.5c1.8-.2 4.4-1.4 5.6-3.6.6 1.7 1.6 2.9 2.4 3.4"/><path d="M8.3 11.5v1.2a3.7 3.7 0 0 0 7.4 0v-1.6"/>',
  accessories: '<circle class="d" cx="12" cy="15" r="4.5"/><path d="M12 3.5v4"/><path d="M9.6 8.6 12 7.5l2.4 1.1"/><circle cx="12" cy="15" r="4.5"/><path d="m12 12.2.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
  objects: '<path class="d" d="M8 4h8l2.5 7h-13z"/><path d="M8 4h8l2.5 7h-13z"/><path d="M12 11v7M8 20h8M10 18h4"/>',
  buildbuy: '<path class="d" d="M4.5 10.5 12 4.5l7.5 6V20h-15z"/><path d="M3.5 11 12 4.2l8.5 6.8"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-4.5h5V20M5.5 14h4M14.5 14h4"/>',
  // Actions
  search: '<circle class="d" cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  filter: '<path class="d" d="M4 5.5h16l-6 7.2V19l-4-2v-4.3z"/><path d="M4 5.5h16l-6 7.2V19l-4-2v-4.3z"/>',
  sliders: '<path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle class="d" cx="16" cy="7" r="2.4"/><circle cx="16" cy="7" r="2.4"/><circle class="d" cx="10" cy="17" r="2.4"/><circle cx="10" cy="17" r="2.4"/>',
  heart: '<path class="d" d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  star: '<path class="d" d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/><path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  download: '<path class="d" d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3z"/><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  updates: '<circle class="d" cx="12" cy="12" r="8"/><path d="M19.5 11A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13a7.5 7.5 0 0 0 13.5 4.4l1.5-1.4M19.5 20v-4h-4"/><path d="M12 8.5V12l2.2 1.6"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13a7.5 7.5 0 0 0 13.5 4.4l1.5-1.4M19.5 20v-4h-4"/>',
  import: '<path class="d" d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5l-2.5-6H16M4 13.5l2.5-6H8"/><path d="M12 3.5v8M9 8.5l3 3 3-3"/>',
  folder: '<path class="d" d="M3.5 8.5h17V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  folderCog: '<path class="d" d="M3.5 8.5h17V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M11 19.5H5.5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v2"/><circle cx="17" cy="16.5" r="2"/><path d="M17 12.8v1.2M17 19v1.2M13.3 16.5h1.2M19.5 16.5h1.2"/>',
  tag: '<path class="d" d="M4 4.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-5.1 5.1a1.5 1.5 0 0 1-2.1 0L4 11.7z"/><path d="M4 4.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-5.1 5.1a1.5 1.5 0 0 1-2.1 0L4 11.7z"/><circle cx="8.3" cy="8.8" r="1.3"/>',
  upload: '<path class="d" d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3z"/><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  sparkle: '<path class="d" d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M18.5 16.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z"/>',
  curseforge: '<path class="d" d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  sun: '<circle class="d" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path class="d" d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  eye: '<path class="d" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M10.2 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.4C3.9 9.1 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.5 4.2-1.1M9.9 10a2.8 2.8 0 0 0 4 4M4 4l16 16"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"/>',
  warning: '<path class="d" d="M12 4 2.8 19.5h18.4z"/><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.3"/>',
  help: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.6M12 17.2v.3"/>',
  cloud: '<path class="d" d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18.5z"/><path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18.5z"/>',
  sync: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9"/>',
  logout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h10"/>',
  trash: '<path class="d" d="M7 7l1 12.5h8L17 7z"/><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  edit: '<path class="d" d="m15.5 5 3.5 3.5L9 18.5H5.5V15z"/><path d="m15.5 5 3.5 3.5L9 18.5H5.5V15zM13.5 7l3.5 3.5"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  pin: '<path d="M9 4.5h6M10 4.5v5L7 13h10l-3-3.5v-5M12 13v6.5"/>'
};
// Older names kept so existing screens keep working.
ICON_PATHS.explore = ICON_PATHS.discover;
ICON_PATHS.profile = ICON_PATHS.user;
ICON_PATHS.notifications = ICON_PATHS.bell;
ICON_PATHS.favorites = ICON_PATHS.heart;

function icon(name, className = '') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  const filled = name === 'play';
  return `<svg class="icon icon-${name} ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'}>${paths}</svg>`;
}

// The plumbob: a faceted diamond in the collection's own color. Facets are drawn with white and black
// overlays so any color reads as a gem; the outline keeps pale colors visible on light backgrounds.
function plumbob(color, { className = '', label = '' } = {}) {
  const safe = collectionColor(color);
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="plumbob ${className}" viewBox="0 0 16 24" ${a11y} focusable="false" style="--plumbob:${safe}"><path class="pb-body" d="M8 1.2 14.8 10 8 22.8 1.2 10z"/><path d="M8 1.2 1.2 10 8 11.2z" fill="#fff" opacity=".45"/><path d="M8 1.2 14.8 10 8 11.2z" fill="#fff" opacity=".18"/><path d="M1.2 10 8 11.2 8 22.8z" fill="#000" opacity=".06"/><path d="M14.8 10 8 11.2 8 22.8z" fill="#000" opacity=".22"/><path class="pb-edge" d="M8 1.2 14.8 10 8 22.8 1.2 10z"/></svg>`;
}

// SimmerSpace mark: a brilliant-cut crystal (not a plumbob) in the theme's primary color, with one facet in
// the pop color and a sparkle in the warm note. renderer/brand/ holds the same drawing as standalone files.
function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="bm-a" d="M9.2 6.5h13.6a1.6 1.6 0 0 1 1.3.66l3.9 5.4a1.6 1.6 0 0 1-.05 1.94L17.25 27.1a1.6 1.6 0 0 1-2.5 0L4.05 14.5a1.6 1.6 0 0 1-.05-1.94l3.9-5.4a1.6 1.6 0 0 1 1.3-.66z"/><path d="M4.3 13.4h23.4L16 27.6z" fill="#000" fill-opacity=".14"/><path d="M4.3 13.4 12.2 13.4 16 27.6z" fill="#fff" fill-opacity=".22"/><path d="M8.6 6.9 12.2 13.4H4.3z" fill="#fff" fill-opacity=".42"/><path d="M12.2 13.4 16 6.6 19.8 13.4z" fill="#fff" fill-opacity=".28"/><path class="bm-b" d="M23.4 6.9 19.8 13.4h7.9z"/><path class="bm-b" d="M19.8 13.4h7.9L16 27.6z" fill-opacity=".55"/><path class="bm-edge" d="M4.3 13.4h23.4M12.2 13.4 16 27.6M19.8 13.4 16 27.6M12.2 13.4 16 6.6l3.8 6.8"/><path class="bm-spark" d="M27.2 1.2c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6z"/></svg>`;
}
