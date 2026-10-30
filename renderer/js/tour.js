/* First-launch tutorial: short guided steps that highlight the real interface. It runs once (the
   "onboarding-done" preference) and can be replayed from Settings → Help. Each step may open a page and
   point at an element; when the element is missing (for example, no Mods folder chosen yet) it points at a
   fallback or shows the step in the middle of the window. */
const TOUR_STEPS = [
  { title: 'tourWelcomeTitle', text: 'tourWelcomeText' },
  { title: 'tourNavTitle', text: 'tourNavText', target: '.side-nav', openSidebar: true },
  { title: 'tourLibraryTitle', text: 'tourLibraryText', target: '.nav-item[data-page="mycc"]', openSidebar: true },
  { title: 'tourScanTitle', text: 'tourScanText', page: 'mycc', target: ['#managed-scan-mods', '[data-pick-folder="mods"]'] },
  { title: 'tourImportTitle', text: 'tourImportText', page: 'mycc', target: ['#import-mod-files', '[data-pick-folder="mods"]'] },
  { title: 'tourCategoriesTitle', text: 'tourCategoriesText', page: 'mycc', target: ['#manage-mod-categories', '#mods-manager-root'] },
  { title: 'tourCreatorsOrgTitle', text: 'tourCreatorsOrgText', page: 'mycc', target: ['#manage-mod-creators', '#mods-manager-root'] },
  { title: 'tourCollectionsTitle', text: 'tourCollectionsText', target: '.nav-item[data-page="collections"]', openSidebar: true },
  { title: 'tourFollowTitle', text: 'tourFollowText', target: '.nav-item[data-page="creators"]', openSidebar: true },
  { title: 'tourInspirationTitle', text: 'tourInspirationText', target: '.nav-item[data-page="inspiration"]', openSidebar: true },
  { title: 'tourThemeTitle', text: 'tourThemeText', page: 'settings', target: '#personalization' },
  { title: 'tourAccountTitle', text: 'tourAccountText', target: '.account-chip', openSidebar: true }
];

const tour = { index: -1, layer: null, returnFocus: null };

function tourTarget(step) {
  const selectors = Array.isArray(step.target) ? step.target : step.target ? [step.target] : [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.getClientRects().length) return element;
  }
  return null;
}

function startTour({ replay = false } = {}) {
  if (tour.layer) return;
  tour.returnFocus = replay ? document.activeElement : null;
  tour.layer = document.createElement('div');
  tour.layer.className = 'tour-layer';
  tour.layer.innerHTML = '<div class="tour-spot" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1"></section>';
  document.body.append(tour.layer);
  showTourStep(0);
}

function endTour() {
  if (!tour.layer) return;
  safeWrite('onboarding-done', true);
  tour.layer.remove();
  tour.layer = null;
  tour.index = -1;
  setSidebarOpen(false);
  tour.returnFocus?.focus?.();
  tour.returnFocus = null;
}

function showTourStep(index) {
  const step = TOUR_STEPS[index];
  if (!step || !tour.layer) return endTour();
  tour.index = index;
  if (step.page && state.page !== step.page) goTo(step.page);
  setSidebarOpen(!!step.openSidebar);
  const total = TOUR_STEPS.length;
  const last = index === total - 1;
  const card = tour.layer.querySelector('.tour-card');
  card.innerHTML = `<div class="tour-progress" aria-label="${esc(format(t('tourProgress'), { step: index + 1, total }))}">${TOUR_STEPS.map((_, i) => `<i class="${i === index ? 'is-current' : i < index ? 'is-done' : ''}"></i>`).join('')}</div><h2 id="tour-title">${esc(t(step.title))}</h2><p id="tour-text">${esc(t(step.text))}</p><div class="tour-actions"><button class="tertiary-btn" data-tour="skip">${t('tourSkip')}</button><span class="tour-count">${index + 1} / ${total}</span>${index ? `<button class="secondary-btn" data-tour="prev">${t('tourPrev')}</button>` : ''}<button class="primary-btn" data-tour="${last ? 'finish' : 'next'}">${t(last ? 'tourFinish' : 'tourNext')}</button></div>`;
  // Wait for the sidebar transition and page render before measuring the highlighted element.
  requestAnimationFrame(() => setTimeout(() => placeTour(step), step.openSidebar ? 220 : 40));
}

function placeTour(step) {
  if (!tour.layer) return;
  const spot = tour.layer.querySelector('.tour-spot');
  const card = tour.layer.querySelector('.tour-card');
  const target = tourTarget(step);
  const gap = 14;
  if (!target) {
    spot.hidden = true;
    tour.layer.classList.add('is-centered');
    card.style.left = '';
    card.style.top = '';
  } else {
    tour.layer.classList.remove('is-centered');
    target.scrollIntoView?.({ block: 'nearest' });
    const box = target.getBoundingClientRect();
    spot.hidden = false;
    Object.assign(spot.style, { left: `${box.left - 6}px`, top: `${box.top - 6}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px` });
    const cardBox = card.getBoundingClientRect();
    // Right of the highlight when there is room (the sidebar), otherwise below or above it.
    let left = box.right + gap + 6;
    let top = box.top;
    if (left + cardBox.width > window.innerWidth - gap) {
      left = box.left;
      top = box.bottom + gap + 6;
      if (top + cardBox.height > window.innerHeight - gap) top = box.top - cardBox.height - gap - 6;
    }
    card.style.left = `${Math.round(Math.max(gap, Math.min(left, window.innerWidth - cardBox.width - gap)))}px`;
    card.style.top = `${Math.round(Math.max(gap, Math.min(top, window.innerHeight - cardBox.height - gap)))}px`;
  }
  card.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  const action = event.target.closest?.('[data-tour]')?.dataset.tour;
  if (!action || !tour.layer) return;
  event.stopPropagation();
  if (action === 'next') showTourStep(tour.index + 1);
  else if (action === 'prev') showTourStep(Math.max(0, tour.index - 1));
  else endTour();
}, true);

document.addEventListener('keydown', event => {
  if (!tour.layer) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    endTour();
  } else if (event.key === 'ArrowRight') showTourStep(tour.index + 1);
  else if (event.key === 'ArrowLeft' && tour.index > 0) showTourStep(tour.index - 1);
  else if (event.key === 'Tab') {
    // Keep keyboard focus inside the tutorial card.
    const buttons = [...tour.layer.querySelectorAll('button')];
    const first = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      first.focus();
    }
  }
}, true);

window.addEventListener('resize', () => {
  if (tour.layer && tour.index >= 0) placeTour(TOUR_STEPS[tour.index]);
});

function maybeStartTour() {
  if (safeRead('onboarding-done', false) !== true) startTour();
}
