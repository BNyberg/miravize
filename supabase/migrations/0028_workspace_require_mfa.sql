-- Workspace require_mfa is additive. aal_satisfies_mfa() still hides every row from an enrolled user at AAL1.

create or replace function public.workspace_require_mfa_ok(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.require_mfa
    );
$$;

revoke all on function public.workspace_require_mfa_ok(uuid) from public;
grant execute on function public.workspace_require_mfa_ok(uuid) to authenticated, service_role;

do $$
declare
  target text;
begin
  foreach target in array array[
    'workspace_members',
    'workspace_invites',
    'workspace_counters',
    'clients',
    'projects',
    'project_clients',
    'tags',
    'project_tags',
    'project_aliases',
    'time_entries',
    'time_entry_tags',
    'time_entry_clients',
    'requests',
    'request_clients',
    'time_entry_requests',
    'activities',
    'tasks',
    'task_clients',
    'time_entry_tasks',
    'workspace_member_key_envelopes'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive to authenticated using (public.workspace_require_mfa_ok(workspace_id)) with check (public.workspace_require_mfa_ok(workspace_id))',
      target || '_require_mfa',
      target
    );
  end loop;
end $$;

create policy workspaces_require_mfa on public.workspaces
  as restrictive
  to authenticated
  using (public.workspace_require_mfa_ok(id))
  with check (public.workspace_require_mfa_ok(id));

create or replace function public.screenshot_require_mfa_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  folder text;
begin
  folder := (storage.foldername(p_name))[1];
  if folder is null or folder !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return public.workspace_require_mfa_ok(folder::uuid);
end;
$$;

revoke all on function public.screenshot_require_mfa_ok(text) from public;
grant execute on function public.screenshot_require_mfa_ok(text) to authenticated, service_role;

create policy objects_require_mfa on storage.objects
  as restrictive
  to authenticated
  using (
    case
      when bucket_id is distinct from 'request-screenshots' then true
      else public.screenshot_require_mfa_ok(name)
    end
  )
  with check (
    case
      when bucket_id is distinct from 'request-screenshots' then true
      else public.screenshot_require_mfa_ok(name)
    end
  );

create or replace function public.set_workspace_require_mfa(p_workspace_id uuid, p_require_mfa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'aal', 'aal1') is distinct from 'aal2' then
    raise exception 'Two-factor authentication is required' using errcode = '42501';
  end if;
  if not public.can_manage_workspace(p_workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.workspaces
  set require_mfa = coalesce(p_require_mfa, false)
  where id = p_workspace_id;
end;
$$;

revoke all on function public.set_workspace_require_mfa(uuid, boolean) from public;
grant execute on function public.set_workspace_require_mfa(uuid, boolean) to authenticated;

revoke update (require_mfa) on table public.workspaces from authenticated, anon;
