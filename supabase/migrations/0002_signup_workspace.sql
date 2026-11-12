-- Create the workspace named at signup even when email confirmation
-- delays the first client session. The name is stored on the auth user.

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_name text;
  ws public.workspaces;
begin
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data->>'workspace_name', '')), '');
  if ws_name is null then
    return new;
  end if;

  insert into public.workspaces (name, created_by)
  values (ws_name, new.id)
  returning * into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, new.id, 'owner');

  insert into public.workspace_counters (workspace_id, requests)
  values (ws.id, 0);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_workspace on auth.users;

create trigger on_auth_user_created_workspace
after insert on auth.users
for each row
execute function public.handle_new_user_workspace();
