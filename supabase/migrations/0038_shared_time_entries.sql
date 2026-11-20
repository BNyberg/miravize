-- An owner or admin can change or remove another member's time entry.
-- The author can still change their own. New entries stay attributed to the signed-in person.

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries
  for update using (
    public.is_workspace_member(workspace_id)
    and (user_id = auth.uid() or public.can_manage_workspace(workspace_id))
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (user_id = auth.uid() or public.can_manage_workspace(workspace_id))
  );

drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries
  for delete using (
    public.is_workspace_member(workspace_id)
    and (user_id = auth.uid() or public.can_manage_workspace(workspace_id))
  );

create or replace function public.write_field_ciphertext_body(
  p_table text,
  p_record_id uuid,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  entry_user uuid;
  field_key text;
  field_value jsonb;
begin
  perform public.enforce_aal();
  if auth.uid() is null or p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for field_key, field_value in select * from jsonb_each(p_fields)
  loop
    if not public.field_ciphertext_ok(field_value) then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
  end loop;

  if p_table = 'workspaces' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    if public.workspace_role_of(p_record_id) <> 'owner' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    update public.workspaces
      set name_ciphertext = public.ciphertext_assignment(p_fields, 'name_ciphertext', name_ciphertext)
      where id = p_record_id
      returning id into ws;
  elsif p_table = 'clients' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.clients
      set name_ciphertext = public.ciphertext_assignment(p_fields, 'name_ciphertext', name_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'projects' then
    if p_fields - 'name_ciphertext' - 'description_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.projects
      set
        name_ciphertext = public.ciphertext_assignment(p_fields, 'name_ciphertext', name_ciphertext),
        description_ciphertext = public.ciphertext_assignment(p_fields, 'description_ciphertext', description_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'activities' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.activities
      set name_ciphertext = public.ciphertext_assignment(p_fields, 'name_ciphertext', name_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'tags' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.tags
      set name_ciphertext = public.ciphertext_assignment(p_fields, 'name_ciphertext', name_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'project_aliases' then
    if p_fields - 'shortcut_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.project_aliases
      set shortcut_ciphertext = public.ciphertext_assignment(p_fields, 'shortcut_ciphertext', shortcut_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'time_entries' then
    if p_fields - 'description_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.time_entries
      set description_ciphertext = public.ciphertext_assignment(p_fields, 'description_ciphertext', description_ciphertext)
      where id = p_record_id
      returning workspace_id, user_id into ws, entry_user;
    if entry_user is distinct from auth.uid() and not public.can_manage_workspace(ws) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif p_table = 'requests' then
    if p_fields - 'requester_ciphertext' - 'request_ciphertext' - 'additional_notes_ciphertext' - 'website_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.requests
      set
        requester_ciphertext = public.ciphertext_assignment(p_fields, 'requester_ciphertext', requester_ciphertext),
        request_ciphertext = public.ciphertext_assignment(p_fields, 'request_ciphertext', request_ciphertext),
        additional_notes_ciphertext = public.ciphertext_assignment(p_fields, 'additional_notes_ciphertext', additional_notes_ciphertext),
        website_ciphertext = public.ciphertext_assignment(p_fields, 'website_ciphertext', website_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'tasks' then
    if p_fields - 'requester_ciphertext' - 'task_ciphertext' - 'additional_notes_ciphertext' - 'website_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.tasks
      set
        requester_ciphertext = public.ciphertext_assignment(p_fields, 'requester_ciphertext', requester_ciphertext),
        task_ciphertext = public.ciphertext_assignment(p_fields, 'task_ciphertext', task_ciphertext),
        additional_notes_ciphertext = public.ciphertext_assignment(p_fields, 'additional_notes_ciphertext', additional_notes_ciphertext),
        website_ciphertext = public.ciphertext_assignment(p_fields, 'website_ciphertext', website_ciphertext)
      where id = p_record_id
      returning workspace_id into ws;
  else
    raise exception 'Encrypted value is malformed' using errcode = '22023';
  end if;

  if ws is null or not public.is_workspace_member(ws) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_table in ('clients', 'projects', 'activities', 'tags', 'project_aliases') and not public.can_manage_workspace(ws) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.write_field_ciphertext_body(text, uuid, jsonb) from public;
