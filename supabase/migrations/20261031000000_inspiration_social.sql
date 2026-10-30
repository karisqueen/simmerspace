-- simmerspace 0.12.1: the community side of Inspiration.
--   * editable posts (caption, category and tags; the publication date never changes)
--   * tags chosen by players, searchable, normalized for search while keeping a readable name
--   * personal boards that save posts by reference (private by default; ready for public boards later)
--   * comments with one level of replies, editing and safe deletion
--   * following other simlings
-- Run once in the Supabase SQL Editor. It only ADDS things: no table or column is dropped, existing posts stay as
-- they are (with no tags and no comments), and running it again changes nothing. Row-level security is on for every
-- new table; nothing here is readable without signing in.

-- ---------------------------------------------------------------------------------------------------------------
-- Posts: edit date and a guard so an edit can only touch the caption and category
-- ---------------------------------------------------------------------------------------------------------------
alter table public.inspiration_posts add column if not exists updated_at timestamptz;

create or replace function public.simmerspace_guard_post_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.image_path := old.image_path;
  new.created_at := old.created_at;
  if new.caption is distinct from old.caption or new.category is distinct from old.category then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists simmerspace_posts_guard on public.inspiration_posts;
create trigger simmerspace_posts_guard
  before update on public.inspiration_posts
  for each row execute function public.simmerspace_guard_post_update();

-- ---------------------------------------------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------------------------------------------
-- One row per tag. `slug` is the search form ("Long curly hair" -> "long-curly-hair", accents removed); `name` is
-- how it was first written. Players never write this table directly: set_post_tags() creates tags as needed.
create table if not exists public.inspiration_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 32),
  name text not null check (char_length(btrim(name)) between 2 and 32),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inspiration_post_tags (
  post_id uuid not null references public.inspiration_posts (id) on delete cascade,
  tag_id uuid not null references public.inspiration_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);
create index if not exists inspiration_post_tags_tag_idx on public.inspiration_post_tags (tag_id, post_id);

alter table public.inspiration_tags enable row level security;
alter table public.inspiration_post_tags enable row level security;

drop policy if exists "Tags are visible to signed-in users" on public.inspiration_tags;
create policy "Tags are visible to signed-in users" on public.inspiration_tags
  for select to authenticated using (true);

drop policy if exists "Post tags are visible to signed-in users" on public.inspiration_post_tags;
create policy "Post tags are visible to signed-in users" on public.inspiration_post_tags
  for select to authenticated using (true);

drop policy if exists "Authors tag their own posts" on public.inspiration_post_tags;
create policy "Authors tag their own posts" on public.inspiration_post_tags
  for insert to authenticated
  with check (exists (select 1 from public.inspiration_posts p where p.id = post_id and p.user_id = (select auth.uid())));

drop policy if exists "Authors untag their own posts" on public.inspiration_post_tags;
create policy "Authors untag their own posts" on public.inspiration_post_tags
  for delete to authenticated
  using (exists (select 1 from public.inspiration_posts p where p.id = post_id and p.user_id = (select auth.uid())));

grant select on public.inspiration_tags to authenticated;
grant select, insert, delete on public.inspiration_post_tags to authenticated;

create or replace function public.simmerspace_tag_slug(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(btrim(coalesce(value, ''))),
      'áàäâãåāéèëêēíìïîīóòöôõøōúùüûūñçýÿ',
      'aaaaaaaeeeeeiiiiiooooooouuuuuncyy'),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- Replaces the tags of one of the caller's own posts. At most 8 tags of 2-32 characters; repeated tags (also
-- written differently, like "Maxis Match" and "maxis-match") count once. Returns the post's tags.
create or replace function public.set_post_tags(target_post uuid, tag_names text[])
returns table (id uuid, slug text, name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  wanted text;
  clean_name text;
  clean_slug text;
  slugs text[] := '{}';
  tag uuid;
  tag_ids uuid[] := '{}';
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inspiration_posts p where p.id = target_post and p.user_id = me) then
    raise exception 'not_your_post' using errcode = '42501';
  end if;
  foreach wanted in array coalesce(tag_names, '{}') loop
    clean_name := regexp_replace(btrim(coalesce(wanted, '')), '\s+', ' ', 'g');
    clean_name := btrim(clean_name, '#');
    clean_slug := public.simmerspace_tag_slug(clean_name);
    continue when char_length(clean_slug) < 2 or char_length(clean_name) < 2;
    continue when clean_slug = any (slugs);
    if char_length(clean_name) > 32 or char_length(clean_slug) > 32 then
      raise exception 'tag_too_long' using errcode = '22001';
    end if;
    slugs := slugs || clean_slug;
    if cardinality(slugs) > 8 then
      raise exception 'too_many_tags' using errcode = '22023';
    end if;
    insert into public.inspiration_tags as t (slug, name, created_by)
      values (clean_slug, clean_name, me)
      on conflict on constraint inspiration_tags_slug_key do update set slug = excluded.slug
      returning t.id into tag;
    tag_ids := tag_ids || tag;
  end loop;
  delete from public.inspiration_post_tags pt where pt.post_id = target_post and not (pt.tag_id = any (tag_ids));
  insert into public.inspiration_post_tags (post_id, tag_id)
    select target_post, unnest(tag_ids)
    on conflict do nothing;
  return query
    select t.id, t.slug, t.name from public.inspiration_tags t
    join public.inspiration_post_tags pt on pt.tag_id = t.id
    where pt.post_id = target_post
    order by t.name;
