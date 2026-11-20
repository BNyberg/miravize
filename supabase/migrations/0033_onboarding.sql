-- Onboarding is complete only when the database says so. Clients cannot write these rows.

create table public.user_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mfa_choice text check (mfa_choice in ('enrolled', 'skipped')),
  mfa_choice_at timestamptz,
  recovery_confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_disclosure_acknowledgements (
  user_id uuid not null references auth.users (id) on delete cascade,
  disclosure_key text not null,
  disclosure_version integer not null check (disclosure_version > 0),
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, disclosure_key, disclosure_version)
);

alter table public.user_onboarding enable row level security;
alter table public.user_disclosure_acknowledgements enable row level security;

create policy user_onboarding_select on public.user_onboarding
  for select to authenticated
  using (user_id = auth.uid());

create policy user_disclosure_acknowledgements_select on public.user_disclosure_acknowledgements
  for select to authenticated
  using (user_id = auth.uid());

create policy user_disclosure_acknowledgements_insert on public.user_disclosure_acknowledgements
  for insert to authenticated
  with check (user_id = auth.uid());

insert into public.user_onboarding (user_id, mfa_choice, mfa_choice_at, recovery_confirmed_at, completed_at)
select
  members.user_id,
  case
    when exists (
      select 1
      from auth.mfa_factors factor
      where factor.user_id = members.user_id
        and factor.status = 'verified'
        and factor.factor_type = 'totp'
    ) then 'enrolled'
    else 'skipped'
  end,
  now(),
  case when profile.crypto_status = 'ready' then now() else null end,
  now()
from (
  select distinct user_id from public.workspace_members
) members
left join public.user_crypto_profiles profile on profile.user_id = members.user_id;

create or replace function public.onboarding_complete()
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
      else exists (
        select 1
        from public.user_onboarding
        where user_id = auth.uid()
          and completed_at is not null
      )
    end;
$$;

create or replace function public.enforce_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.onboarding_complete() then
    raise exception 'Finish setting up your account' using errcode = '42501';
  end if;
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
  if public.onboarding_complete() then
    return;
  end if;
  if coalesce(current_setting('miravize.onboarding_bypass', true), '') = 'on' then
    return;
  end if;
  perform public.enforce_onboarding();
end;
$$;

revoke all on function public.onboarding_complete() from public;
revoke all on function public.enforce_onboarding() from public;
grant execute on function public.onboarding_complete() to anon, authenticated, service_role;
grant execute on function public.enforce_onboarding() to authenticated, service_role;

