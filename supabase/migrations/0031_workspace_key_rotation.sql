-- Owner rotation. The new key is sealed before ciphertext is rewritten.
-- Commit refuses to switch versions until every stored ciphertext uses the new version.

create or replace function public.workspace_ciphertext_at_version(p_workspace_id uuid, p_version integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_version >= 1
    and not exists (
      select 1 from public.workspaces
      where id = p_workspace_id
        and name_ciphertext is not null
        and coalesce((name_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.clients
      where workspace_id = p_workspace_id
        and name_ciphertext is not null
        and coalesce((name_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.projects
      where workspace_id = p_workspace_id
        and (
          (name_ciphertext is not null and coalesce((name_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (description_ciphertext is not null and coalesce((description_ciphertext->>'key_version')::integer, 0) <> p_version)
        )
    )
    and not exists (
      select 1 from public.activities
      where workspace_id = p_workspace_id
        and name_ciphertext is not null
        and coalesce((name_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.tags
      where workspace_id = p_workspace_id
        and name_ciphertext is not null
        and coalesce((name_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.project_aliases
      where workspace_id = p_workspace_id
        and shortcut_ciphertext is not null
        and coalesce((shortcut_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.time_entries
      where workspace_id = p_workspace_id
        and description_ciphertext is not null
        and coalesce((description_ciphertext->>'key_version')::integer, 0) <> p_version
    )
    and not exists (
      select 1 from public.requests
      where workspace_id = p_workspace_id
        and (
          (requester_ciphertext is not null and coalesce((requester_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (request_ciphertext is not null and coalesce((request_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (additional_notes_ciphertext is not null and coalesce((additional_notes_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (website_ciphertext is not null and coalesce((website_ciphertext->>'key_version')::integer, 0) <> p_version)
        )
    )
    and not exists (
      select 1 from public.tasks
      where workspace_id = p_workspace_id
        and (
          (requester_ciphertext is not null and coalesce((requester_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (task_ciphertext is not null and coalesce((task_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (additional_notes_ciphertext is not null and coalesce((additional_notes_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (website_ciphertext is not null and coalesce((website_ciphertext->>'key_version')::integer, 0) <> p_version)
        )
    );
$$;

create or replace function public.begin_workspace_key_rotation(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  perform public.enforce_aal();
  if public.workspace_role_of(p_workspace_id) <> 'owner' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.workspaces
    set key_rotation_status = 'rotating'
    where id = p_workspace_id
      and encryption_status in ('dual', 'ciphertext_only')
      and key_rotation_status in ('stable', 'rotating')
      and current_key_version is not null
    returning id into updated_id;
  if updated_id is null then
    raise exception 'Workspace encryption key cannot rotate' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.commit_workspace_key_rotation(p_workspace_id uuid, p_key_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
  rotating text;
begin
  perform public.enforce_aal();
  if public.workspace_role_of(p_workspace_id) <> 'owner' or p_key_version < 2 then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select current_key_version, key_rotation_status
    into current_version, rotating
    from public.workspaces
    where id = p_workspace_id
      and encryption_status in ('dual', 'ciphertext_only');
  if current_version is null then
    raise exception 'Workspace encryption key cannot rotate' using errcode = '42501';
  end if;
  if current_version = p_key_version and rotating = 'stable' then
    return;
  end if;
  if rotating <> 'rotating' or p_key_version <= current_version then
    raise exception 'Workspace encryption key cannot rotate' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_member_key_envelopes
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and key_version = p_key_version
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not public.workspace_ciphertext_at_version(p_workspace_id, p_key_version) then
    raise exception 'Encrypted fields are still on the previous key' using errcode = '42501';
  end if;
  update public.workspaces
    set current_key_version = p_key_version, key_rotation_status = 'stable'
    where id = p_workspace_id;
  delete from public.workspace_member_key_envelopes
    where workspace_id = p_workspace_id
      and key_version <> p_key_version;
end;
$$;

revoke all on function public.workspace_ciphertext_at_version(uuid, integer) from public;
revoke all on function public.begin_workspace_key_rotation(uuid) from public;
revoke all on function public.commit_workspace_key_rotation(uuid, integer) from public;
grant execute on function public.begin_workspace_key_rotation(uuid) to authenticated;
grant execute on function public.commit_workspace_key_rotation(uuid, integer) to authenticated;
