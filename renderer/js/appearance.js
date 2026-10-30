/* Personalization: theme family, light/dark mode, one or two accents, density and motion.
   Saved with the other local preferences; applied as data attributes on <html> that the design tokens in
   styles/tokens.css read. */
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

function loadAppearance() {
  return normalizeAppearance(safeRead('appearance', null), safeGet('theme'), { primary: safeGet('primary-hue'), secondary: safeGet('secondary-hue') });
}

function resolvedMode(appearance) {
  if (appearance.mode === 'system') return darkQuery?.matches ? 'dark' : 'light';
  return appearance.mode;
}

function applyAppearance(appearance) {
  const root = document.documentElement;
  root.dataset.family = appearance.family;
  root.dataset.mode = resolvedMode(appearance);
  root.dataset.accent = appearance.primary;
  root.dataset.accent2 = appearance.secondary || appearance.primary;
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
  // Choosing the Sims blue theme starts it with its signature accent; any accent can be picked afterwards.
  if (changes.family === 'sims-blue' && state.appearance.family !== 'sims-blue' && !('primary' in changes)) {
    next.primary = 'blue';
    if (next.secondary === 'blue') next.secondary = '';
  }
  state.appearance = next;
  safeWrite('appearance', next);
  safeWrite('preferences-updated', Date.now());
  render();
}

darkQuery?.addEventListener?.('change', () => {
  if (state.appearance.mode === 'system') render();
});
