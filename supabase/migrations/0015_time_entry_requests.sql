create table if not exists public.time_entry_requests (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (time_entry_id, request_id)
);

alter table public.time_entry_requests enable row level security;

create policy time_entry_requests_select on public.time_entry_requests
  for select using (public.is_workspace_member(workspace_id));
create policy time_entry_requests_write on public.time_entry_requests
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
