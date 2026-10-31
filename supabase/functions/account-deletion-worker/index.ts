// Carries out account deletions once their 60 minutes are over. pg_cron starts it (see the 20261101 migration), so it
// works with SimmerSpace closed. It holds the only privileged step: the service key is a secret of this function and
// never reaches the app. Deploy with: supabase functions deploy account-deletion-worker --no-verify-jwt
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKETS = ['avatars', 'inspiration'];
const PAGE = 100;

// Storage has no cascade: each file is removed here so nothing is left orphaned. Files live under <user id>/.
async function emptyFolder(admin: SupabaseClient, bucket: string, userId: string) {
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: PAGE });
    if (error) throw new Error(`list ${bucket}: ${error.message}`);
    if (!data?.length) return;
    const removed = await admin.storage.from(bucket).remove(data.map(file => `${userId}/${file.name}`));
    if (removed.error) throw new Error(`remove ${bucket}: ${removed.error.message}`);
  }
}

async function deleteAccount(admin: SupabaseClient, userId: string) {
  const posts = await admin.from('inspiration_posts').select('image_path').eq('user_id', userId);
  if (posts.error) throw new Error(`posts: ${posts.error.message}`);
  const paths = (posts.data ?? []).map(post => post.image_path).filter(Boolean);
  for (let start = 0; start < paths.length; start += PAGE) {
    const removed = await admin.storage.from('inspiration').remove(paths.slice(start, start + PAGE));
    if (removed.error) throw new Error(`images: ${removed.error.message}`);
  }
  for (const bucket of BUCKETS) await emptyFolder(admin, bucket, userId);
  const purged = await admin.rpc('purge_account_content', { target: userId });
  if (purged.error) throw new Error(`content: ${purged.error.message}`);
  // Cascades to the profile, posts, boards and follows.
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error && deleted.error.status !== 404) throw new Error(`auth: ${deleted.error.message}`);
}

Deno.serve(async request => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return Response.json({ error: 'not configured' }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const allowed = await admin.rpc('worker_secret_matches', { candidate: request.headers.get('x-worker-secret') ?? '' });
  if (allowed.data !== true) return Response.json({ error: 'forbidden' }, { status: 403 });

  const claimed = await admin.rpc('claim_due_account_deletions', { max_rows: 5 });
  if (claimed.error) return Response.json({ error: 'claim failed' }, { status: 500 });
  const results = [];
  for (const row of claimed.data ?? []) {
    const userId = typeof row === 'string' ? row : Object.values(row)[0] as string;
    try {
      await deleteAccount(admin, userId);
      await admin.rpc('finish_account_deletion', { target: userId, succeeded: true });
      results.push({ ok: true });
    } catch (error) {
      await admin.rpc('finish_account_deletion', { target: userId, succeeded: false, problem: String(error instanceof Error ? error.message : error) });
      results.push({ ok: false });
    }
  }
  return Response.json({ processed: results.length, failed: results.filter(item => !item.ok).length });
});
