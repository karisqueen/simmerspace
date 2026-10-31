-- Checks of the 0.12.2 migration on PostgreSQL: account deletion and the creator index. Each check raises an error if it
-- fails. Only for a test database: it creates and deletes accounts. Never run this on the real project.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'leaver@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'stays@example.test');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000000a', 'leaver'),
  ('00000000-0000-0000-0000-00000000000b', 'stays')
  on conflict (id) do update set username = excluded.username;
insert into public.inspiration_posts (id, user_id, image_path, category) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a/1.webp', 'other'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b/1.webp', 'other');
insert into public.inspiration_comments (id, post_id, user_id, parent_id, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', null, 'has a reply from someone else'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'reply that must survive'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', null, 'nobody answered'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', null, 'a comment of the other account'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000004', 'own reply goes'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', null, 'on the deleted post');
insert into public.user_follows (follower_id, followee_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
insert into public.inspiration_boards (id, user_id, name) values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'mine');
insert into public.feedback (user_id, category, message, email) values
  ('00000000-0000-0000-0000-00000000000a', 'other', 'keep the message', 'leaver@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'other', 'unrelated', 'stays@example.test'),
  (null, 'other', 'anonymous', null);

do $$
declare
  request public.account_deletions;
  changed boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  request := public.request_account_deletion();
  if request.status <> 'pending' or abs(extract(epoch from request.scheduled_for - now()) - 3600) > 5 then
    raise exception 'the deletion must be scheduled 60 minutes ahead';
  end if;
  if (select count(*) from public.claim_due_account_deletions(5)) <> 0 then raise exception 'nothing is due before the 60 minutes'; end if;
  changed := public.cancel_account_deletion();
  if changed is not true or (select status from public.account_deletions) <> 'cancelled' then raise exception 'a pending deletion can be cancelled'; end if;
  request := public.request_account_deletion();
  if request.status <> 'pending' then raise exception 'a cancelled deletion can be requested again'; end if;
  update public.account_deletions set scheduled_for = now() - interval '1 minute';
  if (select count(*) from public.claim_due_account_deletions(5)) <> 1 then raise exception 'a due deletion is claimed'; end if;
  if public.cancel_account_deletion() then raise exception 'a claimed deletion cannot be cancelled'; end if;
  perform public.purge_account_content('00000000-0000-0000-0000-00000000000a');
  delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
  perform public.finish_account_deletion('00000000-0000-0000-0000-00000000000a', true);

  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a') then raise exception 'profile left'; end if;
  if exists (select 1 from public.inspiration_posts where user_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'posts left'; end if;
  if exists (select 1 from public.inspiration_boards) then raise exception 'boards left'; end if;
  if exists (select 1 from public.user_follows) then raise exception 'follows left'; end if;
  if exists (select 1 from public.inspiration_comments where id in ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000005')) then raise exception 'own comments left'; end if;
  if not exists (select 1 from public.inspiration_comments where id = '20000000-0000-0000-0000-000000000001' and user_id is null and body = '' and deleted_at is not null) then raise exception 'a comment with replies stays, empty and without author'; end if;
  if not exists (select 1 from public.inspiration_comments where id = '20000000-0000-0000-0000-000000000002' and body = 'reply that must survive') then raise exception 'the reply of another account was lost'; end if;
  if not exists (select 1 from public.inspiration_comments where id = '20000000-0000-0000-0000-000000000004') then raise exception 'unrelated comment lost'; end if;
  if not exists (select 1 from public.inspiration_posts where user_id = '00000000-0000-0000-0000-00000000000b') then raise exception 'unrelated post lost'; end if;
  if not exists (select 1 from public.feedback where message = 'keep the message' and user_id is null and email is null) then raise exception 'feedback keeps its text and loses its owner and address'; end if;
  if not exists (select 1 from public.feedback where message = 'unrelated' and email = 'stays@example.test') then raise exception 'unrelated feedback changed'; end if;
  if not exists (select 1 from public.feedback where message = 'anonymous') then raise exception 'anonymous feedback lost'; end if;
  if (select status from public.account_deletions) <> 'completed' then raise exception 'the record must say completed'; end if;
end;
$$;

insert into public.cf_index_projects (id, name, downloads, created_on, updated_on, categories, is_maxis, authors) values
  (1, 'Hair A', 100, '2026-01-01', '2026-03-01', '{Hairstyles,Feminine}', true, '[{"id": 7, "name": "Moss", "url": "https://www.curseforge.com/members/moss", "avatar": null}]'),
  (2, 'Hair B', 50, '2026-02-01', '2026-02-02', '{Hairstyles}', false, '[{"id": 7, "name": "Moss", "url": null, "avatar": null}, {"id": 8, "name": "fern", "url": null, "avatar": null}]'),
  (3, 'Sofa', 500, '2025-01-01', '2025-01-02', '{Decor}', false, '[{"id": 9, "name": "Ash", "url": null, "avatar": null}]');
insert into public.cf_creators (id, name, name_key, indexed_at) values (99, 'Gone', 'gone', now() - interval '1 day');

do $$
begin
  perform public.refresh_cf_creators();
  if (select count(*) from public.cf_creators) <> 3 then raise exception 'one row per author, and authors no longer in the catalog go'; end if;
  if not exists (select 1 from public.cf_creators where id = 7 and project_count = 2 and total_downloads = 150 and style = 'maxis' and last_created_at = '2026-02-01' and last_updated_at = '2026-03-01' and name_key = 'moss' and categories[1] = 'Hairstyles' and jsonb_array_length(top_projects) = 2) then raise exception 'the numbers of a creator must come from their projects'; end if;
  if (select status from public.cf_index_state) <> 'idle' then raise exception 'the run must end idle'; end if;
end;
$$;
