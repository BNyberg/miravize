create or replace function public.provision_onboarding_workspace(
  p_name text,
  p_id_code text default null,
  p_icon text default null
)
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
#variable_conflict use_column
declare
  existing_id uuid;
  existing_name text;
  existing_code text;
  existing_status text;
  member_role public.workspace_role;
  ws public.workspaces;
  code text;
  icon text;
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

  select u.email_confirmed_at into confirmed from auth.users u where u.id = auth.uid();
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

  code := upper(trim(coalesce(p_id_code, '')));
  if code = '' then
    code := public.suggest_workspace_id_code(trim(p_name));
  end if;
  if code is null or code !~ '^[A-Z]{1,3}$' then
    raise exception 'Use 1-3 letters' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.user_id = auth.uid()
      and w.id_code = code
  ) then
    raise exception 'ID % is already used', code using errcode = '23505';
  end if;

  icon := nullif(p_icon, '');
  if not public.workspace_icon_ok(icon) then
    raise exception 'Invalid icon' using errcode = '22023';
  end if;

  insert into public.workspaces (name, created_by, id_code, icon)
  values (trim(p_name), auth.uid(), code, icon)
  returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, auth.uid(), 'owner');
  insert into public.workspace_counters (workspace_id, requests) values (ws.id, 0);

  return query
  select ws.id, ws.name, ws.id_code, ws.encryption_status, 'owner'::public.workspace_role, true;
end;
$$;
