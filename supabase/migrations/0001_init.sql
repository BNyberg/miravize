-- Genki Tenki core schema, RLS, RPCs, and storage.

create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.time_entry_source as enum ('manual', 'quick_start');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token)
);

create table public.workspace_counters (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  requests integer not null default 0
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  default_billable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default '#1C9C71',
  billable boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.project_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  split_percent numeric(6, 2) not null check (split_percent > 0 and split_percent <= 100),
  unique (project_id, client_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.project_tags (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (project_id, tag_id)
);

create table public.project_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  shortcut text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, shortcut)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  description text not null default '',
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  duration_seconds integer,
  billable boolean not null default true,
  source public.time_entry_source not null default 'manual',
  created_at timestamptz not null default now()
);

create unique index time_entries_one_running_per_user
  on public.time_entries (user_id)
  where stopped_at is null;

create table public.time_entry_tags (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (time_entry_id, tag_id)
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  task_number integer not null,
  logged_on date not null,
  requester text not null,
  request text not null,
  project_id uuid not null references public.projects (id) on delete restrict,
  website text,
  additional_notes text,
  screenshot_path text,
  submission_id uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, task_number),
  unique (workspace_id, submission_id)
);

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  select m.role from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin');
$$;

create or replace function public.check_project_splits()
returns trigger
language plpgsql
as $$
declare
  pid uuid;
  total numeric;
  cnt integer;
begin
  pid := coalesce(new.project_id, old.project_id);
  select coalesce(sum(split_percent), 0), count(*) into total, cnt
  from public.project_clients
  where project_id = pid;
  if cnt = 0 then
    return coalesce(new, old);
  end if;
  if total <> 100 then
    raise exception 'Project client splits must sum to 100, got %', total;
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger project_clients_splits_sum
after insert or update or delete on public.project_clients
deferrable initially deferred
for each row
execute procedure public.check_project_splits();

