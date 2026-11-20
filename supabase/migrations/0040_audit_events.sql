-- Owner and admin actions, sealed with the workspace key.
-- Accepted invites are removed after the action is stored here.

create table public.audit_events (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  action text not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  recorded_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  target_user_id uuid references auth.users (id) on delete set null,
  subject_id uuid,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  detail_ciphertext jsonb not null,
  constraint audit_events_action_ok check (
    action in (
      'invite.sent',
      'invite.accepted',
      'invite.revoked',
      'member.removed',
      'workspace.mfa_required'
    )
  ),
  constraint audit_events_detail_ok check (public.field_ciphertext_ok(detail_ciphertext))
);

create unique index audit_events_subject_action
  on public.audit_events (subject_id, action)
  where subject_id is not null;

create index audit_events_workspace_time
  on public.audit_events (workspace_id, occurred_at desc);

alter table public.audit_events enable row level security;

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (public.can_manage_workspace(workspace_id));

create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and public.can_manage_workspace(workspace_id)
  );

create policy audit_events_aal on public.audit_events
  as restrictive to authenticated
  using (public.aal_satisfies_mfa())
  with check (public.aal_satisfies_mfa());

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
    );
$$;


create or replace function public.set_audit_event_detail(p_event_id uuid, p_ciphertext jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event public.audit_events;
begin
  perform public.enforce_aal();
  if not public.field_ciphertext_ok(p_ciphertext) then
    raise exception 'Encrypted value is malformed' using errcode = '22023';
  end if;
  select * into event from public.audit_events where id = p_event_id;
  if event.id is null or not public.can_manage_workspace(event.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.audit_events
  set detail_ciphertext = p_ciphertext
  where id = event.id;
end;
$$;

revoke all on function public.set_audit_event_detail(uuid, jsonb) from public;
grant execute on function public.set_audit_event_detail(uuid, jsonb) to authenticated;

create or replace function public.retire_accepted_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
begin
  perform public.enforce_aal();
  select * into inv from public.workspace_invites where id = p_invite_id;
  if inv.id is null then
    return;
  end if;
  if inv.accepted_at is null or not public.can_manage_workspace(inv.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.audit_events
    where subject_id = inv.id
      and action = 'invite.accepted'
      and workspace_id = inv.workspace_id
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.workspace_invites where id = inv.id;
end;
$$;

revoke all on function public.retire_accepted_invite(uuid) from public;
grant execute on function public.retire_accepted_invite(uuid) to authenticated;
