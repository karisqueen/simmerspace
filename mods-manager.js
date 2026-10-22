/* Local, reversible Sims 4 Mods management. File operations are exposed by the Electron preload only. */
const MOD_MANAGER_TEXT = {
  en: {
    title: 'Your Mods folder', intro: 'Scan and organize your local .package and .ts4script files. Imports copy files; organizing moves them inside Mods.',
    scan: 'Scan Mods', scanning: 'Scanning…', importFiles: 'Import files', importFolder: 'Import folder', addCategory: 'Categories & folders', addCreator: 'Creators',
    search: 'Search file, folder, category, or creator…', allFiles: 'All files', enabled: 'Enabled', disabled: 'Disabled', tooDeep: 'Files too deep', scriptTooDeep: 'Script mods must be at most one folder deep.', packageTooDeep: 'Package files should be no more than five folders deep.',
    files: 'files', visited: 'checked', inaccessible: 'folders could not be read', noMods: 'No supported mod files were found.', noScan: 'Choose your Mods folder in Settings, then scan it to begin.',
    chooseFolder: 'Choose the Mods folder in Settings first.', page: 'Page', of: 'of', selectPage: 'Select page', selectResults: 'Select all results', clearSelection: 'Clear selection', selected: 'selected',
    applyTags: 'Apply tags', category: 'Category', creator: 'Creator', noCategory: 'Uncategorized', anyCreator: 'Unassigned', gender: 'Style', age: 'Age',
    unchanged: 'Leave unchanged', clear: 'Clear', female: 'Feminine', male: 'Masculine', unisex: 'Unisex', neutral: 'Neutral / unknown',
    infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen', youngAdult: 'Young adult', adult: 'Adult', elder: 'Elder', unknownAge: 'Unspecified',
    enabledState: 'Enabled', disabledState: 'Disabled', enable: 'Enable', disable: 'Disable', editTags: 'Edit tags', rename: 'Rename', remove: 'Move to Recycle Bin',
    organize: 'Organize selected', configureFolders: 'Choose category folders', noFolders: 'Select which tagged categories should become folders. Unselected categories stay where they are.',
    createFolders: 'Create selected folders', folderName: 'Folder name', useFolder: 'Use as a folder', folderReady: 'category folders selected',
    newCategory: 'New category', categoryName: 'Category name', createCategory: 'Create category', custom: 'Custom', deleteCategory: 'Delete category',
    creatorTitle: 'Creators', creatorName: 'Creator name', saveCreator: 'Save creator', newCreator: 'Add creator', deleteCreator: 'Remove creator',
    editTagsTitle: 'File tags', saveTags: 'Save tags', fileName: 'File name (extension stays the same)', saveName: 'Save name',
    confirmDelete: 'Send this mod file to the Windows Recycle Bin?', confirmBulkDelete: 'Send the selected files to the Windows Recycle Bin?',
    confirmOrganize: 'Move the selected tagged files into their chosen category folders inside Mods?', organizeResult: 'Moved {moved}; skipped {skipped}. Files with name conflicts were left in place.',
    importResult: 'Copied {count} mod files into Mods. Existing files were never overwritten.', scanError: 'Could not scan the selected Mods folder.',
    noSelection: 'Select at least one mod file first.', noFolderForCategory: 'Choose a category folder for each selected file before organizing.',
    tagSaved: 'File tags saved.', actionFailed: 'The operation could not be completed.', pageSize: 'Showing up to 100 files per page.',
    tooDeep: 'This script is more than one folder deep; The Sims 4 may not load it.', folderConfigSaved: 'Folder preferences saved.', noCreator: 'No creator', noAge: 'Any age'
  },
  es: {
    title: 'Tu carpeta Mods', intro: 'Escanea y organiza tus archivos locales .package y .ts4script. Importar copia archivos; organizar los mueve dentro de Mods.',
    scan: 'Escanear Mods', scanning: 'Escaneando…', importFiles: 'Importar archivos', importFolder: 'Importar carpeta', addCategory: 'Categorías y carpetas', addCreator: 'Creadores',
    search: 'Buscar archivo, carpeta, categoría o creador…', allFiles: 'Todos los archivos', enabled: 'Activados', disabled: 'Desactivados', tooDeep: 'Archivos demasiado profundos', scriptTooDeep: 'Los mods de script deben estar como máximo a una carpeta de profundidad.', packageTooDeep: 'Los archivos package no deberían superar cinco carpetas de profundidad.',
    files: 'archivos', visited: 'revisados', inaccessible: 'carpetas no se pudieron leer', noMods: 'No se encontraron archivos de mods compatibles.', noScan: 'Primero elige tu carpeta Mods en Ajustes y escanéala.',
    chooseFolder: 'Primero elige la carpeta Mods en Ajustes.', page: 'Página', of: 'de', selectPage: 'Seleccionar página', selectResults: 'Seleccionar todos los resultados', clearSelection: 'Quitar selección', selected: 'seleccionados',
    applyTags: 'Aplicar etiquetas', category: 'Categoría', creator: 'Creador', noCategory: 'Sin categoría', anyCreator: 'Sin asignar', gender: 'Estilo', age: 'Edad',
    unchanged: 'No cambiar', clear: 'Quitar', female: 'Femenino', male: 'Masculino', unisex: 'Unisex', neutral: 'Neutro / desconocido',
    infant: 'Infante', toddler: 'Niño pequeño', child: 'Niño', teen: 'Adolescente', youngAdult: 'Joven adulto', adult: 'Adulto', elder: 'Anciano', unknownAge: 'Sin especificar',
    enabledState: 'Activado', disabledState: 'Desactivado', enable: 'Activar', disable: 'Desactivar', editTags: 'Editar etiquetas', rename: 'Cambiar nombre', remove: 'Enviar a la Papelera',
    organize: 'Organizar selección', configureFolders: 'Elegir carpetas por categoría', noFolders: 'Elige qué categorías etiquetadas se convertirán en carpetas. Las demás se quedan donde están.',
    createFolders: 'Crear carpetas seleccionadas', folderName: 'Nombre de carpeta', useFolder: 'Usar como carpeta', folderReady: 'carpetas de categoría elegidas',
    newCategory: 'Nueva categoría', categoryName: 'Nombre de categoría', createCategory: 'Crear categoría', custom: 'Personalizada', deleteCategory: 'Eliminar categoría',
    creatorTitle: 'Creadores', creatorName: 'Nombre del creador', saveCreator: 'Guardar creador', newCreator: 'Añadir creador', deleteCreator: 'Quitar creador',
    editTagsTitle: 'Etiquetas del archivo', saveTags: 'Guardar etiquetas', fileName: 'Nombre del archivo (la extensión se conserva)', saveName: 'Guardar nombre',
    confirmDelete: '¿Enviar este archivo de mod a la Papelera de reciclaje de Windows?', confirmBulkDelete: '¿Enviar los archivos seleccionados a la Papelera de reciclaje de Windows?',
    confirmOrganize: '¿Mover los archivos seleccionados y etiquetados a sus carpetas de categoría dentro de Mods?', organizeResult: 'Movidos: {moved}; omitidos: {skipped}. Los archivos con conflictos de nombre se dejaron en su sitio.',
    importResult: 'Se copiaron {count} archivos de mods a Mods. Nunca se sobrescribieron archivos existentes.', scanError: 'No se pudo escanear la carpeta Mods seleccionada.',
    noSelection: 'Primero selecciona al menos un archivo de mod.', noFolderForCategory: 'Elige una carpeta de categoría para cada archivo seleccionado.',
    tagSaved: 'Etiquetas del archivo guardadas.', actionFailed: 'No se pudo completar la acción.', pageSize: 'Se muestran hasta 100 archivos por página.',
    tooDeep: 'Este script está a más de una carpeta de profundidad; Los Sims 4 podría no cargarlo.', folderConfigSaved: 'Preferencias de carpetas guardadas.', noCreator: 'Sin creador', noAge: 'Cualquier edad'
  }
};

