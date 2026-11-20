-- Name uniqueness moves to the client so a ciphertext-only workspace can store blank plaintext.

alter table public.clients drop constraint if exists clients_workspace_id_name_key;
alter table public.projects drop constraint if exists projects_workspace_id_name_key;
alter table public.tags drop constraint if exists tags_workspace_id_name_key;
alter table public.project_aliases drop constraint if exists project_aliases_workspace_id_shortcut_key;
drop index if exists public.activities_project_name;
drop index if exists public.activities_project_client_name;

create or replace function public.blank_sensitive_plaintext()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  status text;
begin
  if tg_table_name = 'workspaces' then
    ws := new.id;
  else
    ws := new.workspace_id;
  end if;
  select encryption_status into status from public.workspaces where id = ws;
  if status is distinct from 'ciphertext_only' then
    return new;
  end if;
  case tg_table_name
    when 'workspaces' then
      new.name := '';
    when 'clients' then
      new.name := '';
    when 'projects' then
      new.name := '';
      new.description := '';
    when 'activities' then
      new.name := '';
    when 'tags' then
      new.name := '';
    when 'project_aliases' then
      new.shortcut := '';
    when 'time_entries' then
      new.description := '';
    when 'requests' then
      new.requester := '';
      new.request := '';
      new.additional_notes := '';
      new.website := '';
    when 'tasks' then
      new.requester := '';
      new.task := '';
      new.additional_notes := '';
      new.website := '';
    else
      null;
  end case;
  return new;
end;
$$;

revoke all on function public.blank_sensitive_plaintext() from public;

do $$
declare
  target text;
begin
  foreach target in array array[
    'workspaces',
    'clients',
    'projects',
    'activities',
    'tags',
    'project_aliases',
    'time_entries',
    'requests',
    'tasks'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_blank_plaintext', target);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.blank_sensitive_plaintext()',
      target || '_blank_plaintext',
      target
    );
  end loop;
end $$;

create or replace function public.cutover_workspace_plaintext(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  status text;
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.workspace_role_of(p_workspace_id) is distinct from 'owner' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select encryption_status into status from public.workspaces where id = p_workspace_id;
  if status is distinct from 'dual' then
    raise exception 'Workspace is not ready to remove original text';
  end if;
  update public.clients set name = '' where workspace_id = p_workspace_id;
  update public.projects set name = '', description = '' where workspace_id = p_workspace_id;
  update public.activities set name = '' where workspace_id = p_workspace_id;
  update public.tags set name = '' where workspace_id = p_workspace_id;
  update public.project_aliases set shortcut = '' where workspace_id = p_workspace_id;
  update public.time_entries set description = '' where workspace_id = p_workspace_id;
  update public.requests
  set requester = '', request = '', additional_notes = '', website = ''
  where workspace_id = p_workspace_id;
  update public.tasks
  set requester = '', task = '', additional_notes = '', website = ''
  where workspace_id = p_workspace_id;
  update public.workspaces
  set name = '', encryption_status = 'ciphertext_only'
  where id = p_workspace_id
    and encryption_status = 'dual';
end;
$$;

revoke all on function public.cutover_workspace_plaintext(uuid) from public;
grant execute on function public.cutover_workspace_plaintext(uuid) to authenticated;
