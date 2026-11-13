create function public.delete_project(p_project_id uuid)
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

  delete from public.time_entries where project_id = p_project_id;
  delete from public.requests where project_id = p_project_id;
  delete from public.projects where id = p_project_id;
end;
$$;

grant execute on function public.delete_project(uuid) to authenticated;
