// Drives the real Electron app through the 0.12.2 features, with real clicks, a throwaway profile, generated Mods files and
// a test Options.ini. Sign-in uses the app's development bypass; a stand-in user is set only to reach the account screens.
// The game is never started. Run from the repository root: node scripts/e2e-library.cjs . <output folder>
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repo = path.resolve(process.argv[2] || '.'), outDir = path.resolve(process.argv[3] || os.tmpdir());
const PORT = 9334;
const electron = path.join(repo, 'node_modules', '.pnpm', fss.readdirSync(path.join(repo, 'node_modules', '.pnpm')).find(n => n.startsWith('electron@')), 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const report = (name, ok, detail = '') => { log.push({ name, ok: !!ok, detail: String(detail) }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const INI = '[options]\r\nedgescrolling = 1\r\n\r\nshowmodliststartup = 1\r\nscriptmodsenabled = 0\r\nmodsdisabled = 0\r\naudiooutputmode = 1\r\n';
let ws, app, id = 0, pageErrors = [];
const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const until = async (expression, ms = 25000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(`!!(${expression})`).catch(() => false)) return true; await sleep(150); } return false; };
const click = selector => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('no element ${selector.replace(/'/g, '')}'); e.click(); return true; })()`);
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(outDir, `e2e2-${name}.png`), Buffer.from(r.data, 'base64')); };
const toastText = () => js(`document.getElementById('toast').textContent`);

async function start(env) {
  app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: repo, env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
        await send('Page.enable'); await send('Runtime.enable');
        await until(`typeof boot === 'function' && state`);
        await sleep(800);
        await js(`localStorage.setItem('simmerspace-onboarding-done','true'); localStorage.setItem('simmerspace-language','es'); account.devBypass = true; state.lang = 'es'; render(); true`);
        return;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('app did not open');
}
async function stop() {
  try { ws?.close(); } catch {}
  app?.kill();
  await sleep(2000);
}
const scan = async () => { await js(`library.offered = true; goTo('mycc'); scanManagedMods(); true`); await until(`mods.result && !mods.busy`); await js(`care.reconciling`); await sleep(400); };
const walk = async d => { const o = []; for (const e of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o.push(...await walk(p)); else o.push(p); } return o; };

