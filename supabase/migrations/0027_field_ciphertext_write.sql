-- Write ciphertext only. Plaintext columns are not in these updates.

create or replace function public.field_ciphertext_ok(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select p_value is null
    or (
      jsonb_typeof(p_value) = 'object'
      and p_value->>'v' = '1'
      and p_value->>'alg' = 'A256GCM'
      and (p_value->>'key_version') ~ '^[1-9][0-9]*$'
      and length(coalesce(p_value->>'iv', '')) > 0
      and length(coalesce(p_value->>'ct', '')) > 0
      and (select count(*) from jsonb_object_keys(p_value)) = 5
    );
$$;

create or replace function public.write_field_ciphertext(
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
      set name_ciphertext = case when p_fields ? 'name_ciphertext' then p_fields->'name_ciphertext' else name_ciphertext end
      where id = p_record_id
      returning id into ws;
  elsif p_table = 'clients' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.clients
      set name_ciphertext = case when p_fields ? 'name_ciphertext' then p_fields->'name_ciphertext' else name_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'projects' then
    if p_fields - 'name_ciphertext' - 'description_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.projects
      set
        name_ciphertext = case when p_fields ? 'name_ciphertext' then p_fields->'name_ciphertext' else name_ciphertext end,
        description_ciphertext = case when p_fields ? 'description_ciphertext' then p_fields->'description_ciphertext' else description_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'activities' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.activities
      set name_ciphertext = case when p_fields ? 'name_ciphertext' then p_fields->'name_ciphertext' else name_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'tags' then
    if p_fields - 'name_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.tags
      set name_ciphertext = case when p_fields ? 'name_ciphertext' then p_fields->'name_ciphertext' else name_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'project_aliases' then
    if p_fields - 'shortcut_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.project_aliases
      set shortcut_ciphertext = case when p_fields ? 'shortcut_ciphertext' then p_fields->'shortcut_ciphertext' else shortcut_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'time_entries' then
    if p_fields - 'description_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.time_entries
      set description_ciphertext = case when p_fields ? 'description_ciphertext' then p_fields->'description_ciphertext' else description_ciphertext end
      where id = p_record_id
      returning workspace_id, user_id into ws, entry_user;
    if entry_user is distinct from auth.uid() and public.workspace_role_of(ws) is distinct from 'owner' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif p_table = 'requests' then
    if p_fields - 'requester_ciphertext' - 'request_ciphertext' - 'additional_notes_ciphertext' - 'website_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.requests
      set
        requester_ciphertext = case when p_fields ? 'requester_ciphertext' then p_fields->'requester_ciphertext' else requester_ciphertext end,
        request_ciphertext = case when p_fields ? 'request_ciphertext' then p_fields->'request_ciphertext' else request_ciphertext end,
        additional_notes_ciphertext = case when p_fields ? 'additional_notes_ciphertext' then p_fields->'additional_notes_ciphertext' else additional_notes_ciphertext end,
        website_ciphertext = case when p_fields ? 'website_ciphertext' then p_fields->'website_ciphertext' else website_ciphertext end
      where id = p_record_id
      returning workspace_id into ws;
  elsif p_table = 'tasks' then
    if p_fields - 'requester_ciphertext' - 'task_ciphertext' - 'additional_notes_ciphertext' - 'website_ciphertext' <> '{}'::jsonb then
      raise exception 'Encrypted value is malformed' using errcode = '22023';
    end if;
    update public.tasks
      set
        requester_ciphertext = case when p_fields ? 'requester_ciphertext' then p_fields->'requester_ciphertext' else requester_ciphertext end,
        task_ciphertext = case when p_fields ? 'task_ciphertext' then p_fields->'task_ciphertext' else task_ciphertext end,
        additional_notes_ciphertext = case when p_fields ? 'additional_notes_ciphertext' then p_fields->'additional_notes_ciphertext' else additional_notes_ciphertext end,
        website_ciphertext = case when p_fields ? 'website_ciphertext' then p_fields->'website_ciphertext' else website_ciphertext end
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

create or replace function public.mark_workspace_dual(p_workspace_id uuid, p_key_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  perform public.enforce_aal();
  if public.workspace_role_of(p_workspace_id) <> 'owner' or p_key_version < 1 then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_member_key_envelopes
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and key_version = p_key_version
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspaces
    where id = p_workspace_id
      and encryption_status = 'dual'
      and current_key_version = p_key_version
  ) then
    return;
  end if;
  update public.workspaces
    set encryption_status = 'dual', current_key_version = p_key_version
    where id = p_workspace_id
      and encryption_status = 'plaintext'
      and (current_key_version is null or current_key_version = p_key_version)
    returning id into updated_id;
  if updated_id is null then
    raise exception 'Workspace encryption state cannot change' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.field_ciphertext_ok(jsonb) from public;
revoke all on function public.write_field_ciphertext(text, uuid, jsonb) from public;
revoke all on function public.mark_workspace_dual(uuid, integer) from public;
grant execute on function public.write_field_ciphertext(text, uuid, jsonb) to authenticated;
grant execute on function public.mark_workspace_dual(uuid, integer) to authenticated;

create policy workspace_member_key_envelopes_insert on public.workspace_member_key_envelopes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
    and recipient_public_key_fingerprint = (
      select public_key_fingerprint
      from public.user_crypto_profiles
      where user_id = auth.uid()
        and crypto_status = 'ready'
    )
  );
