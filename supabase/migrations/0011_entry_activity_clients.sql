alter table public.time_entries
  add column if not exists activity_id uuid references public.activities (id) on delete set null;

create table if not exists public.time_entry_clients (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  primary key (time_entry_id, client_id)
);

alter table public.time_entry_clients enable row level security;

create policy time_entry_clients_select on public.time_entry_clients
  for select using (public.is_workspace_member(workspace_id));
create policy time_entry_clients_write on public.time_entry_clients
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
