alter table public.requests
  add column if not exists status public.task_status not null default 'todo';

drop function if exists public.update_support_request(uuid, text, text, uuid, uuid, uuid[], text);

create or replace function public.update_support_request(
  p_id uuid,
  p_requester text,
  p_request text,
  p_project_id uuid default null,
  p_activity_id uuid default null,
  p_client_ids uuid[] default '{}',
  p_additional_notes text default null,
  p_status public.task_status default 'todo'
)
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

  update public.requests
  set
    requester = btrim(p_requester),
    request = btrim(p_request),
    project_id = p_project_id,
    activity_id = p_activity_id,
    additional_notes = nullif(btrim(coalesce(p_additional_notes, '')), ''),
    status = p_status
  where id = p_id
  returning * into updated;

  delete from public.request_clients where request_id = p_id;
  if p_client_ids is not null then
    insert into public.request_clients (request_id, client_id, workspace_id)
    select updated.id, client_id, updated.workspace_id
    from unnest(p_client_ids) as client_id
    where client_id is not null
    on conflict do nothing;
  end if;

  return updated;
end;
$$;

grant execute on function public.update_support_request(uuid, text, text, uuid, uuid, uuid[], text, public.task_status) to authenticated;
