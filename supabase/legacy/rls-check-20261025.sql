-- Run after local-auth-stub.sql and the migration. Stops with an error if any check fails.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"display_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{}');

do $$ begin
  if (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'Ana' then raise exception 'sign-up trigger did not create the profile'; end if;
end $$;

-- As user A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.user_settings (user_id, preferences, favorites) values ('00000000-0000-0000-0000-00000000000a', '{"lang":"es"}', '{demo-1}');
insert into public.collections (user_id, client_id, name, color, items) values ('00000000-0000-0000-0000-00000000000a', 'c1', 'Cozy', '#d16f91', '{cf:42}');
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'A sees other profiles'; end if;
  begin
    insert into public.collections (user_id, client_id, name) values ('00000000-0000-0000-0000-00000000000b', 'x', 'Planted');
    raise exception 'A could write a row for B';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.collections (user_id, client_id, name, color) values ('00000000-0000-0000-0000-00000000000a', 'bad', 'Bad', 'red');
    raise exception 'an invalid color was accepted';
  exception when check_violation then null; end;
end $$;
update public.profiles set display_name = 'Ana B' where id = '00000000-0000-0000-0000-00000000000b';

-- As user B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.collections) <> 0 then raise exception 'B sees A''s collections'; end if;
  if (select count(*) from public.user_settings) <> 0 then raise exception 'B sees A''s settings'; end if;
  update public.collections set name = 'Hacked';
  delete from public.user_settings;
end $$;
reset role;
do $$ begin
  if (select name from public.collections where client_id = 'c1') <> 'Cozy' then raise exception 'B changed A''s collection'; end if;
  if (select count(*) from public.user_settings) <> 1 then raise exception 'B deleted A''s settings'; end if;
  if (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Ana B' then raise exception 'A renamed B'; end if;
end $$;

-- Signed out
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select count(*) from public.collections) + (select count(*) from public.profiles) + (select count(*) from public.user_settings) <> 0 then raise exception 'anonymous users can read rows'; end if;
end $$;
reset role;
select 'RLS checks passed' as result;
