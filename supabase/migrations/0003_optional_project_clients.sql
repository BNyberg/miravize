-- Projects may have no clients (personal or internal work).
-- When splits are present, the deferred trigger still requires they sum to 100.

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

  delete from public.project_clients where project_id = p_project_id;

  if coalesce(jsonb_array_length(p_splits), 0) = 0 then
    return;
  end if;

  insert into public.project_clients (workspace_id, project_id, client_id, split_percent)
  select ws, p_project_id, (item->>'client_id')::uuid, (item->>'split_percent')::numeric
  from jsonb_array_elements(p_splits) as item;
end;
$$;
