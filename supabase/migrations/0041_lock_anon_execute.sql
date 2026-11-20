-- Logged-out callers must not execute workspace RPCs.
-- enforce_aal() returns successfully when auth.uid() is null, so it is not an auth check.
-- The invite preview is the only function anon may call.

create or replace function public.next_request_number(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.enforce_aal();
  insert into public.workspace_counters (workspace_id, requests)
  values (p_workspace_id, 0)
  on conflict (workspace_id) do nothing;
  update public.workspace_counters
  set requests = requests + 1
  where workspace_id = p_workspace_id
  returning requests into n;
  return n;
end;
$$;

create or replace function public.next_task_number(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.enforce_aal();
  insert into public.workspace_counters (workspace_id, requests, tasks)
  values (p_workspace_id, 0, 0)
  on conflict (workspace_id) do nothing;
  update public.workspace_counters
  set tasks = tasks + 1
  where workspace_id = p_workspace_id
  returning tasks into n;
  return n;
end;
$$;

create or replace function public.workspace_ciphertext_at_version(p_workspace_id uuid, p_version integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ready boolean;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.enforce_aal();
  select
    p_version >= 1
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
    )
    and not exists (
      select 1 from public.workspace_members
      where workspace_id = p_workspace_id
        and (
          (display_name_ciphertext is not null and coalesce((display_name_ciphertext->>'key_version')::integer, 0) <> p_version)
          or (avatar_ciphertext is not null and coalesce((avatar_ciphertext->>'key_version')::integer, 0) <> p_version)
        )
    )
    and not exists (
      select 1 from public.audit_events
      where workspace_id = p_workspace_id
        and detail_ciphertext is not null
        and coalesce((detail_ciphertext->>'key_version')::integer, 0) <> p_version
    )
  into ready;
  return coalesce(ready, false);
end;
$$;

revoke execute on all functions in schema public from public, anon;

grant execute on function public.preview_workspace_invite(uuid) to anon;
grant execute on function public.handle_new_user_workspace() to supabase_auth_admin;

alter default privileges in schema public revoke execute on functions from public, anon;
