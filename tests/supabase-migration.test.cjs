const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static checks of the migration. supabase/tests/community-check.sql runs the real checks on PostgreSQL.
const dir = path.join(__dirname, '../supabase/migrations');
const files = fs.readdirSync(dir).filter(name => name.endsWith('.sql'));
const sql = files.map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n').toLowerCase();
const policies = [...sql.matchAll(/create policy "[^"]+" on ([\w.]+)\s+for (\w+)(?: to (\w+))?([^;]*);/g)].map(m => ({ table: m[1], action: m[2], role: m[3] || 'public', body: m[4] }));

test('the active migrations are the ones for the real project, in order', () => {
  assert.deepEqual(files, ['20261030000000_simmerspace_community.sql', '20261030120000_username_changes.sql']);
  assert.doesNotMatch(sql, /display_name|user_settings|public\.collections/);
});

test('the migration never weakens security or drops data', () => {
  // Revoking a privilege only takes access away, so revoke statements and comments are left out of this check.
  const statements = sql.replace(/--[^\n]*/g, '').replace(/revoke [^;]+;/g, '');
  assert.doesNotMatch(statements, /disable row level security|drop table|truncate|delete from|alter table auth\.|service_role/);
  // TRUNCATE ignores row level security, so the API roles lose it.
  assert.match(sql, /revoke truncate, references, trigger on public\.profiles, public\.inspiration_posts, public\.feedback from anon, authenticated;/);
  assert.match(sql, /drop policy if exists "users can submit feedback" on public\.feedback;/);
  for (const table of ['profiles', 'inspiration_posts', 'feedback']) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
});

test('writes are limited to the signed-in owner, and storage to their own folder', () => {
  const writes = policies.filter(p => p.action !== 'select');
  assert.ok(writes.length >= 10);
  for (const p of writes) {
    assert.equal(p.role, 'authenticated', `${p.table} ${p.action}`);
    assert.match(p.body, /\(select auth\.uid\(\)\)/, `${p.table} ${p.action} checks the owner`);
    if (p.table === 'storage.objects') assert.match(p.body, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  }
  // Only avatars are readable without signing in (it is a public bucket).
  for (const p of policies.filter(p => p.action === 'select' && p.role !== 'authenticated')) assert.match(p.body, /bucket_id = 'avatars'/);
});

test('functions run with an empty search path; only the username check is open to anon', () => {
  const functions = [...sql.matchAll(/create or replace function ([\w.]+)\(([^)]*)\)([\s\S]*?)\$\$;/g)];
  assert.ok(functions.length >= 5);
  for (const [, name, , body] of functions) assert.match(body, /set search_path = ''/, name);
  const anonGrants = [...sql.matchAll(/grant execute on function ([\w.]+)\([^)]*\) to ([^;]+);/g)].filter(m => m[2].includes('anon')).map(m => m[1]);
  assert.deepEqual(anonGrants, ['public.username_available']);
  const trigger = sql.slice(sql.indexOf('create or replace function public.handle_new_user'), sql.indexOf('$$;', sql.indexOf('handle_new_user')));
  assert.match(trigger, /security definer/);
  assert.match(trigger, /raw_user_meta_data ->> 'username'/);
  assert.match(sql, /create unique index if not exists profiles_username_lower_key on public\.profiles \(lower\(username\)\)/);
});

test('the account service and the migration agree on columns, categories and buckets', () => {
  const service = fs.readFileSync(path.join(__dirname, '../electron/account-service.cjs'), 'utf8');
  const { POST_CATEGORIES, FEEDBACK_CATEGORIES } = require('../electron/account-service.cjs');
  for (const column of ['username', 'avatar_url', 'image_path', 'caption', 'category', 'message', 'created_at']) {
    assert.ok(service.includes(column), `service uses ${column}`);
    assert.ok(sql.includes(column), `migration knows ${column}`);
  }
  assert.ok(sql.includes(`check (category in (${POST_CATEGORIES.map(c => `'${c}'`).join(', ')}))`));
  assert.ok(sql.includes(`check (category in (${FEEDBACK_CATEGORIES.map(c => `'${c}'`).join(', ')}))`));
  for (const bucket of ['avatars', 'inspiration']) assert.ok(service.includes(`'${bucket}'`) && sql.includes(`bucket_id = '${bucket}'`));
  assert.ok(service.includes("rpc('ensure_my_profile')") && service.includes("rpc('username_available'"));
});

test('usernames can change at most once every 30 days, enforced by a trigger', () => {
  assert.match(sql, /add column if not exists username_changed_at timestamptz/);
  assert.match(sql, /before update on public\.profiles\s+for each row execute function public\.simmerspace_guard_profile_update\(\)/);
  assert.match(sql, /username_changed_at > now\(\) - interval '30 days'/);
  assert.match(sql, /errcode = 'ss030'/);
});
