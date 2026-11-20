-- Beta invite codes. The plaintext is never stored.
-- API roles cannot read or write the table. Signup consumes a code in a
-- before-insert trigger, and a failed insert rolls the claim back.

create table public.beta_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint beta_invite_codes_used_after_create check (used_at is null or used_at >= created_at)
);

comment on table public.beta_invite_codes is
  'Beta invite codes. Plaintext is never stored. No API role can read or write this table.';

alter table public.beta_invite_codes enable row level security;

revoke all on table public.beta_invite_codes from public, anon, authenticated, service_role;

create or replace function public.beta_invite_code_hash(p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when length(canonical) < 8 then null
    else encode(digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex')
  end
  from (
    select upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g')) as canonical
  ) normalized;
$$;

revoke all on function public.beta_invite_code_hash(text) from public, anon, authenticated, service_role;

create or replace function public.beta_invite_open(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.beta_invite_codes
    where code_hash = public.beta_invite_code_hash(p_code)
      and used_at is null
  );
$$;

revoke all on function public.beta_invite_open(text) from public, anon, authenticated, service_role;
grant execute on function public.beta_invite_open(text) to anon, authenticated;

create or replace function public.consume_beta_invite()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  claimed uuid;
begin
  update public.beta_invite_codes
  set used_at = now()
  where code_hash = public.beta_invite_code_hash(new.raw_user_meta_data->>'invite_code')
    and used_at is null
  returning id into claimed;

  if claimed is null then
    raise exception 'Invalid invite code' using errcode = '42501';
  end if;

  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';
  return new;
end;
$$;

revoke all on function public.consume_beta_invite() from public, anon, authenticated, service_role;
grant execute on function public.consume_beta_invite() to supabase_auth_admin;

drop trigger if exists consume_beta_invite on auth.users;

create trigger consume_beta_invite
before insert on auth.users
for each row
execute function public.consume_beta_invite();