const MOD_CATEGORIES = [
  { id: 'cas-tops', group: 'cas', en: 'Tops', es: 'Parte de arriba' },
  { id: 'cas-bottoms', group: 'cas', en: 'Bottoms', es: 'Parte de abajo' },
  { id: 'cas-full-body', group: 'cas', en: 'Full body', es: 'Cuerpo completo' },
  { id: 'cas-dresses', group: 'cas', en: 'Dresses', es: 'Vestidos' },
  { id: 'cas-outerwear', group: 'cas', en: 'Outerwear', es: 'Abrigos' },
  { id: 'cas-sleepwear', group: 'cas', en: 'Sleepwear & underwear', es: 'Ropa interior y pijamas' },
  { id: 'cas-swimwear', group: 'cas', en: 'Swimwear', es: 'Trajes de baño' },
  { id: 'cas-shoes', group: 'cas', en: 'Shoes', es: 'Zapatos' },
  { id: 'cas-accessories', group: 'cas', en: 'Accessories', es: 'Accesorios' },
  { id: 'cas-hair', group: 'cas', en: 'Hair', es: 'Cabello' },
  { id: 'cas-skin-details', group: 'cas', en: 'Skin details', es: 'Detalles de la piel' },
  { id: 'cas-teeth', group: 'cas', en: 'Teeth', es: 'Dientes' },
  { id: 'cas-makeup', group: 'cas', en: 'Makeup', es: 'Maquillaje' },
  { id: 'cas-eyes', group: 'cas', en: 'Eyes & eyebrows', es: 'Ojos y cejas' },
  { id: 'cas-lashes', group: 'cas', en: 'Lashes', es: 'Pestañas' },
  { id: 'cas-nails', group: 'cas', en: 'Nails', es: 'Uñas' },
  { id: 'cas-tattoos', group: 'cas', en: 'Tattoos', es: 'Tatuajes' },
  { id: 'cas-presets', group: 'cas', en: 'Presets & sliders', es: 'Presets y deslizadores' },
  { id: 'cas-poses', group: 'cas', en: 'Poses & animations', es: 'Poses y animaciones' },
  { id: 'cas-defaults', group: 'cas', en: 'Default replacements', es: 'Reemplazos predeterminados' },
  { id: 'bb-furniture', group: 'buildbuy', en: 'Furniture', es: 'Muebles' },
  { id: 'bb-decor', group: 'buildbuy', en: 'Decor', es: 'Decoración' },
  { id: 'bb-lighting', group: 'buildbuy', en: 'Lighting', es: 'Iluminación' },
  { id: 'bb-plants', group: 'buildbuy', en: 'Plants', es: 'Plantas' },
  { id: 'bb-walls-floors', group: 'buildbuy', en: 'Walls & floors', es: 'Paredes y suelos' },
  { id: 'bb-doors-windows', group: 'buildbuy', en: 'Doors & windows', es: 'Puertas y ventanas' },
  { id: 'bb-appliances', group: 'buildbuy', en: 'Appliances', es: 'Electrodomésticos' },
  { id: 'bb-build', group: 'buildbuy', en: 'Build tools', es: 'Construcción' },
  { id: 'gameplay', group: 'gameplay', en: 'Gameplay', es: 'Jugabilidad' },
  { id: 'script-mods', group: 'gameplay', en: 'Script mods', es: 'Mods de script' },
  { id: 'traits-skills', group: 'gameplay', en: 'Traits, aspirations & skills', es: 'Rasgos, aspiraciones y habilidades' },
  { id: 'careers', group: 'gameplay', en: 'Careers', es: 'Profesiones' },
  { id: 'ui-cheats', group: 'gameplay', en: 'UI & cheats', es: 'Interfaz y trucos' },
  { id: 'fixes-utilities', group: 'gameplay', en: 'Fixes & utilities', es: 'Arreglos y utilidades' },
  { id: 'other', group: 'other', en: 'Other', es: 'Otros' }
];
const MOD_GENDERS = [['Female', 'female'], ['Male', 'male'], ['Unisex', 'unisex'], ['Neutral', 'neutral']];
const MOD_AGES = [['Infant', 'infant'], ['Toddler', 'toddler'], ['Child', 'child'], ['Teen', 'teen'], ['Young Adult', 'youngAdult'], ['Adult', 'adult'], ['Elder', 'elder']];
const selectedModPaths = new Set();
let modCatalog = { files: {}, categories: [], creators: [], folderCategories: [], folderNames: {} };
let modCatalogDirty = false;
let modCatalogSaveTimer = null;
let modManagerFilter = 'all';
let modCategoryFilter = '';
let modCatalogLoaded = false;

