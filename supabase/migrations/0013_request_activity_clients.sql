alter table public.requests
  alter column project_id drop not null;

alter table public.requests
  add column if not exists activity_id uuid references public.activities (id) on delete set null;

alter table public.requests
  add column if not exists screenshot_paths text[] not null default '{}';

update public.requests
set screenshot_paths = array[screenshot_path]
where screenshot_path is not null
  and (screenshot_paths is null or cardinality(screenshot_paths) = 0);

create table if not exists public.request_clients (
  request_id uuid not null references public.requests (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (request_id, client_id)
);

alter table public.request_clients enable row level security;

drop policy if exists request_clients_select on public.request_clients;
create policy request_clients_select on public.request_clients
  for select using (public.is_workspace_member(workspace_id));
drop policy if exists request_clients_write on public.request_clients;
create policy request_clients_write on public.request_clients
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop function if exists public.log_support_request(uuid, uuid, text, text, uuid, text, text, text, date);

create or replace function public.log_support_request(
  p_workspace_id uuid,
  p_submission_id uuid,
  p_requester text,
  p_request text,
  p_project_id uuid default null,
  p_activity_id uuid default null,
  p_client_ids uuid[] default '{}',
  p_additional_notes text default null,
  p_screenshot_paths text[] default '{}',
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
  first_path text;
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
  first_path := case
    when p_screenshot_paths is not null and cardinality(p_screenshot_paths) > 0 then p_screenshot_paths[1]
    else null
  end;
  insert into public.requests (
    workspace_id, created_by, task_number, logged_on, requester, request,
    project_id, activity_id, website, additional_notes, screenshot_path, screenshot_paths, submission_id
  ) values (
    p_workspace_id, auth.uid(), n, p_logged_on, p_requester, p_request,
    p_project_id, p_activity_id, null, nullif(btrim(coalesce(p_additional_notes, '')), ''),
    first_path, coalesce(p_screenshot_paths, '{}'), p_submission_id
  ) returning * into created;

  if p_client_ids is not null then
    insert into public.request_clients (request_id, client_id, workspace_id)
    select created.id, client_id, p_workspace_id
    from unnest(p_client_ids) as client_id
    where client_id is not null
    on conflict do nothing;
  end if;

  return created;
end;
$$;

grant execute on function public.log_support_request(uuid, uuid, text, text, uuid, uuid, uuid[], text, text[], date) to authenticated;
