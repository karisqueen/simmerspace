// Reproducible evidence for 0.12.2. Run from the repository root: node scripts/e2e-downloads.cjs . <output folder>
// Needs .env.local with CURSEFORGE_API_KEY. The key is never printed or saved. Keep the pace: at high speed
// CloudFront answers 403 with a web page for a few minutes.
// Drives the real Electron app with a throwaway profile and Mods folder, through real clicks in the page. Sign-in is
// passed with the app's own development bypass: no account or password is used. CurseForge runs in direct mode with the
// development key from .env.local, which never leaves the desktop process.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repo = process.argv[2], outDir = process.argv[3];
const PORT = 9333;
const electron = path.join(repo, 'node_modules', '.pnpm', fss.readdirSync(path.join(repo, 'node_modules', '.pnpm')).find(n => n.startsWith('electron@')), 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const report = (name, ok, detail = '') => { log.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sse2e-'));
  const profile = path.join(base, 'profile'), mods = path.join(base, 'Mods');
  await fs.mkdir(profile); await fs.mkdir(mods);
  await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ routes: { mods: { id: 'mods', path: mods, name: 'Mods', updated: 1 } } }));
  const env = { ...process.env, SIMMERSPACE_PROFILE_DIR: profile, SIMMERSPACE_DEV: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: repo, env, stdio: 'ignore' });
  let ws, id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(outDir, `e2e-${name}.png`), Buffer.from(r.data, 'base64')); };
  const until = async (expression, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(`!!(${expression})`).catch(() => false)) return true; await sleep(150); } return false; };
  const connect = async () => {
    for (let i = 0; i < 60; i++) { try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const page = list.find(t => t.type === 'page' && t.url.includes('index.html')); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; }); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result ?? m); pending.delete(m.id); } }; return; } } catch {} await sleep(500); }
    throw new Error('app did not open');
  };
  const pass = () => js(`account.devBypass = true; render(); true`);
  const toastText = () => js(`document.getElementById('toast').textContent`);
  try {
    await connect();
    await send('Page.enable'); await send('Runtime.enable');
    await js(`localStorage.setItem('simmerspace-onboarding-done','true'); localStorage.setItem('simmerspace-language','"es"'); localStorage.setItem('simmerspace-language','es'); location.reload(); true`).catch(() => {});
    await sleep(2500);
    await until(`typeof boot === 'function'`);
    await pass();
    const info = await js(`callDesktop(desktop.integrationStatus).then(s => s.developer ? s.developer.curseforge.mode : 'none')`);
    report('la app abre en Electron real y CurseForge está en modo directo', info === 'direct', `modo=${info}`);

    await js(`goTo('creators'); true`);
    report('Creadores carga tarjetas reales', await until(`document.querySelector('.creator-card [data-follow-creator]')`, 40000));
    const before = await js(`state.followingCreators.length`);
    await js(`document.querySelector('[data-follow-creator]').click(); true`);
    await sleep(500);
    const followToast = await toastText();
    const after = await js(`state.followingCreators.length`);
    report('Seguir creador funciona', after === before + 1 && !/entender|understand/i.test(followToast), followToast);
    const pressed = await js(`document.querySelector('.follow-btn.is-on')?.getAttribute('aria-pressed')`);
    report('el botón cambia a Siguiendo al momento', pressed === 'true');
    await js(`location.reload(); true`).catch(() => {});
    await sleep(2500); await until(`typeof boot === 'function'`); await pass();
    report('el seguimiento persiste tras recargar', (await js(`state.followingCreators.length`)) === after);
    await js(`setFollowing(state.followingCreators[0], false); true`); await sleep(300);
    report('Dejar de seguir funciona', (await js(`state.followingCreators.length`)) === before, await toastText());

    await js(`goTo('curseforge'); true`);
    report('Explorar carga resultados', await until(`document.querySelector('.cf-card')`, 30000));
    await shot('explorar');

    // A large allowed project, so progress can be seen moving.
    await js(`openCurseForgeDetails(1295328); true`);
    report('detalle abre con botón Instalar', await until(`dialog.querySelector('[data-cf-install]')`, 20000));
    await shot('detalle');
    await js(`dialog.querySelector('[data-cf-install]').click(); true`);
    const seen = [];
    const installed = new Promise(async resolve => { const end = Date.now() + 240000; while (Date.now() < end) { const v = await js(`(() => { const s = document.querySelector('[data-cf-progress]'); return { text: s?.textContent || '', busy: cf.installing.size }; })()`).catch(() => null); if (v?.text && seen[seen.length - 1] !== v.text) seen.push(v.text); if (v && !v.busy && Date.now() > end - 238000) return resolve(true); await sleep(120); } resolve(false); });
    await sleep(1200); await shot('progreso');
    report('la instalación termina', await installed);
    const percents = seen.filter(t => /%/.test(t));
    report('el progreso se muestra y avanza', percents.length >= 2, seen.slice(0, 8).join(' | '));
    await sleep(600); await shot('fin-instalacion');
    const disk = await (async function w(d) { const o = []; for (const e of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o.push(...await w(p)); else o.push(p); } return o; })(mods);
    report('los archivos están en Mods, en su carpeta', disk.length > 0 && disk.every(f => path.relative(mods, f).startsWith('CurseForge - ')), `${disk.length} archivos`);
    report('sin temporales en Mods', !disk.some(f => f.endsWith('.tmp')));
    await js(`if (!overlay.hidden) closeDialog(); true`);

    const dup = await js(`callDesktop(cfApi.installs).then(list => list[0])`);
    await js(`installCurseForgeFile(${dup.modId}, ${dup.fileId}); true`);
    report('el duplicado se detecta y pregunta', await until(`dialog.textContent.includes('Ya instalado') || dialog.textContent.includes('Already installed')`, 15000));
    await shot('duplicado');
    await js(`closeDialog(); true`); await sleep(400);

    await js(`goTo('mycc'); true`);
    await js(`scanManagedMods(); true`);
    report('Mi CC escanea y lista lo instalado', await until(`mods.result && mods.result.files.length && document.querySelector('.managed-mod-row')`, 20000), `${await js(`mods.result?.files.length`)} archivos`);
    await js(`ensureInstallsLoaded(); true`);
    report('lo instalado figura como descargado por simmerspace', await until(`document.querySelector('.origin-badge.is-app')`, 10000));
    await sleep(500); await shot('biblioteca');

    // Stop a download halfway.
    await js(`goTo('curseforge'); true`);
    await js(`openCurseForgeDetails(1295328, { refresh: true }); true`); await until(`dialog.querySelector('[data-cf-install]')`, 15000);
    const fileCountBefore = disk.length;
    await js(`installCurseForgeFile(${dup.modId}, ${dup.fileId}, { reinstall: true }); true`);
    await until(`document.querySelector('[data-cf-cancel]')`, 8000);
    await sleep(300);
    await js(`document.querySelector('[data-cf-cancel]')?.click(); true`);
    await until(`cf.installing.size === 0`, 20000); await sleep(300);
    const stopped = await toastText();
    const afterStop = await (async function w(d) { const o = []; for (const e of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o.push(...await w(p)); else o.push(p); } return o; })(mods);
    report('detener no deja archivos nuevos en Mods', afterStop.length === fileCountBefore, `${fileCountBefore} antes, ${afterStop.length} después`);
    report('Detener cancela y avisa', /detuvo|stopped/i.test(stopped), stopped);
    await js(`closeDialog(); true`);

    // MCCC through the interface.
    await js(`openCurseForgeDetails(663350); true`);
    report('MCCC muestra instalación asistida, no Instalar', await until(`dialog.querySelector('[data-cf-assisted]')`, 20000) && !(await js(`!!dialog.querySelector('[data-cf-install]')`)));
    await shot('mccc-detalle');
    await js(`dialog.querySelector('[data-cf-assisted]').click(); true`);
    report('el diálogo asistido se abre con el archivo esperado', await until(`dialog.textContent.includes('McCmdCenter_AllModules_2026_5_0.zip')`, 15000));
    const page = await js(`assisted.info.pageUrl`);
    report('apunta a la página exacta del archivo', page === 'https://www.curseforge.com/sims4/mods/mc-command-center/files/8823491', page);
    await shot('mccc-asistido');
    await js(`closeDialog(); true`);
    await js(`installCurseForgeFile(663350, 8823491); true`);
    report('forzar la descarga directa de MCCC termina en la vía asistida', await until(`dialog.querySelector('#cf-assisted-open')`, 15000));
    const errors = await js(`closeDialog(); document.querySelectorAll('.field-error').length`);
    report('sin errores visibles al terminar', errors === 0);
  } catch (error) {
    report('la prueba terminó por una excepción', false, String(error.message).slice(0, 300));
    try { await shot('error'); } catch {}
  } finally {
    await fs.writeFile(path.join(outDir, 'e2e.json'), JSON.stringify(log, null, 1));
    try { ws?.close(); } catch {}
    app.kill();
    await sleep(1500);
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
    console.log(`RESULT ${log.filter(x => x.ok).length}/${log.length}`);
    process.exit(0);
  }
})();

