create type public.task_status as enum ('todo', 'doing', 'done');

alter table public.workspace_counters
  add column if not exists tasks integer not null default 0;

create or replace function public.next_task_number(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.workspace_counters (workspace_id, requests, tasks)
  values (p_workspace_id, 0, 0)
  on conflict (workspace_id) do nothing;
  update public.workspace_counters
  set tasks = tasks + 1
  where workspace_id = p_workspace_id
  returning tasks into n;
  return n;
end;
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  task_number integer not null,
  logged_on date not null,
  requester text not null,
  task text not null,
  project_id uuid references public.projects (id) on delete restrict,
  activity_id uuid references public.activities (id) on delete set null,
  website text,
  additional_notes text,
  screenshot_path text,
  screenshot_paths text[] not null default '{}',
  submission_id uuid not null,
  status public.task_status not null default 'todo',
  created_at timestamptz not null default now(),
  unique (workspace_id, task_number),
  unique (workspace_id, submission_id)
);

create table public.task_clients (
  task_id uuid not null references public.tasks (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (task_id, client_id)
);

create table public.time_entry_tasks (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (time_entry_id, task_id)
);

alter table public.tasks enable row level security;
alter table public.task_clients enable row level security;
alter table public.time_entry_tasks enable row level security;

create policy tasks_select on public.tasks
  for select using (public.is_workspace_member(workspace_id));
create policy tasks_insert on public.tasks
  for insert with check (public.is_workspace_member(workspace_id));

create policy task_clients_select on public.task_clients
  for select using (public.is_workspace_member(workspace_id));
create policy task_clients_write on public.task_clients
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy time_entry_tasks_select on public.time_entry_tasks
  for select using (public.is_workspace_member(workspace_id));
create policy time_entry_tasks_write on public.time_entry_tasks
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.log_task(
  p_workspace_id uuid,
  p_submission_id uuid,
  p_requester text,
  p_task text,
  p_project_id uuid default null,
  p_activity_id uuid default null,
  p_client_ids uuid[] default '{}',
  p_additional_notes text default null,
  p_screenshot_paths text[] default '{}',
  p_logged_on date default (timezone('utc', now()))::date
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.tasks;
  created public.tasks;
  n integer;
  first_path text;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  select * into existing from public.tasks
  where workspace_id = p_workspace_id and submission_id = p_submission_id;
  if existing.id is not null then
    return existing;
  end if;
  n := public.next_task_number(p_workspace_id);
  first_path := case
    when p_screenshot_paths is not null and cardinality(p_screenshot_paths) > 0 then p_screenshot_paths[1]
    else null
  end;
  insert into public.tasks (
    workspace_id, created_by, task_number, logged_on, requester, task,
    project_id, activity_id, website, additional_notes, screenshot_path, screenshot_paths, submission_id, status
  ) values (
    p_workspace_id, auth.uid(), n, p_logged_on, btrim(p_requester), btrim(p_task),
    p_project_id, p_activity_id, null, nullif(btrim(coalesce(p_additional_notes, '')), ''),
    first_path, coalesce(p_screenshot_paths, '{}'), p_submission_id, 'todo'
  ) returning * into created;

  if p_client_ids is not null then
    insert into public.task_clients (task_id, client_id, workspace_id)
    select created.id, client_id, p_workspace_id
    from unnest(p_client_ids) as client_id
    where client_id is not null
    on conflict do nothing;
  end if;

  return created;
end;
$$;

create or replace function public.update_task(
  p_id uuid,
  p_requester text,
  p_task text,
  p_project_id uuid default null,
  p_activity_id uuid default null,
  p_client_ids uuid[] default '{}',
  p_additional_notes text default null,
  p_status public.task_status default 'todo'
)
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

  update public.tasks
  set
    requester = btrim(p_requester),
    task = btrim(p_task),
    project_id = p_project_id,
    activity_id = p_activity_id,
    additional_notes = nullif(btrim(coalesce(p_additional_notes, '')), ''),
    status = p_status
  where id = p_id
  returning * into updated;

  delete from public.task_clients where task_id = p_id;
  if p_client_ids is not null then
    insert into public.task_clients (task_id, client_id, workspace_id)
    select updated.id, client_id, updated.workspace_id
    from unnest(p_client_ids) as client_id
    where client_id is not null
    on conflict do nothing;
  end if;

  return updated;
end;
$$;

create or replace function public.delete_task(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.tasks;
begin
  select * into current from public.tasks where id = p_id;
  if current.id is null then
    raise exception 'Not found';
  end if;
  if not public.is_workspace_member(current.workspace_id) then
    raise exception 'Not allowed';
  end if;

  delete from public.tasks where id = p_id;
end;
$$;

grant execute on function public.next_task_number(uuid) to authenticated;
grant execute on function public.log_task(uuid, uuid, text, text, uuid, uuid, uuid[], text, text[], date) to authenticated;
grant execute on function public.update_task(uuid, text, text, uuid, uuid, uuid[], text, public.task_status) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
