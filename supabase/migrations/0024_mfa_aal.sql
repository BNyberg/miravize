-- Optional authenticator MFA: AAL2 is required only after a factor is verified.

create or replace function public.aal_satisfies_mfa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when coalesce(auth.role(), '') = 'service_role' then true
      when auth.uid() is null then true
      when exists (
        select 1
        from auth.mfa_factors
        where user_id = auth.uid()
          and status = 'verified'
      ) then coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      else true
    end;
$$;

create or replace function public.enforce_aal()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aal_satisfies_mfa() then
    raise exception 'Two-factor authentication is required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.aal_satisfies_mfa() from public;
revoke all on function public.enforce_aal() from public;
grant execute on function public.aal_satisfies_mfa() to anon, authenticated, service_role;
grant execute on function public.enforce_aal() to authenticated, service_role;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.aal_satisfies_mfa()
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id
        and m.user_id = auth.uid()
    );
$$;

create or replace function public.workspace_role_of(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.workspace_members m
  where public.aal_satisfies_mfa()
    and m.workspace_id = p_workspace_id
    and m.user_id = auth.uid()
  limit 1;
$$;

-- These RPCs do not go through the membership helpers, so they check AAL themselves.

create or replace function public.create_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  ws public.workspaces;
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.workspaces (name, created_by)
  values (p_name, auth.uid())
  returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, auth.uid(), 'owner');
  insert into public.workspace_counters (workspace_id, requests) values (ws.id, 0);
  return ws;
end;
$$;

create or replace function public.accept_workspace_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into inv from public.workspace_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now();
  if inv.id is null then
    raise exception 'Invite not found or expired';
  end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email', '')) then
    raise exception 'Invite email does not match this account';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;

create or replace function public.stop_running_timer(p_stopped_at timestamptz default now())
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries;
begin
  perform public.enforce_aal();
  select * into entry from public.time_entries
  where user_id = auth.uid() and stopped_at is null
  for update;
  if entry.id is null then
    return null;
  end if;
  update public.time_entries
  set stopped_at = p_stopped_at,
      duration_seconds = greatest(0, floor(extract(epoch from (p_stopped_at - started_at))))::integer
  where id = entry.id
  returning * into entry;
  return entry;
end;
$$;

create or replace function public.next_request_number(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
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
    'requests',
    'activities',
    'time_entry_clients',
    'request_clients',
    'time_entry_requests',
    'tasks',
    'task_clients',
    'time_entry_tasks'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive to authenticated using (public.aal_satisfies_mfa()) with check (public.aal_satisfies_mfa())',
      table_name || '_aal',
      table_name
    );
  end loop;
end $$;

create policy objects_aal on storage.objects
  as restrictive
  to authenticated
  using (public.aal_satisfies_mfa())
  with check (public.aal_satisfies_mfa());

create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mfa_recovery_codes enable row level security;

create or replace function public.replace_mfa_recovery_codes(p_codes text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_code text;
  normalized text;
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Two-factor authentication is required' using errcode = '42501';
  end if;
  if p_codes is null or cardinality(p_codes) <> 10 then
    raise exception 'Expected 10 backup codes';
  end if;
  delete from public.mfa_recovery_codes where user_id = auth.uid();
  foreach raw_code in array p_codes loop
    normalized := upper(regexp_replace(coalesce(raw_code, ''), '[\s-]', '', 'g'));
    if length(normalized) < 8 then
      raise exception 'Backup code is too short';
    end if;
    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (auth.uid(), crypt(normalized, gen_salt('bf')));
  end loop;
end;
$$;

create or replace function public.delete_mfa_recovery_codes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.mfa_recovery_codes where user_id = auth.uid();
end;
$$;

create or replace function public.match_mfa_recovery_code(p_user_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  found uuid;
  normalized text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  normalized := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  select id into found
  from public.mfa_recovery_codes
  where user_id = p_user_id
    and used_at is null
    and code_hash = crypt(normalized, code_hash)
  limit 1;
  return found;
end;
$$;

create or replace function public.consume_mfa_recovery_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  update public.mfa_recovery_codes
  set used_at = now()
  where id = p_id
    and used_at is null;
end;
$$;

revoke all on function public.replace_mfa_recovery_codes(text[]) from public;
revoke all on function public.delete_mfa_recovery_codes() from public;
revoke all on function public.match_mfa_recovery_code(uuid, text) from public;
revoke all on function public.consume_mfa_recovery_code(uuid) from public;
grant execute on function public.replace_mfa_recovery_codes(text[]) to authenticated;
grant execute on function public.delete_mfa_recovery_codes() to authenticated;
grant execute on function public.match_mfa_recovery_code(uuid, text) to service_role;
grant execute on function public.consume_mfa_recovery_code(uuid) to service_role;
