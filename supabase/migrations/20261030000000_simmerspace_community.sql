-- SimmerSpace 0.10.0: accounts, profiles, the Inspiration community feed and feedback.
--
-- Written for the existing "SimmerSpace" project, whose tables and buckets already exist:
--   public.profiles (id, username, avatar_url, created_at)
--   public.inspiration_posts (id, user_id, image_path, caption, created_at)
--   public.feedback (id, user_id, category, message, email, status default 'pending', created_at)
--   storage buckets "avatars" (public, 2 MB, jpeg/png/webp) and "inspiration" (10 MB, jpeg/png/webp/gif)
--
-- Safe to run more than once: every step checks before it creates, and nothing here deletes data, drops a table,
-- disables row level security or changes Auth settings. New constraints are added NOT VALID, so existing rows
-- that do not match them are kept (only new and changed rows are checked).
-- Apply it in the SQL Editor of the project, or with `supabase db push`.

-- ---------------------------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Usernames are unique regardless of case.
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- The username format (3-24 characters: a-z, 0-9, _ and .) is checked by the app and by username_available().
-- It is not a table constraint, so an older profile with another format can still change its avatar.

drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;

-- Turns any text into a valid username: lower case, allowed characters only, 3 to 24 characters.
create or replace function public.simmerspace_clean_username(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(cleaned) >= 3 then left(cleaned, 24)
    else left(rpad(coalesce(nullif(cleaned, ''), 'simmer'), 3, '_'), 24)
  end
  from (select regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9_.]', '', 'g') as cleaned) as input
$$;

-- Creates the profile of a user. Used by the sign-up trigger and by ensure_my_profile(). If the name is taken,
-- a short suffix is added until it is free. Does nothing when the profile already exists.
create or replace function public.simmerspace_create_profile(user_id uuid, wanted text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := public.simmerspace_clean_username(wanted);
  candidate text := base;
  attempt int := 0;
begin
  if exists (select 1 from public.profiles where id = user_id) then
    return;
  end if;
  loop
    begin
      insert into public.profiles (id, username) values (user_id, candidate);
      return;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = user_id) then
        return;
      end if;
      attempt := attempt + 1;
      if attempt > 20 then
        raise;
      end if;
      candidate := left(base, 19) || '_' || substr(md5(user_id::text || attempt::text), 1, 4);
    end;
  end loop;
end;
$$;
revoke all on function public.simmerspace_create_profile(uuid, text) from public, anon, authenticated;

-- Sign-up trigger: reads the username sent with the sign-up (raw_user_meta_data->>'username').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.simmerspace_create_profile(
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recovery: a signed-in user whose profile is missing (for example, created before the trigger existed) gets
-- one, named from their sign-up username. Returns the profile.
create or replace function public.ensure_my_profile()
returns table (id uuid, username text, avatar_url text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me) then
    select coalesce(nullif(u.raw_user_meta_data ->> 'username', ''), split_part(coalesce(u.email, ''), '@', 1))
      into wanted from auth.users u where u.id = me;
    perform public.simmerspace_create_profile(me, wanted);
  end if;
  return query select p.id, p.username, p.avatar_url, p.created_at from public.profiles p where p.id = me;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- Lets the sign-up form say whether a username is free before the account exists. Returns only true/false.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select name ~ '^[a-z0-9_.]{3,24}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(name))
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Backfill: profiles for users who signed up before the trigger existed.
do $$
declare
  missing record;
begin
  for missing in
    select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'username', ''), split_part(coalesce(u.email, ''), '@', 1)) as wanted
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    perform public.simmerspace_create_profile(missing.id, missing.wanted);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Inspiration posts
-- ---------------------------------------------------------------------------------------------------------------
alter table public.inspiration_posts enable row level security;

alter table public.inspiration_posts add column if not exists category text not null default 'other';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inspiration_posts_category_check') then
    alter table public.inspiration_posts
      add constraint inspiration_posts_category_check
      check (category in ('cas', 'build', 'gameplay', 'story', 'other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inspiration_posts_caption_length') then
    alter table public.inspiration_posts
      add constraint inspiration_posts_caption_length check (char_length(coalesce(caption, '')) <= 500) not valid;
  end if;
  -- The image must live in the author's own folder: inspiration/<user id>/<file>.
  if not exists (select 1 from pg_constraint where conname = 'inspiration_posts_image_in_own_folder') then
    alter table public.inspiration_posts
      add constraint inspiration_posts_image_in_own_folder check (split_part(image_path, '/', 1) = user_id::text) not valid;
  end if;
end $$;

create index if not exists inspiration_posts_created_at_idx on public.inspiration_posts (created_at desc, id desc);
create index if not exists inspiration_posts_user_id_idx on public.inspiration_posts (user_id, created_at desc);

drop policy if exists "Posts are visible to signed-in users" on public.inspiration_posts;
create policy "Posts are visible to signed-in users" on public.inspiration_posts
  for select to authenticated using (true);

drop policy if exists "Users publish their own posts" on public.inspiration_posts;
create policy "Users publish their own posts" on public.inspiration_posts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users edit their own posts" on public.inspiration_posts;
create policy "Users edit their own posts" on public.inspiration_posts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own posts" on public.inspiration_posts;
create policy "Users delete their own posts" on public.inspiration_posts
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.inspiration_posts to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------------------------------------------
alter table public.feedback enable row level security;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_category_check') then
    alter table public.feedback
      add constraint feedback_category_check
      check (category in ('suggestion', 'bug_report', 'feature_request', 'donation_feedback', 'other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_message_length') then
    alter table public.feedback
      add constraint feedback_message_length check (char_length(message) between 1 and 4000) not valid;
  end if;
end $$;

drop policy if exists "Users send their own feedback" on public.feedback;
create policy "Users send their own feedback" on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Users read their own feedback" on public.feedback;
create policy "Users read their own feedback" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));

grant select, insert on public.feedback to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Storage: each user writes only inside the folder named after their user id.
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists "Avatars are readable" on storage.objects;
create policy "Avatars are readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users replace their own avatar" on storage.objects;
create policy "Users replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Inspiration images are visible to signed-in users" on storage.objects;
create policy "Inspiration images are visible to signed-in users" on storage.objects
  for select to authenticated using (bucket_id = 'inspiration');

drop policy if exists "Users upload their own inspiration images" on storage.objects;
create policy "Users upload their own inspiration images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inspiration' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own inspiration images" on storage.objects;
create policy "Users delete their own inspiration images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inspiration' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------------------------
-- Hardening of the project defaults
-- ---------------------------------------------------------------------------------------------------------------
-- TRUNCATE ignores row level security, so the app roles must not hold it. REFERENCES and TRIGGER are not used.
revoke truncate, references, trigger on public.profiles, public.inspiration_posts, public.feedback from anon, authenticated;

-- The app is sign-in only: anonymous feedback and the older "public" policies are replaced by the ones above.
drop policy if exists "Users can submit feedback" on public.feedback;
drop policy if exists "Profiles are publicly viewable" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Posts are publicly viewable" on public.inspiration_posts;
drop policy if exists "Users can create posts" on public.inspiration_posts;
drop policy if exists "Users can update own posts" on public.inspiration_posts;
drop policy if exists "Users can delete own posts" on public.inspiration_posts;

-- rls_auto_enable() runs from an event trigger; nobody needs to call it through the API.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
