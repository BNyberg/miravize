alter table public.time_entries
  alter column project_id drop not null;

create or replace function public.start_time_entry(
  p_workspace_id uuid,
  p_project_id uuid,
  p_description text default '',
  p_billable boolean default true,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_source public.time_entry_source default 'quick_start'
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries;
  proj public.projects;
  billable boolean;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  perform public.stop_running_timer(now());
  if p_project_id is null then
    billable := coalesce(p_billable, true);
  else
    select * into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
    if proj.id is null then
      raise exception 'Project not found';
    end if;
    billable := coalesce(p_billable, proj.billable);
  end if;
  insert into public.time_entries (
    workspace_id, user_id, project_id, description, billable, source, started_at
  ) values (
    p_workspace_id, auth.uid(), p_project_id, coalesce(p_description, ''), billable, p_source, now()
  ) returning * into entry;

  insert into public.time_entry_tags (time_entry_id, tag_id, workspace_id)
  select entry.id, unnest(coalesce(p_tag_ids, '{}'::uuid[])), p_workspace_id;

  return entry;
end;
$$;
