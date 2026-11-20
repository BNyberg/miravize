alter table public.tasks
  add column if not exists assignee_id uuid references auth.users (id),
  add column if not exists completed_by uuid references auth.users (id);

alter table public.requests
  add column if not exists assignee_id uuid references auth.users (id),
  add column if not exists completed_by uuid references auth.users (id);

create or replace function public.set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_default_assignee()
returns trigger
language plpgsql
as $$
begin
  if new.assignee_id is null then
    new.assignee_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_default_assignee on public.tasks;
create trigger tasks_set_default_assignee
  before insert on public.tasks
  for each row
  execute function public.set_default_assignee();

drop trigger if exists requests_set_default_assignee on public.requests;
create trigger requests_set_default_assignee
  before insert on public.requests
  for each row
  execute function public.set_default_assignee();

do $$
declare
  brian uuid;
begin
  select id into brian from auth.users where lower(email) = 'brian@niiyama.io';
  if brian is null then
    raise exception 'brian@niiyama.io was not found';
  end if;

  update public.tasks
  set assignee_id = brian
  where assignee_id is null;

  update public.requests
  set assignee_id = brian
  where assignee_id is null;

  update public.tasks
  set completed_by = brian
  where status = 'done' and completed_by is null;

  update public.requests
  set completed_by = brian
  where status = 'done' and completed_by is null;
end;
$$;

alter table public.tasks alter column assignee_id set not null;
alter table public.requests alter column assignee_id set not null;

drop function if exists public.workspace_people(uuid);

create function public.workspace_people(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role public.workspace_role,
  full_name text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    m.user_id,
    u.email::text,
    m.role,
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), '')
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id);
$$;

create or replace function public.set_task_assignee(p_id uuid, p_assignee_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.tasks;
  updated public.tasks;
begin
  select * into current from public.tasks where id = p_id;
  if current.id is null then
    raise exception 'Not found';
  end if;
  if not public.is_workspace_member(current.workspace_id) then
    raise exception 'Not allowed';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = current.workspace_id and user_id = p_assignee_id
  ) then
    raise exception 'Assignee must be a member of this workspace';
  end if;

  update public.tasks
  set assignee_id = p_assignee_id
  where id = p_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function public.set_request_assignee(p_id uuid, p_assignee_id uuid)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.requests;
  updated public.requests;
begin
  select * into current from public.requests where id = p_id;
  if current.id is null then
    raise exception 'Not found';
  end if;
  if not public.is_workspace_member(current.workspace_id) then
    raise exception 'Not allowed';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = current.workspace_id and user_id = p_assignee_id
  ) then
    raise exception 'Assignee must be a member of this workspace';
  end if;

  update public.requests
  set assignee_id = p_assignee_id
  where id = p_id
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.workspace_people(uuid) to authenticated;
grant execute on function public.set_task_assignee(uuid, uuid) to authenticated;
grant execute on function public.set_request_assignee(uuid, uuid) to authenticated;