create or replace function public.replace_project_clients(
  p_project_id uuid,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.projects where id = p_project_id;
  if ws is null then
    raise exception 'Project not found';
  end if;
  if not public.can_manage_workspace(ws) then
    raise exception 'Not allowed';
  end if;
  if jsonb_array_length(p_splits) < 1 then
    raise exception 'A project needs at least one client';
  end if;

  delete from public.project_clients where project_id = p_project_id;
  insert into public.project_clients (workspace_id, project_id, client_id, split_percent)
  select ws, p_project_id, (item->>'client_id')::uuid, (item->>'split_percent')::numeric
  from jsonb_array_elements(p_splits) as item;
end;
$$;

create or replace function public.replace_project_tags(
  p_project_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.projects where id = p_project_id;
  if ws is null then
    raise exception 'Project not found';
  end if;
  if not public.can_manage_workspace(ws) then
    raise exception 'Not allowed';
  end if;
  delete from public.project_tags where project_id = p_project_id;
  insert into public.project_tags (workspace_id, project_id, tag_id)
  select ws, p_project_id, unnest(coalesce(p_tag_ids, '{}'::uuid[]));
end;
$$;

create or replace function public.create_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  ws public.workspaces;
begin
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

create or replace function public.invite_to_workspace(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role default 'member'
)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
begin
  if not public.can_manage_workspace(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  if p_role = 'owner' then
    raise exception 'Cannot invite as owner';
  end if;
  insert into public.workspace_invites (workspace_id, email, role, invited_by)
  values (p_workspace_id, lower(trim(p_email)), p_role, auth.uid())
  returning * into inv;
  return inv;
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

create or replace function public.start_time_entry(
  p_workspace_id uuid,
  p_project_id uuid,
  p_description text default '',
  p_billable boolean default true,
  p_tag_ids uuid[] default '{}'::uuid[],
  p_source public.time_entry_source default 'quick_start'
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries;
  proj public.projects;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  perform public.stop_running_timer(now());
  select * into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  if proj.id is null then
    raise exception 'Project not found';
  end if;
  insert into public.time_entries (
    workspace_id, user_id, project_id, description, billable, source, started_at
  ) values (
    p_workspace_id, auth.uid(), p_project_id, coalesce(p_description, ''), coalesce(p_billable, proj.billable), p_source, now()
  ) returning * into entry;

  insert into public.time_entry_tags (time_entry_id, tag_id, workspace_id)
  select entry.id, unnest(coalesce(p_tag_ids, '{}'::uuid[])), p_workspace_id;

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

create or replace function public.log_support_request(
  p_workspace_id uuid,
  p_submission_id uuid,
  p_requester text,
  p_request text,
  p_project_id uuid,
  p_website text default null,
  p_additional_notes text default null,
  p_screenshot_path text default null,
  p_logged_on date default (timezone('utc', now()))::date
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.requests;
  created public.requests;
  n integer;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed';
  end if;
  select * into existing from public.requests
  where workspace_id = p_workspace_id and submission_id = p_submission_id;
  if existing.id is not null then
    return existing;
  end if;
  n := public.next_request_number(p_workspace_id);
  insert into public.requests (
    workspace_id, created_by, task_number, logged_on, requester, request,
    project_id, website, additional_notes, screenshot_path, submission_id
  ) values (
    p_workspace_id, auth.uid(), n, p_logged_on, p_requester, p_request,
    p_project_id, nullif(p_website, ''), nullif(p_additional_notes, ''), p_screenshot_path, p_submission_id
  ) returning * into created;
  return created;
end;
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_counters enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_clients enable row level security;
alter table public.tags enable row level security;
alter table public.project_tags enable row level security;
alter table public.project_aliases enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_tags enable row level security;
alter table public.requests enable row level security;

create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces
  for update using (public.workspace_role_of(id) = 'owner');

create policy members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
create policy members_delete on public.workspace_members
  for delete using (public.workspace_role_of(workspace_id) = 'owner' and role <> 'owner');

create policy invites_select on public.workspace_invites
  for select using (public.can_manage_workspace(workspace_id));

create policy counters_select on public.workspace_counters
  for select using (public.is_workspace_member(workspace_id));

create policy clients_select on public.clients
  for select using (public.is_workspace_member(workspace_id));
create policy clients_write on public.clients
  for all using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

create policy projects_select on public.projects
  for select using (public.is_workspace_member(workspace_id));
create policy projects_write on public.projects
  for all using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

create policy project_clients_select on public.project_clients
  for select using (public.is_workspace_member(workspace_id));

create policy tags_select on public.tags
  for select using (public.is_workspace_member(workspace_id));
create policy tags_write on public.tags
  for all using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

create policy project_tags_select on public.project_tags
  for select using (public.is_workspace_member(workspace_id));

create policy aliases_select on public.project_aliases
  for select using (public.is_workspace_member(workspace_id));
create policy aliases_write on public.project_aliases
  for all using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

create policy time_entries_select on public.time_entries
  for select using (public.is_workspace_member(workspace_id));
create policy time_entries_insert on public.time_entries
  for insert with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());
create policy time_entries_update on public.time_entries
  for update using (public.is_workspace_member(workspace_id) and user_id = auth.uid());
create policy time_entries_delete on public.time_entries
  for delete using (public.is_workspace_member(workspace_id) and user_id = auth.uid());

create policy time_entry_tags_select on public.time_entry_tags
  for select using (public.is_workspace_member(workspace_id));
create policy time_entry_tags_write on public.time_entry_tags
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy requests_select on public.requests
  for select using (public.is_workspace_member(workspace_id));
create policy requests_insert on public.requests
  for insert with check (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public)
values ('request-screenshots', 'request-screenshots', false)
on conflict (id) do nothing;

create policy screenshots_select on storage.objects
  for select using (
    bucket_id = 'request-screenshots'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid)
  );
create policy screenshots_insert on storage.objects
  for insert with check (
    bucket_id = 'request-screenshots'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid)
  );

grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.invite_to_workspace(uuid, text, public.workspace_role) to authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;
grant execute on function public.start_time_entry(uuid, uuid, text, boolean, uuid[], public.time_entry_source) to authenticated;
grant execute on function public.stop_running_timer(timestamptz) to authenticated;
grant execute on function public.replace_project_clients(uuid, jsonb) to authenticated;
grant execute on function public.replace_project_tags(uuid, uuid[]) to authenticated;
grant execute on function public.log_support_request(uuid, uuid, text, text, uuid, text, text, text, date) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;
