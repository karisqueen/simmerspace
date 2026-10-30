-- SimmerSpace 0.12.0: a username can change at most once every 30 days.
-- Run once in the Supabase SQL Editor (it is safe to run again). The app also asks for the password before a
-- change; this trigger is what enforces the limit, whatever client sends the update.

alter table public.profiles add column if not exists username_changed_at timestamptz;

create or replace function public.simmerspace_guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The id and creation date never change.
  new.id := old.id;
  new.created_at := old.created_at;
  if new.username is distinct from old.username then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username_change_too_soon'
        using errcode = 'SS030', hint = to_char((old.username_changed_at + interval '30 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    new.username_changed_at := now();
  else
    new.username_changed_at := old.username_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists simmerspace_profiles_guard on public.profiles;
create trigger simmerspace_profiles_guard
  before update on public.profiles
  for each row execute function public.simmerspace_guard_profile_update();
