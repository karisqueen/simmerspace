const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static checks of the account migration. supabase/tests/rls-check.sql runs the real checks on PostgreSQL.
const dir = path.join(__dirname, '../supabase/migrations');
const sql = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n').toLowerCase();

test('every account table has row level security and owner-only policies', () => {
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
  assert.deepEqual(tables.sort(), ['collections', 'profiles', 'user_settings']);
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
    for (const action of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`on public\\.${table} for ${action} to authenticated`), `${table} ${action}`);
  }
  assert.doesNotMatch(sql, /using \(true\)|with check \(true\)|\bto anon\b|\bto public\b/);
  // select and delete: using; insert: with check; update: both. 5 owner checks per table.
  assert.equal([...sql.matchAll(/\(select auth\.uid\(\)\) = (id|user_id)/g)].length, 15);
});

test('the sign-up trigger is security definer with an empty search path', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.handle_new_user'), sql.indexOf('$$;', sql.indexOf('handle_new_user')));
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(fn, /public\.profiles/);
});

test('the account service uses the columns the migration creates', () => {
  const service = fs.readFileSync(path.join(__dirname, '../electron/account-service.cjs'), 'utf8');
  for (const column of ['display_name', 'preferences', 'favorites', 'client_id', 'position', 'items', 'updated_at']) {
    assert.ok(service.includes(column), `service uses ${column}`);
    assert.ok(sql.includes(column), `migration creates ${column}`);
  }
  assert.ok(service.includes("onConflict: 'user_id,client_id'") && sql.includes('unique (user_id, client_id)'));
});
