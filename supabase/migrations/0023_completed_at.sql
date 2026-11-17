alter table public.requests
  add column if not exists completed_at timestamptz;

alter table public.tasks
  add column if not exists completed_at timestamptz;

create or replace function public.set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.completed_at := now();
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_set_completed_at on public.requests;
create trigger requests_set_completed_at
  before update on public.requests
  for each row
  execute function public.set_completed_at();

drop trigger if exists tasks_set_completed_at on public.tasks;
create trigger tasks_set_completed_at
  before update on public.tasks
  for each row
  execute function public.set_completed_at();

update public.requests
  set completed_at = now()
  where status = 'done' and completed_at is null;

update public.tasks
  set completed_at = now()
  where status = 'done' and completed_at is null;
