-- Local stand-in for what the real "SimmerSpace" project already has (tables and the parts of the storage schema
-- the policies use), so the migration can be tried on a plain PostgreSQL. Run after local-auth-stub.sql.
-- Only for testing: never run this on the real project.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create table public.inspiration_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  category text not null,
  message text not null,
  email text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
-- Like a default Supabase project: the API roles have table privileges, and row level security decides.
grant select, insert, update, delete on public.profiles, public.inspiration_posts, public.feedback to anon, authenticated;
-- The live project also had these: TRUNCATE for the API roles, "public" policies and anonymous feedback.
grant truncate, references, trigger on public.profiles, public.inspiration_posts, public.feedback to anon, authenticated;
create policy "Profiles are publicly viewable" on public.profiles for select using (true);
create policy "Posts are publicly viewable" on public.inspiration_posts for select using (true);
create policy "Users can submit feedback" on public.feedback for insert to anon, authenticated with check (true);
create function public.rls_auto_enable() returns void language sql security definer as $$ select $$;
grant execute on function public.rls_auto_enable() to anon, authenticated;
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
-- A user who signed up before the trigger existed, and one whose wanted name is taken.
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c0', 'old@example.test', '{"username":"Old User!"}');
