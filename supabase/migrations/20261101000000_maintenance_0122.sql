-- simmerspace 0.12.2: account deletion after 60 minutes, and a creator index for the full CurseForge catalog.
-- Safe to run more than once. It adds tables and functions and changes one foreign key; it deletes no data.
-- The privileged work runs in two Edge Functions (account-deletion-worker, curseforge-index), started by pg_cron through
-- pg_net with a random secret kept in Vault. No service key ever reaches the desktop app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------------------------------------------
-- Worker secret
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'simmerspace_worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'simmerspace_worker_secret', 'Lets pg_cron start the simmerspace workers.');
  end if;
end;
$$;

create or replace function public.worker_secret_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets s where s.name = 'simmerspace_worker_secret' and s.decrypted_secret = candidate);
$$;

-- Starts one Edge Function without waiting for it.
create or replace function public.start_worker(worker text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'simmerspace_worker_secret';
  perform net.http_post(
    url := 'https://wvvookczuzlxihwdlnbl.supabase.co/functions/v1/' || worker,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Comments of deleted accounts
-- ---------------------------------------------------------------------------------------------------------------
-- A deleted account must not take other simlings' replies with it. A comment that has replies from others stays as an
-- empty "comment deleted" with no author, the same way as when its author deletes it by hand.
alter table public.inspiration_comments alter column user_id drop not null;
alter table public.inspiration_comments drop constraint if exists inspiration_comments_user_id_fkey;
alter table public.inspiration_comments
  add constraint inspiration_comments_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;

create or replace function public.simmerspace_guard_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent record;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    new.body := btrim(new.body);
    if new.parent_id is not null then
      select c.post_id, c.parent_id, c.deleted_at into parent from public.inspiration_comments c where c.id = new.parent_id;
      if not found or parent.post_id <> new.post_id then
        raise exception 'reply_to_other_post' using errcode = '23514';
      end if;
      if parent.parent_id is not null then
        raise exception 'reply_too_deep' using errcode = '23514';
      end if;
      if parent.deleted_at is not null then
        raise exception 'reply_to_deleted' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  -- The foreign key clearing the author of a deleted account. Row-level security stops anyone else from doing this.
  if new.user_id is null and old.user_id is not null then
    return new;
  end if;
  -- UPDATE: only the text can change (an edit), or the comment can be marked deleted. Never undeleted.
  new.id := old.id;
  new.post_id := old.post_id;
  new.user_id := old.user_id;
  new.parent_id := old.parent_id;
  new.created_at := old.created_at;
  if old.deleted_at is not null then
    raise exception 'comment_deleted' using errcode = '23514';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.edited_at := old.edited_at;
  elsif new.body is distinct from old.body then
    new.body := btrim(new.body);
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------------------------------------------
-- One row per request. It has no foreign key on purpose: the row outlives the account as a record that the deletion
-- ran, and holds no personal data beyond the id of an account that no longer exists.
create table if not exists public.account_deletions (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'failed', 'completed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  completed_at timestamptz
);
create index if not exists account_deletions_due_idx on public.account_deletions (scheduled_for) where status in ('pending', 'failed');
alter table public.account_deletions enable row level security;

drop policy if exists "Users see their own deletion request" on public.account_deletions;
create policy "Users see their own deletion request" on public.account_deletions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.account_deletions from anon, authenticated;
grant select on public.account_deletions to authenticated;

create or replace function public.request_account_deletion()
returns public.account_deletions
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  row_out public.account_deletions;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  insert into public.account_deletions as d (user_id, scheduled_for)
  values (me, now() + interval '60 minutes')
  on conflict (user_id) do update
    set requested_at = now(), scheduled_for = now() + interval '60 minutes', status = 'pending', attempts = 0, last_error = null, completed_at = null
    where d.status = 'cancelled'
  returning * into row_out;
  if row_out.user_id is null then
    select * into row_out from public.account_deletions d where d.user_id = me;
  end if;
  return row_out;
end;
$$;

-- Possible until the worker has picked the request up.
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.account_deletions set status = 'cancelled' where user_id = auth.uid() and status in ('pending', 'failed');
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.claim_due_account_deletions(max_rows integer default 5)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.account_deletions d
  set status = 'processing', attempts = d.attempts + 1
  where d.user_id in (
    select c.user_id from public.account_deletions c
    where c.scheduled_for <= now() and (c.status = 'pending' or (c.status = 'failed' and c.attempts < 5))
    order by c.scheduled_for
    limit max_rows
    for update skip locked
  )
  returning d.user_id;
end;
$$;

-- Everything the foreign keys do not settle by themselves. Runs right before the auth user is deleted, which cascades to
-- the profile, posts, boards, tags of posts and follows.
create or replace function public.purge_account_content(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.inspiration_comments c where c.user_id = target and c.parent_id is not null;
  delete from public.inspiration_comments c
  where c.user_id = target
    and not exists (select 1 from public.inspiration_comments r where r.parent_id = c.id and r.user_id is distinct from target);
  update public.inspiration_comments set deleted_at = now(), body = '' where user_id = target and deleted_at is null;
  -- Feedback stays, as before: the foreign key clears the author. The contact address typed into it goes.
  update public.feedback set email = null where user_id = target;
end;
$$;

create or replace function public.finish_account_deletion(target uuid, succeeded boolean, problem text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.account_deletions
  set status = case when succeeded then 'completed' else 'failed' end,
      completed_at = case when succeeded then now() end,
      last_error = case when succeeded then null else left(problem, 300) end
  where user_id = target;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Creator index
-- ---------------------------------------------------------------------------------------------------------------
-- CurseForge has no list of authors, so the catalog is read in the background and grouped here. Written by the
-- worker only; the app reads cf_creators.
create table if not exists public.cf_index_projects (
  id bigint primary key,
  name text not null,
  logo text,
  website_url text,
  downloads bigint not null default 0,
  created_on timestamptz,
  updated_on timestamptz,
  categories text[] not null default '{}',
  is_maxis boolean not null default false,
  is_alpha boolean not null default false,
  authors jsonb not null default '[]'::jsonb,
  seen_at timestamptz not null default now()
);
alter table public.cf_index_projects enable row level security;

create table if not exists public.cf_creators (
  id bigint primary key,
  name text not null,
  name_key text not null,
  url text,
  avatar_url text,
  project_count integer not null default 0,
  total_downloads bigint not null default 0,
  last_created_at timestamptz,
  last_updated_at timestamptz,
  categories text[] not null default '{}',
  style text not null default 'unknown' check (style in ('maxis', 'alpha', 'both', 'unknown')),
  top_projects jsonb not null default '[]'::jsonb,
  indexed_at timestamptz not null default now()
);
create index if not exists cf_creators_name_idx on public.cf_creators (name_key, id);
create index if not exists cf_creators_downloads_idx on public.cf_creators (total_downloads desc, id);
create index if not exists cf_creators_created_idx on public.cf_creators (last_created_at desc nulls last, id);
create index if not exists cf_creators_updated_idx on public.cf_creators (last_updated_at desc nulls last, id);
alter table public.cf_creators enable row level security;

drop policy if exists "Signed-in users read creators" on public.cf_creators;
create policy "Signed-in users read creators" on public.cf_creators for select to authenticated using (true);
revoke all on public.cf_index_projects from anon, authenticated;
revoke all on public.cf_creators from anon, authenticated;
grant select on public.cf_creators to authenticated;

-- One row: where the reading of the catalog is. `status` is idle, running or grouping.
create table if not exists public.cf_index_state (
  id boolean primary key default true check (id),
  status text not null default 'idle' check (status in ('idle', 'running', 'grouping')),
  queue jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  page_index integer not null default 0,
  pages_read integer not null default 0,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);
insert into public.cf_index_state (id) values (true) on conflict (id) do nothing;
alter table public.cf_index_state enable row level security;
revoke all on public.cf_index_state from anon, authenticated;

create or replace function public.refresh_cf_creators()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_at timestamptz := now();
begin
  with links as (
    select a.id, a.name, a.url, a.avatar, p.id as project_id, p.name as project, p.logo, p.website_url, p.downloads, p.created_on, p.updated_on, p.categories, p.is_maxis, p.is_alpha
    from public.cf_index_projects p
    cross join lateral jsonb_to_recordset(p.authors) as a(id bigint, name text, url text, avatar text)
    where a.id is not null and a.name is not null
  ),
  ranked_categories as (
    select l.id, c.category, row_number() over (partition by l.id order by count(*) desc, c.category) as place
    from links l cross join lateral unnest(l.categories) as c(category)
    group by l.id, c.category
  ),
  categories as (
    select r.id, array_agg(r.category order by r.place) as names from ranked_categories r where r.place <= 12 group by r.id
  ),
  grouped as (
    select l.id,
      (array_agg(l.name order by l.downloads desc))[1] as name,
      (array_agg(l.url order by l.downloads desc) filter (where l.url is not null))[1] as url,
      (array_agg(l.avatar order by l.downloads desc) filter (where l.avatar is not null))[1] as avatar,
      count(*)::integer as project_count,
      sum(l.downloads)::bigint as total_downloads,
      max(l.created_on) as last_created_at,
      max(l.updated_on) as last_updated_at,
      bool_or(l.is_maxis) as maxis,
      bool_or(l.is_alpha) as alpha,
      (array_agg(jsonb_build_object('id', l.project_id, 'name', l.project, 'logo', coalesce(l.logo, ''), 'downloadCount', l.downloads, 'websiteUrl', coalesce(l.website_url, '')) order by l.downloads desc))[1:3] as top
    from links l
    group by l.id
  )
  insert into public.cf_creators as c (id, name, name_key, url, avatar_url, project_count, total_downloads, last_created_at, last_updated_at, categories, style, top_projects, indexed_at)
  select g.id, g.name, lower(g.name), g.url, g.avatar, g.project_count, g.total_downloads, g.last_created_at, g.last_updated_at,
    coalesce(k.names, '{}'),
    case when g.maxis and g.alpha then 'both' when g.maxis then 'maxis' when g.alpha then 'alpha' else 'unknown' end,
    to_jsonb(g.top), run_at
  from grouped g left join categories k on k.id = g.id
  on conflict (id) do update set
    name = excluded.name, name_key = excluded.name_key, url = excluded.url, avatar_url = excluded.avatar_url,
    project_count = excluded.project_count, total_downloads = excluded.total_downloads,
    last_created_at = excluded.last_created_at, last_updated_at = excluded.last_updated_at,
    categories = excluded.categories, style = excluded.style, top_projects = excluded.top_projects, indexed_at = excluded.indexed_at;
  delete from public.cf_creators c where c.indexed_at < run_at;
  update public.cf_index_state set status = 'idle', finished_at = now(), queue = '[]'::jsonb, position = 0, page_index = 0;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.account_deletion_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.account_deletions d where d.scheduled_for <= now() and (d.status = 'pending' or (d.status = 'failed' and d.attempts < 5))) then
    perform public.start_worker('account-deletion-worker');
  end if;
end;
$$;

-- Reads a slice of the catalog each minute while a run is going, starts a run once a week, and does the grouping here:
-- pg_cron has no statement time limit, unlike a request from the Edge Function.
create or replace function public.creator_index_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state public.cf_index_state;
begin
  select * into current_state from public.cf_index_state;
  if current_state.status = 'grouping' then
    perform public.refresh_cf_creators();
  elsif current_state.status = 'running' then
    perform public.start_worker('curseforge-index');
  elsif current_state.finished_at is null or current_state.finished_at < now() - interval '7 days' then
    update public.cf_index_state set status = 'running', started_at = now(), queue = '[]'::jsonb, position = 0, page_index = 0, pages_read = 0, last_error = null;
    perform public.start_worker('curseforge-index');
  end if;
end;
$$;

select cron.schedule('simmerspace-account-deletion', '* * * * *', 'select public.account_deletion_tick()');
select cron.schedule('simmerspace-creator-index', '* * * * *', 'select public.creator_index_tick()');

-- ---------------------------------------------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.worker_secret_matches(text), public.start_worker(text), public.claim_due_account_deletions(integer),
  public.purge_account_content(uuid), public.finish_account_deletion(uuid, boolean, text), public.refresh_cf_creators(),
  public.account_deletion_tick(), public.creator_index_tick() from public, anon, authenticated;
grant execute on function public.worker_secret_matches(text), public.claim_due_account_deletions(integer),
  public.purge_account_content(uuid), public.finish_account_deletion(uuid, boolean, text) to service_role;
revoke all on function public.request_account_deletion(), public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion(), public.cancel_account_deletion() to authenticated;
-- Tables on this project do not grant anything to service_role by default, so the workers get exactly what they use.
grant select, update on public.cf_index_state to service_role;
grant select, insert, update on public.cf_index_projects to service_role;
grant select on public.inspiration_posts to service_role;
