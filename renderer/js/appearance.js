/* Personalization: color family, light/dark mode, density and motion.
   Saved with the other local preferences; applied as data attributes on <html> that the design tokens in
   styles/tokens.css read. */
// Windows' own preferences are read only to carry over the removed "Match Windows" option and to pick the
// first motion setting of a new install (see normalizeAppearance in core.js).
function systemAppearancePrefs() {
  return { dark: !!window.matchMedia?.('(prefers-color-scheme: dark)').matches, reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches };
}

function loadAppearance() {
  const saved = safeRead('appearance', null);
  const appearance = normalizeAppearance(saved, safeGet('theme'), { primary: safeGet('primary-hue'), secondary: safeGet('secondary-hue') }, systemAppearancePrefs());
  if (saved && (saved.mode === 'system' || saved.motion === 'system')) safeWrite('appearance', appearance);
  return appearance;
}

function resolvedMode(appearance) {
  return appearance.mode === 'dark' ? 'dark' : 'light';
}

function applyAppearance(appearance) {
  const root = document.documentElement;
  root.dataset.family = appearance.family;
  root.dataset.mode = resolvedMode(appearance);
  root.dataset.density = appearance.density;
  root.dataset.motion = appearance.motion;
  // Remembered by the desktop app so the next start does not flash the wrong background.
  if (desktop?.setWindowBackground) {
    const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (rgb?.length >= 3) desktop.setWindowBackground(`#${rgb.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('')}`).catch?.(() => {});
  }
}

function setAppearance(changes) {
  const next = normalizeAppearance({ ...state.appearance, ...changes });
  state.appearance = next;
  safeWrite('appearance', next);
  render();
}