(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sse2e2-'));
  const profile = path.join(base, 'profile'), mods = path.join(base, 'Mods'), docs = path.join(base, 'Docs', 'Los Sims 4');
  await fs.mkdir(profile); await fs.mkdir(mods); await fs.mkdir(docs, { recursive: true });
  await fs.writeFile(path.join(docs, 'Options.ini'), INI);
  const put = async (rel, content) => { await fs.mkdir(path.dirname(path.join(mods, rel)), { recursive: true }); await fs.writeFile(path.join(mods, rel), content); };
  await put('Hair/Pelo.package', 'DBPF identical content');
  await put('Copias/Pelo copia.package', 'DBPF identical content');
  await put('A/Vestido.package', 'DBPF version one');
  await put('B/Vestido.package', 'DBPF version two');
  await put('Unico.package', 'DBPF only one');
  await put('Notas.txt', 'hello');
  await put('Roto.package', 'this is not a package');
  await fs.mkdir(path.join(mods, 'Vacia', 'Dentro'), { recursive: true });
  await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ routes: { mods: { id: 'mods', path: mods, name: 'Mods', updated: 1 }, documents: { id: 'documents', path: docs, name: 'Los Sims 4', updated: 1 } } }));
  const env = { ...process.env, SIMMERSPACE_PROFILE_DIR: profile, SIMMERSPACE_DEV: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await start(env);

    /* Game settings */
    await js(`openSettings('game-settings'); true`);
    report('Ajustes muestra los valores reales del archivo', await until(`document.querySelector('[data-gc-option="scriptMods"]') && gc.data.status === 'ready' && gc.data.folder.endsWith('Los Sims 4') && gc.data.values.modsEnabled === true && gc.data.values.scriptMods === false`));
    await shot('ajustes-juego');
    await click('[data-gc-option="scriptMods"]');
    await until(`!document.querySelector('#gc-apply').disabled`);
    await click('#gc-apply');
    await until(`gc.data.values.scriptMods === true`);
    const ini = await fs.readFile(path.join(docs, 'Options.ini'), 'utf8');
    report('Aplicar cambia el archivo real y nada más', ini === INI.replace('scriptmodsenabled = 0', 'scriptmodsenabled = 1'));
    report('guarda copia del original', (await fs.readFile(path.join(docs, 'Options.ini.simmerspace-original'), 'utf8')) === INI);
    await click('#launch-game');
    report('Iniciar el juego muestra el panel antes', await until(`dialog.querySelector('#gc-continue') && dialog.textContent.includes('Antes de iniciar')`));
    await shot('panel-iniciar');
    await js(`closeDialog(); true`);
    await sleep(300);

    /* Library */
    await scan();
    report('Biblioteca lista los archivos con miniatura', (await js(`document.querySelectorAll('.managed-mod-row .mod-thumb').length`)) === 6);
    await js(`document.getElementById('care-menu').open = true; true`);
    await shot('cuidado-menu');
    await click('[data-care-tool="duplicates"]');
    report('Duplicados distingue contenido idéntico de mismo nombre', await until(`care.tool?.data && care.tool.data.exact.length === 1 && care.tool.data.possible.length === 1`));
    await sleep(200); await shot('duplicados');
    report('Nada seleccionado por defecto', await js(`document.querySelector('#care-delete').disabled`));
    const copy = 'Copias\\Pelo copia.package', kept = 'Hair\\Pelo.package';
    await js(`(() => { const r = [...dialog.querySelectorAll('[data-care-keep="e0"]')].find(x => x.value === ${JSON.stringify(kept)}); r.click(); })()`);
    await until(`!document.querySelector('#care-delete').disabled`);
    await click('#care-delete');
    await until(`dialog.textContent.includes('no ofrece papelera')`);
    await shot('confirmar-borrado');
    report('La confirmación tiene Cancelar enfocado y muestra la ruta', await js(`document.activeElement.textContent === t('cancel') && dialog.textContent.includes(${JSON.stringify(copy)})`));
    await js(`document.activeElement.click(); true`);
    await until(`care.tool`);
    report('Cancelar no borra nada', fss.existsSync(path.join(mods, copy)));
    await click('#care-delete');
    await until(`dialog.querySelector('[data-dialog-result="confirm"]')`);
    await click('[data-dialog-result="confirm"]');
    await until(`dialog.textContent.includes('eliminados')`);
    report('Confirmar borra exactamente lo elegido', !fss.existsSync(path.join(mods, copy)) && fss.existsSync(path.join(mods, kept)));
    await js(`closeDialog(); true`); await sleep(500);
    await until(`!mods.busy`);

    await js(`openCareTool('empty'); true`);
    report('Detecta carpetas vacías anidadas, también la que dejó el duplicado', await until(`care.tool?.data?.folders?.length === 3`));
    await click('#care-select-all');
    await until(`!document.querySelector('#care-delete').disabled`);
    await click('#care-delete');
    await until(`dialog.querySelector('[data-dialog-result="confirm"]')`);
    await click('[data-dialog-result="confirm"]');
    await until(`dialog.textContent.includes('eliminados')`);
    report('Borra las carpetas vacías', !fss.existsSync(path.join(mods, 'Vacia')));
    await js(`closeDialog(); true`); await sleep(300);

    await js(`openCareTool('stray'); true`);
    report('Archivos extraños clasifica sin borrar', await until(`care.tool?.data?.unnecessary?.length === 1 && care.tool.data.review.length === 1`) && fss.existsSync(path.join(mods, 'Notas.txt')));
    await sleep(200); await shot('extranos');
    await js(`closeDialog(); true`); await sleep(300);

    /* Preview and tags */
    const target = 'Unico.package';
    await js(`(async () => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 300, 200); const blob = await new Promise(r => c.toBlob(r, 'image/png')); openPreviewDialog(${JSON.stringify(target)}); await savePreviewFile(${JSON.stringify(target)}, new File([blob], 'p.png', { type: 'image/png' })); closeDialog(); })()`);
    const thumb = `document.querySelector('[data-mod-preview=${JSON.stringify(target)}] img')`;
    report('La vista previa se ve desde el almacén local', await until(`${thumb}?.complete && ${thumb}.naturalWidth === 300 && ${thumb}.src.startsWith('simmer-preview://')`));
    const stored = (await fs.readdir(path.join(profile, 'library-previews'))).length;
    report('La imagen está en el PC y el mod no cambió', stored === 1 && (await fs.readFile(path.join(mods, target), 'utf8')) === 'DBPF only one');
    await js(`storeModTags(${JSON.stringify(target)}, { categoryId: 'cas-hair', labels: ['cozy', 'verano'] }); scheduleModCatalogSave(0); true`);
    await sleep(600);
    await stop();

    // Renamed outside the app while it is closed, then a full restart: the same thing an update does to the running app.
    await fs.rename(path.join(mods, target), path.join(mods, 'Renombrado fuera.package'));
    await start(env);
    await scan();
    const renamed = 'Renombrado fuera.package';
    report('Tras reiniciar y renombrar fuera, conserva etiquetas', await js(`JSON.stringify(tagsForMod(${JSON.stringify(renamed)}).labels) === '["cozy","verano"]' && tagsForMod(${JSON.stringify(renamed)}).categoryId === 'cas-hair'`));
    report('Tras reiniciar y renombrar fuera, conserva la vista previa', await until(`document.querySelector('[data-mod-preview=${JSON.stringify(renamed)}] img')?.src.startsWith('simmer-preview://')`, 8000));
    await sleep(300); await shot('biblioteca-preview');

    /* Filters, gently */
    await js(`goTo('curseforge'); true`);
    await until(`document.querySelector('.cf-card')`);
    await js(`document.getElementById('cf-filter-panel').open = true; true`); await sleep(200);
    const chip = (name, value) => click(`[data-filter="cf-f-${name}"][data-value="${value}"]`);
    await chip('content', 'hair'); await sleep(1200);
    await chip('age', 'child'); await sleep(1200);
    await chip('gender', 'masculine');
    await until(`!cf.loading`); await sleep(900); await until(`!cf.loading`);
    const state = await js(`JSON.stringify({ results: !!cf.results, error: cf.error ? { code: cf.error.code, message: cf.error.message } : null, loading: cf.loading, filters: cf.filters })`);
    console.log('estado de Explorar', state);
    const total = await js(`cf.results.pagination.totalCount`);
    report('Pelo + Niño + Masculino da el resultado combinado', total > 0 && total < 400, `${total} resultados`);
    report('Muestra filtros activos', (await js(`document.querySelectorAll('.cf-active-chip').length`)) === 3);
    await shot('filtros');
    await click('[data-cf-remove="age"]'); await sleep(1200); await until(`!cf.loading`);
    report('Quitar un filtro amplía los resultados', (await js(`cf.results.pagination.totalCount`)) > total);
    if (await js(`cf.results.pagination.reachable > cf.pageSize`)) { await click('[data-cf-page="1"]'); await sleep(1200); await until(`!cf.loading`); report('La paginación conserva los filtros', await js(`cf.index === cf.pageSize && cf.filters.content === 'hair'`)); }
    await click('#cf-clear-filters'); await sleep(1200); await until(`!cf.loading`);
    await click('#cf-followed-only');
    report('Creadores seguidos sin seguir a nadie explica qué hacer', await until(`document.getElementById('page-content').textContent.includes('Todavía no sigues a nadie')`, 6000));
    await click('#cf-followed-only'); await sleep(1200);

    await js(`goTo('creators'); true`);
    await until(`creators.result`);
    report('Creadores pagina de 12 en 12', (await js(`creators.result.creators.length`)) === 12, await js(`creators.result.source`));
    await js(`document.getElementById('creators-sort').value = 'az'; document.getElementById('creators-sort').dispatchEvent(new Event('change', { bubbles: true })); true`);
    await sleep(1500); await until(`!creators.loading`);
    report('Orden A-Z aplicado', await js(`(() => { const list = creators.result.creators.map(c => c.name); return list.join() === [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(); })()`));
    await js(`(() => { const s = document.getElementById('search-input'); s.value = 'deaderpool'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(1800); await until(`!creators.loading`);
    report('La búsqueda encuentra un creador fuera de la primera página', await js(`creators.result.creators.some(c => /deaderpool/i.test(c.name))`), await js(`creators.result.creators.map(c => c.name).slice(0, 3).join()`));
    await js(`(() => { const s = document.getElementById('search-input'); s.value = ''; })(); creators.query = ''; true`);

    /* Account screens: a stand-in user, only to see them */
    await js(`account.status = { configured: true, persistent: true, user: { id: 'x', username: 'prueba', email: 'prueba@example.test', avatarUrl: '' } }; account.profile = { ...freshProfile('x'), loaded: true, posts: [], postCount: 0 }; account.deletion = { status: 'none' }; goTo('account'); true`);
    await until(`document.querySelector('#delete-account-open')`);
    await click('#delete-account-open');
    report('Eliminar cuenta abre su pantalla con Cancelar enfocado', await until(`dialog.textContent.includes('60 minutos') && document.activeElement.textContent === t('cancel')`));
    await shot('eliminar-cuenta');
    await js(`closeDialog(); account.deletion = { status: 'pending', scheduledFor: new Date(Date.now() + 3600000).toISOString() }; render(); true`);
    report('Muestra el estado pendiente con opción de cancelar', await until(`document.querySelector('.deletion-pending #delete-account-cancel')`));
    await shot('cuenta-pendiente');

    /* All eight themes */
    let themed = 0;
    await js(`goTo('curseforge'); true`); await sleep(500);
    for (const family of ['pink', 'purple', 'green', 'blue']) for (const mode of ['light', 'dark']) {
      await js(`setAppearance({ family: ${JSON.stringify(family)}, mode: ${JSON.stringify(mode)} }); true`); await sleep(150);
      const ok = await js(`(() => { const s = getComputedStyle(document.getElementById('cf-filter-panel')); return document.documentElement.dataset.family === ${JSON.stringify(family)} && document.documentElement.dataset.mode === ${JSON.stringify(mode)} && s.backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`);
      if (ok) themed++;
    }
    await shot('tema-final');
    report('Los ocho temas aplican a lo nuevo', themed === 8, `${themed}/8`);
    report('Sin errores de JavaScript en la página', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ').slice(0, 300));
  } catch (error) {
    report('la prueba terminó por una excepción', false, String(error.message).slice(0, 300));
    try { await shot('error'); } catch {}
  } finally {
    await fs.writeFile(path.join(outDir, 'e2e-library.json'), JSON.stringify(log, null, 1));
    await stop();
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
    console.log(`RESULT ${log.filter(x => x.ok).length}/${log.length}`);
    process.exit(0);
  }
})();
