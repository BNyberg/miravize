create or replace function public.workspace_members_missing_key(p_workspace_id uuid, p_key_version integer)
returns table (
  user_id uuid,
  public_key text,
  public_key_fingerprint text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  current_version integer;
  rotating text;
begin
  perform public.enforce_aal();
  if not public.can_manage_workspace(p_workspace_id) or p_key_version < 1 then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select workspaces.current_key_version, workspaces.key_rotation_status
    into current_version, rotating
    from public.workspaces
    where workspaces.id = p_workspace_id;
  if current_version is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not (
    (rotating = 'stable' and p_key_version = current_version)
    or (
      rotating = 'rotating'
      and p_key_version > current_version
      and exists (
        select 1 from public.workspace_member_key_envelopes envelope
        where envelope.workspace_id = p_workspace_id
          and envelope.user_id = auth.uid()
          and envelope.key_version = p_key_version
      )
    )
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select member.user_id, profile.public_key, profile.public_key_fingerprint
  from public.workspace_members member
  join public.user_crypto_profiles profile
    on profile.user_id = member.user_id
   and profile.crypto_status = 'ready'
  where member.workspace_id = p_workspace_id
    and member.user_id <> auth.uid()
    and not exists (
      select 1 from public.workspace_member_key_envelopes envelope
      where envelope.workspace_id = member.workspace_id
        and envelope.user_id = member.user_id
        and envelope.key_version = p_key_version
    );
end;
$$;

create or replace function public.grant_workspace_key_envelope(
  p_workspace_id uuid,
  p_user_id uuid,
  p_key_version integer,
  p_sealed text,
  p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  current_version integer;
  rotating text;
begin
  perform public.enforce_aal();
  if not public.can_manage_workspace(p_workspace_id) or p_key_version < 1 or length(trim(p_sealed)) = 0 then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_user_id
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_crypto_profiles profile
    where profile.user_id = p_user_id
      and profile.crypto_status = 'ready'
      and profile.public_key_fingerprint = p_fingerprint
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select workspaces.current_key_version, workspaces.key_rotation_status
    into current_version, rotating
    from public.workspaces
    where workspaces.id = p_workspace_id;
  if not (
    (rotating = 'stable' and p_key_version = current_version)
    or (
      rotating = 'rotating'
      and p_key_version > current_version
      and exists (
        select 1 from public.workspace_member_key_envelopes envelope
        where envelope.workspace_id = p_workspace_id
          and envelope.user_id = auth.uid()
          and envelope.key_version = p_key_version
      )
    )
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.workspace_member_key_envelopes (
    workspace_id,
    user_id,
    key_version,
    recipient_public_key_fingerprint,
    sealed_workspace_key
  )
  values (p_workspace_id, p_user_id, p_key_version, p_fingerprint, p_sealed)
  on conflict (workspace_id, user_id, key_version) do nothing;
end;
$$;
