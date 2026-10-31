// Reproducible evidence for 0.12.2. Run from the repository root: node scripts/audit-curseforge.cjs . <output folder>
// Needs .env.local with CURSEFORGE_API_KEY. The key is never printed or saved. Keep the pace: at high speed
// CloudFront answers 403 with a web page for a few minutes.
// Reproducible audit: MCCC stage by stage, then every project in the sample. Read-only; no CDN address is ever built by
// hand, so the CDN stage is only reached with a link the API returned. The key is never printed or saved.
const fs = require('node:fs');
const path = require('node:path');
const repo = process.argv[2], outDir = process.argv[3];
const env = Object.fromEntries(fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split(/\r?\n/).map(l => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]));
const KEY = env.CURSEFORGE_API_KEY, G = 78062;
const sanitize = t => String(t).split(KEY).join('[key]').slice(0, 260);
async function call(p, opt = {}, attempt = 0) {
  const r = await fetch('https://api.curseforge.com' + p, { ...opt, headers: { Accept: 'application/json', 'x-api-key': KEY, ...(opt.headers || {}) } });
  if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise(x => setTimeout(x, 1500 * (attempt + 1))); return call(p, opt, attempt + 1); }
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json, type: r.headers.get('content-type') || '' };
}
async function pool(items, size, work) { let i = 0; await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const n = i++; await work(items[n], n); } })); }
(async () => {
  /* ---------- MCCC ---------- */
  const M = 663350, F = 8823491;
  const stages = [['proyecto', `/v1/mods/${M}`], ['lista de archivos', `/v1/mods/${M}/files?pageSize=50`], ['archivo', `/v1/mods/${M}/files/${F}`], ['archivos por POST', '/v1/mods/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: [F] }) }], ['descripción del archivo', `/v1/mods/${M}/files/${F}/changelog`], ['download-url', `/v1/mods/${M}/files/${F}/download-url`]];
  const mccc = [];
  for (const [stage, p, opt] of stages) {
    const r = await call(p, opt);
    const d = r.json?.data;
    const one = Array.isArray(d) ? d[0] : d;
    mccc.push({ stage, request: `${opt?.method || 'GET'} ${p}`, status: r.status, contentType: r.type, bodyBytes: r.text.length, body: r.status === 200 ? { allowModDistribution: one?.allowModDistribution, isAvailable: one?.isAvailable, modStatus: stage === 'proyecto' ? one?.status : undefined, fileStatus: one?.fileStatus, downloadUrl: one?.downloadUrl === undefined ? undefined : one.downloadUrl, fileName: one?.fileName, fileLength: one?.fileLength, hashes: one?.hashes?.map(h => `algo${h.algo}:${h.value.slice(0, 8)}…`), files: Array.isArray(d) ? d.length : undefined } : sanitize(r.text) || '(cuerpo vacío)' });
  }
  for (const row of mccc) console.log(JSON.stringify(row));
  const headers = ['Accept', 'x-api-key (presente, valor no mostrado)'];
  const bad = await fetch(`https://api.curseforge.com/v1/mods/${M}/files/${F}/download-url`, { headers: { 'x-api-key': 'invalid-key' } });
  const badMeta = await fetch(`https://api.curseforge.com/v1/mods/${M}`, { headers: { 'x-api-key': 'invalid-key' } });
  const noKeyMeta = await fetch(`https://api.curseforge.com/v1/mods/${M}`);
  console.log('control autenticación:', JSON.stringify({ metadataClaveInvalida: badMeta.status, metadataSinClave: noKeyMeta.status, downloadUrlClaveInvalida: bad.status }));

  /* ---------- The whole sample ---------- */
  const groups = [['gameplay', { categoryIds: [5091] }], ['script', { q: 'script' }], ['buildbuy', { classId: 5437 }], ['cas', { classId: 5339 }], ['hair', { categoryIds: [5606] }], ['clothing', { categoryIds: [5340] }], ['accessories', { categoryIds: [5603] }], ['poses', { categoryIds: [5599] }]];
  const seen = new Map(); let entries = 0;
  for (const [group, q] of groups) for (const [band, index] of [['top', 0], ['mid', 500], ['small', 1500]]) {
    const qs = new URLSearchParams({ gameId: G, sortField: 2, sortOrder: 'desc', pageSize: 50, index });
    if (q.classId) qs.set('classId', q.classId);
    if (q.categoryIds) qs.set('categoryIds', JSON.stringify(q.categoryIds));
    if (q.q) qs.set('searchFilter', q.q);
    const r = await call(`/v1/mods/search?${qs}`);
    for (const m of r.json?.data || []) { entries++; if (!seen.has(m.id)) seen.set(m.id, { m, group: `${group}/${band}` }); }
  }
  const list = [...seen.values()];
  console.log('entradas', entries, 'proyectos únicos', list.length);
  const rows = [];
  await pool(list, 2, async ({ m, group }) => {
    const main = m.latestFiles?.find(f => f.id === m.mainFileId) || m.latestFiles?.[0];
    if (!main) return rows.push({ group, modId: m.id, name: m.name, allow: m.allowModDistribution, stage: 'sin archivos', reason: 'el proyecto no publica archivos' });
    const proj = await call(`/v1/mods/${m.id}`);
    const file = await call(`/v1/mods/${m.id}/files/${main.id}`);
    const link = await call(`/v1/mods/${m.id}/files/${main.id}/download-url`);
    const f = file.json?.data;
    const url = typeof link.json?.data === 'string' ? link.json.data : '';
    const row = { group, modId: m.id, name: String(m.name).replace(/[\r\n,;]+/g, ' ').slice(0, 70), fileId: main.id, fileName: main.fileName, allow: proj.json?.data?.allowModDistribution ?? null, modAvailable: proj.json?.data?.isAvailable, projectStatus: proj.status, fileStatus: file.status, available: f?.isAvailable, fileState: f?.fileStatus, fileUrl: !!f?.downloadUrl, linkStatus: link.status, linkBody: link.status === 200 ? '' : sanitize(link.text) };
    if (url) { const c = await fetch(url, { redirect: 'manual', headers: { 'x-api-key': KEY } }); await c.body?.cancel(); row.cdnStatus = c.status; if (c.status >= 300 && c.status < 400) { const d = await fetch(new URL(c.headers.get('location'), url), { redirect: 'manual' }); await d.body?.cancel(); row.cdnFinalStatus = d.status; row.cdnType = d.headers.get('content-type'); row.cdnBytes = Number(d.headers.get('content-length')); } }
    rows.push(row);
  });
  // For restricted projects, older files too: does any file of the project behave differently?
  const off = rows.filter(r => r.linkStatus !== 200 && r.fileId);
  let olderChecked = 0, olderWithLink = 0;
  await pool(off.slice(0, 120), 2, async r => {
    const all = await call(`/v1/mods/${r.modId}/files?pageSize=50`);
    for (const f of (all.json?.data || []).filter(x => x.id !== r.fileId).slice(0, 3)) { olderChecked++; if (f.downloadUrl) { olderWithLink++; r.olderHasUrl = true; continue; } const l = await call(`/v1/mods/${r.modId}/files/${f.id}/download-url`); if (l.status === 200) { olderWithLink++; r.olderHasUrl = true; } }
  });
  const cross = {};
  for (const r of rows) { const k = `allow=${r.allow} fileUrl=${r.fileUrl} available=${r.available} link=${r.linkStatus} cdn=${r.cdnStatus ?? '-'}/${r.cdnFinalStatus ?? '-'}`; cross[k] = (cross[k] || 0) + 1; }
  console.log(JSON.stringify(cross, null, 1));
  console.log('olderChecked', olderChecked, 'olderWithLink', olderWithLink);
  console.log('cuerpos 403 distintos', JSON.stringify([...new Set(off.map(r => r.linkBody))]));
  rows.sort((a, b) => a.modId - b.modId);
  const stageOf = r => (r.projectStatus !== 200 ? ['proyecto', r.projectStatus] : r.fileStatus !== 200 ? ['archivo', r.fileStatus] : r.linkStatus !== 200 ? ['download-url', r.linkStatus] : r.cdnFinalStatus && r.cdnFinalStatus !== 200 ? ['CDN', r.cdnFinalStatus] : ['ninguna', 200]);
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['grupo,proyecto,mod_id,file_id,archivo,allowModDistribution,isAvailable,downloadUrl_en_metadatos,etapa_fallida,http,cuerpo,causa,control'];
  for (const r of rows) {
    const [stage, status] = stageOf(r);
    const ok = stage === 'ninguna';
    const reason = ok ? 'descarga autorizada' : r.allow === false && stage === 'download-url' ? 'distribución a terceros desactivada en el proyecto' : 'revisar';
    csv.push([r.group, q(r.name), r.modId, r.fileId, q(r.fileName), r.allow, r.available, r.fileUrl, stage, status, q(r.linkBody), q(reason), ok ? 'n/a' : reason === 'revisar' ? 'revisar' : 'CurseForge / autor'].join(','));
  }
  fs.writeFileSync(path.join(outDir, 'muestra.csv'), '﻿' + csv.join('\r\n'));
  fs.writeFileSync(path.join(outDir, 'muestra.json'), JSON.stringify({ when: new Date().toISOString(), requestHeaders: headers, mccc, rows }, null, 1));
  const needs = rows.filter(r => stageOf(r)[0] !== 'ninguna' && !(r.allow === false && stageOf(r)[0] === 'download-url'));
  console.log('casos que no encajan en la causa principal', needs.length, JSON.stringify(needs.slice(0, 10)));
})().catch(e => console.log('ERR', e.message));
