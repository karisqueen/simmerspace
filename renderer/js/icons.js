/* Interface icons as inline SVG (24×24, drawn with currentColor), plus the plumbob and the SimmerSpace mark.
   Icons are decorative (aria-hidden); the button or link around them carries the accessible name. */
const ICON_PATHS = {
  discover: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  curseforge: '<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7"/>',
  library: '<rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  creators: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M15.5 5.2a3.4 3.4 0 0 1 0 6.6M17.6 14.8c1.8.7 3 2.3 3.4 4.7"/>',
  inspiration: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 4.8-4.3 3.4 3 2.8-2.4L20 17.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.7 7.7 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13a7.5 7.5 0 0 0 13.5 4.4l1.5-1.4M19.5 20v-4h-4"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  warning: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.3"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18.5z"/>',
  sync: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  logout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h10"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>'
};

function icon(name, className = '') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  const filled = name === 'play';
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'}>${paths}</svg>`;
}

// The plumbob: a faceted diamond in the collection's own color. Facets are drawn with white and black
// overlays so any color reads as a gem; the outline keeps pale colors visible on light backgrounds.
function plumbob(color, { className = '', label = '' } = {}) {
  const safe = collectionColor(color);
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="plumbob ${className}" viewBox="0 0 16 24" ${a11y} focusable="false" style="--plumbob:${safe}"><path class="pb-body" d="M8 1.2 14.8 10 8 22.8 1.2 10z"/><path d="M8 1.2 1.2 10 8 11.2z" fill="#fff" opacity=".45"/><path d="M8 1.2 14.8 10 8 11.2z" fill="#fff" opacity=".18"/><path d="M1.2 10 8 11.2 8 22.8z" fill="#000" opacity=".06"/><path d="M14.8 10 8 11.2 8 22.8z" fill="#000" opacity=".22"/><path class="pb-edge" d="M8 1.2 14.8 10 8 22.8 1.2 10z"/></svg>`;
}

// SimmerSpace mark: a plumbob-cut gem split between the primary and secondary accents.
function brandMark() {
  return `<svg class="brand-mark" viewBox="0 0 28 32" aria-hidden="true" focusable="false"><path class="bm-a" d="M14 1.5 25.5 13 14 30.5 2.5 13z"/><path class="bm-b" d="M14 1.5 25.5 13 14 14.6z"/><path d="M14 1.5 2.5 13 14 14.6z" fill="#fff" opacity=".38"/><path d="M25.5 13 14 14.6 14 30.5z" fill="#000" opacity=".16"/><circle class="bm-spark" cx="22.5" cy="4.5" r="1.6"/></svg>`;
}
