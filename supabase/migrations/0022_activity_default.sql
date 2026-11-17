alter table public.activities
  add column if not exists is_default boolean not null default false;

create unique index if not exists activities_one_default_per_project
  on public.activities (project_id)
  where is_default;

create or replace function public.activities_single_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default then
    update public.activities
    set is_default = false
    where project_id = new.project_id
      and id <> new.id
      and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_single_default on public.activities;
create trigger activities_single_default
  before insert or update of is_default, project_id on public.activities
  for each row
  execute function public.activities_single_default();
