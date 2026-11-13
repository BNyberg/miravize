create or replace function public.delete_support_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.requests;
begin
  select * into current from public.requests where id = p_id;
  if current.id is null then
    raise exception 'Not found';
  end if;
  if not public.is_workspace_member(current.workspace_id) then
    raise exception 'Not allowed';
  end if;

  delete from public.requests where id = p_id;
end;
$$;

grant execute on function public.delete_support_request(uuid) to authenticated;
