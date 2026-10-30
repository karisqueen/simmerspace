/* Shared interface plumbing: local preferences, toasts, accessible dialogs and focus handling. */
const STORAGE_PREFIX = 'simmerspace-';

function safeRead(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function safeWrite(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function safeGet(key) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {}
}

const desktop = window.simmerSpace || null;

// Calls a preload function and returns its value, or throws an Error with a `code`.
async function callDesktop(fn, ...args) {
  if (typeof fn !== 'function') {
    const error = new Error('Desktop features are unavailable.');
    error.code = 'DESKTOP_ONLY';
    throw error;
  }
  return unwrapDesktopResult(await fn(...args));
}

function toast(message, tone = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), tone === 'error' ? 5200 : 2800);
}

/* ---------- Focus preservation across re-renders ---------- */
function focusKey(el) {
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-') && attr.value) return `${el.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
  }
  return null;
}

// Runs a render function and puts keyboard focus (and caret) back on the equivalent element.
function withFocusPreserved(renderFn) {
  const active = document.activeElement;
  const key = focusKey(active);
  const caret = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  renderFn();
  if (!key) return;
  const next = document.querySelector(key);
  if (!next || next === document.activeElement) return;
  next.focus({ preventScroll: true });
  if (caret && typeof next.setSelectionRange === 'function') {
    try {
      next.setSelectionRange(caret[0], caret[1]);
    } catch {}
  }
}

/* ---------- Dialogs ---------- */
const overlay = document.getElementById('overlay');
const dialog = document.getElementById('dialog');
let dialogReturnFocus = null;
let dialogReturnKey = null; // fallback when the opener was re-rendered while the dialog was open
let dialogOnClose = null;
let dialogLocked = false; // while true (a file action is running) the dialog ignores Esc, the × button and outside clicks
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function closeButton() {
  return `<button class="dialog-close" data-close aria-label="${esc(t('close'))}" title="${esc(t('close'))}">×</button>`;
}

// Opens the shared dialog. Focus moves into it, stays inside it, and returns to the opener on close.
function openDialog(html, { onClose = null, wide = false } = {}) {
  if (overlay.hidden) {
    dialogReturnFocus = document.activeElement;
    dialogReturnKey = focusKey(dialogReturnFocus);
  }
  dialogOnClose?.(null);
  dialogOnClose = onClose;
  dialog.classList.toggle('dialog-wide', wide);
  dialog.innerHTML = html;
  overlay.hidden = false;
  document.body.classList.add('dialog-open');
  const target = dialog.querySelector('[autofocus]') || dialog.querySelector('input,textarea,select') || dialog.querySelector('.detail-actions button') || dialog.querySelector(FOCUSABLE);
  target?.focus();
}

// Keeps the open dialog on screen until the work it shows has finished.
function setDialogLocked(locked) {
  dialogLocked = locked;
  dialog.setAttribute('aria-busy', String(locked));
  for (const button of dialog.querySelectorAll('.dialog-close')) button.disabled = locked;
}

function closeDialog(result = null) {
  if (overlay.hidden || dialogLocked) return;
  overlay.hidden = true;
  dialog.innerHTML = '';
  document.body.classList.remove('dialog-open');
  const callback = dialogOnClose;
  dialogOnClose = null;
  callback?.(result);
  const opener = dialogReturnFocus?.isConnected ? dialogReturnFocus : dialogReturnKey && document.querySelector(dialogReturnKey);
  opener?.focus({ preventScroll: true });
  dialogReturnFocus = null;
  dialogReturnKey = null;
}

function trapDialogFocus(event) {
  if (event.key !== 'Tab' || overlay.hidden) return;
  const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
}

