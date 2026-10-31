/* Library Care: what SimmerSpace remembers about each file (electron/library-metadata.cjs), local preview images, and
   the tools that find duplicates, empty folders and stray files. Tools only look until the player selects something
   and confirms: deleting here is permanent, as the confirmation says, and there is no recycle bin behind it. */
const careApi = desktop?.libraryTools || null;
const CARE_PAGE_SIZE = 50;
const CARE_REASON_ACTIONS = { temporary: 'remove', system: 'remove', installer: 'remove', document: 'remove', image: 'remove', archive: 'review', modSupport: 'review', damaged: 'review', link: 'review', unknownType: 'review' };
const care = {
  meta: {}, // relativePath -> { id, preview, originalName, originalKnown, source, sha256, size }
  reconciling: null,
  hashing: null, // { done, total } while files are being read
  tool: null // { kind, data, keep, selected, page, busy, error }
};

function metaFor(relativePath) {
  return care.meta[relativePath] || null;
}
function previewUrl(entry) {
  if (!entry?.preview) return '';
  const [name, version] = entry.preview.split('?');
  return `simmer-preview://${name.replace(/\.jpg$/, '')}/preview.jpg?${version || ''}`;
}
function modPicture(file) {
  return previewUrl(metaFor(file.relativePath)) || installFor(file)?.logo || '';
}
function modThumb(file) {
  const picture = modPicture(file);
  const label = format(mt(picture ? 'previewChange' : 'previewAdd'), { name: file.name });
  return `<button class="mod-thumb" data-mod-preview="${esc(file.relativePath)}" aria-label="${esc(label)}" data-tip="${esc(label)}">${picture ? `<img src="${esc(picture)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon(file.extension === 'ts4script' ? 'mods' : 'cc')}</button>`;
}

/* ---------- After a scan ---------- */
// Runs in the background: the list is usable at once, and tags, previews and original names settle in behind it.
function reconcileLibrary() {
  if (!careApi || !mods.result) return Promise.resolve();
  const files = mods.result.files.map(file => ({ relativePath: file.relativePath }));
  const job = (async () => {
    try {
      const result = await callDesktop(careApi.reconcile, files);
      care.meta = result.entries;
      if (result.moved.length || result.recovered) {
        await loadModCatalog();
        if (typeof cf !== 'undefined') cf.installs = null;
        await ensureInstallsLoaded();
        if (result.recovered) toast(format(mt('tagsRecovered'), { count: n(result.recovered) }));
      }
    } catch (error) {
      console.warn('Could not update the library data:', error.code);
    } finally {
      care.hashing = null;
      if (state.page === 'mycc') renderModsPanel();
    }
  })();
  care.reconciling = job;
  return job;
}
careApi?.onHashProgress(progress => {
  care.hashing = progress.total && progress.done < progress.total ? progress : null;
  const slot = document.getElementById('library-hash-status');
  if (slot) slot.textContent = care.hashing ? format(mt('hashProgress'), { done: n(progress.done), total: n(progress.total) }) : '';
});
function hashStatus() {
  return `<span class="muted-note" id="library-hash-status" role="status">${care.hashing ? esc(format(mt('hashProgress'), { done: n(care.hashing.done), total: n(care.hashing.total) })) : ''}</span>`;
}

