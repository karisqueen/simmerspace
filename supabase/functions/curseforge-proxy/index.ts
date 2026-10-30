// Optional CurseForge proxy for SimmerSpace (Supabase Edge Function, Deno).
// NOT DEPLOYED OR TESTED AGAINST A LIVE PROJECT. Review before use.
//
// Why: a key inside a desktop app can be extracted. With this proxy the CurseForge key stays in the
// function's secrets, and only signed-in SimmerSpace users can call it. The desktop app sends requests to
//   <SUPABASE_URL>/functions/v1/curseforge-proxy/v1/...
// with the user's access token, and this function forwards allowed read-only paths to api.curseforge.com.
//
// Setup:  supabase secrets set CURSEFORGE_API_KEY=<your key>
//         supabase functions deploy curseforge-proxy
// JWT verification stays on (the default), so anonymous calls are rejected by Supabase before this runs.

const API = 'https://api.curseforge.com';
const KEY = Deno.env.get('CURSEFORGE_API_KEY') ?? '';

// Only the read-only endpoints SimmerSpace uses.
const ALLOWED: Array<[string, RegExp]> = [
  ['GET', /^\/v1\/games$/],
  ['GET', /^\/v1\/categories$/],
  ['GET', /^\/v1\/mods\/search$/],
  ['GET', /^\/v1\/mods\/\d+$/],
  ['GET', /^\/v1\/mods\/\d+\/description$/],
  ['GET', /^\/v1\/mods\/\d+\/files$/],
  ['GET', /^\/v1\/mods\/\d+\/files\/\d+$/],
  ['GET', /^\/v1\/mods\/\d+\/files\/\d+\/download-url$/],
  ['POST', /^\/v1\/mods$/]
];

Deno.serve(async request => {
  if (!KEY) return Response.json({ error: 'not configured' }, { status: 503 });
  const url = new URL(request.url);
  const marker = '/curseforge-proxy';
  const at = url.pathname.indexOf(marker);
  const apiPath = at >= 0 ? url.pathname.slice(at + marker.length) : url.pathname;
  if (!ALLOWED.some(([method, pattern]) => method === request.method && pattern.test(apiPath))) {
    return Response.json({ error: 'not allowed' }, { status: 404 });
  }
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > 20000) return Response.json({ error: 'too large' }, { status: 413 });
  const upstream = await fetch(`${API}${apiPath}${url.search}`, {
    method: request.method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-api-key': KEY },
    body
  });
  const headers = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' });
  const retry = upstream.headers.get('Retry-After');
  if (retry) headers.set('Retry-After', retry);
  return new Response(upstream.body, { status: upstream.status, headers });
});