function mt(key) { return MOD_MANAGER_TEXT[state.lang]?.[key] || MOD_MANAGER_TEXT.en[key] || key; }
function allModCategories() { return [...MOD_CATEGORIES, ...modCatalog.categories.map(item => ({ ...item, group: 'custom', en: item.name, es: item.name }))]; }
function categoryForMod(id) { return allModCategories().find(item => item.id === id); }
function categoryNameForMod(id) { const item = categoryForMod(id); return item ? item[state.lang === 'es' ? 'es' : 'en'] : ''; }
function creatorForMod(id) { return modCatalog.creators.find(item => item.id === id); }
function modDepthWarning(file) {
  if (file.extension === 'ts4script' && file.depth > 1) return mt('scriptTooDeep');
  if (file.extension === 'package' && file.depth > 5) return mt('packageTooDeep');
  return '';
}
function tagsForMod(relativePath) { return modCatalog.files[relativePath] || {}; }
function escapeModText(value) { return esc(String(value ?? '')); }
function modNameOptions(selected = '', allowUnchanged = false) {
  const unchanged = allowUnchanged ? `<option value="">${mt('unchanged')}</option><option value="__clear__">${mt('clear')}</option>` : `<option value="">${mt('noCategory')}</option>`;
  return `${unchanged}${allModCategories().map(item => `<option value="${escapeModText(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeModText(item[state.lang === 'es' ? 'es' : 'en'])}</option>`).join('')}`;
}
function genderOptions(selected = '', allowUnchanged = false) {
  const top = allowUnchanged ? `<option value="">${mt('unchanged')}</option><option value="__clear__">${mt('clear')}</option>` : `<option value="">${mt('neutral')}</option>`;
  return `${top}${MOD_GENDERS.map(([value, key]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${mt(key)}</option>`).join('')}`;
}
function ageOptions(selected = '', allowUnchanged = false) {
  const top = allowUnchanged ? `<option value="">${mt('unchanged')}</option><option value="__clear__">${mt('clear')}</option>` : `<option value="">${mt('noAge')}</option>`;
  return `${top}${MOD_AGES.map(([value, key]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${mt(key)}</option>`).join('')}`;
}
function creatorsDatalist(id) { return `<datalist id="${id}">${modCatalog.creators.map(item => `<option value="${escapeModText(item.name)}"></option>`).join('')}</datalist>`; }

async function loadModCatalog() {
  const api = window.simmerSpace?.manageMods;
  if (!api) return;
  try {
    const loaded = await api.loadCatalog();
    modCatalog = {
      files: loaded?.files && typeof loaded.files === 'object' ? loaded.files : {},
      categories: Array.isArray(loaded?.categories) ? loaded.categories : [],
      creators: Array.isArray(loaded?.creators) ? loaded.creators : [],
      folderCategories: Array.isArray(loaded?.folderCategories) ? loaded.folderCategories : [],
      folderNames: loaded?.folderNames && typeof loaded.folderNames === 'object' ? loaded.folderNames : {}
    };
    modCatalogLoaded = true;
  } catch (error) { console.warn('Could not load the local Mods catalog:', error); }
}
window.acceptModCatalog = loadModCatalog;

async function saveModCatalog() {
  modCatalogDirty = false;
  const api = window.simmerSpace?.manageMods;
  if (!api) { safeWrite('mods-catalog', modCatalog); return; }
  try { await api.saveCatalog(modCatalog); }
  catch (error) { modCatalogDirty = true; toast(error?.message || mt('actionFailed')); }
}
function scheduleModCatalogSave() {
  modCatalogDirty = true;
  clearTimeout(modCatalogSaveTimer);
  modCatalogSaveTimer = setTimeout(saveModCatalog, 350);
}
function flushModCatalog() {
  if (!modCatalogDirty) return;
  clearTimeout(modCatalogSaveTimer);
  modCatalogSaveTimer = null;
  saveModCatalog();
}

function renderManagedModsPanel() {
  const result = modsScanResult;
  const files = result?.files || [];
  const query = modsScanQuery.trim().toLocaleLowerCase();
  const filtered = filteredManagedModFiles(files, query);
  const pages = Math.max(1, Math.ceil(filtered.length / MODS_SCAN_PAGE_SIZE));
  modsScanPage = Math.min(modsScanPage, pages - 1);
  const pageFiles = filtered.slice(modsScanPage * MODS_SCAN_PAGE_SIZE, (modsScanPage + 1) * MODS_SCAN_PAGE_SIZE);
  const enabledCount = files.reduce((count, file) => count + (file.enabled ? 1 : 0), 0);
  const disabledCount = files.length - enabledCount;
  const tooDeepCount = files.reduce((count, file) => count + (modDepthWarning(file) ? 1 : 0), 0);
  const desktop = !!window.simmerSpace?.manageMods;
  const pagesControls = `<div class="scan-pagination"><button class="small-chip" data-scan-page="-1" ${modsScanPage === 0 ? 'disabled' : ''}>←</button><span>${mt('page')} ${modsScanPage + 1} ${mt('of')} ${pages} · ${filtered.length.toLocaleString(state.lang)}</span><button class="small-chip" data-scan-page="1" ${modsScanPage >= pages - 1 ? 'disabled' : ''}>→</button></div>`;
  const resultSummary = result ? `<div class="scan-summary"><b>${files.length.toLocaleString(state.lang)} ${mt('files')}</b><span>${Number(result.visited || 0).toLocaleString(state.lang)} ${mt('visited')}</span><span>${enabledCount.toLocaleString(state.lang)} ${mt('enabled')}</span><span>${disabledCount.toLocaleString(state.lang)} ${mt('disabled')}</span>${result.unreadableFolders ? `<span class="scan-warning">${result.unreadableFolders} ${mt('inaccessible')}</span>` : ''}${tooDeepCount ? `<span class="scan-warning">${tooDeepCount} ${mt('tooDeep')}</span>` : ''}</div>` : `<p class="scan-empty">${desktop ? mt('noScan') : t('scanEmpty')}</p>`;
  const categoryFilter = `<select id="mod-category-filter"><option value="">${mt('allFiles')}</option>${allModCategories().map(item => `<option value="${escapeModText(item.id)}" ${item.id === modCategoryFilter ? 'selected' : ''}>${escapeModText(item[state.lang === 'es' ? 'es' : 'en'])}</option>`).join('')}</select>`;
  const filterTabs = `<div class="subtabs mods-filter-tabs">${[['all', 'allFiles'], ['enabled', 'enabled'], ['disabled', 'disabled'], ['tooDeep', 'tooDeep']].map(([id, key]) => `<button class="small-chip ${modManagerFilter === id ? 'active' : ''}" data-mod-filter="${id}">${mt(key)}</button>`).join('')}</div>`;
  const settings = `<details class="mods-folder-settings"><summary>${mt('configureFolders')} · ${modCatalog.folderCategories.length} ${mt('folderReady')}</summary><p>${mt('noFolders')}</p><div class="mods-folder-choice-list">${allModCategories().map(item => {
    const checked = modCatalog.folderCategories.includes(item.id);
    const folderName = modCatalog.folderNames[item.id] || item.es;
    return `<label><input type="checkbox" data-folder-category="${escapeModText(item.id)}" ${checked ? 'checked' : ''}><span>${escapeModText(item[state.lang === 'es' ? 'es' : 'en'])}</span><input type="text" data-folder-name="${escapeModText(item.id)}" value="${escapeModText(folderName)}" aria-label="${mt('folderName')}" ${checked ? '' : 'disabled'}></label>`;
  }).join('')}</div><button class="secondary-btn" id="create-mod-category-folders">${mt('createFolders')}</button></details>`;
  const bulk = selectedModPaths.size ? `<div class="mods-bulk-tools"><div><b>${selectedModPaths.size.toLocaleString(state.lang)} ${mt('selected')}</b><button class="text-link" id="clear-mod-selection">${mt('clearSelection')}</button></div><div class="mods-bulk-fields"><select id="bulk-mod-category">${modNameOptions('', true)}</select><input id="bulk-mod-creator" list="bulk-mod-creators" placeholder="${mt('creator')} · ${mt('unchanged')}">${creatorsDatalist('bulk-mod-creators')}<select id="bulk-mod-gender">${genderOptions('', true)}</select><select id="bulk-mod-age">${ageOptions('', true)}</select><button class="small-chip" id="apply-mod-tags">${mt('applyTags')}</button><label class="mods-clear-creator"><input id="clear-bulk-mod-creator" type="checkbox">${mt('creator')} · ${mt('clear')}</label></div><div class="mods-bulk-actions"><button class="secondary-btn" data-bulk-mod-toggle="true">${mt('enable')}</button><button class="secondary-btn" data-bulk-mod-toggle="false">${mt('disable')}</button><button class="secondary-btn" id="organize-selected-mods" ${modCatalog.folderCategories.length ? '' : 'disabled'}>${mt('organize')}</button><button class="secondary-btn danger-quiet" id="trash-selected-mods">${mt('remove')}</button></div></div>` : '';
  const rows = pageFiles.map(file => {
    const tags = tagsForMod(file.relativePath);
    const category = categoryNameForMod(tags.categoryId) || mt('noCategory');
    const creator = creatorForMod(tags.creatorId)?.name || mt('noCreator');
    const dimensions = [tags.gender && mt(MOD_GENDERS.find(([value]) => value === tags.gender)?.[1] || 'neutral'), tags.age && mt(MOD_AGES.find(([value]) => value === tags.age)?.[1] || 'unknownAge')].filter(Boolean).join(' · ');
    const warning = modDepthWarning(file);
    return `<article class="scan-file-row managed-mod-row"><input type="checkbox" data-mod-select="${escapeModText(file.relativePath)}" ${selectedModPaths.has(file.relativePath) ? 'checked' : ''} aria-label="${escapeModText(file.name)}"><span class="scan-file-icon">${file.extension === 'ts4script' ? '⚙' : '✧'}</span><span class="managed-mod-copy"><b title="${escapeModText(file.name)}">${escapeModText(file.name)}</b><small title="${escapeModText(file.relativePath)}">${escapeModText(file.relativePath)}</small><span class="managed-mod-tags"><i>${escapeModText(category)}</i><i>${escapeModText(creator)}</i>${dimensions ? `<i>${escapeModText(dimensions)}</i>` : ''}<i class="${file.enabled ? 'is-enabled' : 'is-disabled'}">${file.enabled ? mt('enabledState') : mt('disabledState')}</i>${warning ? `<i class="script-depth-warning" title="${escapeModText(warning)}">⚠ ${escapeModText(mt('tooDeep'))}</i>` : ''}</span></span><span class="managed-mod-actions"><button class="small-chip" data-edit-mod-tags="${escapeModText(file.relativePath)}">${mt('editTags')}</button><button class="small-chip" data-toggle-mod="${escapeModText(file.relativePath)}" data-next-enabled="${!file.enabled}">${file.enabled ? mt('disable') : mt('enable')}</button><button class="small-chip" data-rename-mod="${escapeModText(file.relativePath)}">${mt('rename')}</button><button class="small-chip danger-quiet" data-trash-mod="${escapeModText(file.relativePath)}" aria-label="${mt('remove')}">×</button></span></article>`;
  }).join('');
  return `<section class="mods-scan-panel mods-manager"><div class="scan-panel-head"><div><div class="eyebrow">${t('mycc')}</div><h2>${mt('title')}</h2><p>${mt('intro')}</p></div><div class="mods-manager-actions"><button class="primary-btn" id="managed-scan-mods" ${modsScanBusy ? 'disabled' : ''}>${modsScanBusy ? mt('scanning') : mt('scan')}</button>${desktop ? `<button class="secondary-btn" id="import-mod-files">${mt('importFiles')}</button><button class="secondary-btn" id="import-mod-folder">${mt('importFolder')}</button><button class="secondary-btn" id="manage-mod-categories">${mt('addCategory')}</button><button class="secondary-btn" id="manage-mod-creators">${mt('addCreator')}</button>` : ''}</div></div>${modsScanBusy ? `<div class="scan-progress"><div class="scan-progress-copy" id="managed-scan-progress"><span>${mt('visited')}: ${Number(modsScanProgress?.visited || 0).toLocaleString(state.lang)} · ${mt('files')}: ${Number(modsScanProgress?.found || 0).toLocaleString(state.lang)}</span><span>${mt('scanning')}</span></div><div class="scan-progress-track"><i></i></div></div>` : ''}${modsScanError ? `<p class="scan-error">${escapeModText(modsScanError)}</p>` : ''}${resultSummary}${settings}${result ? `<div class="library-search-bar scan-search"><label><span>⌕</span><input id="scan-search" type="search" value="${escapeModText(modsScanQuery)}" placeholder="${mt('search')}"></label></div><div class="mods-filter-row">${filterTabs}${categoryFilter}<button class="small-chip" id="select-mod-page">${mt('selectPage')}</button><button class="small-chip" id="select-mod-results">${mt('selectResults')} · ${filtered.length.toLocaleString(state.lang)}</button></div>${bulk}<p class="mods-page-hint">${mt('pageSize')}</p><div class="scan-file-list managed-mod-list">${rows || `<p class="scan-empty">${mt('noMods')}</p>`}</div>${pagesControls}` : ''}</section>`;
}
function filteredManagedModFiles(files = modsScanResult?.files || [], query = modsScanQuery.trim().toLocaleLowerCase()) {
  return files.filter(file => {
    const tags = tagsForMod(file.relativePath);
    if (modManagerFilter === 'enabled' && !file.enabled) return false;
    if (modManagerFilter === 'disabled' && file.enabled) return false;
    if (modManagerFilter === 'tooDeep' && !modDepthWarning(file)) return false;
    if (modCategoryFilter && tags.categoryId !== modCategoryFilter) return false;
    const category = categoryNameForMod(tags.categoryId);
    const creator = creatorForMod(tags.creatorId)?.name || '';
    return !query || `${file.name} ${file.relativePath} ${category} ${creator} ${tags.gender || ''} ${tags.age || ''}`.toLocaleLowerCase().includes(query);
  });
}
window.renderManagedModsPanel = renderManagedModsPanel;

function updateModPath(oldPath, newPath) {
  if (oldPath === newPath) return;
  const tags = modCatalog.files[oldPath];
  if (tags) { modCatalog.files[newPath] = tags; delete modCatalog.files[oldPath]; scheduleModCatalogSave(); }
  if (selectedModPaths.delete(oldPath)) selectedModPaths.add(newPath);
  const file = modsScanResult?.files?.find(item => item.relativePath === oldPath);
  if (file) {
    file.relativePath = newPath;
    file.name = newPath.split(/[\\/]/).pop();
    file.depth = newPath.split(/[\\/]/).length - 1;
    if (/\.(?:packageoff|ts4scriptoff)$/i.test(newPath)) file.enabled = false;
    else if (/\.(?:package|ts4script)$/i.test(newPath)) file.enabled = true;
  }
}
function modActionError(error) { toast(error?.message || mt('actionFailed')); }
async function scanManagedMods() {
  const api = window.simmerSpace?.manageMods;
  if (!api) { modsScanError = t('scanError'); renderLibrary(); return; }
  modsScanBusy = true; modsScanError = ''; modsScanProgress = { visited: 0, found: 0 }; renderLibrary();
  try {
    await loadModCatalog();
    modsScanResult = await api.scan();
    modsScanPage = 0;
    selectedModPaths.clear();
  } catch (error) { modsScanError = error?.message || mt('scanError'); }
  finally { modsScanBusy = false; if (state.page === 'mycc') renderLibrary(); }
}
async function importManagedMods(kind) {
  try {
    const api = window.simmerSpace?.manageMods;
    const result = kind === 'folder' ? await api?.importFolder() : await api?.importFiles();
    if (!result || result.imported === 0) { if (result?.skipped) toast(mt('actionFailed')); return; }
    await scanManagedMods();
    toast(mt('importResult').replace('{count}', result.imported.toLocaleString(state.lang)));
  } catch (error) { modActionError(error); }
}
function createCreatorIfMissing(name) {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) return null;
  let creator = modCatalog.creators.find(item => item.name.trim().toLocaleLowerCase() === normalized);
  if (!creator) {
    creator = { id: `creator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 120) };
    modCatalog.creators.push(creator);
  }
  return creator;
}
function storeModTags(relativePath, tags) {
  const compact = Object.fromEntries(Object.entries(tags).filter(([, value]) => typeof value === 'string' && value));
  if (Object.keys(compact).length) modCatalog.files[relativePath] = compact;
  else delete modCatalog.files[relativePath];
}
function openModTagsDialog(relativePath) {
  const tags = tagsForMod(relativePath);
  const currentCreator = creatorForMod(tags.creatorId)?.name || '';
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form"><div class="eyebrow">${mt('editTags')}</div><h2 id="dialog-title">${mt('editTagsTitle')}</h2><p>${escapeModText(relativePath)}</p><label>${mt('category')}<select id="mod-tag-category">${modNameOptions(tags.categoryId)}</select></label><label>${mt('creator')}<input id="mod-tag-creator" list="mod-tag-creators" value="${escapeModText(currentCreator)}" placeholder="${mt('noCreator')}">${creatorsDatalist('mod-tag-creators')}</label><label>${mt('gender')}<select id="mod-tag-gender">${genderOptions(tags.gender)}</select></label><label>${mt('age')}<select id="mod-tag-age">${ageOptions(tags.age)}</select></label><div class="detail-actions"><button class="primary-btn" id="save-mod-tags" data-mod-path="${escapeModText(relativePath)}">${mt('saveTags')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}
function openRenameModDialog(relativePath) {
  const name = relativePath.split(/[\\/]/).pop();
  const extension = name.slice(name.lastIndexOf('.'));
  const base = extension ? name.slice(0, -extension.length) : name;
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form"><div class="eyebrow">${mt('rename')}</div><h2 id="dialog-title">${mt('fileName')}</h2><p>${escapeModText(relativePath)}</p><input id="rename-mod-name" value="${escapeModText(base)}" maxlength="180"><div class="detail-actions"><button class="primary-btn" id="save-mod-name" data-mod-path="${escapeModText(relativePath)}">${mt('saveName')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}
function openAddCategoryDialog() {
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form"><div class="eyebrow">${mt('custom')}</div><h2 id="dialog-title">${mt('newCategory')}</h2><label>${mt('categoryName')}<input id="new-mod-category" maxlength="120"></label><div class="detail-actions"><button class="primary-btn" id="save-new-mod-category">${mt('createCategory')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}
function openCategoriesDialog() {
  const rows = allModCategories().map(item => {
    const checked = modCatalog.folderCategories.includes(item.id);
    const custom = item.group === 'custom';
    const folderName = modCatalog.folderNames[item.id] || item.es;
    return `<div class="mods-category-setting"><label><input type="checkbox" data-folder-category="${escapeModText(item.id)}" ${checked ? 'checked' : ''}><span>${escapeModText(item[state.lang === 'es' ? 'es' : 'en'])}</span></label><input type="text" data-folder-name="${escapeModText(item.id)}" value="${escapeModText(folderName)}" aria-label="${mt('folderName')}" ${checked ? '' : 'disabled'}>${custom ? `<button class="small-chip danger-quiet" data-remove-category="${escapeModText(item.id)}" aria-label="${mt('deleteCategory')}">×</button>` : ''}</div>`;
  }).join('');
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form mods-category-dialog"><div class="eyebrow">${mt('configureFolders')}</div><h2 id="dialog-title">${mt('addCategory')}</h2><p>${mt('noFolders')}</p><div class="mods-category-settings-list">${rows}</div><div class="detail-actions"><button class="primary-btn" id="new-mod-category-button">＋ ${mt('newCategory')}</button><button class="secondary-btn" id="save-mod-category-settings">${t('save')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}
function openCreatorsDialog() {
  const rows = modCatalog.creators.map(item => `<div class="mods-creator-setting"><span>${escapeModText(item.name)}</span><button class="small-chip" data-edit-creator="${escapeModText(item.id)}">${mt('rename')}</button><button class="small-chip danger-quiet" data-remove-creator="${escapeModText(item.id)}">×</button></div>`).join('');
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form"><div class="eyebrow">${mt('creatorTitle')}</div><h2 id="dialog-title">${mt('creatorTitle')}</h2><div class="mods-creator-list">${rows || `<p>${mt('noCreator')}</p>`}</div><div class="detail-actions"><button class="primary-btn" id="new-mod-creator-button">＋ ${mt('newCreator')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}
function openCreatorEditor(creatorId = '') {
  const creator = modCatalog.creators.find(item => item.id === creatorId);
  openDialog(`<button class="dialog-close" data-close>×</button><div class="form-dialog mods-form"><div class="eyebrow">${mt('creatorTitle')}</div><h2 id="dialog-title">${creator ? mt('rename') : mt('newCreator')}</h2><label>${mt('creatorName')}<input id="edit-mod-creator-name" maxlength="120" value="${escapeModText(creator?.name || '')}"></label><div class="detail-actions"><button class="primary-btn" id="save-mod-creator" data-creator-id="${escapeModText(creatorId)}">${mt('saveCreator')}</button><button class="secondary-btn" data-close>${t('cancel')}</button></div></div>`);
}

function renderCurrentModsPage() { if (state.page === 'mycc') renderLibrary(); }

document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target) return;
  const api = window.simmerSpace?.manageMods;
  try {
    if (target.id === 'managed-scan-mods') { await scanManagedMods(); return; }
    if (target.id === 'import-mod-files') { await importManagedMods('files'); return; }
    if (target.id === 'import-mod-folder') { await importManagedMods('folder'); return; }
    if (target.id === 'manage-mod-categories') { openCategoriesDialog(); return; }
    if (target.id === 'manage-mod-creators') { openCreatorsDialog(); return; }
    if (target.id === 'new-mod-category-button') { openAddCategoryDialog(); return; }
    if (target.id === 'new-mod-creator-button') { openCreatorEditor(); return; }
    if (target.id === 'save-new-mod-category') {
      const name = document.getElementById('new-mod-category')?.value.trim();
      if (!name) { document.getElementById('new-mod-category')?.focus(); return; }
      if (allModCategories().some(item => item[state.lang === 'es' ? 'es' : 'en'].toLocaleLowerCase() === name.toLocaleLowerCase())) { toast(mt('actionFailed')); return; }
      modCatalog.categories.push({ id: `custom-${Date.now().toString(36)}`, name: name.slice(0, 120) });
      scheduleModCatalogSave(); openCategoriesDialog(); return;
    }
    if (target.id === 'save-mod-category-settings') { flushModCatalog(); closeDialog(); renderCurrentModsPage(); return; }
    if (target.id === 'create-mod-category-folders') {
      if (!modCatalog.folderCategories.length) { toast(mt('noFolders')); return; }
      const names = modCatalog.folderCategories.map(id => modCatalog.folderNames[id] || categoryForMod(id)?.es).filter(Boolean);
      const result = await api?.createFolders(names);
      toast(`${result?.created || 0} ${mt('folderReady')}`); return;
    }
    if (target.id === 'select-mod-page') { for (const file of filteredManagedModFiles().slice(modsScanPage * MODS_SCAN_PAGE_SIZE, (modsScanPage + 1) * MODS_SCAN_PAGE_SIZE)) selectedModPaths.add(file.relativePath); renderLibrary(); return; }
    if (target.id === 'select-mod-results') {
      for (const file of filteredManagedModFiles()) selectedModPaths.add(file.relativePath);
      renderLibrary(); return;
    }
    if (target.id === 'clear-mod-selection') { selectedModPaths.clear(); renderLibrary(); return; }
    if (target.id === 'apply-mod-tags') {
      if (!selectedModPaths.size) { toast(mt('noSelection')); return; }
      const category = document.getElementById('bulk-mod-category')?.value || '';
      const creatorText = document.getElementById('bulk-mod-creator')?.value.trim() || '';
      const clearCreator = !!document.getElementById('clear-bulk-mod-creator')?.checked;
      const gender = document.getElementById('bulk-mod-gender')?.value || '';
      const age = document.getElementById('bulk-mod-age')?.value || '';
      const creator = creatorText ? createCreatorIfMissing(creatorText) : null;
      for (const relativePath of selectedModPaths) {
        const tags = { ...tagsForMod(relativePath) };
        if (category) { if (category === '__clear__') delete tags.categoryId; else tags.categoryId = category; }
        if (creator) tags.creatorId = creator.id; else if (clearCreator) delete tags.creatorId;
        if (gender) { if (gender === '__clear__') delete tags.gender; else tags.gender = gender; }
        if (age) { if (age === '__clear__') delete tags.age; else tags.age = age; }
        storeModTags(relativePath, tags);
      }
      scheduleModCatalogSave(); renderLibrary(); toast(mt('tagSaved')); return;
    }
    if (target.id === 'organize-selected-mods') {
      if (!selectedModPaths.size) { toast(mt('noSelection')); return; }
      const entries = [...selectedModPaths].flatMap(relativePath => {
        const categoryId = tagsForMod(relativePath).categoryId;
        if (!categoryId || !modCatalog.folderCategories.includes(categoryId)) return [];
        const category = categoryForMod(categoryId);
        const folderName = modCatalog.folderNames[categoryId] || category?.es;
        return folderName ? [{ relativePath, folderName }] : [];
      });
      if (!entries.length) { toast(mt('noFolderForCategory')); return; }
      if (!confirm(mt('confirmOrganize'))) return;
      const result = await api?.organize(entries);
      for (const item of result?.results || []) if (item.ok && item.newPath) updateModPath(item.oldPath, item.newPath);
      scheduleModCatalogSave();
      toast(mt('organizeResult').replace('{moved}', result?.moved || 0).replace('{skipped}', result?.skipped || 0));
      renderLibrary(); return;
    }
    if (target.dataset.bulkModToggle) {
      if (!selectedModPaths.size) { toast(mt('noSelection')); return; }
      const result = await api?.toggleMany([...selectedModPaths], target.dataset.bulkModToggle === 'true');
      for (const item of result?.results || []) if (item.ok && item.newPath) updateModPath(item.oldPath, item.newPath);
      renderLibrary(); toast(`${result?.changed || 0} ${mt('files')}`); return;
    }
    if (target.id === 'trash-selected-mods') {
      if (!selectedModPaths.size) { toast(mt('noSelection')); return; }
      if (!confirm(mt('confirmBulkDelete'))) return;
      const result = await api?.trashMany([...selectedModPaths]);
      for (const item of result?.results || []) if (item.ok) { delete modCatalog.files[item.relativePath]; selectedModPaths.delete(item.relativePath); }
      scheduleModCatalogSave();
      modsScanResult.files = modsScanResult.files.filter(file => !result?.results?.some(item => item.ok && item.relativePath === file.relativePath));
      renderLibrary(); toast(`${result?.deleted || 0} ${mt('remove')}`); return;
    }
    if (target.id === 'save-mod-tags') {
      const relativePath = target.dataset.modPath;
      const creatorName = document.getElementById('mod-tag-creator')?.value.trim() || '';
      const creator = creatorName ? createCreatorIfMissing(creatorName) : null;
      storeModTags(relativePath, {
        categoryId: document.getElementById('mod-tag-category')?.value || '',
        creatorId: creator?.id || '',
        gender: document.getElementById('mod-tag-gender')?.value || '',
        age: document.getElementById('mod-tag-age')?.value || ''
      });
      scheduleModCatalogSave(); closeDialog(); renderCurrentModsPage(); toast(mt('tagSaved')); return;
    }
    const editTags = target.closest('[data-edit-mod-tags]');
    if (editTags) { openModTagsDialog(editTags.dataset.editModTags); return; }
    const renameMod = target.closest('[data-rename-mod]');
    if (renameMod) { openRenameModDialog(renameMod.dataset.renameMod); return; }
    if (target.id === 'save-mod-name') {
      const result = await api?.rename(target.dataset.modPath, document.getElementById('rename-mod-name')?.value || '');
      updateModPath(result.oldPath, result.newPath); closeDialog(); renderCurrentModsPage(); return;
    }
    const toggleMod = target.closest('[data-toggle-mod]');
    if (toggleMod) {
      const result = await api?.toggle(toggleMod.dataset.toggleMod);
      updateModPath(result.oldPath, result.newPath);
      const file = modsScanResult?.files?.find(item => item.relativePath === result.newPath);
      if (file) file.enabled = result.enabled;
      renderCurrentModsPage(); return;
    }
    const trashMod = target.closest('[data-trash-mod]');
    if (trashMod) {
      if (!confirm(mt('confirmDelete'))) return;
      const result = await api?.trash(trashMod.dataset.trashMod);
      delete modCatalog.files[result.relativePath]; selectedModPaths.delete(result.relativePath);
      modsScanResult.files = modsScanResult.files.filter(file => file.relativePath !== result.relativePath);
      scheduleModCatalogSave(); renderCurrentModsPage(); return;
    }
    if (target.id === 'save-mod-creator') {
      const name = document.getElementById('edit-mod-creator-name')?.value.trim();
      if (!name) { document.getElementById('edit-mod-creator-name')?.focus(); return; }
      const id = target.dataset.creatorId;
      if (id) { const creator = creatorForMod(id); if (creator) creator.name = name.slice(0, 120); }
      else createCreatorIfMissing(name);
      scheduleModCatalogSave(); openCreatorsDialog(); renderCurrentModsPage(); return;
    }
    const editCreator = target.closest('[data-edit-creator]');
    if (editCreator) { openCreatorEditor(editCreator.dataset.editCreator); return; }
    const removeCreator = target.closest('[data-remove-creator]');
    if (removeCreator) {
      const id = removeCreator.dataset.removeCreator;
      if (!confirm(`${mt('deleteCreator')}?`)) return;
      modCatalog.creators = modCatalog.creators.filter(item => item.id !== id);
      for (const tags of Object.values(modCatalog.files)) if (tags.creatorId === id) delete tags.creatorId;
      scheduleModCatalogSave(); openCreatorsDialog(); renderCurrentModsPage(); return;
    }
    const removeCategory = target.closest('[data-remove-category]');
    if (removeCategory) {
      const id = removeCategory.dataset.removeCategory;
      if (!confirm(`${mt('deleteCategory')}?`)) return;
      modCatalog.categories = modCatalog.categories.filter(item => item.id !== id);
      modCatalog.folderCategories = modCatalog.folderCategories.filter(value => value !== id);
      delete modCatalog.folderNames[id];
      for (const tags of Object.values(modCatalog.files)) if (tags.categoryId === id) delete tags.categoryId;
      scheduleModCatalogSave(); openCategoriesDialog(); renderCurrentModsPage(); return;
    }
    const filter = target.closest('[data-mod-filter]');
    if (filter) { modManagerFilter = filter.dataset.modFilter; modsScanPage = 0; renderLibrary(); return; }
  } catch (error) { modActionError(error); }
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.matches('[data-mod-select]')) {
    if (target.checked) selectedModPaths.add(target.dataset.modSelect); else selectedModPaths.delete(target.dataset.modSelect);
    renderLibrary(); return;
  }
  if (target.id === 'mod-category-filter') { modCategoryFilter = target.value; modsScanPage = 0; selectedModPaths.clear(); renderLibrary(); return; }
  if (target.matches('[data-folder-category]')) {
    const id = target.dataset.folderCategory;
    modCatalog.folderCategories = target.checked ? [...new Set([...modCatalog.folderCategories, id])] : modCatalog.folderCategories.filter(value => value !== id);
    const nameInput = target.closest('.mods-folder-choice-list,.mods-category-settings-list')?.querySelector(`[data-folder-name="${CSS.escape(id)}"]`);
    if (nameInput) nameInput.disabled = !target.checked;
    scheduleModCatalogSave();
    if (!dialog.contains(target)) renderLibrary();
    return;
  }
  if (target.matches('[data-folder-name]')) {
    const id = target.dataset.folderName;
    if (target.value.trim()) modCatalog.folderNames[id] = target.value.trim(); else delete modCatalog.folderNames[id];
    scheduleModCatalogSave();
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'scan-search') { modsScanPage = 0; selectedModPaths.clear(); }
});

window.simmerSpace?.manageMods?.onProgress(progress => {
  modsScanProgress = progress;
  const field = document.getElementById('managed-scan-progress');
  if (field) field.innerHTML = `<span>${mt('visited')}: ${Number(progress.visited || 0).toLocaleString(state.lang)} · ${mt('files')}: ${Number(progress.found || 0).toLocaleString(state.lang)}</span><span>${mt('scanning')}</span>`;
});
window.addEventListener('beforeunload', flushModCatalog);
loadModCatalog().then(renderCurrentModsPage);
