-- Checks the 0.10.0 migration. Run on a local PostgreSQL after local-auth-stub.sql, existing-schema-stub.sql and
-- the migration (twice, to prove it can be re-run). Stops with an error if any check fails.
\set ON_ERROR_STOP on

do $$ begin
  if (select username from public.profiles where id = '00000000-0000-0000-0000-0000000000c0') <> 'olduser' then raise exception 'backfill did not create the missing profile'; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"username":"ana_sims"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"username":"ANA_SIMS"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dee@example.test', '{}');

do $$ begin
  if (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'ana_sims' then raise exception 'sign-up trigger did not use the username'; end if;
  if (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000b') !~ '^ana_sims_[0-9a-f]{4}$' then raise exception 'a taken username did not get a suffix'; end if;
  if (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000d') <> 'dee' then raise exception 'missing username did not fall back to the email name'; end if;
  begin
    insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000000c0', 'x');
    raise exception 'a second profile row was accepted';
  exception when unique_violation then null; end;
end $$;

-- As anon: only the username check is open.
set role anon;
do $$ begin
  if not public.username_available('free_name') then raise exception 'free name reported as taken'; end if;
  if public.username_available('Ana_Sims') then raise exception 'taken name (other case) reported as free'; end if;
  if public.username_available('no spaces') then raise exception 'invalid name reported as free'; end if;
  if (select count(*) from public.profiles) <> 0 or (select count(*) from public.inspiration_posts) <> 0 then raise exception 'anon could read rows'; end if;
  begin
    insert into public.feedback (user_id, category, message) values (null, 'other', 'anonymous');
    raise exception 'anon could send feedback';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon', 'public.profiles', 'truncate') or has_table_privilege('authenticated', 'public.feedback', 'truncate') then raise exception 'API roles can still truncate'; end if;
  if has_function_privilege('anon', 'public.rls_auto_enable()', 'execute') then raise exception 'anon can call rls_auto_enable'; end if;
end $$;

-- As user A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into storage.objects (bucket_id, name) values ('inspiration', '00000000-0000-0000-0000-00000000000a/p1.webp');
insert into public.inspiration_posts (user_id, image_path, caption, category) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a/p1.webp', 'Cozy room', 'build');
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/avatar.webp');
update public.profiles set avatar_url = 'https://example.test/a.webp' where id = '00000000-0000-0000-0000-00000000000a';
insert into public.feedback (user_id, category, message) values ('00000000-0000-0000-0000-00000000000a', 'bug_report', 'Something broke');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('inspiration', '00000000-0000-0000-0000-00000000000b/planted.webp');
    raise exception 'A could upload into B''s folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inspiration_posts (user_id, image_path) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b/x.webp');
    raise exception 'A could post as B';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inspiration_posts (user_id, image_path) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b/x.webp');
    raise exception 'A could post an image from B''s folder';
  exception when check_violation then null; end;
  begin
    insert into public.inspiration_posts (user_id, image_path, category) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a/y.webp', 'nope');
    raise exception 'an unknown category was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.feedback (user_id, category, message) values ('00000000-0000-0000-0000-00000000000a', 'rant', 'x');
    raise exception 'an unknown feedback category was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.feedback (user_id, category, message, status) values ('00000000-0000-0000-0000-00000000000a', 'other', 'x', 'resolved');
    raise exception 'feedback could be sent as already resolved';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.profiles) < 4 then raise exception 'A cannot see other profiles (needed for post authors)'; end if;
  if (select username from public.ensure_my_profile()) <> 'ana_sims' then raise exception 'ensure_my_profile did not return the profile'; end if;
end $$;
update public.profiles set username = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';

-- As user B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.inspiration_posts) <> 1 then raise exception 'B cannot see A''s post in the feed'; end if;
  if (select count(*) from public.feedback) <> 0 then raise exception 'B sees A''s feedback'; end if;
  if (select count(*) from storage.objects where bucket_id = 'inspiration') <> 1 then raise exception 'B cannot see the feed image'; end if;
end $$;
update public.inspiration_posts set caption = 'Hacked';
delete from public.inspiration_posts;
delete from storage.objects;
update public.profiles set avatar_url = 'https://evil.example/x' where id = '00000000-0000-0000-0000-00000000000a';

-- A user without a profile (deleted by hand) gets it back.
reset role;
delete from public.profiles where id = '00000000-0000-0000-0000-00000000000d';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  if (select username from public.ensure_my_profile()) <> 'dee' then raise exception 'ensure_my_profile did not recover the missing profile'; end if;
end $$;
reset role;

do $$ begin
  if (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'hacked' then raise exception 'A changed B''s profile'; end if;
  if (select caption from public.inspiration_posts) <> 'Cozy room' then raise exception 'B changed A''s post'; end if;
  if (select count(*) from storage.objects) <> 2 then raise exception 'B deleted A''s files'; end if;
  if (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'https://example.test/a.webp' then raise exception 'B changed A''s avatar'; end if;
  if exists (select 1 from pg_class where relname in ('profiles', 'inspiration_posts', 'feedback') and relnamespace = 'public'::regnamespace and not relrowsecurity) then raise exception 'row level security is off somewhere'; end if;
end $$;

-- A deletes their own post and image.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
delete from public.inspiration_posts where image_path = '00000000-0000-0000-0000-00000000000a/p1.webp';
delete from storage.objects where bucket_id = 'inspiration' and name = '00000000-0000-0000-0000-00000000000a/p1.webp';
reset role;
do $$ begin
  if exists (select 1 from public.inspiration_posts) or exists (select 1 from storage.objects where bucket_id = 'inspiration') then raise exception 'A could not delete their own post and image'; end if;
end $$;

select 'community checks passed' as result;