create or replace function public.onboarding_workspace_empty(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role_of(p_workspace_id) = 'owner'
    and not exists (select 1 from public.clients where workspace_id = p_workspace_id)
    and not exists (select 1 from public.projects where workspace_id = p_workspace_id)
    and not exists (select 1 from public.activities where workspace_id = p_workspace_id)
    and not exists (select 1 from public.tags where workspace_id = p_workspace_id)
    and not exists (select 1 from public.project_aliases where workspace_id = p_workspace_id)
    and not exists (select 1 from public.time_entries where workspace_id = p_workspace_id)
    and not exists (select 1 from public.requests where workspace_id = p_workspace_id)
    and not exists (select 1 from public.tasks where workspace_id = p_workspace_id);
$$;

revoke all on function public.onboarding_workspace_empty(uuid) from public;
grant execute on function public.onboarding_workspace_empty(uuid) to authenticated;

-- Sealing the first workspace, saving backup codes, and accepting an invite
-- have to run before onboarding is complete. The bypass lasts for that transaction only.

alter function public.write_field_ciphertext(text, uuid, jsonb) rename to write_field_ciphertext_body;
alter function public.mark_workspace_dual(uuid, integer) rename to mark_workspace_dual_body;
alter function public.cutover_workspace_plaintext(uuid) rename to cutover_workspace_plaintext_body;
alter function public.replace_mfa_recovery_codes(text[]) rename to replace_mfa_recovery_codes_body;
alter function public.delete_mfa_recovery_codes() rename to delete_mfa_recovery_codes_body;
alter function public.accept_workspace_invite(uuid) rename to accept_workspace_invite_body;

revoke all on function public.write_field_ciphertext_body(text, uuid, jsonb) from public;
revoke all on function public.mark_workspace_dual_body(uuid, integer) from public;
revoke all on function public.cutover_workspace_plaintext_body(uuid) from public;
revoke all on function public.replace_mfa_recovery_codes_body(text[]) from public;
revoke all on function public.delete_mfa_recovery_codes_body() from public;
revoke all on function public.accept_workspace_invite_body(uuid) from public;

create function public.write_field_ciphertext(p_table text, p_record_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.onboarding_complete() and p_table is distinct from 'workspaces' then
    raise exception 'Finish setting up your account' using errcode = '42501';
  end if;
  perform set_config('miravize.onboarding_bypass', 'on', true);
  perform public.write_field_ciphertext_body(p_table, p_record_id, p_fields);
end;
$$;

create function public.mark_workspace_dual(p_workspace_id uuid, p_key_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('miravize.onboarding_bypass', 'on', true);
  perform public.mark_workspace_dual_body(p_workspace_id, p_key_version);
end;
$$;

create function public.cutover_workspace_plaintext(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.onboarding_complete() and not public.onboarding_workspace_empty(p_workspace_id) then
    raise exception 'Workspace is not ready to remove original text' using errcode = '42501';
  end if;
  perform set_config('miravize.onboarding_bypass', 'on', true);
  perform public.cutover_workspace_plaintext_body(p_workspace_id);
end;
$$;

create function public.replace_mfa_recovery_codes(p_codes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('miravize.onboarding_bypass', 'on', true);
  perform public.replace_mfa_recovery_codes_body(p_codes);
end;
$$;

create function public.delete_mfa_recovery_codes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('miravize.onboarding_bypass', 'on', true);
  perform public.delete_mfa_recovery_codes_body();
end;
$$;

create function public.accept_workspace_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('miravize.onboarding_bypass', 'on', true);
  return public.accept_workspace_invite_body(p_token);
end;
$$;

revoke all on function public.write_field_ciphertext(text, uuid, jsonb) from public;
revoke all on function public.mark_workspace_dual(uuid, integer) from public;
revoke all on function public.cutover_workspace_plaintext(uuid) from public;
revoke all on function public.replace_mfa_recovery_codes(text[]) from public;
revoke all on function public.delete_mfa_recovery_codes() from public;
revoke all on function public.accept_workspace_invite(uuid) from public;
grant execute on function public.write_field_ciphertext(text, uuid, jsonb) to authenticated;
grant execute on function public.mark_workspace_dual(uuid, integer) to authenticated;
grant execute on function public.cutover_workspace_plaintext(uuid) to authenticated;
grant execute on function public.replace_mfa_recovery_codes(text[]) to authenticated;
grant execute on function public.delete_mfa_recovery_codes() to authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

create or replace function public.record_onboarding_mfa_choice(p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verified boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_choice not in ('enrolled', 'skipped') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_onboarding where user_id = auth.uid() and completed_at is not null) then
    return;
  end if;
  select exists (
    select 1
    from auth.mfa_factors
    where user_id = auth.uid()
      and status = 'verified'
      and factor_type = 'totp'
  ) into verified;
  if p_choice = 'enrolled' and not verified then
    raise exception 'Verify your authenticator before continuing' using errcode = '42501';
  end if;
  if p_choice = 'skipped' and verified then
    raise exception 'Authenticator is already on' using errcode = '42501';
  end if;
  insert into public.user_onboarding (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;
  update public.user_onboarding
  set
    mfa_choice = case
      when mfa_choice = 'enrolled' then 'enrolled'
      else p_choice
    end,
    mfa_choice_at = coalesce(mfa_choice_at, now()),
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

create or replace function public.confirm_onboarding_recovery()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.user_crypto_profiles
    where user_id = auth.uid()
      and crypto_status = 'ready'
  ) then
    raise exception 'Save your recovery key first' using errcode = '42501';
  end if;
  insert into public.user_onboarding (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;
  update public.user_onboarding
  set recovery_confirmed_at = coalesce(recovery_confirmed_at, now()), updated_at = now()
  where user_id = auth.uid();
end;
$$;

create or replace function public.provision_onboarding_workspace(p_name text)
returns table (
  id uuid,
  name text,
  id_code text,
  encryption_status text,
  role public.workspace_role,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  existing_name text;
  existing_code text;
  existing_status text;
  member_role public.workspace_role;
  ws public.workspaces;
  code text;
  confirmed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.aal_satisfies_mfa() then
    raise exception 'Two-factor authentication is required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select w.id, w.name, w.id_code, w.encryption_status, m.role
  into existing_id, existing_name, existing_code, existing_status, member_role
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid()
  order by (m.role = 'owner') desc, w.created_at
  limit 1;
  if existing_id is not null then
    return query
    select existing_id, existing_name, existing_code, existing_status, member_role, false;
    return;
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    return;
  end if;

  select email_confirmed_at into confirmed from auth.users where id = auth.uid();
  if confirmed is null then
    raise exception 'Confirm your email first' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_onboarding
    where user_id = auth.uid() and mfa_choice is not null and recovery_confirmed_at is not null
  ) then
    raise exception 'Finish the earlier setup steps first' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_crypto_profiles
    where user_id = auth.uid() and crypto_status = 'ready'
  ) then
    raise exception 'Save your recovery key first' using errcode = '42501';
  end if;

  code := public.suggest_workspace_id_code(trim(p_name));
  if code is null or code !~ '^[A-Z]{1,3}$' then
    code := 'W';
  end if;

  insert into public.workspaces (name, created_by, id_code)
  values (trim(p_name), auth.uid(), code)
  returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, auth.uid(), 'owner');
  insert into public.workspace_counters (workspace_id, requests) values (ws.id, 0);

  return query
  select ws.id, ws.name, ws.id_code, ws.encryption_status, 'owner'::public.workspace_role, true;
end;
$$;

create or replace function public.complete_onboarding()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed timestamptz;
  already timestamptz;
  owned uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select completed_at into already from public.user_onboarding where user_id = auth.uid();
  if already is not null then
    select workspace_id into owned
    from public.workspace_members
    where user_id = auth.uid()
    order by created_at
    limit 1;
    return owned;
  end if;

  select email_confirmed_at into confirmed from auth.users where id = auth.uid();
  if confirmed is null then
    raise exception 'Confirm your email first' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_onboarding
    where user_id = auth.uid()
      and mfa_choice is not null
      and recovery_confirmed_at is not null
  ) then
    raise exception 'Finish the earlier setup steps first' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_crypto_profiles
    where user_id = auth.uid() and crypto_status = 'ready'
  ) then
    raise exception 'Save your recovery key first' using errcode = '42501';
  end if;

  select w.id into owned
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  join public.workspace_member_key_envelopes envelope
    on envelope.workspace_id = w.id
    and envelope.user_id = auth.uid()
  where m.user_id = auth.uid()
    and m.role = 'owner'
    and w.encryption_status = 'ciphertext_only'
  order by w.created_at
  limit 1;

  if owned is null then
    if exists (
      select 1
      from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
      where m.user_id = auth.uid()
        and m.role = 'owner'
    ) or not exists (
      select 1 from public.workspace_members where user_id = auth.uid()
    ) then
      raise exception 'Workspace is not ready' using errcode = '42501';
    end if;
    select workspace_id into owned
    from public.workspace_members
    where user_id = auth.uid()
    order by created_at
    limit 1;
  end if;

  update public.user_onboarding
  set completed_at = now(), updated_at = now()
  where user_id = auth.uid()
    and completed_at is null;
  return owned;
end;
$$;

revoke all on function public.record_onboarding_mfa_choice(text) from public;
revoke all on function public.confirm_onboarding_recovery() from public;
revoke all on function public.provision_onboarding_workspace(text) from public;
revoke all on function public.complete_onboarding() from public;
grant execute on function public.record_onboarding_mfa_choice(text) to authenticated;
grant execute on function public.confirm_onboarding_recovery() to authenticated;
grant execute on function public.provision_onboarding_workspace(text) to authenticated;
grant execute on function public.complete_onboarding() to authenticated;

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
      'create policy %I on public.%I as restrictive to authenticated using (public.onboarding_complete()) with check (public.onboarding_complete())',
      target || '_onboarding',
      target
    );
  end loop;
end $$;

create policy workspaces_onboarding on public.workspaces
  as restrictive
  to authenticated
  using (public.onboarding_complete() or created_by = auth.uid())
  with check (public.onboarding_complete());

create policy workspace_member_key_envelopes_onboarding on public.workspace_member_key_envelopes
  as restrictive
  to authenticated
  using (
    public.onboarding_complete()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.workspaces
        where id = workspace_id
          and created_by = auth.uid()
      )
    )
  )
  with check (
    public.onboarding_complete()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.workspaces
        where id = workspace_id
          and created_by = auth.uid()
      )
    )
  );

create policy objects_onboarding on storage.objects
  as restrictive
  to authenticated
  using (public.onboarding_complete())
  with check (public.onboarding_complete());
