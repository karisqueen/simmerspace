// CurseForge proxy for SimmerSpace (Supabase Edge Function, Deno).
//
// Why: a key inside a desktop app can be extracted. With this proxy the CurseForge key stays in the
// function's secrets, and only signed-in SimmerSpace users can call it. The desktop app sends requests to
//   <SUPABASE_URL>/functions/v1/curseforge-proxy/v1/...
// with the user's access token, and this function forwards allowed read-only paths to api.curseforge.com.
//
// Setup:  supabase secrets set CURSEFORGE_API_KEY=<your key>
//         supabase functions deploy curseforge-proxy --no-verify-jwt
// The gateway JWT check is off because the function checks the token itself with Supabase Auth: that works with
// both the legacy and the new (sb_publishable_ / asymmetric) keys, and it rejects the anon key, so only a
// signed-in user gets through.

const API = 'https://api.curseforge.com';
const KEY = Deno.env.get('CURSEFORGE_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

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

// Tokens already checked with Supabase Auth, kept for a few minutes so a page of results costs one check.
const checked = new Map<string, number>();
const CHECK_TTL_MS = 5 * 60 * 1000;

async function signedIn(request: Request): Promise<boolean> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === SUPABASE_ANON_KEY) return false;
  const until = checked.get(token);
  if (until && until > Date.now()) return true;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!response.ok) return false;
  const user = await response.json().catch(() => null);
  if (!user?.id) return false;
  if (checked.size > 5000) checked.clear();
  checked.set(token, Date.now() + CHECK_TTL_MS);
  return true;
}

Deno.serve(async request => {
  if (!KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) return Response.json({ error: 'not configured' }, { status: 503 });
  const url = new URL(request.url);
  const marker = '/curseforge-proxy';
  const at = url.pathname.indexOf(marker);
  const apiPath = at >= 0 ? url.pathname.slice(at + marker.length) : url.pathname;
  if (apiPath === '/health') return Response.json({ ok: true });
  if (!(await signedIn(request))) return Response.json({ error: 'sign in required' }, { status: 401 });
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
