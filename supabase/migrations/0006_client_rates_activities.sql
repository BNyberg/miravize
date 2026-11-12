alter table public.project_clients
  add column if not exists hourly_rate numeric(12, 2);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists activities_project_name
  on public.activities (project_id, name)
  where client_id is null;

create unique index if not exists activities_project_client_name
  on public.activities (project_id, client_id, name)
  where client_id is not null;

alter table public.activities enable row level security;

create policy activities_select on public.activities
  for select using (public.is_workspace_member(workspace_id));
create policy activities_write on public.activities
  for all using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

create or replace function public.replace_project_clients(
  p_project_id uuid,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.projects where id = p_project_id;
  if ws is null then
    raise exception 'Project not found';
  end if;
  if not public.can_manage_workspace(ws) then
    raise exception 'Not allowed';
  end if;

  create temporary table if not exists _project_client_rates (
    client_id uuid primary key,
    hourly_rate numeric(12, 2)
  ) on commit drop;
  delete from _project_client_rates;
  insert into _project_client_rates (client_id, hourly_rate)
  select client_id, hourly_rate from public.project_clients where project_id = p_project_id;

  delete from public.project_clients where project_id = p_project_id;

  if coalesce(jsonb_array_length(p_splits), 0) = 0 then
    return;
  end if;

  insert into public.project_clients (workspace_id, project_id, client_id, split_percent, hourly_rate)
  select
    ws,
    p_project_id,
    (item->>'client_id')::uuid,
    (item->>'split_percent')::numeric,
    rates.hourly_rate
  from jsonb_array_elements(p_splits) as item
  left join _project_client_rates as rates on rates.client_id = (item->>'client_id')::uuid;
end;
$$;

create or replace function public.set_project_client_rate(
  p_project_id uuid,
  p_client_id uuid,
  p_hourly_rate numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.projects where id = p_project_id;
  if ws is null then
    raise exception 'Project not found';
  end if;
  if not public.can_manage_workspace(ws) then
    raise exception 'Not allowed';
  end if;
  update public.project_clients
  set hourly_rate = p_hourly_rate
  where project_id = p_project_id and client_id = p_client_id;
  if not found then
    raise exception 'Client is not on this project';
  end if;
end;
$$;

grant execute on function public.set_project_client_rate(uuid, uuid, numeric) to authenticated;
