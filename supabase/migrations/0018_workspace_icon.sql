create or replace function public.workspace_icon_ok(p_icon text)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_icon is null then
    return true;
  end if;
  if p_icon ~ '^hero:[A-Za-z0-9]+Icon$' and char_length(p_icon) <= 64 then
    return true;
  end if;
  if p_icon ~ '^letters:[[:alpha:]]{1,2}$' then
    return true;
  end if;
  if left(p_icon, 6) = 'emoji:'
    and char_length(substr(p_icon, 7)) between 1 and 16
    and substr(p_icon, 7) !~ '[[:space:]]' then
    return true;
  end if;
  return false;
end;
$$;

alter table public.workspaces
  add column icon text;

alter table public.workspaces
  add constraint workspaces_icon_ok check (public.workspace_icon_ok(icon));

create or replace function public.update_workspace(
  p_workspace_id uuid,
  p_name text,
  p_icon text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  ws public.workspaces;
  next_name text;
  next_icon text;
begin
  if not public.can_manage_workspace(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  next_name := nullif(trim(p_name), '');
  if next_name is null then
    raise exception 'Name is required';
  end if;
  next_icon := nullif(p_icon, '');
  if not public.workspace_icon_ok(next_icon) then
    raise exception 'Invalid icon';
  end if;
  update public.workspaces
  set name = next_name,
      icon = next_icon
  where id = p_workspace_id
  returning * into ws;
  return ws;
end;
$$;

create or replace function public.workspace_people(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role public.workspace_role
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.user_id, u.email::text, m.role
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id);
$$;

create or replace function public.revoke_workspace_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
begin
  select * into inv from public.workspace_invites where id = p_invite_id;
  if inv.id is null then
    raise exception 'Invite not found';
  end if;
  if not public.can_manage_workspace(inv.workspace_id) then
    raise exception 'Not allowed';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;
  delete from public.workspace_invites where id = p_invite_id;
end;
$$;

grant execute on function public.update_workspace(uuid, text, text) to authenticated;
grant execute on function public.workspace_people(uuid) to authenticated;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;