end;
$$;
revoke all on function public.set_post_tags(uuid, text[]) from public, anon;
grant execute on function public.set_post_tags(uuid, text[]) to authenticated;

-- Tag suggestions: the most used tags that start with (or contain) what the player is typing.
create or replace function public.suggest_inspiration_tags(prefix text default '', max_rows integer default 8)
returns table (id uuid, slug text, name text, uses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.slug, t.name, count(pt.post_id) as uses
  from public.inspiration_tags t
  left join public.inspiration_post_tags pt on pt.tag_id = t.id
  where public.simmerspace_tag_slug(prefix) = '' or t.slug like '%' || public.simmerspace_tag_slug(prefix) || '%'
  group by t.id
  having count(pt.post_id) > 0
  order by (t.slug like public.simmerspace_tag_slug(prefix) || '%') desc, count(pt.post_id) desc, t.name
  limit least(greatest(coalesce(max_rows, 8), 1), 20)
$$;
revoke all on function public.suggest_inspiration_tags(text, integer) from public, anon;
grant execute on function public.suggest_inspiration_tags(text, integer) to authenticated;

-- One page of posts that have ALL the given tags (and the category, when given), newest first.
create or replace function public.inspiration_posts_tagged(tag_slugs text[], post_category text default null, before_time timestamptz default null, max_rows integer default 24)
returns setof public.inspiration_posts
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.inspiration_posts p
  where (post_category is null or p.category = post_category)
    and (before_time is null or p.created_at < before_time)
    and (
      select count(distinct t.slug) from public.inspiration_post_tags pt
      join public.inspiration_tags t on t.id = pt.tag_id
      where pt.post_id = p.id and t.slug = any (tag_slugs)
    ) = cardinality(array(select distinct unnest(tag_slugs)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(max_rows, 24), 1), 49)
$$;
revoke all on function public.inspiration_posts_tagged(text[], text, timestamptz, integer) from public, anon;
grant execute on function public.inspiration_posts_tagged(text[], text, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Boards
-- ---------------------------------------------------------------------------------------------------------------
-- Private unless is_public is true. The app has no public boards yet, so it always saves false.
create table if not exists public.inspiration_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (char_length(coalesce(description, '')) <= 300),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists inspiration_boards_owner_name_idx on public.inspiration_boards (user_id, lower(btrim(name)));

-- Saving a post stores only a reference. Deleting a board never touches the posts; deleting a post removes it from
-- every board, so boards never show broken entries.
create table if not exists public.inspiration_board_posts (
  board_id uuid not null references public.inspiration_boards (id) on delete cascade,
  post_id uuid not null references public.inspiration_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (board_id, post_id)
);
create index if not exists inspiration_board_posts_post_idx on public.inspiration_board_posts (post_id);
create index if not exists inspiration_board_posts_board_time_idx on public.inspiration_board_posts (board_id, created_at desc);

create or replace function public.simmerspace_guard_board_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists simmerspace_boards_guard on public.inspiration_boards;
create trigger simmerspace_boards_guard
  before update on public.inspiration_boards
  for each row execute function public.simmerspace_guard_board_update();

alter table public.inspiration_boards enable row level security;
alter table public.inspiration_board_posts enable row level security;

drop policy if exists "Owners see their boards, others only public ones" on public.inspiration_boards;
create policy "Owners see their boards, others only public ones" on public.inspiration_boards
  for select to authenticated using (user_id = (select auth.uid()) or is_public);

drop policy if exists "Users create their own boards" on public.inspiration_boards;
create policy "Users create their own boards" on public.inspiration_boards
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users edit their own boards" on public.inspiration_boards;
create policy "Users edit their own boards" on public.inspiration_boards
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own boards" on public.inspiration_boards;
create policy "Users delete their own boards" on public.inspiration_boards
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Saved posts follow their board's visibility" on public.inspiration_board_posts;
create policy "Saved posts follow their board's visibility" on public.inspiration_board_posts
  for select to authenticated
  using (exists (select 1 from public.inspiration_boards b where b.id = board_id and (b.user_id = (select auth.uid()) or b.is_public)));

drop policy if exists "Owners save posts to their boards" on public.inspiration_board_posts;
create policy "Owners save posts to their boards" on public.inspiration_board_posts
  for insert to authenticated
  with check (exists (select 1 from public.inspiration_boards b where b.id = board_id and b.user_id = (select auth.uid())));

drop policy if exists "Owners remove posts from their boards" on public.inspiration_board_posts;
create policy "Owners remove posts from their boards" on public.inspiration_board_posts
  for delete to authenticated
  using (exists (select 1 from public.inspiration_boards b where b.id = board_id and b.user_id = (select auth.uid())));

grant select, insert, update, delete on public.inspiration_boards to authenticated;
grant select, insert, delete on public.inspiration_board_posts to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Comments and replies (one level)
-- ---------------------------------------------------------------------------------------------------------------
-- A comment with replies is not removed when its author deletes it: its text is cleared and deleted_at is set, so
-- the replies keep their context ("comment deleted"). A comment without replies is removed.
create table if not exists public.inspiration_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.inspiration_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.inspiration_comments (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint inspiration_comments_body_check check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 1000) or (deleted_at is not null and body = '')
  )
);
create index if not exists inspiration_comments_post_idx on public.inspiration_comments (post_id, created_at);
create index if not exists inspiration_comments_parent_idx on public.inspiration_comments (parent_id) where parent_id is not null;
create index if not exists inspiration_comments_user_idx on public.inspiration_comments (user_id);

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
drop trigger if exists simmerspace_comments_guard on public.inspiration_comments;
create trigger simmerspace_comments_guard
  before insert or update on public.inspiration_comments
  for each row execute function public.simmerspace_guard_comment();