// In-app confirmation that says exactly what will happen. Resolves true only on the confirm button.
function confirmAction({ eyebrow = '', title, body = '', details = [], confirmLabel, danger = false }) {
  return new Promise(resolve => {
    const list = details.length ? `<ul class="confirm-details">${details.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
    openDialog(
      `${closeButton()}<div class="form-dialog confirm-dialog ${danger ? 'is-danger' : ''}">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h2 id="dialog-title">${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}${list}<div class="detail-actions"><button class="${danger ? 'danger-btn' : 'primary-btn'}" data-dialog-result="confirm">${esc(confirmLabel)}</button><button class="secondary-btn" data-close autofocus>${esc(t('cancel'))}</button></div></div>`,
      { onClose: result => resolve(result === 'confirm') }
    );
  });
}

// Summary after a batch action, listing the files that were left untouched and why, and optionally
// the files that did change (`successes`: [{ label, detail }]).
function showResultDialog({ title, summary, failures = [], describe, successes = [], successTitle = '', successMore = '', note = '' }) {
  const shown = failures.slice(0, 50);
  const more = failures.length - shown.length;
  const okShown = successes.slice(0, 200);
  const okList = okShown.length
    ? `<details class="result-success"><summary>${esc(successTitle)} (${successes.length.toLocaleString(state.lang)})</summary><ul class="result-list">${okShown
        .map(item => `<li><b>${esc(item.label)}</b>${item.detail ? `<span>${esc(item.detail)}</span>` : ''}</li>`)
        .join('')}</ul>${successes.length > okShown.length && successMore ? `<p class="muted-note">${esc(successMore)}</p>` : ''}</details>`
    : '';
  const list = shown.length
    ? `<h3 class="result-subtitle">${esc(t('resultsNotChanged'))}</h3><ul class="result-list">${shown
        .map(item => `<li><b>${esc(item.label)}</b><span>${esc(describe(item))}</span></li>`)
        .join('')}</ul>${more > 0 ? `<p class="muted-note">${esc(format(t('resultsMore'), { count: more.toLocaleString(state.lang) }))}</p>` : ''}`
    : '';
  openDialog(
    `${closeButton()}<div class="form-dialog result-dialog"><h2 id="dialog-title">${esc(title)}</h2><p>${esc(summary)}</p>${note ? `<p class="muted-note">${esc(note)}</p>` : ''}${list}${okList}<div class="detail-actions"><button class="primary-btn" data-close>${esc(t('done'))}</button></div></div>`,
    { wide: shown.length > 0 || okShown.length > 0 }
  );
}

document.addEventListener('click', event => {
  const choice = event.target.closest('[data-dialog-result]');
  if (choice && dialog.contains(choice)) {
    closeDialog(choice.dataset.dialogResult);
    return;
  }
  if (event.target.closest('[data-close]')) closeDialog();
});
overlay.addEventListener('mousedown', event => {
  if (event.target === overlay) closeDialog();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !overlay.hidden) {
    event.preventDefault();
    closeDialog();
  }
  trapDialogFocus(event);
});

/* ---------- Delayed tooltips ----------
   Any control with data-tip="…" explains itself after the pointer rests on it for about two seconds, or
   shortly after it gets keyboard focus. The text says what the control does, not its name. Players can turn
   this off in Settings (state.tooltips). Tooltips never hold essential information: every control also
   has a visible label or an accessible name. */
const TIP_DELAY_POINTER = 2000;
const TIP_DELAY_KEYBOARD = 700;
let tipTimer = null;
let tipTarget = null;
let tipElement = null;

function tooltipsEnabled() {
  return typeof state === 'undefined' || state.tooltips !== false;
}
function hideTooltip() {
  clearTimeout(tipTimer);
  tipTimer = null;
  if (tipTarget?.getAttribute('aria-describedby') === 'app-tooltip') tipTarget.removeAttribute('aria-describedby');
  tipTarget = null;
  if (tipElement) tipElement.hidden = true;
}
function showTooltip(target) {
  if (!target.isConnected || !tooltipsEnabled()) return;
  const text = target.dataset.tip;
  if (!text) return;
  if (!tipElement) {
    tipElement = document.createElement('div');
    tipElement.id = 'app-tooltip';
    tipElement.className = 'tooltip';
    tipElement.setAttribute('role', 'tooltip');
    document.body.append(tipElement);
  }
  tipElement.textContent = text;
  tipElement.hidden = false;
  target.setAttribute('aria-describedby', 'app-tooltip');
  // Beside the control in the sidebar (so it never covers the next item), otherwise below or above it.
  const box = target.getBoundingClientRect();
  const tip = tipElement.getBoundingClientRect();
  const gap = 8;
  let left;
  let top;
  if (target.closest('.sidebar')) {
    left = box.right + gap;
    top = box.top + (box.height - tip.height) / 2;
  } else {
    left = box.left + (box.width - tip.width) / 2;
    top = box.bottom + gap;
    if (top + tip.height > window.innerHeight - gap) top = box.top - tip.height - gap;
  }
  tipElement.style.left = `${Math.round(Math.max(gap, Math.min(left, window.innerWidth - tip.width - gap)))}px`;
  tipElement.style.top = `${Math.round(Math.max(gap, Math.min(top, window.innerHeight - tip.height - gap)))}px`;
}
function scheduleTooltip(target, delay) {
  if (target === tipTarget) return;
  hideTooltip();
  if (!tooltipsEnabled()) return;
  tipTarget = target;
  tipTimer = setTimeout(() => showTooltip(target), delay);
}
document.addEventListener('pointerover', event => {
  if (event.pointerType === 'touch') return;
  const target = event.target.closest?.('[data-tip]');
  if (target) scheduleTooltip(target, TIP_DELAY_POINTER);
  else if (tipTarget) hideTooltip();
});
document.addEventListener('pointerout', event => {
  if (tipTarget && !tipTarget.contains(event.relatedTarget)) hideTooltip();
});
document.addEventListener('focusin', event => {
  const target = event.target.closest?.('[data-tip]');
  if (target && target.matches(':focus-visible')) scheduleTooltip(target, TIP_DELAY_KEYBOARD);
});
document.addEventListener('focusout', hideTooltip);
document.addEventListener('pointerdown', hideTooltip);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && tipTarget) hideTooltip();
});
window.addEventListener('scroll', hideTooltip, true);
window.addEventListener('blur', hideTooltip);
