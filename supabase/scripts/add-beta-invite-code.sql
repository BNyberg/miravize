-- Adds one beta invite code.
-- Leave supplied empty to mint a code, or paste a code you already chose.
-- Run this in the Supabase SQL editor. It is not a migration.
-- Copy the code from the notice. The table stores only its hash, so it cannot be shown again.
-- Run it again for another code.

do $$
declare
  supplied text := '';
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw text := '';
  canonical text;
  hashed text;
  i integer;
  n integer;
begin
  if nullif(trim(supplied), '') is null then
    for i in 1..12 loop
      n := 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet));
      raw := raw || substr(alphabet, n, 1);
      if i in (4, 8) then
        raw := raw || '-';
      end if;
    end loop;
  else
    raw := trim(supplied);
  end if;

  canonical := upper(regexp_replace(raw, '[[:space:]-]', '', 'g'));
  if length(canonical) < 8 then
    raise exception 'Invite code must be at least 8 characters after removing spaces and hyphens';
  end if;

  hashed := encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex');

  insert into public.beta_invite_codes (code_hash)
  values (hashed)
  on conflict (code_hash) do nothing;

  if not found then
    raise exception 'That invite code is already in the table';
  end if;

  raise notice 'Beta invite code (copy now): %', raw;
end $$;
