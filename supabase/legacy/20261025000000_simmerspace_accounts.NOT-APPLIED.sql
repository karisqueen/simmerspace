-- SimmerSpace accounts: profile, synced preferences and favorites, and collections.
-- Every table has row level security; each user can read and change only their own rows.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor of your project.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb check (pg_column_size(preferences) <= 16384),
  favorites text[] not null default '{}' check (cardinality(favorites) <= 5000),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 80),
  color text check (color ~ '^#[0-9a-f]{6}$'),
  position integer not null default 0,
  items text[] not null default '{}' check (cardinality(items) <= 2000),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists collections_user_id_idx on public.collections (user_id);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.collections enable row level security;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "settings: read own" on public.user_settings;
create policy "settings: read own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "settings: insert own" on public.user_settings;
create policy "settings: insert own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "settings: update own" on public.user_settings;
create policy "settings: update own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "settings: delete own" on public.user_settings;
create policy "settings: delete own" on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "collections: read own" on public.collections;
create policy "collections: read own" on public.collections for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "collections: insert own" on public.collections;
create policy "collections: insert own" on public.collections for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "collections: update own" on public.collections;
create policy "collections: update own" on public.collections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "collections: delete own" on public.collections;
create policy "collections: delete own" on public.collections for delete to authenticated using ((select auth.uid()) = user_id);

-- Creates the profile row when someone signs up. The display name comes from the sign-up form.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps updated_at current on profile edits.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
