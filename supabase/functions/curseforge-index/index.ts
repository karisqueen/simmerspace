// Reads the Sims 4 catalog a slice at a time and stores what the creator list needs. CurseForge has no list of authors
// and a search stops at 10,000 results, so the catalog is walked by category, from both ends when a category is
// larger than that. pg_cron starts this each minute while a run is going, about once a week; the grouping then
// happens in the database. It reads public metadata only, at a gentle pace, and downloads no files.
// Deploy with: supabase functions deploy curseforge-index --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.curseforge.com';
const GAME_ID = 78062;
const PAGE_SIZE = 50;
const WINDOW = 10000;
const PAGES_PER_RUN = 40;
const PAUSE_MS = 400;
const TIME_BUDGET_MS = 40000;

type Slice = { categoryId: number; order: 'asc' | 'desc' };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function curseforge(path: string) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json', 'x-api-key': Deno.env.get('CURSEFORGE_API_KEY') ?? '' } });
  if (!response.ok) throw new Error(`CurseForge ${response.status}`);
  return response.json();
}

// The categories with nothing below them: every project sits in at least one.
async function allSlices(): Promise<Slice[]> {
  const { data } = await curseforge(`/v1/categories?gameId=${GAME_ID}`);
  const categories = (data ?? []).filter((item: { isClass?: boolean }) => !item.isClass);
  const parents = new Set(categories.map((item: { parentCategoryId: number }) => item.parentCategoryId));
  return categories.filter((item: { id: number }) => !parents.has(item.id)).map((item: { id: number }) => ({ categoryId: item.id, order: 'asc' as const }));
}

function row(mod: Record<string, any>) {
  const text = `${mod.name ?? ''} ${mod.summary ?? ''}`.toLowerCase();
  return {
    id: mod.id,
    name: String(mod.name ?? '').slice(0, 200),
    logo: mod.logo?.thumbnailUrl ?? null,
    website_url: mod.links?.websiteUrl ?? null,
    downloads: Math.round(Number(mod.downloadCount) || 0),
    created_on: mod.dateCreated ?? null,
    updated_on: mod.dateModified ?? null,
    categories: (mod.categories ?? []).map((item: { name: string }) => item.name).filter(Boolean).slice(0, 12),
    is_maxis: /maxis[\s-]*match/.test(text),
    is_alpha: /\balpha\b/.test(text),
    authors: (mod.authors ?? []).slice(0, 2).map((item: Record<string, unknown>) => ({ id: item.id, name: item.name, url: item.url ?? null, avatar: item.avatarUrl ?? null })),
    seen_at: new Date().toISOString()
  };
}

Deno.serve(async request => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return Response.json({ error: 'not configured' }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const allowed = await admin.rpc('worker_secret_matches', { candidate: request.headers.get('x-worker-secret') ?? '' });
  if (allowed.data !== true) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { data: state } = await admin.from('cf_index_state').select('*').single();
  if (state?.status !== 'running') return Response.json({ skipped: true });
  if (state.locked_until && new Date(state.locked_until) > new Date()) return Response.json({ busy: true });
  await admin.from('cf_index_state').update({ locked_until: new Date(Date.now() + 90000).toISOString() }).eq('id', true);

  const started = Date.now();
  let queue: Slice[] = state.queue?.length ? state.queue : await allSlices();
  let position: number = state.position;
  let index: number = state.page_index;
  let pages = 0;
  let problem: string | null = null;
  try {
    while (position < queue.length && pages < PAGES_PER_RUN && Date.now() - started < TIME_BUDGET_MS) {
      const slice = queue[position];
      const query = new URLSearchParams({ gameId: String(GAME_ID), categoryId: String(slice.categoryId), sortField: '4', sortOrder: slice.order, index: String(index), pageSize: String(PAGE_SIZE) });
      const page = await curseforge(`/v1/mods/search?${query}`);
      const mods = page.data ?? [];
      if (mods.length) {
        const saved = await admin.from('cf_index_projects').upsert(mods.map(row));
        if (saved.error) throw new Error(saved.error.message);
      }
      pages++;
      index += PAGE_SIZE;
      const total = Number(page.pagination?.totalCount) || 0;
      if (!mods.length || index >= total || index + PAGE_SIZE > WINDOW) {
        // A category that fills the search window is read again from the other end.
        if (total >= WINDOW && slice.order === 'asc') queue = [...queue, { categoryId: slice.categoryId, order: 'desc' }];
        position++;
        index = 0;
      }
      await sleep(PAUSE_MS);
    }
  } catch (error) {
    problem = String(error instanceof Error ? error.message : error).slice(0, 300);
  }
  const finished = position >= queue.length;
  await admin.from('cf_index_state').update({ queue, position, page_index: index, pages_read: state.pages_read + pages, status: finished ? 'grouping' : 'running', locked_until: null, last_error: problem }).eq('id', true);
  return Response.json({ pages, position, slices: queue.length, finished });
});
