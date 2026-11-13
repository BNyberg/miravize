alter table public.project_clients
  alter column split_percent drop not null;

alter table public.project_clients
  drop constraint if exists project_clients_split_percent_check;

alter table public.project_clients
  add constraint project_clients_split_percent_check
  check (split_percent is null or (split_percent > 0 and split_percent <= 100));

create or replace function public.check_project_splits()
returns trigger
language plpgsql
as $$
declare
  pid uuid;
  total numeric;
  cnt integer;
  with_percent integer;
begin
  pid := coalesce(new.project_id, old.project_id);
  select
    coalesce(sum(split_percent), 0),
    count(*),
    count(split_percent)
  into total, cnt, with_percent
  from public.project_clients
  where project_id = pid;
  if cnt = 0 or with_percent = 0 then
    return coalesce(new, old);
  end if;
  if with_percent <> cnt then
    raise exception 'All client links must be split, or none of them';
  end if;
  if total <> 100 then
    raise exception 'Project client splits must sum to 100, got %', total;
  end if;
  return coalesce(new, old);
end;
$$;

drop function if exists public.replace_project_clients(uuid, jsonb);

create function public.replace_project_clients(
  p_project_id uuid,
  p_splits jsonb
)
returns setof public.project_clients
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

  if coalesce(jsonb_array_length(p_splits), 0) = 0 then
    delete from public.project_clients where project_id = p_project_id;
    return;
  end if;

  return query
  with removed as (
    delete from public.project_clients
    where project_id = p_project_id
    returning client_id, hourly_rate
  )
  insert into public.project_clients (workspace_id, project_id, client_id, split_percent, hourly_rate)
  select
    ws,
    p_project_id,
    (item->>'client_id')::uuid,
    nullif(item->>'split_percent', '')::numeric,
    rates.hourly_rate
  from jsonb_array_elements(p_splits) as item
  left join removed as rates on rates.client_id = (item->>'client_id')::uuid
  returning *;
end;
$$;

grant execute on function public.replace_project_clients(uuid, jsonb) to authenticated;