alter table public.inspiration_comments enable row level security;

drop policy if exists "Comments are visible to signed-in users" on public.inspiration_comments;
create policy "Comments are visible to signed-in users" on public.inspiration_comments
  for select to authenticated using (true);

drop policy if exists "Users write their own comments" on public.inspiration_comments;
create policy "Users write their own comments" on public.inspiration_comments
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users edit their own comments" on public.inspiration_comments;
create policy "Users edit their own comments" on public.inspiration_comments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own comments" on public.inspiration_comments;
create policy "Users delete their own comments" on public.inspiration_comments
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.inspiration_comments to authenticated;

-- Deletes one of the caller's comments: removed if nobody replied, otherwise kept as "deleted" for its replies.
create or replace function public.delete_inspiration_comment(target_comment uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.inspiration_comments c where c.id = target_comment and c.user_id = me) then
    raise exception 'not_your_comment' using errcode = '42501';
  end if;
  if exists (select 1 from public.inspiration_comments r where r.parent_id = target_comment) then
    update public.inspiration_comments set deleted_at = now(), body = '' where id = target_comment and user_id = me;
    return 'hidden';
  end if;
  delete from public.inspiration_comments where id = target_comment and user_id = me;
  return 'removed';
end;
$$;
revoke all on function public.delete_inspiration_comment(uuid) from public, anon;
grant execute on function public.delete_inspiration_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Following simlings
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.user_follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_not_self check (follower_id <> followee_id)
);
create index if not exists user_follows_followee_idx on public.user_follows (followee_id, created_at desc);
create index if not exists user_follows_follower_time_idx on public.user_follows (follower_id, created_at desc);

alter table public.user_follows enable row level security;

drop policy if exists "Follows are visible to signed-in users" on public.user_follows;
create policy "Follows are visible to signed-in users" on public.user_follows
  for select to authenticated using (true);

drop policy if exists "Users follow from their own account" on public.user_follows;
create policy "Users follow from their own account" on public.user_follows
  for insert to authenticated with check (follower_id = (select auth.uid()));

drop policy if exists "Users unfollow from their own account" on public.user_follows;
create policy "Users unfollow from their own account" on public.user_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

grant select, insert, delete on public.user_follows to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- No access for signed-out visitors, and no bulk operations from the API
-- ---------------------------------------------------------------------------------------------------------------
revoke all on public.inspiration_tags, public.inspiration_post_tags, public.inspiration_boards,
  public.inspiration_board_posts, public.inspiration_comments, public.user_follows from anon;
revoke truncate, references, trigger on public.inspiration_tags, public.inspiration_post_tags, public.inspiration_boards,
  public.inspiration_board_posts, public.inspiration_comments, public.user_follows from authenticated;
revoke all on function public.simmerspace_guard_post_update() from public, anon, authenticated;
revoke all on function public.simmerspace_guard_board_update() from public, anon, authenticated;
revoke all on function public.simmerspace_guard_comment() from public, anon, authenticated;
