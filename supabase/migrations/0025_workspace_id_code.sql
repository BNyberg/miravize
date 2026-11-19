-- Workspace letter code used in task and request IDs: T-MV01, R-P01.

create or replace function public.suggest_workspace_id_code(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  spaced text;
  words text[];
  word text;
  code text := '';
begin
  spaced := regexp_replace(trim(coalesce(p_name, '')), '([a-z0-9])([A-Z])', '\1 \2', 'g');
  words := array_remove(regexp_split_to_array(spaced, '[^A-Za-z0-9]+'), '');
  if words is null or cardinality(words) = 0 then
    return 'W';
  end if;
  if cardinality(words) = 1 then
    return upper(left(words[1], 1));
  end if;
  foreach word in array words loop
    code := code || upper(left(word, 1));
    exit when char_length(code) >= 3;
  end loop;
  if code = '' then
    return 'W';
  end if;
  return code;
end;
$$;

alter table public.workspaces
  add column id_code text;

update public.workspaces set id_code = 'P' where name = 'Personal';
update public.workspaces set id_code = 'MV' where name = 'Miravize';
update public.workspaces set id_code = 'TD' where name = 'TaskDirection';

update public.workspaces
set id_code = public.suggest_workspace_id_code(name)
where id_code is null;

alter table public.workspaces
  alter column id_code set not null;

alter table public.workspaces
  add constraint workspaces_id_code_ok check (id_code ~ '^[A-Z]{1,3}$');

drop function if exists public.create_workspace(text);

create function public.create_workspace(p_name text, p_id_code text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  ws public.workspaces;
  code text;
begin
  perform public.enforce_aal();
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Name is required';
  end if;
  code := upper(trim(coalesce(p_id_code, '')));
  if code !~ '^[A-Z]{1,3}$' then
    raise exception 'Use 1-3 letters';
  end if;
  if exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.user_id = auth.uid()
      and w.id_code = code
  ) then
    raise exception 'ID % is already used', code;
  end if;
  insert into public.workspaces (name, created_by, id_code)
  values (trim(p_name), auth.uid(), code)
  returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, auth.uid(), 'owner');
  insert into public.workspace_counters (workspace_id, requests) values (ws.id, 0);
  return ws;
end;
$$;

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_name text;
  code text;
  ws public.workspaces;
begin
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data->>'workspace_name', '')), '');
  if ws_name is null then
    return new;
  end if;

  code := upper(trim(coalesce(new.raw_user_meta_data->>'workspace_id_code', '')));
  if code !~ '^[A-Z]{1,3}$' then
    code := public.suggest_workspace_id_code(ws_name);
  end if;

  insert into public.workspaces (name, created_by, id_code)
  values (ws_name, new.id, code)
  returning * into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws.id, new.id, 'owner');

  insert into public.workspace_counters (workspace_id, requests)
  values (ws.id, 0);

  return new;
end;
$$;

grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.suggest_workspace_id_code(text) to authenticated;
