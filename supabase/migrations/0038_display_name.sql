-- A display name is sealed once for the person and once per workspace membership.
-- auth.users metadata keeps the current name until those copies are confirmed.

alter table public.workspace_members
  add column display_name_ciphertext jsonb;

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
    )
    and not exists (
      select 1 from public.workspace_members
      where workspace_id = p_workspace_id
        and display_name_ciphertext is not null
        and coalesce((display_name_ciphertext->>'key_version')::integer, 0) <> p_version
    );
$$;

create or replace function public.set_member_display_name(p_member_id uuid, p_ciphertext jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member public.workspace_members;
begin
  perform public.enforce_aal();
  select * into member from public.workspace_members where id = p_member_id;
  if member.id is null then
    raise exception 'Member was not found.';
  end if;
  if member.user_id <> auth.uid() and not public.can_manage_workspace(member.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.workspace_members
  set display_name_ciphertext = p_ciphertext
  where id = member.id;
end;
$$;

revoke all on function public.set_member_display_name(uuid, jsonb) from public;
grant execute on function public.set_member_display_name(uuid, jsonb) to authenticated;

drop function if exists public.workspace_people(uuid);

create function public.workspace_people(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role public.workspace_role,
  full_name text,
  avatar_url text,
  display_name_ciphertext jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    m.user_id,
    u.email::text,
    m.role,
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
    m.display_name_ciphertext
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id);
$$;

grant execute on function public.workspace_people(uuid) to authenticated;
