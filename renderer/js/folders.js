/* Sims 4 folder locations. Paths are chosen in the system folder dialog and saved by the desktop app. */
const FOLDER_DEFS = [
  { id: 'mods', label: 'modsFolder', icon: '▧', required: true, usual: '%USERPROFILE%\\Documents\\Electronic Arts\\The Sims 4\\Mods' },
  { id: 'documents', label: 'documentsFolder', icon: '⌂', required: true, usual: '%USERPROFILE%\\Documents\\Electronic Arts\\The Sims 4', hint: 'oneDriveHint' },
  {
    id: 'game',
    label: 'installFolder',
    icon: '◈',
    required: true,
    usual: 'C:\\Program Files\\EA Games\\The Sims 4',
    alternate: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\The Sims 4'
  },
  { id: 's4s', label: 's4sFolder', icon: '✧', required: false, usual: 'C:\\Program Files (x86)\\Sims 4 Studio' }
];
const REQUIRED_FOLDERS = FOLDER_DEFS.filter(def => def.required);
let routeRecords = {};
let pickingFolder = null;

function folderSettingsSection() {
  const done = REQUIRED_FOLDERS.filter(def => routeRecords[def.id]?.path).length;
  return `<section class="routes-section" id="folder-settings" aria-label="${esc(t('folderRoutes'))}"><div class="routes-head"><p class="setting-help">${desktop ? t('folderIntro') : t('desktopOnly')}</p><span class="badge badge-quiet" title="${esc(t('required'))}">${done} / ${REQUIRED_FOLDERS.length}</span></div><div class="route-list">${FOLDER_DEFS.map(def => {
    const record = routeRecords[def.id];
    return `<article class="route-card ${record ? 'is-connected' : ''}"><div class="route-copy"><h3>${t(def.label)} <span class="route-badge ${def.required ? 'required' : 'optional'}">${t(def.required ? 'required' : 'optional')}</span></h3><p class="route-path">${
      record ? `<strong title="${esc(record.path)}">${esc(record.path)}</strong>` : t('notSelected')
    }</p><details class="route-hint"><summary>${t('usualPath')}</summary><code>${esc(def.usual)}</code>${def.alternate ? `<br><b>${t('alternatePath')}:</b> <code>${esc(def.alternate)}</code>` : ''}${def.hint ? `<br>${t(def.hint)}` : ''}</details></div><button class="secondary-btn small-chip" data-pick-folder="${def.id}" ${desktop ? '' : 'disabled'} ${pickingFolder ? 'aria-disabled="true"' : ''}>${record ? t('changeFolder') : t('chooseFolder')}</button></article>`;
  }).join('')}</div><p class="setting-help">${t('folderFootnote')}</p></section>`;
}

function folderRoutePanel() {
  const done = REQUIRED_FOLDERS.filter(def => routeRecords[def.id]?.path).length;
  if (done === REQUIRED_FOLDERS.length || routeRecords.mods?.path) return '';
  return notice(`<b>${t('requiredRoutes')} (${done}/${REQUIRED_FOLDERS.length}).</b> ${t('requiredText')}`, { tone: 'warning', action: `<button class="secondary-btn small-chip" data-settings-section="folders">${t('setPaths')}</button>` });
}

async function chooseDirectory(id) {
  if (pickingFolder) return;
  pickingFolder = id;
  try {
    const record = await callDesktop(desktop?.chooseFolder, id);
    if (!record) return;
    const modsChanged = id === 'mods' && routeRecords.mods?.path !== record.path;
    routeRecords[id] = record;
    if (modsChanged) await onModsFolderChanged();
    render();
    toast(t('folderSaved'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    pickingFolder = null;
  }
}

async function loadRoutes() {
  if (!desktop) return;
  try {
    routeRecords = (await callDesktop(desktop.loadRoutes)) || {};
  } catch (error) {
    console.warn('Could not load saved folder settings:', error);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-pick-folder]');
  if (button) chooseDirectory(button.dataset.pickFolder);
});
