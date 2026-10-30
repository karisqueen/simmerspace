-- Checks the 0.12.1 migration (tags, boards, comments, follows) with two separate accounts. Run on a local
-- PostgreSQL after local-auth-stub.sql, existing-schema-stub.sql, the earlier migrations and
-- 20261031000000_inspiration_social.sql (twice, to prove it can be re-run). Stops with an error if a check fails.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'luna@example.test', '{"username":"luna"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'sol@example.test', '{"username":"sol"}')
  on conflict do nothing;
-- An older post from before 0.12.1: it must keep working with no tags and no comments.
insert into public.inspiration_posts (id, user_id, image_path, caption, category, created_at) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1/old.webp', 'Old post', 'cas', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2/sol.webp', 'Sol''s kitchen', 'build', now() - interval '1 day');

grant usage on schema public to authenticated;

-- ---------- As Luna ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare
  tags record;
  board uuid;
  comment uuid;
  outcome text;
begin
  -- Old posts are still visible, with no tags.
  if (select count(*) from public.inspiration_posts) <> 2 then raise exception 'existing posts are not visible'; end if;
  if (select count(*) from public.inspiration_post_tags) <> 0 then raise exception 'old posts got tags'; end if;

  -- Tags: normalized, deduplicated, limited.
  perform public.set_post_tags('00000000-0000-0000-0000-00000000aa01', array['Maxis Match', 'maxis-match', '#Pelo Rizado', 'Cottagecore', ' ', 'x']);
  if (select count(*) from public.inspiration_post_tags where post_id = '00000000-0000-0000-0000-00000000aa01') <> 3 then raise exception 'tags were not deduplicated'; end if;
  if not exists (select 1 from public.inspiration_tags where slug = 'pelo-rizado' and name = 'Pelo Rizado') then raise exception 'tag slug or name is wrong'; end if;
  begin
    perform public.set_post_tags('00000000-0000-0000-0000-00000000aa01', array['a1','b2','c3','d4','e5','f6','g7','h8','i9']);
    raise exception 'more than 8 tags were accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_post_tags('00000000-0000-0000-0000-00000000aa01', array[repeat('a', 40)]);
    raise exception 'a 40-character tag was accepted';
  exception when string_data_right_truncation then null; end;
  -- Someone else's post cannot be tagged, directly or through the function.
  begin
    perform public.set_post_tags('00000000-0000-0000-0000-00000000bb01', array['mine now']);
    raise exception 'Luna tagged Sol''s post';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inspiration_post_tags (post_id, tag_id) select '00000000-0000-0000-0000-00000000bb01', id from public.inspiration_tags limit 1;
    raise exception 'Luna inserted a tag on Sol''s post';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inspiration_tags (slug, name) values ('direct', 'direct');
    raise exception 'tags can be inserted directly';
  exception when insufficient_privilege then null; end;

  -- Editing a post keeps its date and owner, and records the edit.
  update public.inspiration_posts set caption = 'Old post, edited', created_at = now(), user_id = '00000000-0000-0000-0000-0000000000b2' where id = '00000000-0000-0000-0000-00000000aa01';
  if (select user_id from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000aa01') <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'post owner changed'; end if;
  if (select created_at > now() - interval '1 day' from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000aa01') then raise exception 'post date changed'; end if;
  if (select updated_at from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000aa01') is null then raise exception 'edit time not recorded'; end if;
  update public.inspiration_posts set caption = 'hacked' where id = '00000000-0000-0000-0000-00000000bb01';
  if (select caption from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000bb01') <> 'Sol''s kitchen' then raise exception 'Luna edited Sol''s post'; end if;

  -- Search by tags: all of them must match.
  if (select count(*) from public.inspiration_posts_tagged(array['maxis-match', 'cottagecore'])) <> 1 then raise exception 'tag search missed the post'; end if;
  if (select count(*) from public.inspiration_posts_tagged(array['maxis-match', 'nope'])) <> 0 then raise exception 'tag search ignored a tag'; end if;
  if (select count(*) from public.suggest_inspiration_tags('max', 8)) <> 1 then raise exception 'tag suggestions are wrong'; end if;

  -- Boards: private by default, saving Sol's post by reference.
  insert into public.inspiration_boards (name, description) values ('Cocinas', 'Ideas') returning id into board;
  insert into public.inspiration_board_posts (board_id, post_id) values (board, '00000000-0000-0000-0000-00000000bb01'), (board, '00000000-0000-0000-0000-00000000aa01');
  begin
    insert into public.inspiration_board_posts (board_id, post_id) values (board, '00000000-0000-0000-0000-00000000bb01');
    raise exception 'the same post was saved twice';
  exception when unique_violation then null; end;
  begin
    insert into public.inspiration_boards (name) values (' cocinas ');
    raise exception 'two boards with the same name';
  exception when unique_violation then null; end;
  update public.inspiration_boards set name = 'Cocinas bonitas' where id = board;

  -- Comments: one level of replies, never empty.
  insert into public.inspiration_comments (post_id, body) values ('00000000-0000-0000-0000-00000000bb01', '  Me encanta  ') returning id into comment;
  if (select body from public.inspiration_comments where id = comment) <> 'Me encanta' then raise exception 'comment was not trimmed'; end if;
  begin
    insert into public.inspiration_comments (post_id, body) values ('00000000-0000-0000-0000-00000000bb01', '   ');
    raise exception 'an empty comment was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.inspiration_comments (post_id, body, user_id) values ('00000000-0000-0000-0000-00000000bb01', 'as Sol', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'Luna commented as Sol';
  exception when insufficient_privilege then null; end;
  perform set_config('test.luna_comment', comment::text, false);
  perform set_config('test.luna_board', board::text, false);

  -- Following: once, never yourself.
  insert into public.user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b2');
  begin
    insert into public.user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b2');
    raise exception 'followed twice';
  exception when unique_violation then null; end;
  begin
    insert into public.user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000a1');
    raise exception 'followed herself';
  exception when check_violation then null; end;
  begin
    insert into public.user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000ff');
    raise exception 'followed a profile that does not exist';
  exception when foreign_key_violation then null; end;
end $$;

-- ---------- As Sol ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$
declare
  reply uuid;
  nested uuid;
  outcome text;
  luna_comment uuid := current_setting('test.luna_comment')::uuid;
  luna_board uuid := current_setting('test.luna_board')::uuid;
begin
  -- Luna's private board and what she saved are invisible to Sol, and he cannot change them.
  if exists (select 1 from public.inspiration_boards) then raise exception 'Sol sees Luna''s private board'; end if;
  if exists (select 1 from public.inspiration_board_posts) then raise exception 'Sol sees Luna''s saved posts'; end if;
  delete from public.inspiration_board_posts where board_id = luna_board;
  update public.inspiration_boards set name = 'mine' where id = luna_board;
  delete from public.inspiration_boards where id = luna_board;
  begin
    insert into public.inspiration_board_posts (board_id, post_id) values (luna_board, '00000000-0000-0000-0000-00000000bb01');
    raise exception 'Sol saved into Luna''s board';
  exception when insufficient_privilege then null; end;

  -- Sol replies to Luna; replies to replies are refused.
  insert into public.inspiration_comments (post_id, parent_id, body) values ('00000000-0000-0000-0000-00000000bb01', luna_comment, 'Gracias') returning id into reply;
  begin
    insert into public.inspiration_comments (post_id, parent_id, body) values ('00000000-0000-0000-0000-00000000bb01', reply, 'too deep') returning id into nested;
    raise exception 'a reply to a reply was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.inspiration_comments (post_id, parent_id, body) values ('00000000-0000-0000-0000-00000000aa01', luna_comment, 'wrong post');
    raise exception 'a reply on another post was accepted';
  exception when check_violation then null; end;
  -- Sol cannot edit or delete Luna's comment.
  update public.inspiration_comments set body = 'edited by Sol' where id = luna_comment;
  delete from public.inspiration_comments where id = luna_comment;
  begin
    perform public.delete_inspiration_comment(luna_comment);
    raise exception 'Sol deleted Luna''s comment';
  exception when insufficient_privilege then null; end;
  -- His own reply can be edited.
  update public.inspiration_comments set body = 'Gracias!' where id = reply;
  if (select edited_at from public.inspiration_comments where id = reply) is null then raise exception 'edit time not recorded'; end if;
  -- Sol cannot remove Luna's follow, and sees the follow.
  delete from public.user_follows where follower_id = '00000000-0000-0000-0000-0000000000a1';
  if (select count(*) from public.user_follows where followee_id = '00000000-0000-0000-0000-0000000000b2') <> 1 then raise exception 'follow not visible or removed by Sol'; end if;
end $$;

-- ---------- Back as Luna ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare
  luna_comment uuid := current_setting('test.luna_comment')::uuid;
  luna_board uuid := current_setting('test.luna_board')::uuid;
begin
  if (select body from public.inspiration_comments where id = luna_comment) <> 'Me encanta' then raise exception 'Sol changed Luna''s comment'; end if;
  if (select count(*) from public.inspiration_board_posts where board_id = luna_board) <> 2 then raise exception 'Sol changed Luna''s board'; end if;
  -- Her comment has a reply, so deleting keeps it as "deleted" and the reply stays.
  if public.delete_inspiration_comment(luna_comment) <> 'hidden' then raise exception 'comment with replies was removed'; end if;
  if (select deleted_at is null or body <> '' from public.inspiration_comments where id = luna_comment) then raise exception 'comment was not marked deleted'; end if;
  if (select count(*) from public.inspiration_comments where parent_id = luna_comment) <> 1 then raise exception 'reply lost its parent'; end if;
  begin
    update public.inspiration_comments set deleted_at = null, body = 'back' where id = luna_comment;
    raise exception 'a deleted comment came back';
  exception when check_violation then null; end;
  -- Deleting her post removes it from her board but keeps the board and Sol's saved post.
  delete from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000aa01';
  if (select count(*) from public.inspiration_board_posts where board_id = luna_board) <> 1 then raise exception 'deleted post stayed on the board'; end if;
  -- Deleting the board never deletes posts.
  delete from public.inspiration_boards where id = luna_board;
  if not exists (select 1 from public.inspiration_posts where id = '00000000-0000-0000-0000-00000000bb01') then raise exception 'deleting a board deleted a post'; end if;
  delete from public.user_follows where followee_id = '00000000-0000-0000-0000-0000000000b2';
  if exists (select 1 from public.user_follows) then raise exception 'unfollow failed'; end if;
end $$;

-- ---------- Signed out ----------
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.inspiration_comments;
    raise exception 'anon can read comments';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.user_follows;
    raise exception 'anon can read follows';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'social checks passed' as result;