/* ---------- Preview images ---------- */
// The page turns any image the browser can read into a JPEG; it is stored on this PC only and never uploaded.
async function imageToJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw Object.assign(new Error('image'), { code: 'IMAGE_TYPE' });
  return new Uint8Array(await blob.arrayBuffer());
}
function previewDialogBody(relativePath) {
  const file = mods.byPath.get(relativePath);
  const local = previewUrl(metaFor(relativePath));
  const picture = file ? modPicture(file) : '';
  return `${closeButton()}<div class="form-dialog preview-dialog"><div class="eyebrow">${mt('previewEyebrow')}</div><h2 id="dialog-title">${esc(fileNameOf(relativePath))}</h2><div class="preview-stage">${picture ? `<img src="${esc(picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="preview-empty">${icon('cc')}<span>${mt('previewNone')}</span></span>`}</div><p class="muted-note">${mt('previewLocalNote')}</p><input type="file" id="mod-preview-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" data-mod-path="${esc(relativePath)}" hidden><div class="detail-actions"><button class="primary-btn" id="mod-preview-pick">${icon('upload')}<span>${local ? mt('previewReplace') : mt('previewChoose')}</span></button>${local ? `<button class="secondary-btn" id="mod-preview-remove" data-mod-path="${esc(relativePath)}">${mt('previewRemove')}</button>` : ''}<button class="tertiary-btn" data-close>${t('close')}</button></div></div>`;
}
function openPreviewDialog(relativePath) {
  openDialog(previewDialogBody(relativePath));
}
async function savePreviewFile(relativePath, file) {
  if (!file) return;
  try {
    const result = await callDesktop(careApi.savePreview, relativePath, await imageToJpeg(file));
    care.meta[relativePath] = { ...metaFor(relativePath), id: result.id, preview: result.preview };
    dialog.innerHTML = previewDialogBody(relativePath);
    renderModsPanel();
    toast(mt('previewSaved'));
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Original file names ---------- */
async function restoreOriginalName(relativePath) {
  try {
    const status = await callDesktop(careApi.originalName, relativePath);
    if (!status.known) return showResultDialog({ title: mt('restoreNameTitle'), summary: mt('restoreNameUnknown'), failures: [], describe: () => '' });
    if (status.same) return toast(mt('restoreNameSame'));
    if (status.taken) return toast(mt('err_NAME_CONFLICT'), 'error');
    const ok = await confirmAction({ eyebrow: mt('changeGroup'), title: mt('restoreNameTitle'), body: mt('restoreNameConfirm'), details: [`${status.current} → ${status.original}`], confirmLabel: mt('restoreNameAction') });
    if (!ok) return;
    await runFileAction(async () => {
      const result = await callDesktop(careApi.restoreName, relativePath);
      updateModPath(result.oldPath, result.newPath);
      toast(format(mt('renamed'), { name: fileNameOf(result.newPath) }));
    });
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/* ---------- Tools ---------- */
function libraryCareMenu() {
  if (!careApi || !mods.result) return '';
  const item = (kind, iconName) => `<button class="care-menu-item" data-care-tool="${kind}" role="menuitem">${icon(iconName)}<span><b>${mt(`care_${kind}`)}</b><small>${mt(`care_${kind}Help`)}</small></span></button>`;
  return `<details class="care-menu" id="care-menu"><summary class="secondary-btn">${icon('sparkle')}<span>${mt('careTitle')}</span></summary><div class="care-menu-list" role="menu">${item('duplicates', 'collections')}${item('empty', 'folder')}${item('stray', 'warning')}</div></details>`;
}
const CARE_SCANS = { duplicates: 'findDuplicates', empty: 'findEmptyFolders', stray: 'findStrayFiles' };

async function openCareTool(kind) {
  document.getElementById('care-menu')?.removeAttribute('open');
  care.tool = { kind, data: null, keep: {}, selected: new Set(), page: 0, busy: true, error: null };
  openDialog(careBody(), { wide: true, onClose: () => { careApi?.cancel(); care.tool = null; } });
  const tool = care.tool;
  try {
    if (!mods.result) await scanManagedMods();
    await care.reconciling;
    tool.data = await callDesktop(careApi[CARE_SCANS[kind]]);
  } catch (error) {
    tool.error = error;
  }
  tool.busy = false;
  if (care.tool === tool) refreshCare();
}
function refreshCare() {
  if (care.tool && !overlay.hidden) withFocusPreserved(() => (dialog.innerHTML = careBody()));
}
const fileSize = bytes => formatBytes(Number(bytes) || 0);

function duplicateGroup(group, key, exact) {
  const keep = care.tool.keep[key] || '';
  const rows = group.files
    .map(file => `<label class="care-row"><input type="radio" name="keep-${esc(key)}" data-care-keep="${esc(key)}" value="${esc(file.relativePath)}" ${keep === file.relativePath ? 'checked' : ''}><span class="care-row-copy"><b>${esc(file.name)}</b><small>${esc(file.relativePath)}</small><span class="managed-mod-tags"><i>${esc(fileSize(file.size))}</i>${file.source ? `<i>${esc(file.source)}</i>` : ''}${keep && keep !== file.relativePath ? `<i class="is-disabled">${mt('careWillDelete')}</i>` : ''}${keep === file.relativePath ? `<i class="is-enabled">${mt('careWillKeep')}</i>` : ''}</span></span></label>`)
    .join('');
  const title = exact ? format(mt('careExactGroup'), { count: n(group.files.length), size: fileSize(group.size) }) : format(mt('carePossibleGroup'), { count: n(group.files.length) });
  return `<fieldset class="care-group"><legend>${esc(title)}</legend><label class="care-row"><input type="radio" name="keep-${esc(key)}" data-care-keep="${esc(key)}" value="" ${keep ? '' : 'checked'}><span class="care-row-copy"><b>${mt('careLeaveAll')}</b></span></label>${rows}</fieldset>`;
}
function checkRow(path, title, lines = []) {
  return `<label class="care-row"><input type="checkbox" data-care-select="${esc(path)}" ${care.tool.selected.has(path) ? 'checked' : ''}><span class="care-row-copy"><b>${esc(title)}</b>${lines.join('')}</span></label>`;
}
function strayRow(item) {
  const action = CARE_REASON_ACTIONS[item.reason] || 'review';
  return checkRow(item.relativePath, item.name, [`<small>${esc(item.relativePath)}</small>`, `<span class="managed-mod-tags"><i>${esc(item.extension || '—')}</i><i>${esc(fileSize(item.size))}</i><i>${mt(`careReason_${item.reason}`)}</i><i class="${action === 'remove' ? 'is-disabled' : ''}">${mt(`careAction_${action}`)}</i></span>`]);
}
// Long results are shown a page at a time.
function carePaged(sections) {
  const tool = care.tool;
  const all = sections.flatMap(section => section.rows.map(row => ({ title: section.title, row })));
  const pages = Math.max(1, Math.ceil(all.length / CARE_PAGE_SIZE));
  tool.page = Math.min(tool.page, pages - 1);
  let last = null;
  const html = all
    .slice(tool.page * CARE_PAGE_SIZE, (tool.page + 1) * CARE_PAGE_SIZE)
    .map(({ title, row }) => {
      const head = title !== last ? `<h3 class="result-subtitle">${esc(title)}</h3>` : '';
      last = title;
      return head + row();
    })
    .join('');
  const pager = pages > 1 ? `<nav class="pager" aria-label="${esc(mt('pagination'))}"><button class="secondary-btn small-chip" data-care-page="-1" ${tool.page ? '' : 'disabled'}>← ${t('previous')}</button><span>${esc(format(mt('pageOf'), { page: n(tool.page + 1), pages: n(pages) }))}</span><button class="secondary-btn small-chip" data-care-page="1" ${tool.page < pages - 1 ? '' : 'disabled'}>${t('next')} →</button></nav>` : '';
  return `<div class="care-list">${html}</div>${pager}`;
}
function careResults() {
  const { kind, data } = care.tool;
  if (kind === 'duplicates') {
    const exact = data.exact.map((group, i) => () => duplicateGroup(group, `e${i}`, true));
    const possible = data.possible.map((group, i) => () => duplicateGroup(group, `p${i}`, false));
    if (!exact.length && !possible.length) return empty(mt('careNoDuplicates'), format(mt('careChecked'), { count: n(data.checked) }));
    return `${data.unhashed ? notice(esc(format(mt('careUnhashed'), { count: n(data.unhashed) })), { tone: 'warning' }) : ''}${carePaged([{ title: mt('careExactTitle'), rows: exact }, { title: mt('carePossibleTitle'), rows: possible }].filter(section => section.rows.length))}`;
  }
  if (kind === 'empty') {
    if (!data.folders.length) return empty(mt('careNoEmpty'), format(mt('careCheckedFolders'), { count: n(data.checked) }));
    return `<div class="toolbar-row"><button class="text-link" id="care-select-all">${esc(format(mt('selectResults'), { count: n(data.folders.length) }))}</button></div>${carePaged([{ title: mt('careEmptyTitle'), rows: data.folders.map(folder => () => checkRow(folder, folder)) }])}`;
  }
  const sections = ['unnecessary', 'unrecognized', 'review'].filter(group => data[group].length).map(group => ({ title: `${mt(`careGroup_${group}`)} (${n(data[group].length)})`, rows: data[group].map(item => () => strayRow(item)) }));
  const summary = `<p class="muted-note">${esc(format(mt('careRecognized'), { count: n(data.recognized), total: n(data.checked) }))}</p>`;
  return sections.length ? `${summary}${carePaged(sections)}` : `${summary}${empty(mt('careNoStray'), '')}`;
}
// Exactly what would be deleted right now: nothing is ever added on the player's behalf.
function careSelection() {
  const { kind, data, keep, selected } = care.tool;
  if (!data) return { files: [], folders: [], size: 0 };
  if (kind === 'duplicates') {
    const groups = [...data.exact.map((group, i) => [`e${i}`, group]), ...data.possible.map((group, i) => [`p${i}`, group])];
    const chosen = groups.filter(([key]) => keep[key]).flatMap(([key, group]) => group.files.filter(file => file.relativePath !== keep[key]));
    return { files: chosen.map(file => file.relativePath), folders: [], size: chosen.reduce((sum, file) => sum + file.size, 0) };
  }
  if (kind === 'empty') return { files: [], folders: data.folders.filter(folder => selected.has(folder)), size: 0 };
  const chosen = ['unnecessary', 'unrecognized', 'review'].flatMap(group => data[group]).filter(item => selected.has(item.relativePath));
  return { files: chosen.map(item => item.relativePath), folders: [], size: chosen.reduce((sum, item) => sum + item.size, 0) };
}
function careBody() {
  const tool = care.tool;
  if (!tool) return '';
  const head = `${closeButton()}<div class="form-dialog care-dialog"><div class="eyebrow">${mt('careTitle')}</div><h2 id="dialog-title">${mt(`care_${tool.kind}`)}</h2><p>${mt(`care_${tool.kind}Help`)}</p>`;
  if (tool.busy) return `${head}<div class="scan-progress" role="status"><div class="scan-progress-copy">${mt('careScanning')}</div><div class="scan-progress-track" aria-hidden="true"><i></i></div></div><div class="detail-actions"><button class="secondary-btn" data-close autofocus>${t('cancel')}</button></div></div>`;
  if (tool.error) return `${head}<div class="empty-state is-error" role="alert"><b>${mt('careFailed')}</b><p>${esc(errorMessage(tool.error))}</p></div><div class="detail-actions"><button class="secondary-btn" data-close>${t('close')}</button></div></div>`;
  const chosen = careSelection();
  const count = chosen.files.length + chosen.folders.length;
  return `${head}${careResults()}<div class="detail-actions care-actions"><span class="muted-note" role="status">${esc(format(mt('careSelected'), { count: n(count) }))}${chosen.size ? ` · ${esc(fileSize(chosen.size))}` : ''}</span><button class="danger-btn" id="care-delete" ${count ? '' : 'disabled'}>${icon('trash')}<span>${mt('careDelete')}</span></button><button class="secondary-btn" data-close>${t('close')}</button></div></div>`;
}

// The one confirmation every permanent deletion goes through. Cancel has the focus.
function confirmPermanentDeletion({ files, folders, size }) {
  const paths = [...files, ...folders];
  const shown = paths.slice(0, 200);
  const facts = [files.length ? format(mt('careFilesCount'), { count: n(files.length) }) : '', folders.length ? format(mt('careFoldersCount'), { count: n(folders.length) }) : '', size ? fileSize(size) : ''].filter(Boolean).join(' · ');
  return confirmAction({
    eyebrow: facts,
    title: mt('carePermanentTitle'),
    body: mt('carePermanentText'),
    details: paths.length > shown.length ? [...shown, format(mt('andMore'), { count: n(paths.length - shown.length) })] : shown,
    confirmLabel: mt('carePermanentConfirm'),
    danger: true
  });
}
async function deleteCareSelection() {
  const tool = care.tool;
  const chosen = careSelection();
  const kind = tool.kind;
  // The confirmation replaces this dialog, whose closing would otherwise forget the scan.
  care.tool = null;
  const ok = await confirmPermanentDeletion(chosen);
  if (!ok) return reopenCare(tool);
  try {
    const result = await callDesktop(careApi.deletePermanently, { files: chosen.files, folders: chosen.folders });
    showResultDialog({
      title: mt(`care_${kind}`),
      summary: format(mt('careDeleted'), { deleted: n(result.deleted), failed: n(result.failed), size: fileSize(result.freed) }),
      failures: result.results.filter(item => !item.ok).map(item => ({ ...item, label: item.relativePath })),
      describe: describeFailure,
      successes: result.results.filter(item => item.ok).map(item => ({ label: fileNameOf(item.relativePath), detail: item.relativePath })),
      successTitle: mt('careDeletedList')
    });
    if (result.deleted && chosen.files.length) await scanManagedMods();
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}
function reopenCare(tool) {
  care.tool = tool;
  openDialog(careBody(), { wide: true, onClose: () => { careApi?.cancel(); care.tool = null; } });
  care.tool = tool;
}

document.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  if (target.dataset.modPreview) return openPreviewDialog(target.dataset.modPreview);
  if (target.id === 'mod-preview-pick') return document.getElementById('mod-preview-file')?.click();
  if (target.id === 'mod-preview-remove') {
    const relativePath = target.dataset.modPath;
    return callDesktop(careApi.removePreview, relativePath).then(() => {
      care.meta[relativePath] = { ...metaFor(relativePath), preview: '' };
      dialog.innerHTML = previewDialogBody(relativePath);
      renderModsPanel();
      toast(mt('previewRemoved'));
    }, error => toast(errorMessage(error), 'error'));
  }
  if (target.dataset.restoreName) {
    const relativePath = target.dataset.restoreName;
    closeDialog();
    return restoreOriginalName(relativePath);
  }
  if (target.dataset.careTool) return openCareTool(target.dataset.careTool);
  if (target.dataset.carePage && care.tool) {
    care.tool.page = Math.max(0, care.tool.page + Number(target.dataset.carePage));
    return refreshCare();
  }
  if (target.id === 'care-select-all' && care.tool) {
    care.tool.selected = new Set(care.tool.data.folders);
    return refreshCare();
  }
  if (target.id === 'care-delete') deleteCareSelection();
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'mod-preview-file') return savePreviewFile(target.dataset.modPath, target.files?.[0]);
  if (!care.tool) return;
  if (target.dataset.careKeep !== undefined) {
    care.tool.keep[target.dataset.careKeep] = target.value;
    return refreshCare();
  }
  if (target.dataset.careSelect) {
    if (target.checked) care.tool.selected.add(target.dataset.careSelect);
    else care.tool.selected.delete(target.dataset.careSelect);
    refreshCare();
  }
});
